import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import extractHandler, { extractReadableText, isPrivateAddress } from "../api/extract.js";
import { extractValues, parseAssets, scanAssets } from "../web/engine.js";

for (const target of [new URL("../web/app.js", import.meta.url), new URL("../web/engine.js", import.meta.url), new URL("../api/extract.js", import.meta.url)]) {
  const check = spawnSync(process.execPath, ["--check", fileURLToPath(target)], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(`JavaScript syntax check failed:\n${check.stderr}`);
}

const report = JSON.parse(await readFile(new URL("../web/report.json", import.meta.url), "utf8"));
if (!report.corpus_size || !Array.isArray(report.strategies) || report.strategies.length < 2) {
  throw new Error("web/report.json is missing required evaluation data");
}
console.log(`Verified report for ${report.corpus_size} assets and ${report.strategies.length} strategies.`);

const assets = parseAssets("Acme | Pro | Email | Pro costs 79 dollars.\nRival | Pro | Page | Pro costs $79.");
const scan = scanAssets({ assets, product: "Acme", plan: "Pro", kind: "price", oldValue: "$79" });
if (scan.candidateCount !== 1 || scan.candidates[0].evidence !== "79 dollars") {
  throw new Error("Interactive scanner failed its deterministic retrieval check");
}
if (extractValues("one-month trial", "trial")[0]?.amount !== 30) {
  throw new Error("Interactive scanner failed duration normalization");
}
const aprAssets = [{ id: "apr-1", product: "Chase", plan: "Freedom Flex", title: "Offer", text: "0% intro APR for the first fifteen months." }];
const aprScan = scanAssets({ assets: aprAssets, product: "Chase", plan: "Freedom Flex", kind: "intro_apr", oldValue: "15 months" });
if (aprScan.candidateCount !== 1 || aprScan.candidates[0].evidence !== "fifteen months") {
  throw new Error("Interactive scanner failed intro APR normalization");
}
console.log("Verified interactive deterministic scanner.");

const extractedPage = extractReadableText('<title>Offer</title><script>bad()</script><main>Save <strong>25 percent</strong> today.<div hidden>15 months</div>&#x110000;</main>');
if (extractedPage.title !== "Offer" || extractedPage.text.includes("bad()") || extractedPage.text.includes("15 months") || !extractedPage.text.includes("25 percent") || !extractedPage.text.includes("&#x110000;")) {
  throw new Error("Webpage evidence extraction failed its inert-text check");
}
for (const address of ["127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.169.254", "0:0:0:0:0:0:0:1", "fc00::1", "fe80::1", "::ffff:7f00:1"]) {
  if (!isPrivateAddress(address)) throw new Error(`Private address was not blocked: ${address}`);
}
if (isPrivateAddress("8.8.8.8") || isPrivateAddress("2606:4700:4700::1111")) {
  throw new Error("Public URL safety checks are not behaving as expected");
}

let handlerResult;
const mockResponse = {
  statusCode: 200,
  setHeader() {},
  status(code) { this.statusCode = code; return this; },
  json(payload) { handlerResult = { status: this.statusCode, payload }; return handlerResult; },
};
await extractHandler({ method: "POST", headers: { origin: "https://demo.test", host: "demo.test", "content-length": "30" }, body: { url: "file:///private.txt" }, socket: {} }, mockResponse);
if (handlerResult?.status !== 422 || !handlerResult.payload.error.includes("http")) {
  throw new Error("Webpage endpoint failed to reject a non-web URL");
}

const indexHtml = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
for (const marker of ['value="webpage"', 'value="file"', 'value="email"', 'value="paste"', 'id="sources-empty"']) {
  if (!indexHtml.includes(marker)) throw new Error(`Source ingestion UI is missing ${marker}`);
}
if (!appJs.includes("let sources = []") || !appJs.includes('fetch("/api/extract"')) {
  throw new Error("The live workspace must start empty and support webpage extraction");
}
console.log("Verified empty-state source ingestion and webpage safety helpers.");
