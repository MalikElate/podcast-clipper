import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const definedEnv = values => Object.fromEntries(
  Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0),
);

export class PodcastClipperBackend extends Container {
  defaultPort = 8787;
  sleepAfter = "2h";
  entrypoint = ["/usr/local/bin/node", "/app/src/bootstrap.js"];
  envVars = definedEnv({
    HOST: "0.0.0.0",
    PORT: "8787",
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    BRIDGE_APP_URL: env.BRIDGE_APP_URL,
    BRIDGE_PUBLIC_URL: env.BRIDGE_PUBLIC_URL,
    BRIDGE_ENCRYPTION_KEY: env.BRIDGE_ENCRYPTION_KEY,
    BRIDGE_MEDIA_SIGNING_KEY: env.BRIDGE_MEDIA_SIGNING_KEY,
    BRIDGE_MAX_UPLOAD_MB: env.BRIDGE_MAX_UPLOAD_MB,
    BRIDGE_DISABLED_PLATFORMS: env.BRIDGE_DISABLED_PLATFORMS,
    BRIDGE_PUBLISHING_ENABLED: env.BRIDGE_PUBLISHING_ENABLED,
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
    YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    BLUESKY_PRIVATE_KEY: env.BLUESKY_PRIVATE_KEY,
  });

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

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    const backendPath = ["/api/", "/media/", "/oauth/"].some(prefix => url.pathname.startsWith(prefix));
    if (backendPath || url.pathname === "/health") {
      const backend = workerEnv.BACKEND.getByName("primary");
      return backend.fetch(request);
    }

    return workerEnv.ASSETS.fetch(request);
  },
};
