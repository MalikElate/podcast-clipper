import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { invariant, publicError } from "../core/errors.js";
import { metrics } from "../services/AnalyticsService.js";
import { meadowMcpScopes, meadowMcpMetadataPaths } from "./MeadowMcpOAuth.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const remoteRead = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const additive = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const mediaImport = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const uploadGrant = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const publishing = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Tools that act beyond reading need a second OAuth scope. API keys keep their
// owner's full access, as they do on the REST API.
const extraScopes = {
  create_draft: [meadowMcpScopes.draft],
  upload_media: [meadowMcpScopes.media],
  create_upload_url: [meadowMcpScopes.media],
  publish_post: [meadowMcpScopes.publish],
  publish_draft: [meadowMcpScopes.publish],
};
// Base64 media travels inside the JSON-RPC body, so keep it well under the /mcp body limit.
export const inlineMediaLimit = 10 * 1024 ** 2;

const metricValueShape = Object.fromEntries([...metrics, "engagement"].map(metric => [metric, z.number().min(0).optional()]));
const metricCoverageShape = Object.fromEntries(metrics.map(metric => [metric, z.object({ available: z.number().int().min(0), total: z.number().int().min(0) })]));
const analyticsTotalsSchema = z.object({ values: z.object(metricValueShape), coverage: z.object(metricCoverageShape) });
const deliverySchema = z.object({
  id: z.string(), accountId: z.string(), accountName: z.string(), platform: z.string(), status: z.string(),
  requestedAt: z.number(), dueAt: z.number(), url: z.string().optional(), error: z.string().optional(),
  deliveryMode: z.enum(["direct", "inbox"]).optional(), deliveredAt: z.number().optional(),
});
const postSchema = z.object({
  id: z.string(),
  caption: z.string(),
  title: z.string(),
  format: z.string(),
  status: z.enum(["draft", "scheduled", "publishing", "published", "awaiting_publish", "cancelled", "needs_attention", "partially_published"]),
  schedule: z.object({
    mode: z.enum(["now", "scheduled"]),
    timeZone: z.string(),
    localDateTime: z.string().optional(),
    requestedAt: z.number().optional(),
    offset: z.string().optional(),
  }),
  accountIds: z.array(z.string()),
  media: z.array(z.object({ id: z.string(), kind: z.string(), filename: z.string(), status: z.string() })),
  deliveries: z.array(deliverySchema),
  revision: z.number().int().min(1),
  editable: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const formatSchema = z.enum(["auto", "text", "image", "video", "carousel", "document", "reel", "story"]);
const scheduleInput = z.object({
  mode: z.enum(["now", "scheduled"]).default("now"),
  timeZone: z.string().optional().describe("IANA time zone; defaults to the project's"),
  localDateTime: z.string().max(40).optional().describe("Local time such as 2026-10-08T09:30 when mode is scheduled"),
});
const settingValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string().max(500)).max(10)]);
const destinationInput = z.object({
  caption: z.string().max(65000).optional(),
  title: z.string().max(500).optional(),
  format: formatSchema.optional(),
  localDateTime: z.string().max(40).optional().describe("A different scheduled local time for this account"),
  settings: z.record(z.string(), settingValue).optional().describe("Platform settings for this account; see the tool description"),
});
const settingsGuide = "Some platforms need settings in overrides[accountId].settings before they accept a post: "
  + "TikTok needs privacy (one of the privacyOptions from get_account_options) and consent: true for TikTok's Music Usage Confirmation, or deliveryMode: \"inbox\" with uploadConsent: true to send it to the TikTok inbox instead; optional allowComments, allowDuet, allowStitch, brandedContent, ownBrand, aiGenerated, autoMusic. "
  + "YouTube needs privacy (public, unlisted or private) and madeForKids (true or false). Pinterest needs boardId from get_account_options, with an optional link. "
  + "Bluesky accepts altText; Google Business accepts languageCode; Twitch and Kick accept replies (up to 10 follow-up messages) and replyToMessageId. "
  + "Ask the user for privacy, audience and consent choices instead of choosing them yourself.";
const postInputShape = {
  projectId: z.string().min(1).describe("A project ID returned by list_projects"),
  caption: z.string().max(65000).default(""),
  title: z.string().max(500).default(""),
  mediaIds: z.array(z.string().min(1).max(200)).max(35).default([]).describe("Media IDs returned by upload_media"),
  accountIds: z.array(z.string().min(1).max(200)).min(1).max(100).describe("Account IDs returned by list_accounts"),
  format: formatSchema.default("auto"),
  schedule: scheduleInput.optional(),
  overrides: z.record(z.string(), destinationInput).optional().describe("Per-account caption, title, format, time and platform settings, keyed by account ID"),
};
const mediaSchema = z.object({
  id: z.string(), kind: z.string(), filename: z.string(), mime: z.string(), bytes: z.number(), status: z.string(),
  width: z.number().optional(), height: z.number().optional(), durationSec: z.number().optional(),
});
const previewSchema = z.object({
  valid: z.boolean(),
  delayed: z.number().int().min(0),
  destinations: z.array(z.object({
    accountId: z.string(), accountName: z.string(), platform: z.string(), errors: z.array(z.string()),
    requestedAt: z.number().optional(), delayed: z.boolean().optional(),
  })),
});

const jsonResult = data => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

const toolError = error => {
  const visible = publicError(error);
  // Per-destination validation errors tell the agent exactly what to fix.
  const details = visible.code === "invalid_content" && visible.details ? `\n${JSON.stringify(visible.details)}` : "";
  return {
    isError: true,
    content: [{ type: "text", text: `${visible.error} (${visible.code})${details}` }],
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
  ...(account.avatar ? { avatar: account.avatar } : {}),
  ...(account.profileUrl ? { profileUrl: account.profileUrl } : {}),
  ...(Number.isFinite(account.updatedAt) ? { updatedAt: account.updatedAt } : {}),
});

const deliveryView = delivery => ({
  id: delivery.id,
  accountId: delivery.accountId,
  accountName: delivery.accountName,
  platform: delivery.platform,
  status: delivery.status,
  requestedAt: delivery.requestedAt,
  dueAt: delivery.dueAt,
  ...(delivery.deliveryMode ? { deliveryMode: delivery.deliveryMode } : {}),
  ...(Number.isFinite(delivery.deliveredAt) ? { deliveredAt: delivery.deliveredAt } : {}),
  ...(delivery.url ? { url: delivery.url } : {}),
  ...(delivery.error ? { error: delivery.error } : {}),
});

const scheduleView = schedule => ({
  mode: schedule.mode,
  timeZone: schedule.timeZone,
  ...(schedule.localDateTime ? { localDateTime: schedule.localDateTime } : {}),
  ...(Number.isFinite(schedule.requestedAt) ? { requestedAt: schedule.requestedAt } : {}),
  ...(schedule.offset ? { offset: schedule.offset } : {}),
});

const postView = post => ({
  id: post.id,
  caption: post.caption,
  title: post.title,
  format: post.format,
  status: post.status,
  schedule: scheduleView(post.schedule),
  accountIds: post.accountIds,
  media: post.media.map(item => ({ id: item.id, kind: item.kind, filename: item.filename, status: item.status })),
  deliveries: post.deliveries.map(deliveryView),
  revision: post.revision,
  editable: post.editable,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
});

const mediaView = media => ({
  id: media.id, kind: media.kind, filename: media.filename, mime: media.mime, bytes: media.bytes, status: media.status,
  ...(Number.isFinite(media.width) ? { width: media.width } : {}),
  ...(Number.isFinite(media.height) ? { height: media.height } : {}),
  ...(Number.isFinite(media.durationSec) ? { durationSec: media.durationSec } : {}),
});

const previewView = ({ rows, valid, delayed }) => ({
  valid,
  delayed,
  destinations: rows.flatMap(row => row.destinations).map(destination => ({
    accountId: destination.accountId, accountName: destination.accountName, platform: destination.platform, errors: destination.errors,
    ...(Number.isFinite(destination.requestedAt) ? { requestedAt: destination.requestedAt } : {}),
    ...(typeof destination.delayed === "boolean" ? { delayed: destination.delayed } : {}),
  })),
});

const accountOptionsView = (account, options = {}) => {
  const creator = options.creator;
  const permissions = options.tiktokPermissions;
  return {
    accountId: account.id,
    platform: account.platform,
    ...(Number.isFinite(options.remaining) ? { remainingPosts: options.remaining } : {}),
    ...(typeof options.note === "string" ? { note: options.note } : {}),
    ...(account.platform === "tiktok" ? { tiktok: {
      canPublish: permissions?.canPublish !== false,
      canSendToInbox: permissions?.canUpload !== false,
      privateOnly: Boolean(options.tiktokDirectPostPrivateOnly),
      privacyOptions: creator?.privacyOptions || [],
      ...(creator ? { commentsDisabled: Boolean(creator.commentsDisabled), duetDisabled: Boolean(creator.duetDisabled), stitchDisabled: Boolean(creator.stitchDisabled) } : {}),
      ...(Number.isFinite(creator?.maxVideoSeconds) ? { maxVideoSeconds: creator.maxVideoSeconds } : {}),
    } } : {}),
    ...(Array.isArray(options.boards) ? { pinterestBoards: options.boards.map(board => ({ id: String(board.id), name: String(board.name) })) } : {}),
  };
};

// Without a schedule a post goes out now; a schedule without a zone uses the project's.
const withTimeZone = (schedule, timeZone) => ({ mode: "now", ...schedule, timeZone: schedule?.timeZone || timeZone });

const postItem = (project, { caption, title, mediaIds, accountIds, format, schedule, overrides }) => ({
  caption, title, mediaIds, accountIds, format, overrides: overrides || {}, schedule: withTimeZone(schedule, project.timeZone),
});

const inlineBytes = data => {
  const encoded = data.replace(/^data:[\w.+-]+\/[\w.+-]+;base64,/, "").replace(/\s+/g, "");
  invariant(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) && encoded.length % 4 === 0, "data must be base64-encoded file bytes.");
  const bytes = Buffer.from(encoded, "base64");
  invariant(bytes.length > 0, "data is empty.");
  invariant(bytes.length <= inlineMediaLimit, `Inline uploads can be up to ${inlineMediaLimit / 1024 ** 2} MB. Pass a url, or use create_upload_url for larger files.`, { status: 413, code: "upload_limit" });
  return bytes;
};

const analyticsTotalsView = totals => ({
  values: Object.fromEntries(Object.entries(totals.values).filter(([, value]) => Number.isFinite(value))),
  coverage: Object.fromEntries(metrics.map(metric => [metric, totals.coverage[metric]])),
});

export function createMeadowMcpServer(application, uid, { authType = "api_key", scopes = [] } = {}) {
  const server = new McpServer(
    { name: "meadow", version: "0.1.0" },
    {
      instructions: "Use Meadow to review social publishing workspaces, connected accounts, saved posts, and analytics, and to upload media and publish or schedule posts. "
        + "Create a draft when the user wants to save content for later. Upload media with upload_media (a public url, base64 data, or a file attached in ChatGPT) or, for large local files, create_upload_url. "
        + "Before publishing, confirm the exact content, accounts and time with the user, call get_account_options for TikTok and Pinterest accounts, and call preview_post to check every destination. "
        + "publish_post and publish_draft queue deliveries; a post is live only when get_post shows its deliveries as published. Never claim a draft or queued post was published. "
        + "An awaiting_publish delivery has been sent to the TikTok inbox; the user must open TikTok to finish editing and posting. It is not a confirmed published post.",
    },
  );

  const toolDescriptors = [];
  const registerTool = (name, config, handler) => {
    const requiredScopes = [meadowMcpScopes.read, ...(extraScopes[name] || [])];
    const securitySchemes = [{ type: "oauth2", scopes: requiredScopes }];
    const metadata = { ...config._meta, securitySchemes };
    toolDescriptors.push({
      name, title: config.title, description: config.description,
      inputSchema: z.toJSONSchema(z.object(config.inputSchema), { target: "draft-7", io: "input" }),
      outputSchema: z.toJSONSchema(z.object(config.outputSchema), { target: "draft-7", io: "output" }),
      annotations: config.annotations, securitySchemes, _meta: metadata,
    });
    return server.registerTool(name, {
      ...config,
      securitySchemes,
      _meta: metadata,
    }, async (...args) => {
      if (application.mcpOAuth && (!uid || authType === "oauth_token" && !requiredScopes.every(scope => scopes.includes(scope)))) {
        return application.mcpOAuth.toolError(requiredScopes, Boolean(uid));
      }
      return handler(...args);
    });
  };

  registerTool("get_profile", {
    title: "Get Meadow profile",
    description: "Return the authenticated Meadow profile.",
    inputSchema: {},
    outputSchema: {
      id: z.string(),
      nickname: z.string(),
    },
    annotations: readOnly,
    _meta: { "openai/profile": true },
  }, run(application, () => ({ id: uid, nickname: "Meadow workspace" })));

  registerTool("list_projects", {
    title: "List Meadow projects",
    description: "List the social publishing projects owned by the connected Meadow profile.",
    inputSchema: {},
    outputSchema: { projects: z.array(z.object({
      id: z.string(), name: z.string(), timeZone: z.string(), createdAt: z.number(), updatedAt: z.number(),
    })) },
    annotations: readOnly,
  }, run(application, () => ({ projects: application.projects.list(uid).map(projectView) })));

  registerTool("list_accounts", {
    title: "List connected social accounts",
    description: "List the social accounts connected to one Meadow project without refreshing remote provider data.",
    inputSchema: { projectId: z.string().min(1).describe("A project ID returned by list_projects") },
    outputSchema: { accounts: z.array(z.object({
      id: z.string(), platform: z.string(), label: z.string(), status: z.string(), avatar: z.string().optional(), profileUrl: z.string().optional(), updatedAt: z.number().optional(),
    })) },
    annotations: readOnly,
  }, run(application, ({ projectId }) => ({ accounts: application.accounts.list(uid, projectId).map(accountView) })));

  registerTool("list_posts", {
    title: "List Meadow posts",
    description: "List drafts, scheduled posts, and publishing history for one Meadow project. Results are newest first and paginated by offset.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      status: z.enum(["draft", "scheduled", "publishing", "published", "awaiting_publish", "cancelled", "needs_attention", "partially_published"]).optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
    },
    outputSchema: {
      posts: z.array(postSchema),
      total: z.number().int().min(0),
      nextOffset: z.number().int().min(0).optional(),
    },
    annotations: readOnly,
  }, run(application, ({ projectId, status, offset, limit }) => {
    const matches = application.posts.list(uid, projectId)
      .filter(post => !status || post.status === status)
      .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt);
    const posts = matches.slice(offset, offset + limit).map(postView);
    const nextOffset = offset + posts.length < matches.length ? offset + posts.length : undefined;
    return { posts, total: matches.length, ...(nextOffset === undefined ? {} : { nextOffset }) };
  }));

  registerTool("get_post", {
    title: "Get a Meadow post",
    description: "Get one draft, scheduled post, or publishing-history item by ID.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      postId: z.string().min(1).describe("A post ID returned by list_posts or create_draft"),
    },
    outputSchema: { post: postSchema },
    annotations: readOnly,
  }, run(application, ({ projectId, postId }) => ({ post: postView(application.posts.get(uid, projectId, postId)) })));

  registerTool("create_draft", {
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
    outputSchema: { post: postSchema, duplicate: z.boolean() },
    annotations: additive,
  }, run(application, ({ projectId, requestId, caption, title, mediaIds, accountIds, format, schedule }) => {
    const result = application.posts.createDrafts(uid, projectId, {
      requestId,
      items: [{ caption, title, mediaIds, accountIds, format, overrides: {}, ...(schedule ? { schedule } : {}) }],
    });
    return { post: postView(result.posts[0]), duplicate: Boolean(result.duplicate) };
  }, { flush: true }));

  registerTool("get_account_options", {
    title: "Get account publishing options",
    description: "Fetch the current publishing options for one connected account from its platform: TikTok privacy choices and interaction limits, Pinterest boards, and any known posting allowance. Call it before publishing to TikTok or Pinterest.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      accountId: z.string().min(1).describe("An account ID returned by list_accounts"),
    },
    outputSchema: {
      accountId: z.string(),
      platform: z.string(),
      remainingPosts: z.number().optional(),
      note: z.string().optional(),
      tiktok: z.object({
        canPublish: z.boolean(), canSendToInbox: z.boolean(), privateOnly: z.boolean(), privacyOptions: z.array(z.string()),
        commentsDisabled: z.boolean().optional(), duetDisabled: z.boolean().optional(), stitchDisabled: z.boolean().optional(), maxVideoSeconds: z.number().optional(),
      }).optional(),
      pinterestBoards: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
    },
    annotations: remoteRead,
  }, run(application, async ({ projectId, accountId }) => {
    const account = application.accounts.require(uid, projectId, accountId);
    return accountOptionsView(account, await application.accounts.options(uid, projectId, accountId));
  }));

  registerTool("upload_media", {
    title: "Upload media to Meadow",
    description: `Add an image, video, PDF, Word or PowerPoint file to a Meadow project and return its media ID for publish_post, create_draft or publish_draft. Pass exactly one of: url (a public HTTP or HTTPS address that Meadow downloads; preferred for files over a few MB), data (base64 file bytes, up to ${inlineMediaLimit / 1024 ** 2} MB), or file (a file the user attached in ChatGPT). For a large local file, use create_upload_url instead.`,
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      url: z.string().max(4096).optional().describe("A public HTTP or HTTPS URL of the file"),
      data: z.string().optional().describe("Base64-encoded file bytes, optionally as a data: URL"),
      file: z.object({
        download_url: z.string().max(4096),
        file_id: z.string(),
        mime_type: z.string().optional(),
        file_name: z.string().optional(),
      }).optional().describe("A file attached in ChatGPT"),
      filename: z.string().max(180).optional().describe("A filename to show in Meadow"),
    },
    outputSchema: { media: mediaSchema },
    annotations: mediaImport,
    _meta: { "openai/fileParams": ["file"] },
  }, run(application, async ({ projectId, url, data, file, filename }) => {
    invariant([url, data, file].filter(value => value !== undefined).length === 1, "Pass exactly one of url, data or file.");
    application.projects.require(uid, projectId);
    invariant(application.media.signingKey, "Media storage is not configured on this server.", { status: 503 });
    const target = path.join(application.incomingDirectory, `mcp-${randomUUID()}`);
    try {
      let name = filename;
      if (data !== undefined) await fs.promises.writeFile(target, inlineBytes(data), { mode: 0o600 });
      else {
        const downloaded = await application.downloadMedia(file ? file.download_url : url, target, { maxBytes: application.media.maxBytes });
        name ||= file?.file_name || downloaded.filename;
      }
      const record = await application.media.ingest(uid, projectId, { path: target, originalname: name }, { source: "mcp" });
      return { media: mediaView(record) };
    } finally {
      await fs.promises.unlink(target).catch(() => {});
    }
  }, { flush: true }));

  registerTool("create_upload_url", {
    title: "Create a media upload link",
    description: "Create a one-time link for uploading one large local file to a Meadow project, for clients that can run HTTP requests such as curl. Send the file as multipart form field \"file\" with the returned Authorization header before the link expires in 30 minutes; the response contains the media ID. The file must be exactly the declared size.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      bytes: z.number().int().min(1).describe("The exact file size in bytes"),
    },
    outputSchema: {
      uploadUrl: z.string(),
      method: z.literal("POST"),
      headers: z.object({ Authorization: z.string() }),
      fileField: z.literal("file"),
      expiresAt: z.number(),
      example: z.string(),
    },
    annotations: uploadGrant,
  }, run(application, ({ projectId, bytes }) => {
    invariant(application.media.signingKey, "Media storage is not configured on this server.", { status: 503 });
    const { uploadToken, expiresAt } = application.uploadTokens.create(uid, projectId, { bytes });
    const uploadUrl = new URL(`/api/bridge/projects/${encodeURIComponent(projectId)}/media`, application.publicUrl).href;
    const authorization = `Bearer ${uploadToken}`;
    return { uploadUrl, method: "POST", headers: { Authorization: authorization }, fileField: "file", expiresAt, example: `curl -X POST "${uploadUrl}" -H "Authorization: ${authorization}" -F "file=@/path/to/file"` };
  }, { flush: true }));

  registerTool("preview_post", {
    title: "Preview a Meadow post",
    description: `Check a post against every selected account without publishing it. Returns each destination's validation errors and the time Meadow would deliver it. ${settingsGuide}`,
    inputSchema: postInputShape,
    outputSchema: { preview: previewSchema },
    annotations: remoteRead,
  }, run(application, async input => {
    const project = application.projects.require(uid, input.projectId);
    return { preview: previewView(await application.posts.preview(uid, input.projectId, { items: [postItem(project, input)] })) };
  }));

  registerTool("publish_post", {
    title: "Publish or schedule a Meadow post",
    description: `Publish a post now or schedule it on the selected connected accounts. Confirm the content, accounts and time with the user first. Meadow queues one delivery per account; the post is live only when get_post reports its deliveries as published. Reuse the same requestId when retrying so the post is not queued twice. ${settingsGuide}`,
    inputSchema: {
      ...postInputShape,
      requestId: z.string().regex(/^[\w-]{16,100}$/).describe("A stable 16-100 character idempotency identifier"),
    },
    outputSchema: { post: postSchema, duplicate: z.boolean(), delayed: z.number().int().min(0) },
    annotations: publishing,
  }, run(application, async input => {
    const project = application.projects.require(uid, input.projectId);
    const result = await application.posts.submit(uid, input.projectId, { requestId: input.requestId, items: [postItem(project, input)] });
    return { post: postView(result.posts[0]), duplicate: Boolean(result.duplicate), delayed: result.delayed || 0 };
  }, { flush: true }));

  registerTool("publish_draft", {
    title: "Publish or schedule a Meadow draft",
    description: "Publish a saved draft with its saved content, accounts and per-account settings, now or at its saved time. Pass schedule to change when it goes out. Confirm with the user first. Reuse the same requestId when retrying.",
    inputSchema: {
      projectId: z.string().min(1).describe("A project ID returned by list_projects"),
      postId: z.string().min(1).describe("A draft ID returned by list_posts or create_draft"),
      requestId: z.string().regex(/^[\w-]{16,100}$/).describe("A stable 16-100 character idempotency identifier"),
      revision: z.number().int().min(1).optional().describe("The draft revision you reviewed; publishing stops if the draft changed since"),
      schedule: scheduleInput.optional(),
    },
    outputSchema: { post: postSchema, duplicate: z.boolean(), delayed: z.number().int().min(0) },
    annotations: publishing,
  }, run(application, async ({ projectId, postId, requestId, revision, schedule }) => {
    const draft = application.posts.getDraft(uid, projectId, postId);
    const item = { caption: draft.caption, title: draft.title, mediaIds: draft.mediaIds, accountIds: draft.accountIds, overrides: draft.overrides || {}, format: draft.format, schedule: schedule ? withTimeZone(schedule, draft.schedule.timeZone) : draft.schedule };
    const result = await application.posts.submit(uid, projectId, { requestId, draftId: postId, revision: revision ?? draft.revision, items: [item] });
    return { post: postView(result.posts[0]), duplicate: Boolean(result.duplicate), delayed: result.delayed || 0 };
  }, { flush: true }));

  registerTool("get_analytics", {
    title: "Get Meadow analytics",
    description: "Return cached analytics totals for one Meadow project. This does not contact social platforms or refresh their metrics.",
    inputSchema: { projectId: z.string().min(1).describe("A project ID returned by list_projects") },
    outputSchema: {
      totals: analyticsTotalsSchema,
      publishedCount: z.number().int().min(0),
      postCount: z.number().int().min(0),
      accounts: z.array(z.object({
        id: z.string(), platform: z.string(), label: z.string(), status: z.string(), totals: analyticsTotalsSchema, postCount: z.number().int().min(0),
      })),
      engagementDefinition: z.string(),
    },
    annotations: readOnly,
  }, run(application, ({ projectId }) => {
    const report = application.analytics.report(uid, projectId);
    return {
      totals: analyticsTotalsView(report.totals),
      publishedCount: report.publishedCount,
      postCount: report.postCount,
      accounts: report.accounts.map(account => ({ id: account.id, platform: account.platform, label: account.label, status: account.status, totals: analyticsTotalsView(account.totals), postCount: account.posts.length })),
      engagementDefinition: report.engagementDefinition,
    };
  }));

  // The installed SDK serializes standard descriptor fields and _meta only.
  // Keep its execution/validation, and include the OAuth declaration both at
  // the descriptor root and in the compatibility mirror used by older hosts.
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDescriptors }));
  return server;
}

const jsonRpcError = (res, status, code, message, headers = {}) => res.status(status).set(headers).json({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

export function registerMeadowMcpRoutes(application) {
  const oauth = application.mcpOAuth;
  if (oauth) application.app.get(meadowMcpMetadataPaths, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(oauth.metadata);
  });
  const challenge = error => oauth ? oauth.challenge({ error }) : 'Bearer realm="Meadow MCP"';
  const authenticate = async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const key = application.apiKeys.token(req.headers.authorization);
    try {
      if (key) {
        req.uid = application.apiKeys.authenticate(key);
        req.authType = "api_key";
      } else if (oauth) {
        const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
        // MCP clients start OAuth only on an HTTP 401 challenge, so anonymous
        // requests, including initialize, must receive one.
        if (!token) return jsonRpcError(res, 401, -32001, "Sign in to Meadow to continue.", { "WWW-Authenticate": challenge() });
        const verified = await oauth.verify(token);
        req.uid = verified.uid;
        req.mcpScopes = verified.scopes;
        req.authType = "oauth_token";
      } else {
        return jsonRpcError(res, 401, -32001, "A Meadow API key is required.", { "WWW-Authenticate": challenge() });
      }
      application.privacy.assertActive(req.uid);
      req.privacyRelease = application.privacy.track(req.uid, res);
      next();
    } catch (error) {
      const visible = key ? publicError(error).error : "Sign in to Meadow again to continue.";
      return jsonRpcError(res, error.status || 401, -32001, visible, { "WWW-Authenticate": challenge("invalid_token") });
    }
  };

  const limiter = rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: req => req.uid ? `user:${req.uid}` : `anonymous:${ipKeyGenerator(req.ip)}`,
    handler: (req, res) => jsonRpcError(res, 429, -32002, "Too many MCP requests. Please wait a moment."),
  });

  // Signed-in clients may send base64 media inline.
  const body = express.json({ limit: "16mb" });

  application.app.post("/mcp", authenticate, limiter, body, async (req, res) => {
    const server = createMeadowMcpServer(application, req.uid, { authType: req.authType, scopes: req.mcpScopes });
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
