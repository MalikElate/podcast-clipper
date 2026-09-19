import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { publicError } from "../core/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const additive = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const jsonResult = data => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

const toolError = error => {
  const visible = publicError(error);
  return {
    isError: true,
    content: [{ type: "text", text: `${visible.error} (${visible.code})` }],
  };
};

const run = (application, handler, { flush = false } = {}) => async input => {
  try {
    const result = await handler(input);
    if (flush) await application.store.flush?.();
    return jsonResult(result);
  } catch (error) {
    return toolError(error);
  }
};

const projectView = project => ({
  id: project.id,
  name: project.name,
  timeZone: project.timeZone,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const accountView = account => ({
  id: account.id,
  platform: account.platform,
  label: account.label,
  status: account.status,
  avatar: account.avatar || null,
  profileUrl: account.profileUrl || null,
  updatedAt: account.updatedAt || null,
});

const deliveryView = delivery => ({
  id: delivery.id,
  accountId: delivery.accountId,
  accountName: delivery.accountName,
  platform: delivery.platform,
  status: delivery.status,
  requestedAt: delivery.requestedAt,
  dueAt: delivery.dueAt,
  url: delivery.url || null,
  error: delivery.error || null,
});

const postView = post => ({
  id: post.id,
  caption: post.caption,
  title: post.title,
  format: post.format,
  status: post.status,
  schedule: post.schedule,
  accountIds: post.accountIds,
  media: post.media.map(item => ({ id: item.id, kind: item.kind, filename: item.filename, status: item.status })),
  deliveries: post.deliveries.map(deliveryView),
  revision: post.revision,
  editable: post.editable,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
});

export function createMeadowMcpServer(application, uid) {
  const server = new McpServer(
    { name: "meadow", version: "0.1.0" },
    {
      instructions: "Use Meadow to review social publishing workspaces, connected accounts, saved posts, and analytics. Create a draft when the user wants to save new post content. Never claim a draft was published.",
    },
  );

  server.registerTool("get_profile", {
    title: "Get Meadow profile",
    description: "Return the Meadow profile represented by the current API key.",
    inputSchema: {},
    outputSchema: {
      id: z.string(),
      nickname: z.string(),
    },
    annotations: readOnly,
    _meta: { "openai/profile": true },
  }, run(application, () => ({ id: uid, nickname: "Meadow workspace" })));

  server.registerTool("list_projects", {
    title: "List Meadow projects",
    description: "List the social publishing projects owned by the connected Meadow profile.",
    inputSchema: {},
    outputSchema: { projects: z.array(z.object({
      id: z.string(), name: z.string(), timeZone: z.string(), createdAt: z.number(), updatedAt: z.number(),
    })) },
    annotations: readOnly,
  }, run(application, () => ({ projects: application.projects.list(uid).map(projectView) })));

  server.registerTool("list_accounts", {
    title: "List connected social accounts",
    description: "List the social accounts connected to one Meadow project without refreshing remote provider data.",
    inputSchema: { projectId: z.string().min(1).describe("A project ID returned by list_projects") },
    outputSchema: { accounts: z.array(z.object({
      id: z.string(), platform: z.string(), label: z.string(), status: z.string(), avatar: z.string().nullable(), profileUrl: z.string().nullable(), updatedAt: z.number().nullable(),
    })) },
    annotations: readOnly,
  }, run(application, ({ projectId }) => ({ accounts: application.accounts.list(uid, projectId).map(accountView) })));

  server.registerTool("list_posts", {
    title: "List Meadow posts",
    description: "List drafts, scheduled posts, and publishing history for one Meadow project. Results are newest first and paginated by offset.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      status: z.enum(["draft", "scheduled", "publishing", "published", "cancelled", "needs_attention", "partially_published"]).optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
    },
    outputSchema: {
      posts: z.array(z.record(z.string(), z.unknown())),
      total: z.number().int().min(0),
      nextOffset: z.number().int().min(0).nullable(),
    },
    annotations: readOnly,
  }, run(application, ({ projectId, status, offset, limit }) => {
    const matches = application.posts.list(uid, projectId)
      .filter(post => !status || post.status === status)
      .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt);
    const posts = matches.slice(offset, offset + limit).map(postView);
    return { posts, total: matches.length, nextOffset: offset + posts.length < matches.length ? offset + posts.length : null };
  }));

  server.registerTool("get_post", {
    title: "Get a Meadow post",
    description: "Get one draft, scheduled post, or publishing-history item by ID.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      postId: z.string().min(1).describe("A post ID returned by list_posts or create_draft"),
    },
    outputSchema: { post: z.record(z.string(), z.unknown()) },
    annotations: readOnly,
  }, run(application, ({ projectId, postId }) => ({ post: postView(application.posts.get(uid, projectId, postId)) })));

  server.registerTool("create_draft", {
    title: "Create a Meadow draft",
    description: "Save a new, non-empty social post draft in a Meadow project. This does not publish or queue the post. Reuse the same requestId when retrying the same draft creation.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      requestId: z.string().regex(/^[\w-]{16,100}$/).describe("A stable 16-100 character idempotency identifier"),
      caption: z.string().max(65000).default(""),
      title: z.string().max(500).default(""),
      mediaIds: z.array(z.string().min(1).max(200)).max(35).default([]),
      accountIds: z.array(z.string().min(1).max(200)).max(100).default([]),
      format: z.enum(["auto", "text", "image", "video", "carousel", "document", "reel", "story"]).default("auto"),
      schedule: z.object({
        mode: z.enum(["now", "scheduled"]).default("now"),
        timeZone: z.string().optional(),
        localDateTime: z.string().max(40).optional(),
      }).optional(),
    },
    outputSchema: { post: z.record(z.string(), z.unknown()), duplicate: z.boolean() },
    annotations: additive,
  }, run(application, ({ projectId, requestId, caption, title, mediaIds, accountIds, format, schedule }) => {
    const result = application.posts.createDrafts(uid, projectId, {
      requestId,
      items: [{ caption, title, mediaIds, accountIds, format, overrides: {}, ...(schedule ? { schedule } : {}) }],
    });
    return { post: postView(result.posts[0]), duplicate: Boolean(result.duplicate) };
  }, { flush: true }));

  server.registerTool("get_analytics", {
    title: "Get Meadow analytics",
    description: "Return cached analytics totals for one Meadow project. This does not contact social platforms or refresh their metrics.",
    inputSchema: { projectId: z.string().min(1).describe("A project ID returned by list_projects") },
    outputSchema: {
      totals: z.record(z.string(), z.unknown()),
      publishedCount: z.number().int().min(0),
      postCount: z.number().int().min(0),
      accounts: z.array(z.record(z.string(), z.unknown())),
      engagementDefinition: z.string(),
    },
    annotations: readOnly,
  }, run(application, ({ projectId }) => {
    const report = application.analytics.report(uid, projectId);
    return {
      totals: report.totals,
      publishedCount: report.publishedCount,
      postCount: report.postCount,
      accounts: report.accounts.map(account => ({ id: account.id, platform: account.platform, label: account.label, status: account.status, totals: account.totals, postCount: account.posts.length })),
      engagementDefinition: report.engagementDefinition,
    };
  }));

  return server;
}

const jsonRpcError = (res, status, code, message, headers = {}) => res.status(status).set(headers).json({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

export function registerMeadowMcpRoutes(application) {
  const authenticate = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const key = application.apiKeys.token(req.headers.authorization);
    if (!key) return jsonRpcError(res, 401, -32001, "A Meadow API key is required.", { "WWW-Authenticate": "Bearer realm=\"Meadow MCP\"" });
    try {
      req.uid = application.apiKeys.authenticate(key);
      req.authType = "api_key";
      application.privacy.assertActive(req.uid);
      req.privacyRelease = application.privacy.track(req.uid, res);
      next();
    } catch (error) {
      const visible = publicError(error);
      return jsonRpcError(res, error.status || 401, -32001, visible.error, { "WWW-Authenticate": "Bearer realm=\"Meadow MCP\"" });
    }
  };

  const limiter = rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: req => req.uid,
    handler: (req, res) => jsonRpcError(res, 429, -32002, "Too many MCP requests. Please wait a moment."),
  });

  application.app.post("/mcp", authenticate, limiter, async (req, res) => {
    const server = createMeadowMcpServer(application, req.uid);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Meadow MCP request failed:", error.code || error.name);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, "The Meadow MCP request could not be completed.");
    } finally {
      req.privacyRelease?.();
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });

  for (const method of ["get", "delete"]) {
    application.app[method]("/mcp", authenticate, (req, res) => jsonRpcError(res, 405, -32000, "Method not allowed.", { Allow: "POST" }));
  }
}
