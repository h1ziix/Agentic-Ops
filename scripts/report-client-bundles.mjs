import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const assetRoot = path.join(process.cwd(), ".next", "static");
if (!fs.existsSync(assetRoot) || !fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) throw new Error("Run npm run build before reporting browser chunks.");
const chunks = fs.readdirSync(assetRoot, { recursive: true }).filter((file) => /\.(?:js|mjs)$/.test(String(file))).map((file) => {
  const content = fs.readFileSync(path.join(assetRoot, String(file)));
  return { file: path.join(".next", "static", String(file)).replaceAll("\\", "/"), bytes: content.byteLength, gzipBytes: gzipSync(content).byteLength };
}).sort((first, second) => second.bytes - first.bytes);
const report = { buildId: fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim(), generatedAt: new Date().toISOString(),
  scope: "All generated .next/static JavaScript chunks; excludes source maps, CSS, server outputs and public media.",
  interpretation: "Sums cover the entire generated build, not JavaScript transferred by one route. gzipBytes compress each chunk individually; actual server transfer may use a different encoding.",
  chunkCount: chunks.length, totalBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0), totalGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
  largestEightByBytes: chunks.slice(0, 8), largestEightByGzip: [...chunks].sort((first, second) => second.gzipBytes - first.gzipBytes).slice(0, 8) };
const output = path.join(process.cwd(), "output", "release-09-bundles.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log("Saved ignored output/release-09-bundles.json. Measure actual route requests separately.");
