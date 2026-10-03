import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { configuredSecrets, credentialSignatures, secretNames } from "./secret-patterns.mjs";

nextEnv.loadEnvConfig(process.cwd());
const assetRoot = path.join(process.cwd(), ".next", "static");
if (!fs.existsSync(assetRoot) || !fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) throw new Error("Run npm run build before checking browser assets.");
const secrets = configuredSecrets();
const staticFiles = fs.readdirSync(assetRoot, { recursive: true }).filter((file) => /\.(?:js|mjs|map|css|json)$/.test(String(file)))
  .map((file) => ({ source: path.join(".next", "static", String(file)), absolute: path.join(assetRoot, String(file)) }));
const publicRoot = path.join(process.cwd(), "public");
const publicFiles = fs.existsSync(publicRoot) ? fs.readdirSync(publicRoot, { recursive: true })
  .map((file) => ({ source: path.join("public", String(file)), absolute: path.join(publicRoot, String(file)) }))
  .filter(({ absolute }) => fs.statSync(absolute).isFile()) : [];
const files = [...staticFiles, ...publicFiles];
const leaks = [];
for (const { source, absolute } of files) {
  const content = fs.readFileSync(absolute, "utf8");
  for (const secret of secrets) if (content.includes(secret.value)) leaks.push({ key: secret.name, file: source, reason: "configured secret value" });
  for (const name of secretNames) if (content.includes(name)) leaks.push({ key: name, file: source, reason: "server credential identifier in public asset" });
  for (const [name, signature] of credentialSignatures) if (signature.test(content)) leaks.push({ key: name, file: source, reason: "credential signature" });
}
if (leaks.length) {
  console.error("Server secret detected in browser assets", leaks);
  process.exitCode = 1;
} else console.log(`Checked ${staticFiles.length} built browser assets and ${publicFiles.length} public files: no server credential identifiers, configured secret values or credential signatures found (${secrets.length} credentials checked).`);
