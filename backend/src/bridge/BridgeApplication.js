import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteStore } from "./storage/SqliteStore.js";
import { durableResponseBarrier } from "./storage/DurableDatabase.js";
import { LocalMediaStorage } from "./storage/LocalMediaStorage.js";
import { DurableMediaStorage } from "./storage/DurableMediaStorage.js";
import { ProjectService } from "./services/ProjectService.js";
import { ScheduleService } from "./services/ScheduleService.js";
import { MediaService } from "./services/MediaService.js";
import { UploadTokenService } from "./services/UploadTokenService.js";
import { AccountService } from "./services/AccountService.js";
import { PostService } from "./services/PostService.js";
import { RateLimitService } from "./services/RateLimitService.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { AccountViewsService } from "./services/AccountViewsService.js";
import { ApiKeyService } from "./services/ApiKeyService.js";
import { PublishingWorker } from "./services/PublishingWorker.js";
import { BillingService } from "./services/BillingService.js";
import { AnalyticsErasureService } from "./services/AnalyticsErasureService.js";
import { PrivacyService } from "./services/PrivacyService.js";
import { MetaPrivacyService } from "./services/MetaPrivacyService.js";
import { SecretVault } from "./core/SecretVault.js";
import { LockService } from "./core/LockService.js";
import { BridgeError, invariant, publicError } from "./core/errors.js";
import { ProviderRegistry } from "./platforms/ProviderRegistry.js";
import { connectionDisclosures, connectionDisclosure } from "./platforms/connectionPrivacy.js";
import { InstagramProvider, FacebookProvider, ThreadsProvider } from "./platforms/MetaProviders.js";
import { YouTubeProvider, GoogleBusinessProvider } from "./platforms/GoogleProviders.js";
import { TikTokProvider } from "./platforms/TikTokProvider.js";
import { XProvider } from "./platforms/XProvider.js";
import { LinkedInProvider } from "./platforms/LinkedInProvider.js";
import { PinterestProvider } from "./platforms/PinterestProvider.js";
import { BlueskyProvider } from "./platforms/BlueskyProvider.js";
import { SnapchatProvider } from "./platforms/UpcomingProviders.js";
import { TelegramProvider } from "./platforms/TelegramProvider.js";
import { clerkMiddleware, clerkClient } from "@clerk/express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { requireAuth } from "../lib/clerkAuth.js";
import { registerMeadowMcpRoutes } from "./mcp/MeadowMcpServer.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next).finally(() => req.privacyRelease?.());

/** Composition root. Services, repository, adapters and authentication are replaceable. */
export class BridgeApplication {
  constructor({ env = process.env, store, durability, registry, storage, authMiddleware, stripe, deleteIdentity, deleteAnalytics, clock = () => Date.now() } = {}) {
    this.env = env; this.clock = clock;
    this.localPreview = env.BRIDGE_LOCAL_PREVIEW === "1" && env.NODE_ENV !== "production";
    this.dataDir = path.resolve(env.BRIDGE_DATA_DIR || path.join(backendDir, ".bridge"));
    this.publicUrl = (env.BRIDGE_PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");
    this.appUrl = (env.BRIDGE_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.store = store || new SqliteStore(path.join(this.dataDir, "bridge.sqlite"), { durability });
    this.apiKeys = new ApiKeyService(this.store, { clock });
    this.vault = new SecretVault(env.BRIDGE_ENCRYPTION_KEY);
    this.projects = new ProjectService(this.store);
    this.schedules = new ScheduleService({ clock });
    this.locks = new LockService(this.store, { clock });
    this.storage = storage || (env.BRIDGE_DURABLE_STORAGE_URL ? new DurableMediaStorage(path.join(this.dataDir, "media"), { baseUrl: env.BRIDGE_DURABLE_STORAGE_URL }) : new LocalMediaStorage(path.join(this.dataDir, "media")));
    // Preview needs stable download links without enabling OAuth credentials.
    let signingKey = env.BRIDGE_MEDIA_SIGNING_KEY;
    if (!signingKey && this.localPreview) {
      const keyPath = path.join(this.dataDir, "preview-media-key");
      try { signingKey = fs.readFileSync(keyPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; signingKey = randomBytes(32).toString("base64"); fs.writeFileSync(keyPath, signingKey, { mode: 0o600 }); }
    }
    const deps = { env, publicUrl: this.publicUrl, store: this.store, vault: this.vault, locks: this.locks };
    this.registry = registry || new ProviderRegistry([InstagramProvider, TikTokProvider, SnapchatProvider, YouTubeProvider, FacebookProvider, XProvider, LinkedInProvider, PinterestProvider, ThreadsProvider, BlueskyProvider, TelegramProvider, GoogleBusinessProvider].map(Provider => new Provider(deps)), { disabled: (env.BRIDGE_DISABLED_PLATFORMS || "").split(",").filter(Boolean) });
    this.media = new MediaService({ store: this.store, projects: this.projects, storage: this.storage, publicUrl: this.publicUrl, signingKey, clock, maxBytes: Number(env.BRIDGE_MAX_UPLOAD_MB || 1024) * 1024 ** 2 });
    this.uploadTokens = new UploadTokenService({ store: this.store, projects: this.projects, maxBytes: this.media.maxBytes, clock });
    this.rates = new RateLimitService({ store: this.store, clock });
    this.accounts = new AccountService({ ...deps, registry: this.registry, projects: this.projects, clock, localPreview: this.localPreview });
    this.posts = new PostService({ store: this.store, projects: this.projects, accounts: this.accounts, registry: this.registry, media: this.media, schedules: this.schedules, rates: this.rates, clock, localPreview: this.localPreview });
    this.analytics = new AnalyticsService({ store: this.store, projects: this.projects, accounts: this.accounts, registry: this.registry, posts: this.posts, clock });
    this.accountViews = new AccountViewsService({ store: this.store, projects: this.projects, accounts: this.accounts, registry: this.registry, clock });
    this.billing = new BillingService({ store: this.store, env, appUrl: this.appUrl, stripe, locks: this.locks, clock });
    this.privacy = new PrivacyService({ ...deps, registry: this.registry, storage: this.storage, projects: this.projects, billing: this.billing, clock,
      deleteIdentity: deleteIdentity || (async uid => { if (this.localPreview) return; try { await clerkClient.users.deleteUser(uid); } catch (error) { if (error.status !== 404) throw error; } }),
      deleteAnalytics: deleteAnalytics || (uid => this.localPreview ? Promise.resolve(true) : new AnalyticsErasureService({ store: this.store, env }).deleteForOwner(uid)) });
    this.projects.privacy = this.privacy; this.accounts.privacy = this.privacy; this.privacy.accounts = this.accounts; this.privacy.media = this.media;
    this.metaPrivacy = new MetaPrivacyService({ ...deps, privacy: this.privacy, clock });
    this.accounts.metaPrivacy = this.metaPrivacy; this.privacy.metaPrivacy = this.metaPrivacy;
    this.worker = new PublishingWorker({ store: this.store, accounts: this.accounts, registry: this.registry, posts: this.posts, rates: this.rates, media: this.media, locks: this.locks, analytics: this.analytics, clock, enabled: !this.localPreview && env.BRIDGE_PUBLISHING_ENABLED !== "false" });
    const incoming = path.join(this.dataDir, "incoming"); fs.mkdirSync(incoming, { recursive: true, mode: 0o700 });
    this.privacy.incomingDirectory = incoming;
    this.upload = multer({ dest: incoming, limits: { fileSize: this.media.maxBytes, files: 1, fields: 0 } });
    this.receiveUpload = (req, res, next) => {
      const upload = req.uploadGrant ? multer({ dest: incoming, limits: { fileSize: req.uploadGrant.bytes, files: 1, fields: 0 } }) : this.upload;
      upload.single("file")(req, res, next);
    };
    this.app = express(); this.app.disable("x-powered-by");
    if (durability) this.app.use(durableResponseBarrier(this.store));
    if (env.BRIDGE_TRUST_PROXY) this.app.set("trust proxy", Number(env.BRIDGE_TRUST_PROXY));
    this.app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
    this.app.post(["/api/meta/:platform/deauthorize", "/api/meta/:platform/data-deletion"], express.urlencoded({ extended: false, limit: "20kb", parameterLimit: 5 }), route(async (req, res) => {
      const result = this.metaPrivacy.receive(req.params.platform, req.body?.signed_request);
      await this.store.flush?.();
      res.setHeader("Cache-Control", "no-store"); res.json(result);
    }));
    this.app.get("/api/meta/deletion-status/:code", route((req, res) => {
      const result = this.metaPrivacy.status(req.params.code);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Data deletion · Meadow</title><main><h1>Meadow data deletion</h1><p>${result.status === "complete" ? "Your connected Meta account data has been deleted from Meadow. If Meadow held no matching data, no deletion was needed." : "Your request has been received. Publication from the affected connections is stopped and deletion is in progress."}</p><p>Confirmation: ${result.confirmationCode}</p><p>This request covers data received through the connected Meta account. To delete your entire Meadow account and uploaded media, use Settings → Privacy &amp; Account.</p><a href="/privacy/">Privacy policy</a></main></html>`);
    }));
    this.app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), route(async (req, res) => res.json(await this.billing.webhook(req.body, req.headers["stripe-signature"]))));
    this.app.post("/api/tiktok/webhook", express.raw({ type: "application/json", limit: "1mb" }), route((req, res) => res.json(this.privacy.tiktokWebhook(req.body, req.headers["tiktok-signature"]))));
    this.app.post("/api/clerk/webhook", express.raw({ type: "application/json", limit: "1mb" }), route(async (req, res) => {
      invariant(env.CLERK_WEBHOOK_SIGNING_SECRET, "Account webhooks are not configured.", { status: 503 });
      let event; try { event = await verifyWebhook(req, { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET }); } catch { invariant(false, "Invalid account webhook signature."); }
      if (event.type === "user.deleted" && event.data.id) this.privacy.requestAccount(event.data.id, {}, { identityAlreadyDeleted: true });
      res.json({ received: true });
    }));
    const origins = new Set([new URL(this.appUrl).origin, new URL(this.publicUrl).origin]);
    if (this.localPreview) { origins.add("http://127.0.0.1:5173"); origins.add("http://localhost:5173"); }
    this.app.use(cors({ origin: (origin, done) => done(null, !origin || origins.has(origin)), methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization", "X-Bridge-Preview", "MCP-Protocol-Version", "MCP-Session-Id", "Last-Event-ID"] }));
    this.app.use(express.json({ limit: "2mb" }));
    this.app.get("/health", (req, res) => res.json({ status: "ok", app: "Meadow" }));
    this.registerPublicRoutes();
    registerMeadowMcpRoutes(this);
    let clerkAuth;
    const userAuth = authMiddleware || ((req, res, next) => {
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (this.localPreview && loopback && req.headers["x-bridge-preview"] === "1") {
        if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: "Unrecognized preview origin." });
        req.uid = "bridge-local-preview"; return next();
      }
      clerkAuth ||= clerkMiddleware();
      return clerkAuth(req, res, error => error ? next(error) : requireAuth(req, res, next));
    });
    this.app.use("/api/bridge", (req, res, next) => {
      if (this.uploadTokens.matches(req.headers.authorization)) {
        res.setHeader("Cache-Control", "no-store");
        try {
          req.uploadGrant = this.uploadTokens.consume(req.headers.authorization, req.method, req.path);
          req.uid = req.uploadGrant.uid;
          req.authType = "upload_token";
          return next();
        } catch (error) { return next(error); }
      }
      const key = this.apiKeys.token(req.headers.authorization);
      req.authType = key ? "api_key" : "session";
      if (!key) return userAuth(req, res, next);
      try { req.uid = this.apiKeys.authenticate(key); return next(); } catch (error) { return next(error); }
    });
    this.app.use("/api/bridge", rateLimit({ windowMs: 60000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: req => req.uid || "anonymous", message: { error: "Too many requests. Please wait a moment." } }));
    this.app.use("/api/bridge", (req, res, next) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        req.privacyRelease = this.privacy.track(req.uid, res);
        if (!req.path.startsWith("/privacy")) {
          this.privacy.assertActive(req.uid);
        }
        next();
      } catch (error) { next(error); }
    });
    this.registerRoutes();
    this.app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found." }));
    const frontend = path.resolve(backendDir, "../frontend/dist");
    if (env.BRIDGE_SERVE_FRONTEND === "true" && fs.existsSync(frontend)) {
      this.app.use(express.static(frontend));
      this.app.get("*", (req, res) => res.sendFile(path.join(frontend, "index.html")));
    }
    this.app.use((error, req, res, next) => {
      req.privacyRelease?.();
      if (res.headersSent) return next(error);
      if (req.path === "/mcp") {
        const parseError = error.type === "entity.parse.failed";
        return res.status(parseError ? 400 : error instanceof BridgeError ? error.status : 500).json({
          jsonrpc: "2.0",
          error: { code: parseError ? -32700 : error instanceof BridgeError ? -32000 : -32603, message: parseError ? "Invalid JSON request." : publicError(error).error },
          id: null,
        });
      }
      if (error instanceof multer.MulterError) error = new BridgeError(error.code === "LIMIT_FILE_SIZE" ? (req.uploadGrant ? "The file exceeds the authorized upload size. Select the file again." : `Files can be up to ${this.media.maxBytes / 1024 ** 2} MB.`) : "Upload one file at a time.", { status: 413, code: "upload_limit" });
      if (error.type === "entity.parse.failed") error = new BridgeError("Invalid JSON request.");
      if (!(error instanceof BridgeError)) console.error("Meadow request failed:", error.code || error.name);
      res.status(error instanceof BridgeError ? error.status : 500).json(publicError(error));
    });
  }

  registerPublicRoutes() {
    const app = this.app;
    app.post("/api/telegram/webhook", route(async (req, res) => {
      const provider = this.registry.get("telegram");
      invariant(provider.verifyWebhook(req.headers["x-telegram-bot-api-secret-token"]), "Invalid Telegram webhook signature.", { status: 401 });
      res.json(await this.accounts.telegramWebhook(req.body));
    }));
    app.get("/oauth/bluesky/client-metadata.json", route(async (req, res) => res.json((await this.registry.get("bluesky").client()).clientMetadata)));
    app.get("/oauth/bluesky/jwks.json", route(async (req, res) => res.json((await this.registry.get("bluesky").client()).jwks)));
    app.get("/oauth/:platform/callback", route(async (req, res) => {
      const target = new URL("/dashboard/connections", this.appUrl);
      try {
        const result = await this.accounts.callback(req.params.platform, new URL(req.originalUrl, this.publicUrl).searchParams);
        target.searchParams.set("project", result.projectId);
        if (result.connectionId) target.searchParams.set("connection", result.connectionId);
      } catch (error) { target.searchParams.set("connectionError", error instanceof BridgeError ? error.message : "The account could not be connected. Please try again."); }
      res.setHeader("Cache-Control", "no-store"); res.redirect(303, target.toString());
    }));
    app.get("/media/:id/:variant", route(async (req, res) => {
      const result = this.media.verify(req.params.id, req.params.variant, req.query.expires, req.query.signature, req.query.download === "1");
      await this.storage.ensure?.(result.key);
      this.media.verify(req.params.id, req.params.variant, req.query.expires, req.query.signature, req.query.download === "1");
      res.setHeader("Cache-Control", "private, no-store");
      res.type(result.mime);
      if (req.query.download === "1" || result.record.kind === "document") res.attachment(result.record.filename);
      res.sendFile(result.key, { root: this.storage.root, dotfiles: "deny" });
    }));
  }

  registerRoutes() {
    const app = this.app, root = "/api/bridge/projects/:projectId";
    app.get("/api/bridge/privacy", route((req, res) => res.json(this.privacy.status(req.uid))));
    const requireSession = req => invariant(req.authType === "session", "Use your signed-in Meadow account for this action.", { status: 403, code: "session_required" });
    app.get("/api/bridge/privacy/connections", route((req, res) => res.json({ disclosures: connectionDisclosures })));
    app.get("/api/bridge/privacy/connections/:platform", route((req, res) => {
      const disclosure = connectionDisclosure(req.params.platform);
      invariant(disclosure, "Connection privacy notice not found.", { status: 404 });
      res.json({ disclosure });
    }));
    app.delete("/api/bridge/privacy/account", route((req, res) => { requireSession(req); res.status(202).json(this.privacy.requestAccount(req.uid, req.body)); }));
    app.get("/api/bridge/config", route((req, res) => res.json({ name: "Meadow", localPreview: this.localPreview, platforms: this.registry.catalog().map(platform => ({ ...platform, privacyDisclosure: Boolean(connectionDisclosure(platform.id)) })), maxBatchSize: 100, maxUploadBytes: this.media.maxBytes, features: { analytics: true, publishing: this.worker.enabled }, connectionsReady: this.vault.configured, mediaReady: Boolean(this.media.signingKey) })));
    app.get("/api/bridge/billing", route(async (req, res) => res.json(await this.billing.record(req.uid, req.query.refresh === "1"))));
    app.post("/api/bridge/billing/checkout", route(async (req, res) => res.json(await this.billing.checkout(req.uid, req.userEmail, req.body, req.headers["sec-gpc"] === "1" || req.headers.dnt === "1" ? undefined : req.headers.cookie))));
    app.post("/api/bridge/billing/checkout/confirm", route(async (req, res) => res.json(await this.billing.confirmCheckout(req.uid, req.body?.sessionId))));
    app.post("/api/bridge/billing/portal", route(async (req, res) => res.json(await this.billing.portal(req.uid))));
    app.get("/api/bridge/api-keys", route((req, res) => res.json({ apiKeys: this.apiKeys.list(req.uid) })));
    app.post("/api/bridge/api-keys", route((req, res) => res.status(201).json(this.apiKeys.create(req.uid, req.body))));
    app.delete("/api/bridge/api-keys/:id", route((req, res) => res.json(this.apiKeys.remove(req.uid, req.params.id))));
    app.get("/api/bridge/projects", route((req, res) => res.json({ projects: this.projects.list(req.uid) })));
    app.post("/api/bridge/projects/default", route((req, res) => res.json({ project: this.projects.ensureDefault(req.uid, req.body) })));
    app.patch(root, route((req, res) => res.json({ project: this.projects.update(req.uid, req.params.projectId, req.body) })));
    app.post("/api/bridge/schedule/resolve", route((req, res) => res.json(this.schedules.resolve(req.body))));
    app.get(`${root}/accounts`, route(async (req, res) => res.json({ accounts: await this.accounts.listFresh(req.uid, req.params.projectId) })));
    app.post(`${root}/accounts/connect/:platform`, route(async (req, res) => {
      if (connectionDisclosure(req.params.platform)) requireSession(req);
      res.json(await this.accounts.start(req.uid, req.params.projectId, req.params.platform, req.body));
    }));
    app.get(`${root}/connections/:id`, route(async (req, res) => res.json(await this.accounts.pending(req.uid, req.params.projectId, req.params.id))));
    app.post(`${root}/connections/:id`, route((req, res) => res.json({ accounts: this.accounts.attach(req.uid, req.params.projectId, req.params.id, req.body.selectedIds) })));
    app.get(`${root}/accounts/:id/options`, route(async (req, res) => res.json({ options: await this.accounts.options(req.uid, req.params.projectId, req.params.id, { force: req.query.refresh === "1" }) })));
    app.delete(`${root}/accounts/:id`, route((req, res) => res.status(202).json(this.privacy.requestConnection(req.uid, req.params.projectId, req.params.id))));
    app.get(`${root}/media`, route((req, res) => res.json({ media: this.media.list(req.uid, req.params.projectId) })));
    app.post(`${root}/media/uploads`, route((req, res) => {
      invariant(this.media.signingKey, "Media storage is not configured on this server.", { status: 503 });
      res.status(201).json(this.uploadTokens.create(req.uid, req.params.projectId, req.body));
    }));
    app.post(`${root}/media`, (req, res, next) => { try { this.projects.require(req.uid, req.params.projectId); invariant(this.media.signingKey, "Media storage is not configured on this server.", { status: 503 }); next(); } catch (error) { next(error); } }, this.receiveUpload, route(async (req, res) => {
      invariant(req.file, "Choose a file to upload.");
      try {
        invariant(!req.uploadGrant || req.file.size === req.uploadGrant.bytes, "The uploaded file size did not match. Select the file again.", { code: "upload_size_mismatch" });
        res.status(201).json({ media: this.media.toPublic(await this.media.ingest(req.uid, req.params.projectId, req.file)) });
      }
      finally { await fs.promises.unlink(req.file.path).catch(() => {}); }
    }));
    app.delete(`${root}/media/:id`, route(async (req, res) => res.json(await this.media.remove(req.uid, req.params.projectId, req.params.id))));
    app.get(`${root}/posts`, route((req, res) => res.json({ posts: this.posts.list(req.uid, req.params.projectId) })));
    app.get(`${root}/posts/:id`, route((req, res) => res.json({ post: this.posts.getDraft(req.uid, req.params.projectId, req.params.id) })));
    app.post(`${root}/posts/preview`, route(async (req, res) => res.json(await this.posts.preview(req.uid, req.params.projectId, req.body))));
    app.post(`${root}/posts/drafts`, route((req, res) => res.status(201).json(this.posts.createDrafts(req.uid, req.params.projectId, req.body))));
    app.post(`${root}/posts`, route(async (req, res) => res.status(201).json(await this.posts.submit(req.uid, req.params.projectId, req.body))));
    app.patch(`${root}/posts/:id`, route(async (req, res) => res.json({ post: await this.posts.update(req.uid, req.params.projectId, req.params.id, req.body) })));
    app.post(`${root}/posts/:id/cancel`, route((req, res) => res.json({ post: this.posts.cancel(req.uid, req.params.projectId, req.params.id) })));
    app.delete(`${root}/posts/:id`, route((req, res) => res.json(this.posts.remove(req.uid, req.params.projectId, req.params.id, req.body))));
    app.post(`${root}/queue/reorder`, route((req, res) => res.json({ posts: this.posts.reorder(req.uid, req.params.projectId, req.body.accountId, req.body.deliveryIds) })));
    app.post(`${root}/deliveries/:id/retry`, route((req, res) => res.json({ post: this.posts.retry(req.uid, req.params.projectId, req.params.id, req.body) })));
    app.get(`${root}/analytics`, route((req, res) => res.json(this.analytics.report(req.uid, req.params.projectId))));
    app.get(`${root}/analytics/account-views`, route(async (req, res) => res.json(await this.accountViews.report(req.uid, req.params.projectId, { days: req.query.days ?? 180, refresh: req.query.refresh === "true", ...(req.query.accountIds !== undefined ? { accountIds: typeof req.query.accountIds === "string" ? req.query.accountIds.split(",") : [] } : {}) }))));
    app.post(`${root}/analytics/refresh`, route(async (req, res) => res.json(await this.analytics.refresh(req.uid, req.params.projectId, req.body))));
  }
  start() {
    this.worker.start();
    const telegram = this.registry.list().find(provider => provider.id === "telegram");
    if (telegram?.configured) telegram.configureWebhook().catch(error => console.error("Telegram webhook:", error.code || error.name));
    this.privacy.tick().catch(error => console.error("Privacy worker:", error.code || error.name));
    this.privacyTimer = setInterval(() => this.privacy.tick().catch(error => console.error("Privacy worker:", error.code || error.name)), 15000);
    this.privacyTimer.unref?.();
    if (!this.localPreview) {
      this.accounts.maintainConnections().catch(error => console.error("Connection maintenance:", error.code || error.name));
      this.connectionTimer = setInterval(() => this.accounts.maintainConnections().catch(error => console.error("Connection maintenance:", error.code || error.name)), 60000);
      this.connectionTimer.unref?.();
      this.analyticsTimer = setInterval(() => this.analytics.tick().catch(error => console.error("Analytics worker:", error.code || error.name)), 60000);
      this.analyticsTimer.unref?.();
    }
  }
  stopWorkers() { this.worker.stop(); clearInterval(this.analyticsTimer); clearInterval(this.privacyTimer); clearInterval(this.connectionTimer); }
  async shutdown({ timeoutMs = 25000 } = {}) {
    this.stopWorkers();
    const deadline = Date.now() + timeoutMs;
    while (this.worker.running || this.analytics.running || this.privacy.running || this.accounts.running) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await this.store.flush?.();
    this.close();
    return true;
  }
  close() { this.stopWorkers(); this.store.close(); }
}
