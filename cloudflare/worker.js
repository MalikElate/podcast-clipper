import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class PodcastClipperBackend extends Container {
  defaultPort = 8787;
  sleepAfter = "2h";
  envVars = {
    PORT: "8787",
    PYTHON_BIN: "python3",
    WHISPER_MODEL: env.WHISPER_MODEL,
    GEMINI_MODEL: env.GEMINI_MODEL,
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    RAPIDAPI_KEY: env.RAPIDAPI_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  };
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/")) {
      const backend = workerEnv.BACKEND.getByName("primary");
      return backend.fetch(request);
    }

    return workerEnv.ASSETS.fetch(request);
  },
};
