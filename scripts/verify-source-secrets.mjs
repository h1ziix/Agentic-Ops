import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import { configuredSecrets, credentialSignatures } from "./secret-patterns.mjs";

nextEnv.loadEnvConfig(process.cwd());
const secrets = configuredSecrets();
function git(args, input) {
  const result = spawnSync("git", args, { cwd: process.cwd(), input, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Source scan git operation failed: ${args[0]}`);
  return result.stdout;
}
const findings = [];
function scan(content, source) {
  for (const secret of secrets) if (content.includes(secret.value)) findings.push({ source, key: secret.name, reason: "configured secret value" });
  for (const [name, signature] of credentialSignatures) if (signature.test(content)) findings.push({ source, key: name, reason: "credential signature" });
}
const currentFiles = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0").filter(Boolean);
for (const file of currentFiles) {
  const absolute = path.join(process.cwd(), file);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) scan(fs.readFileSync(absolute, "utf8"), file);
}
const objects = git(["rev-list", "--objects", "--all"]).toString("utf8").split("\n").filter(Boolean)
  .map((line) => { const separator = line.indexOf(" "); return { id: separator < 0 ? line : line.slice(0, separator), file: separator < 0 ? "Git object" : line.slice(separator + 1) }; });
const byId = new Map(objects.map((object) => [object.id, object.file]));
const metadata = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], objects.map(({ id }) => id).join("\n") + "\n")
  .toString("utf8").split("\n").filter((line) => line.endsWith(" blob")).map((line) => line.split(" ")[0]);
const blobs = git(["cat-file", "--batch"], metadata.join("\n") + "\n");
let cursor = 0;
for (const id of metadata) {
  const newline = blobs.indexOf(10, cursor);
  const header = blobs.subarray(cursor, newline).toString("utf8").split(" ");
  const size = Number(header[2]);
  if (newline < 0 || header[0] !== id || !Number.isSafeInteger(size) || size < 0) throw new Error("Source scan could not parse Git object metadata.");
  cursor = newline + 1;
  scan(blobs.subarray(cursor, cursor + size).toString("utf8"), `history:${byId.get(id)}:${id.slice(0, 12)}`);
  cursor += size + 1;
}
const environmentTracked = currentFiles.filter((file) => /(?:^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example");
for (const file of environmentTracked) findings.push({ source: file, reason: "non-example environment file tracked or unignored" });
if (findings.length) {
  // Only key identifiers and source paths are emitted. Never print matched text or values.
  console.error("Source/history secret scan failed", findings);
  process.exitCode = 1;
} else console.log(`Checked ${currentFiles.length} current files and ${metadata.length} historical Git blobs: no configured server credentials or credential signatures found (${secrets.length} credential values checked).`);
