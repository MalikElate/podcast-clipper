import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class PodcastClipperBackend extends Container {
  defaultPort = 8787;
  sleepAfter = "2h";
  envVars = {
    HOST: "0.0.0.0",
    PORT: "8787",
    PYTHON_BIN: "python3",
    WHISPER_MODEL: env.WHISPER_MODEL,
    GEMINI_MODEL: env.GEMINI_MODEL,
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    RAPIDAPI_KEY: env.RAPIDAPI_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    BRIDGE_APP_URL: env.BRIDGE_APP_URL,
    BRIDGE_PUBLIC_URL: env.BRIDGE_PUBLIC_URL,
    BRIDGE_ENCRYPTION_KEY: env.BRIDGE_ENCRYPTION_KEY,
    BRIDGE_MEDIA_SIGNING_KEY: env.BRIDGE_MEDIA_SIGNING_KEY,
    BRIDGE_MAX_UPLOAD_MB: env.BRIDGE_MAX_UPLOAD_MB,
    BRIDGE_DISABLED_PLATFORMS: env.BRIDGE_DISABLED_PLATFORMS,
    BRIDGE_CLIPPING_ENABLED: env.BRIDGE_CLIPPING_ENABLED,
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
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    BLUESKY_PRIVATE_KEY: env.BLUESKY_PRIVATE_KEY,
  };
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    const backendPath = ["/api/", "/media/", "/oauth/", "/downloads/"].some(prefix => url.pathname.startsWith(prefix));
    if (backendPath || url.pathname === "/health") {
      const backend = workerEnv.BACKEND.getByName("primary");
      return backend.fetch(request);
    }

    return workerEnv.ASSETS.fetch(request);
  },
};
