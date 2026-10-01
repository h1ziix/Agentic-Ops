import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const assetRoot = path.join(process.cwd(), ".next", "static");
if (!fs.existsSync(assetRoot)) throw new Error("Run npm run build before checking browser assets.");
const secretNames = ["OPENAI_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_SECRET", "HUBSPOT_CLIENT_SECRET", "INTEGRATION_TOKEN_ENCRYPTION_KEY"];
const secrets = secretNames
  .map((name) => ({ name, value: process.env[name]?.trim() }))
  .filter(({ value }) => value && value.length >= 12 && !value.includes("YOUR_"));
const files = fs.readdirSync(assetRoot, { recursive: true }).filter((file) => /\.(?:js|map|css|json)$/.test(String(file)));
const leaks = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(assetRoot, String(file)), "utf8");
  for (const secret of secrets) if (content.includes(secret.value)) leaks.push({ key: secret.name, file });
  for (const name of secretNames) if (content.includes(name)) leaks.push({ key: name, file, reason: "server credential identifier in client code" });
}
if (leaks.length) {
  console.error("Server secret detected in browser assets", leaks);
  process.exitCode = 1;
} else console.log(`Checked ${files.length} browser assets: no server credential identifiers or configured secret values found (${secrets.length} credentials checked).`);
