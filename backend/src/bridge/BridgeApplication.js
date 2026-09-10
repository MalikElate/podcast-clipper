import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { ZipArchive } from "archiver";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteStore } from "./storage/SqliteStore.js";
import { LocalMediaStorage } from "./storage/LocalMediaStorage.js";
import { ProjectService } from "./services/ProjectService.js";
import { ScheduleService } from "./services/ScheduleService.js";
import { MediaService } from "./services/MediaService.js";
import { AccountService } from "./services/AccountService.js";
import { PostService } from "./services/PostService.js";
import { RateLimitService } from "./services/RateLimitService.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { ClippingService } from "./services/ClippingService.js";
import { DownloadService } from "./services/DownloadService.js";
import { ApiKeyService } from "./services/ApiKeyService.js";
import { PublishingWorker } from "./services/PublishingWorker.js";
import { SecretVault } from "./core/SecretVault.js";
import { LockService } from "./core/LockService.js";
import { BridgeError, invariant, publicError } from "./core/errors.js";
import { ProviderRegistry } from "./platforms/ProviderRegistry.js";
import { InstagramProvider, FacebookProvider, ThreadsProvider } from "./platforms/MetaProviders.js";
import { YouTubeProvider, GoogleBusinessProvider } from "./platforms/GoogleProviders.js";
import { TikTokProvider } from "./platforms/TikTokProvider.js";
import { XProvider } from "./platforms/XProvider.js";
import { LinkedInProvider } from "./platforms/LinkedInProvider.js";
import { PinterestProvider } from "./platforms/PinterestProvider.js";
import { BlueskyProvider } from "./platforms/BlueskyProvider.js";
import { requireAuth } from "../lib/firebaseAdmin.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

/** Composition root. Services, repository, adapters and authentication are replaceable. */
export class BridgeApplication {
  constructor({ env = process.env, store, registry, storage, authMiddleware, clock = () => Date.now(), pipeline } = {}) {
    this.env = env; this.clock = clock;
    this.localPreview = env.BRIDGE_LOCAL_PREVIEW === "1" && env.NODE_ENV !== "production";
    this.dataDir = path.resolve(env.BRIDGE_DATA_DIR || path.join(backendDir, ".bridge"));
    this.publicUrl = (env.BRIDGE_PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");
    this.appUrl = (env.BRIDGE_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.store = store || new SqliteStore(path.join(this.dataDir, "bridge.sqlite"));
    this.apiKeys = new ApiKeyService(this.store, { clock });
    this.vault = new SecretVault(env.BRIDGE_ENCRYPTION_KEY);
    this.projects = new ProjectService(this.store);
    this.schedules = new ScheduleService({ clock });
    this.locks = new LockService(this.store, { clock });
    this.storage = storage || new LocalMediaStorage(path.join(this.dataDir, "media"));
    // Preview needs stable download links without enabling OAuth credentials.
    let signingKey = env.BRIDGE_MEDIA_SIGNING_KEY;
    if (!signingKey && this.localPreview) {
      const keyPath = path.join(this.dataDir, "preview-media-key");
      try { signingKey = fs.readFileSync(keyPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; signingKey = randomBytes(32).toString("base64"); fs.writeFileSync(keyPath, signingKey, { mode: 0o600 }); }
    }
    const deps = { env, publicUrl: this.publicUrl, store: this.store, vault: this.vault, locks: this.locks };
    this.registry = registry || new ProviderRegistry([InstagramProvider, TikTokProvider, YouTubeProvider, FacebookProvider, XProvider, LinkedInProvider, PinterestProvider, ThreadsProvider, BlueskyProvider, GoogleBusinessProvider].map(Provider => new Provider(deps)), { disabled: (env.BRIDGE_DISABLED_PLATFORMS || "").split(",").filter(Boolean) });
    this.media = new MediaService({ store: this.store, projects: this.projects, storage: this.storage, publicUrl: this.publicUrl, signingKey, clock, maxBytes: Number(env.BRIDGE_MAX_UPLOAD_MB || 1024) * 1024 ** 2 });
    this.rates = new RateLimitService({ store: this.store, clock });
    this.downloads = new DownloadService({ store: this.store, media: this.media, clock });
    this.accounts = new AccountService({ ...deps, registry: this.registry, projects: this.projects, clock, localPreview: this.localPreview });
    this.posts = new PostService({ store: this.store, projects: this.projects, accounts: this.accounts, registry: this.registry, media: this.media, schedules: this.schedules, rates: this.rates, clock, localPreview: this.localPreview });
    this.analytics = new AnalyticsService({ store: this.store, projects: this.projects, accounts: this.accounts, registry: this.registry, posts: this.posts, clock });
    this.clipping = new ClippingService({ store: this.store, projects: this.projects, media: this.media, locks: this.locks, dataDir: this.dataDir, clock, pipeline });
    this.worker = new PublishingWorker({ store: this.store, accounts: this.accounts, registry: this.registry, posts: this.posts, rates: this.rates, media: this.media, locks: this.locks, analytics: this.analytics, clock, enabled: !this.localPreview && env.BRIDGE_PUBLISHING_ENABLED !== "false" });
    const incoming = path.join(this.dataDir, "incoming"); fs.mkdirSync(incoming, { recursive: true, mode: 0o700 });
    this.upload = multer({ dest: incoming, limits: { fileSize: this.media.maxBytes, files: 1, fields: 0 } });
    this.app = express(); this.app.disable("x-powered-by");
    if (env.BRIDGE_TRUST_PROXY) this.app.set("trust proxy", Number(env.BRIDGE_TRUST_PROXY));
    this.app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
    const origins = new Set([new URL(this.appUrl).origin, new URL(this.publicUrl).origin]);
    if (this.localPreview) { origins.add("http://127.0.0.1:5173"); origins.add("http://localhost:5173"); }
    this.app.use(cors({ origin: (origin, done) => done(null, !origin || origins.has(origin)), methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization", "X-Bridge-Preview"] }));
    this.app.use(express.json({ limit: "2mb" }));
    this.app.get("/health", (req, res) => res.json({ status: "ok", app: "Bridge" }));
    this.registerPublicRoutes();
    const userAuth = authMiddleware || ((req, res, next) => {
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (this.localPreview && loopback && req.headers["x-bridge-preview"] === "1") {
        if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: "Unrecognized preview origin." });
        req.uid = "bridge-local-preview"; return next();
      }
      return requireAuth(req, res, next);
    });
    this.app.use("/api/bridge", (req, res, next) => {
      const key = this.apiKeys.token(req.headers.authorization);
      if (!key) return userAuth(req, res, next);
      try { req.uid = this.apiKeys.authenticate(key); return next(); } catch (error) { return next(error); }
    });
    this.app.use("/api/bridge", rateLimit({ windowMs: 60000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: req => req.uid || "anonymous", message: { error: "Too many requests. Please wait a moment." } }));
    this.registerRoutes();
    this.app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found." }));
    const frontend = path.resolve(backendDir, "../frontend/dist");
    if (env.BRIDGE_SERVE_FRONTEND === "true" && fs.existsSync(frontend)) {
      this.app.use(express.static(frontend));
      this.app.get("*", (req, res) => res.sendFile(path.join(frontend, "index.html")));
    }
    this.app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      if (error instanceof multer.MulterError) error = new BridgeError(error.code === "LIMIT_FILE_SIZE" ? `Files can be up to ${this.media.maxBytes / 1024 ** 2} MB.` : "Upload one file at a time.", { status: 413, code: "upload_limit" });
      if (error.type === "entity.parse.failed") error = new BridgeError("Invalid JSON request.");
      if (!(error instanceof BridgeError)) console.error("Bridge request failed:", error.code || error.name);
      res.status(error instanceof BridgeError ? error.status : 500).json(publicError(error));
    });
  }

  registerPublicRoutes() {
    const app = this.app;
    app.get("/downloads/:ticket", route((req, res) => {
      const download = this.downloads.consume(req.params.ticket);
      req.uid = download.uid; req.params.projectId = download.projectId;
      res.setHeader("Cache-Control", "no-store");
      return this.sendArchive(req, res, download.ids);
    }));
    app.get("/oauth/bluesky/client-metadata.json", route(async (req, res) => res.json((await this.registry.get("bluesky").client()).clientMetadata)));
    app.get("/oauth/bluesky/jwks.json", route(async (req, res) => res.json((await this.registry.get("bluesky").client()).jwks)));
    app.get("/oauth/:platform/callback", route(async (req, res) => {
      const target = new URL(this.appUrl); target.searchParams.set("view", "accounts");
      try {
        const result = await this.accounts.callback(req.params.platform, new URL(req.originalUrl, this.publicUrl).searchParams);
        target.searchParams.set("project", result.projectId); target.searchParams.set("connection", result.connectionId);
      } catch (error) { target.searchParams.set("connectionError", error instanceof BridgeError ? error.message : "The account could not be connected. Please try again."); }
      res.setHeader("Cache-Control", "no-store"); res.redirect(303, target.toString());
    }));
    app.get("/media/:id/:variant", route((req, res) => {
      const result = this.media.verify(req.params.id, req.params.variant, req.query.expires, req.query.signature, req.query.download === "1");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.type(result.mime);
      if (req.query.download === "1" || result.record.kind === "document") res.attachment(result.record.filename);
      res.sendFile(result.key, { root: this.storage.root, dotfiles: "deny" });
    }));
  }

  registerRoutes() {
    const app = this.app, root = "/api/bridge/projects/:projectId";
    app.get("/api/bridge/config", route((req, res) => res.json({ name: "Bridge", localPreview: this.localPreview, platforms: this.registry.catalog(), maxBatchSize: 100, maxUploadBytes: this.media.maxBytes, features: { clipping: this.env.BRIDGE_CLIPPING_ENABLED !== "false", analytics: true, publishing: this.worker.enabled }, connectionsReady: this.vault.configured, mediaReady: Boolean(this.media.signingKey) })));
    app.get("/api/bridge/api-keys", route((req, res) => res.json({ apiKeys: this.apiKeys.list(req.uid) })));
    app.post("/api/bridge/api-keys", route((req, res) => res.status(201).json(this.apiKeys.create(req.uid, req.body))));
    app.delete("/api/bridge/api-keys/:id", route((req, res) => res.json(this.apiKeys.remove(req.uid, req.params.id))));
    app.get("/api/bridge/projects", route((req, res) => res.json({ projects: this.projects.list(req.uid) })));
    app.post("/api/bridge/projects", route((req, res) => res.status(201).json({ project: this.projects.create(req.uid, req.body) })));
    app.patch(root, route((req, res) => res.json({ project: this.projects.update(req.uid, req.params.projectId, req.body) })));
    app.post("/api/bridge/schedule/resolve", route((req, res) => res.json(this.schedules.resolve(req.body))));
    app.get(`${root}/accounts`, route((req, res) => res.json({ accounts: this.accounts.list(req.uid, req.params.projectId) })));
    app.post(`${root}/accounts/connect/:platform`, route(async (req, res) => res.json(await this.accounts.start(req.uid, req.params.projectId, req.params.platform, req.body))));
    app.get(`${root}/connections/:id`, route((req, res) => res.json(this.accounts.pending(req.uid, req.params.projectId, req.params.id))));
    app.post(`${root}/connections/:id`, route((req, res) => res.json({ accounts: this.accounts.attach(req.uid, req.params.projectId, req.params.id, req.body.selectedIds) })));
    app.get(`${root}/accounts/:id/options`, route(async (req, res) => res.json({ options: await this.accounts.options(req.uid, req.params.projectId, req.params.id, { force: req.query.refresh === "1" }) })));
    app.delete(`${root}/accounts/:id`, route((req, res) => res.json(this.accounts.disconnect(req.uid, req.params.projectId, req.params.id))));
    app.get(`${root}/media`, route((req, res) => res.json({ media: this.media.list(req.uid, req.params.projectId) })));
    app.post(`${root}/media`, (req, res, next) => { try { this.projects.require(req.uid, req.params.projectId); invariant(this.media.signingKey, "Media storage is not configured on this server.", { status: 503 }); next(); } catch (error) { next(error); } }, this.upload.single("file"), route(async (req, res) => {
      invariant(req.file, "Choose a file to upload.");
      try { res.status(201).json({ media: this.media.toPublic(await this.media.ingest(req.uid, req.params.projectId, req.file)) }); }
      finally { await fs.promises.unlink(req.file.path).catch(() => {}); }
    }));
    app.delete(`${root}/media/:id`, route(async (req, res) => res.json(await this.media.remove(req.uid, req.params.projectId, req.params.id))));
    app.get(`${root}/media-download`, route((req, res) => {
      const ids = String(req.query.ids || "").split(",").filter(Boolean);
      invariant(ids.length > 0 && ids.length <= 100, "Select between 1 and 100 files to download.");
      return this.sendArchive(req, res, ids);
    }));
    app.post(`${root}/downloads`, route((req, res) => res.json(this.downloads.create(req.uid, req.params.projectId, req.body.ids))));
    app.get(`${root}/posts`, route((req, res) => res.json({ posts: this.posts.list(req.uid, req.params.projectId) })));
    app.post(`${root}/posts/preview`, route(async (req, res) => res.json(await this.posts.preview(req.uid, req.params.projectId, req.body))));
    app.post(`${root}/posts`, route(async (req, res) => res.status(201).json(await this.posts.submit(req.uid, req.params.projectId, req.body))));
    app.patch(`${root}/posts/:id`, route(async (req, res) => res.json({ post: await this.posts.update(req.uid, req.params.projectId, req.params.id, req.body) })));
    app.post(`${root}/posts/:id/cancel`, route((req, res) => res.json({ post: this.posts.cancel(req.uid, req.params.projectId, req.params.id) })));
    app.delete(`${root}/posts/:id`, route((req, res) => res.json(this.posts.remove(req.uid, req.params.projectId, req.params.id))));
    app.post(`${root}/queue/reorder`, route((req, res) => res.json({ posts: this.posts.reorder(req.uid, req.params.projectId, req.body.accountId, req.body.deliveryIds) })));
    app.post(`${root}/deliveries/:id/retry`, route((req, res) => res.json({ post: this.posts.retry(req.uid, req.params.projectId, req.params.id, req.body) })));
    app.get(`${root}/analytics`, route((req, res) => res.json(this.analytics.report(req.uid, req.params.projectId))));
    app.post(`${root}/analytics/refresh`, route(async (req, res) => res.json(await this.analytics.refresh(req.uid, req.params.projectId, req.body))));
    app.get(`${root}/clips`, route((req, res) => res.json({ jobs: this.clipping.list(req.uid, req.params.projectId) })));
    app.post(`${root}/clips`, route((req, res) => {
      invariant(this.env.BRIDGE_CLIPPING_ENABLED !== "false", "Clipping is disabled on this server.", { status: 503 });
      invariant(this.env.GEMINI_API_KEY, "Clipping is not configured on this server yet.", { status: 503 });
      res.status(201).json({ job: this.clipping.create(req.uid, req.params.projectId, req.body) });
    }));
    app.get(`${root}/clips/:id`, route((req, res) => res.json({ job: this.clipping.get(req.uid, req.params.projectId, req.params.id) })));
    app.get(`${root}/clips/:id/download`, route((req, res) => this.sendArchive(req, res, this.clipping.get(req.uid, req.params.projectId, req.params.id).clips.filter(clip => !clip.unavailable).map(clip => clip.mediaId))));
  }

  async sendArchive(req, res, ids) {
    invariant(ids.length, "There are no files to download.");
    const records = ids.map(id => this.media.require(req.uid, req.params.projectId, id));
    invariant(records.every(item => item.status === "ready"), "Some files are not available yet.");
    const archive = new ZipArchive({ store: true });
    res.attachment("bridge-media.zip");
    const completion = new Promise((resolve, reject) => { archive.on("error", reject); res.on("finish", resolve); res.on("close", () => { archive.abort(); resolve(); }); });
    archive.pipe(res);
    records.forEach((record, index) => archive.file(this.storage.path(record.storageKey), { name: `${String(index + 1).padStart(2, "0")}-${record.filename}` }));
    await archive.finalize(); await completion;
  }
  start() {
    this.worker.start();
    if (this.env.BRIDGE_CLIPPING_ENABLED !== "false") this.clipping.startWorker();
    if (!this.localPreview) {
      this.analyticsTimer = setInterval(() => this.analytics.tick().catch(error => console.error("Analytics worker:", error.code || error.name)), 60000);
      this.analyticsTimer.unref?.();
    }
  }
  stopWorkers() { this.worker.stop(); this.clipping.stopWorker(); clearInterval(this.analyticsTimer); }
  async shutdown({ timeoutMs = 25000 } = {}) {
    this.stopWorkers();
    const deadline = Date.now() + timeoutMs;
    while (this.worker.running || this.clipping.running || this.analytics.running) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.close();
    return true;
  }
  close() { this.stopWorkers(); this.store.close(); }
}
