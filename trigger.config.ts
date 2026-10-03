import { defineConfig } from "@trigger.dev/sdk";

const project = process.env.TRIGGER_PROJECT_REF?.trim();
if (!project || /YOUR_|configure-trigger-project/.test(project)) throw new Error("Configure TRIGGER_PROJECT_REF before starting or deploying the Trigger.dev worker.");

export default defineConfig({
  project,
  runtime: "node", dirs: ["./src/trigger"], maxDuration: 360,
  // Keep Next's server-only marker when bundling the shared server configuration.
  build: { conditions: ["react-server"] },
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
});
