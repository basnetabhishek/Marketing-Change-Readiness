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

