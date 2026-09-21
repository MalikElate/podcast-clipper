import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { DurableState } from "./durableState.js";
import { migrationScript } from "./migrationScript.js";
import { appDomainRedirect } from "./domainRouting.js";
export { ContainerProxy } from "@cloudflare/containers";

const definedEnv = values => Object.fromEntries(
  Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0),
);

export class PodcastClipperBackend extends Container {
  inFlightRequests = 0;
  defaultPort = 8787;
  sleepAfter = "2h";
  entrypoint = ["/usr/local/bin/node", "/app/src/bootstrap.js"];
  envVars = definedEnv({
    HOST: "0.0.0.0",
    PORT: "8787",
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    CLERK_WEBHOOK_SIGNING_SECRET: env.CLERK_WEBHOOK_SIGNING_SECRET,
    BRIDGE_POSTHOG_LEGACY_DATA: env.BRIDGE_POSTHOG_LEGACY_DATA,
    POSTHOG_PROJECT_ID: env.POSTHOG_PROJECT_ID,
    POSTHOG_PERSONAL_API_KEY: env.POSTHOG_PERSONAL_API_KEY,
    POSTHOG_API_HOST: env.POSTHOG_API_HOST,
    BRIDGE_APP_URL: env.BRIDGE_APP_URL,
    BRIDGE_PUBLIC_URL: env.BRIDGE_PUBLIC_URL,
    BRIDGE_DURABLE_STORAGE_URL: "http://meadow.storage",
    BRIDGE_ENCRYPTION_KEY: env.BRIDGE_ENCRYPTION_KEY,
    BRIDGE_MEDIA_SIGNING_KEY: env.BRIDGE_MEDIA_SIGNING_KEY,
    BRIDGE_MAX_UPLOAD_MB: env.BRIDGE_MAX_UPLOAD_MB,
    BRIDGE_DISABLED_PLATFORMS: env.BRIDGE_DISABLED_PLATFORMS,
    BRIDGE_PUBLISHING_ENABLED: env.BRIDGE_PUBLISHING_ENABLED,
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    TRYBE_ORDERS_API_KEY: env.TRYBE_ORDERS_API_KEY,
    TRYBE_STORE_ID: env.TRYBE_STORE_ID,
    STRIPE_PRICE_STARTER_MONTHLY: env.STRIPE_PRICE_STARTER_MONTHLY,
    STRIPE_PRICE_STARTER_YEARLY: env.STRIPE_PRICE_STARTER_YEARLY,
    STRIPE_PRICE_CREATOR_MONTHLY: env.STRIPE_PRICE_CREATOR_MONTHLY,
    STRIPE_PRICE_CREATOR_YEARLY: env.STRIPE_PRICE_CREATOR_YEARLY,
    STRIPE_PRICE_GROWTH_MONTHLY: env.STRIPE_PRICE_GROWTH_MONTHLY,
    STRIPE_PRICE_GROWTH_YEARLY: env.STRIPE_PRICE_GROWTH_YEARLY,
    STRIPE_PRICE_PRO_MONTHLY: env.STRIPE_PRICE_PRO_MONTHLY,
    STRIPE_PRICE_PRO_YEARLY: env.STRIPE_PRICE_PRO_YEARLY,
    INSTAGRAM_CLIENT_ID: env.INSTAGRAM_CLIENT_ID,
    INSTAGRAM_CLIENT_SECRET: env.INSTAGRAM_CLIENT_SECRET,
    FACEBOOK_CLIENT_ID: env.FACEBOOK_CLIENT_ID,
    FACEBOOK_CLIENT_SECRET: env.FACEBOOK_CLIENT_SECRET,
    THREADS_CLIENT_ID: env.THREADS_CLIENT_ID,
    THREADS_CLIENT_SECRET: env.THREADS_CLIENT_SECRET,
    TIKTOK_CLIENT_KEY: env.TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET: env.TIKTOK_CLIENT_SECRET,
    X_CLIENT_ID: env.X_CLIENT_ID,
    X_CLIENT_SECRET: env.X_CLIENT_SECRET,
    LINKEDIN_CLIENT_ID: env.LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: env.LINKEDIN_CLIENT_SECRET,
    PINTEREST_CLIENT_ID: env.PINTEREST_CLIENT_ID,
    PINTEREST_CLIENT_SECRET: env.PINTEREST_CLIENT_SECRET,
    PINTEREST_ENVIRONMENT: env.PINTEREST_ENVIRONMENT,
    YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET,
    GOOGLE_BUSINESS_CLIENT_ID: env.GOOGLE_BUSINESS_CLIENT_ID,
    GOOGLE_BUSINESS_CLIENT_SECRET: env.GOOGLE_BUSINESS_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    BLUESKY_PRIVATE_KEY: env.BLUESKY_PRIVATE_KEY,
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
  });

  get durableState() { return new DurableState(this.ctx.storage); }
  async durableStorage(request) { return this.durableState.handle(request); }
  async fetch(request) {
    const { mode } = await this.durableState.status();
    if (["migration", "restoring", "resuming"].includes(mode)) {
      // After the image rollout this starts the replacement, which restores its
      // state and marks itself ready. The old drained process remains gated.
      if (!this.ctx.container.running) await super.fetch(new Request("http://backend/health"));
      if ((await this.durableState.status()).mode !== "ready") return Response.json({ code: "maintenance", error: "Meadow is saving an update. Please try again shortly." }, { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } });
    }
    this.inFlightRequests++;
    try { return await super.fetch(request); } finally { this.inFlightRequests--; }
  }
  async migration(action) {
    if (action === "status") return this.durableState.status();
    if (this.migrationRunning) throw new Error("A migration operation is already running.");
    this.migrationRunning = true;
    try { return await this.performMigration(action); } finally { this.migrationRunning = false; }
  }
  async performMigration(action) {
    if (!["preflight", "capture", "resume"].includes(action)) throw new Error("Unknown migration operation.");
    if (!this.ctx.container.running) throw new Error("The original backend is not running. Do not start a replacement before data preservation.");
    if (action === "resume" && !["migration", "resuming"].includes((await this.durableState.status()).mode)) throw new Error("The original backend is not paused for migration.");
    let migrationGeneration = 0;
    if (action === "capture") {
      migrationGeneration = await this.durableState.setMaintenance();
      const deadline = Date.now() + 30000;
      while (this.inFlightRequests > 0) {
        if (Date.now() > deadline) throw new Error("Backend requests are still finishing. Migration remains paused.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (action === "resume") await this.durableState.beginResume();
    if (action === "resume" && env.MEADOW_MEDIA) {
      // A failed migration must not leave a second unmanaged copy after the
      // original filesystem-only backend resumes accepting deletion requests.
      let cursor;
      do {
        const listed = await env.MEADOW_MEDIA.list({ prefix: `${this.ctx.id.toString()}/`, include: ["customMetadata"], ...(cursor ? { cursor } : {}) });
        const copied = listed.objects.filter(object => object.customMetadata?.meadowMigration === "true").map(object => object.key);
        if (copied.length) await env.MEADOW_MEDIA.delete(copied);
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    }
    await this.applyOutboundInterceptionPromise;
    const process = await this.ctx.container.exec(["node", "--input-type=module", "-e", migrationScript(action, { migrationGeneration })]);
    const result = await process.output();
    if (result.exitCode !== 0) throw new Error(`Migration could not finish safely: ${new TextDecoder().decode(result.stderr).slice(0, 300)}`);
    const captured = JSON.parse(new TextDecoder().decode(result.stdout));
    if (action === "resume") { await this.durableState.resumeLegacy(); return captured; }
    if (action === "capture") {
      const saved = await this.durableState.status();
      if (saved.sha256 !== captured.metadata.sha256) throw new Error("Migration snapshot integrity verification failed.");
      return { ...captured.metadata, mode: "migration", durable: true };
    }
    return captured.metadata;
  }

  async onActivityExpired() {
    const { mode } = await this.durableState.status();
    if (["migration", "resuming"].includes(mode) || mode === "legacy" && env.BRIDGE_MIGRATION_SECRET) return;
    return super.onActivityExpired();
  }

  onStart() {
    console.log("Meadow backend container started.");
  }

  onStop() {
    console.log("Meadow backend container stopped.");
  }

  onError(error) {
    console.error("Meadow backend container error:", error);
  }
}

PodcastClipperBackend.outboundByHost = {
  "meadow.storage": async (request, workerEnv, context) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) {
      if (!workerEnv.MEADOW_MEDIA) return new Response("Durable media storage is not configured.", { status: 503 });
      let key;
      try { key = decodeURIComponent(url.pathname.slice("/media/".length)); } catch { return new Response("Invalid media key", { status: 400 }); }
      if (!key || key.startsWith("/") || key.includes("\\") || key.includes("\0") || key.split("/").some(part => !part || part === "." || part === "..")) return new Response("Invalid media key", { status: 400 });
      const objectKey = `${context.containerId}/${key}`;
      if (request.method === "PUT") {
        const migrationGeneration = request.headers.get("X-Meadow-Migration-Generation");
        if (migrationGeneration !== null) {
          const state = await workerEnv.BACKEND.get(workerEnv.BACKEND.idFromString(context.containerId)).migration("status");
          if (state.mode !== "migration" || state.generation !== Number(migrationGeneration)) return new Response("Migration generation expired", { status: 409 });
        }
        const sha256 = request.headers.get("X-Meadow-Sha256");
        if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) return new Response("Invalid checksum", { status: 400 });
        const object = await workerEnv.MEADOW_MEDIA.put(objectKey, request.body, { ...(sha256 ? { sha256: Uint8Array.from(sha256.match(/../g), value => parseInt(value, 16)).buffer } : {}), customMetadata: { ...(sha256 ? { sha256 } : {}), ...(migrationGeneration !== null ? { meadowMigration: "true", migrationGeneration } : {}) }, httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" } });
        if (migrationGeneration !== null) {
          const state = await workerEnv.BACKEND.get(workerEnv.BACKEND.idFromString(context.containerId)).migration("status");
          if (state.mode !== "migration" || state.generation !== Number(migrationGeneration)) {
            const latest = await workerEnv.MEADOW_MEDIA.head(objectKey);
            if (latest?.customMetadata?.migrationGeneration === migrationGeneration) await workerEnv.MEADOW_MEDIA.delete(objectKey);
            return new Response("Migration generation expired", { status: 409 });
          }
        }
        return new Response(null, { status: 201, headers: { "X-Meadow-Bytes": String(object.size), ...(sha256 ? { "X-Meadow-Sha256": sha256 } : {}) } });
      }
      if (request.method === "GET") {
        const object = await workerEnv.MEADOW_MEDIA.get(objectKey);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Content-Length": String(object.size), ...(object.customMetadata?.sha256 ? { "X-Meadow-Sha256": object.customMetadata.sha256 } : {}) } });
      }
      if (request.method === "DELETE") { await workerEnv.MEADOW_MEDIA.delete(objectKey); return new Response(null, { status: 204 }); }
      return new Response("Method not allowed", { status: 405 });
    }
    return workerEnv.BACKEND.get(workerEnv.BACKEND.idFromString(context.containerId)).durableStorage(request);
  },
};

function migrationAuthorized(request, workerEnv) {
  const expected = workerEnv.BRIDGE_MIGRATION_SECRET;
  if (!expected) return false;
  const actual = request.headers.get("Authorization") || "";
  const wanted = `Bearer ${expected}`;
  return actual.length === wanted.length && timingSafeEqual(new TextEncoder().encode(actual), new TextEncoder().encode(wanted));
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    const appRedirect = appDomainRedirect(url);
    if (appRedirect) return Response.redirect(appRedirect, 308);
    if (url.pathname === "/runtime-config.js") {
      const config = JSON.stringify({ clerkPublishableKey: workerEnv.CLERK_PUBLISHABLE_KEY || "" });
      return new Response(`globalThis.__MEADOW_CONFIG__=${config};`, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/api/internal/durable-migration") {
      if (!migrationAuthorized(request, workerEnv)) return new Response("Not found", { status: 404 });
      try {
        const action = request.method === "GET" ? "status" : request.method === "POST" ? (await request.json()).action : "invalid";
        return Response.json(await workerEnv.BACKEND.getByName("primary").migration(action), { headers: { "Cache-Control": "no-store" } });
      } catch (error) { return Response.json({ error: error.message }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    }
    const backendPath = url.pathname === "/mcp" || ["/api/", "/media/", "/oauth/"].some(prefix => url.pathname.startsWith(prefix));
    if (backendPath || url.pathname === "/health") {
      const backend = workerEnv.BACKEND.getByName("primary");
      return backend.fetch(request);
    }

    return workerEnv.ASSETS.fetch(request);
  },
  async scheduled(event, workerEnv) {
    const response = await workerEnv.BACKEND.getByName("primary").fetch(new Request("http://backend/health"));
    if (!response.ok) throw new Error("Meadow connection maintenance could not start.");
  },
};
