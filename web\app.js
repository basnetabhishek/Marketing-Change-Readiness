const labels = {
  exact_keyword: { name: "Exact + keyword", note: "Unscoped text baseline", tone: "baseline" },
  deterministic_scoped: { name: "Deterministic + scoped", note: "Normalized values with product and plan filters", tone: "winner" },
};

const pct = (value) => `${Math.round(value * 100)}%`;

const response = await fetch("/report.json");
if (!response.ok) throw new Error("Evaluation report could not be loaded");
const report = await response.json();
document.querySelector("#corpus-size").textContent = report.corpus_size;

const cards = report.strategies.map((strategy) => {
  const meta = labels[strategy.strategy] ?? { name: strategy.strategy, note: "Evaluation strategy", tone: "baseline" };
  return `
    <article class="strategy-card ${meta.tone}">
      <div class="card-top">
        <div><h3>${meta.name}</h3><p>${meta.note}</p></div>
        ${meta.tone === "winner" ? '<span class="recommended">Current best</span>' : ""}
      </div>
      <div class="metrics">
        <div class="metric"><strong>${pct(strategy.precision)}</strong><span>Precision</span><div class="bar"><i style="width:${pct(strategy.precision)}"></i></div></div>
        <div class="metric"><strong>${pct(strategy.recall)}</strong><span>Recall</span><div class="bar"><i style="width:${pct(strategy.recall)}"></i></div></div>
      </div>
      <div class="queue"><span>Average review queue</span><strong>${strategy.average_candidate_count} <small>of ${report.corpus_size}</small></strong></div>
      <div class="reduction"><span>Manual review reduced</span><strong>${pct(strategy.manual_review_reduction)}</strong></div>
    </article>`;
}).join("");

document.querySelector("#strategy-cards").innerHTML = cards;

const form = document.querySelector("#scan-form");
const candidateList = document.querySelector("#candidate-list");

const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const assets = parseAssets(document.querySelector("#assets").value);
    const product = document.querySelector("#product").value;
    const plan = document.querySelector("#plan").value;
    const kind = document.querySelector("#kind").value;
    const oldValue = document.querySelector("#old-value").value;
    const newValue = document.querySelector("#new-value").value;
    const result = scanAssets({ assets, product, plan, kind, oldValue });
    document.querySelector("#live-count").textContent = result.candidateCount;
    document.querySelector("#live-reduction").textContent = pct(result.reviewReduction);
    document.querySelector("#result-summary").textContent = `${oldValue} → ${newValue} · ${product}${plan ? ` ${plan}` : ""}`;
    candidateList.innerHTML = result.candidates.length ? result.candidates.map((asset) => `
      <article class="candidate">
        <div><span class="scope">${escapeHtml(asset.product)}${asset.plan ? ` · ${escapeHtml(asset.plan)}` : " · All plans"}</span><h3>${escapeHtml(asset.title)}</h3></div>
        <p>${escapeHtml(asset.text)}</p>
        <div class="evidence"><span>Matched evidence</span><mark>${escapeHtml(asset.evidence)}</mark></div>
      </article>`).join("") : '<div class="empty-state success">No stale references found in the supplied assets.</div>';
  } catch (error) {
    candidateList.innerHTML = `<div class="empty-state error">${escapeHtml(error.message)}</div>`;
    document.querySelector("#live-count").textContent = "—";
    document.querySelector("#live-reduction").textContent = "—";
  }
});

form.requestSubmit();
import { parseAssets, scanAssets } from "/engine.js";

