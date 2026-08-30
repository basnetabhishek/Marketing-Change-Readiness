import { readFile } from "node:fs/promises";
import { extractValues, parseAssets, scanAssets } from "../web/engine.js";

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
console.log("Verified interactive deterministic scanner.");
