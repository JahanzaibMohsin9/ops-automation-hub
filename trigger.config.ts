import { config as loadEnv } from "dotenv";
import { defineConfig } from "@trigger.dev/sdk/v3";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const projectRef = process.env.TRIGGER_PROJECT_REF;

if (!projectRef) {
  throw new Error("TRIGGER_PROJECT_REF is required to configure Trigger.dev.");
}

export default defineConfig({
  project: projectRef,
  dirs: ["./src/trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 6,
      minTimeoutInMs: 10_000,
      maxTimeoutInMs: 300_000,
      randomize: false,
    },
  },
});
