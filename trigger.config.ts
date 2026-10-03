import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "configure-trigger-project",
  runtime: "node", dirs: ["./src/trigger"], maxDuration: 360,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
});
