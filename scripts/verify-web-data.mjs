import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(new URL("../web/report.json", import.meta.url), "utf8"));
if (!report.corpus_size || !Array.isArray(report.strategies) || report.strategies.length < 2) {
  throw new Error("web/report.json is missing required evaluation data");
}
console.log(`Verified report for ${report.corpus_size} assets and ${report.strategies.length} strategies.`);

