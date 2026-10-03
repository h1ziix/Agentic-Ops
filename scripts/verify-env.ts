import { loadEnvConfig } from "@next/env";
import { validateLaunchEnvironment } from "../src/server/config/launch";

loadEnvConfig(process.cwd());
const result = validateLaunchEnvironment(process.env, {
  production: process.argv.includes("--production"),
  requireAutomation: process.argv.includes("--require-automation"),
});
console.log(JSON.stringify({ status: result.errors.length ? "blocked" : "passed", ...result }, null, 2));
if (result.errors.length) process.exitCode = 1;
