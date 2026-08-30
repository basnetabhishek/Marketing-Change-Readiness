import { scanAssets } from "/engine.js";

const defaultSources = [
  {
    id: "src-1", product: "Chase", plan: "Freedom Flex", title: "Freedom Flex product page",
    url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
    text: "0% intro APR for 15 months from account opening on purchases and balance transfers.",
    mode: "Public page", lastChecked: "2 min ago", status: "Available",
  },
  {
    id: "src-2", product: "Chase", plan: "Freedom Flex", title: "0% Intro APR cards",
    url: "https://creditcards.chase.com/0-intro-apr-credit-cards",
    text: "Enjoy a 15-month introductory period on eligible purchases.",
    mode: "Public page", lastChecked: "2 min ago", status: "Available",
  },
  {
    id: "src-3", product: "Chase", plan: "Freedom Flex", title: "Campaign email",
    url: "https://example.com/authorized-campaign-evidence",
    text: "Pay no interest for the first fifteen months.",
    mode: "Supplied text", lastChecked: "This session", status: "Available",
  },
  {
    id: "src-4", product: "Chase", plan: "Slate", title: "Slate product page",
    url: "https://creditcards.chase.com/balance-transfer-credit-cards/slate",
    text: "0% intro APR for 21 months from account opening on purchases and balance transfers.",
    mode: "Public page", lastChecked: "34 min ago", status: "Available",
  },
  {
    id: "src-5", product: "Chase", plan: "Sapphire Preferred", title: "Sapphire Preferred benefits",
    url: "https://www.chase.com/sapphire-cards/personal/preferred",
    text: "Earn more than ever with the same $95 annual fee.",
    mode: "Public page", lastChecked: "34 min ago", status: "Available",
  },
];

let sources = [...defaultSources];
let currentChange = {
  company: "Chase", product: "Freedom Flex", kind: "intro_apr",
  oldValue: "15 months", newValue: "18 months", status: "scenario",
};
let currentResult = scanCurrent();
let activities = [
  { title: "Readiness scan completed", detail: "Intro APR scenario checked against all evidence.", time: "Just now" },
  { title: "Evidence loaded", detail: "Five sample sources are available in this browser.", time: "This session" },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const percentage = (value) => `${Math.round(value * 100)}%`;
const safeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch { return "#"; }
};

function scanCurrent() {
  return scanAssets({
    assets: sources,
    product: currentChange.company,
    plan: currentChange.product,
    kind: currentChange.kind,
    oldValue: currentChange.oldValue,
  });
}

function showView(name) {
  $$("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === name));
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  history.replaceState(null, "", `#${name}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function groupByPlan() {
  return sources.reduce((groups, source) => {
    const key = source.plan || "All products";
    groups[key] = [...(groups[key] || []), source];
    return groups;
  }, {});
}

function renderProductSummary() {
  const candidatePlans = new Set(currentResult.candidates.map((candidate) => candidate.plan));
  $("#product-summary").innerHTML = Object.entries(groupByPlan()).map(([plan, items]) => `
    <div class="product-row">
      <div><h3>${escapeHtml(currentChange.company)} ${escapeHtml(plan)}</h3><p>${items.length} evidence source${items.length === 1 ? "" : "s"} · browser demo</p></div>
      <span class="status-pill ${candidatePlans.has(plan) ? "warning" : ""}">${candidatePlans.has(plan) ? `${currentResult.candidates.filter((item) => item.plan === plan).length} to review` : "Current"}</span>
    </div>`).join("");
}

function renderActivity() {
  $("#activity-list").innerHTML = activities.slice(0, 4).map((activity) => `
    <div class="activity-row"><div><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.detail)}</p></div><time>${escapeHtml(activity.time)}</time></div>`).join("");
}

function renderSources() {
  $("#source-rows").innerHTML = sources.map((source) => `
    <tr>
      <td><span class="source-title">${escapeHtml(source.title)}</span><a class="source-url" href="${safeUrl(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a></td>
      <td>${escapeHtml(source.product)} ${escapeHtml(source.plan || "All products")}</td>
      <td>${escapeHtml(source.mode)}</td><td>${escapeHtml(source.lastChecked)}</td>
      <td><span class="status-pill">${escapeHtml(source.status)}</span></td>
    </tr>`).join("");
  $("#scope-count").textContent = `${sources.length} sources indexed`;
  $("#scope-products").innerHTML = Object.entries(groupByPlan()).map(([plan, items]) => `
    <div class="scope-row"><div><strong>${escapeHtml(plan)}</strong><p>${items.length} source${items.length === 1 ? "" : "s"}</p></div><span class="status-pill">Included</span></div>`).join("");
}

function highlightedClaim(text, evidence) {
  const index = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + evidence.length))}</mark>${escapeHtml(text.slice(index + evidence.length))}`;
}

function renderReview() {
  const count = currentResult.candidateCount;
  const excluded = sources.length - count;
  $("#review-count").textContent = count;
  $("#review-reduction").textContent = percentage(currentResult.reviewReduction);
  $("#review-context").textContent = `${currentChange.oldValue} → ${currentChange.newValue}`;
  $("#review-subtitle").textContent = `${count} of ${sources.length} sources may still reference ${currentChange.oldValue}.`;
  $("#nav-review-count").textContent = count;
  $("#metric-sources").textContent = sources.length;
  $("#metric-candidates").textContent = count;
  $("#metric-confidence").textContent = `${count} deterministic match${count === 1 ? "" : "es"}`;
  $("#metric-reduction").textContent = percentage(currentResult.reviewReduction);
  $("#metric-excluded").textContent = `${excluded} asset${excluded === 1 ? "" : "s"} excluded`;

  $("#review-list").innerHTML = count ? currentResult.candidates.map((candidate) => `
    <article class="review-item">
      <div><span class="status-pill warning">Needs review</span><h3>${escapeHtml(candidate.title)}</h3><p class="claim">“${highlightedClaim(candidate.text, candidate.evidence)}”</p><p class="source-meta">${escapeHtml(candidate.product)} · ${escapeHtml(candidate.plan || "All products")} · ${escapeHtml(candidate.lastChecked)}</p></div>
      <div class="review-side"><strong>Rule</strong><span>Deterministic match</span><a href="${safeUrl(candidate.url)}" target="_blank" rel="noreferrer">Open evidence ↗</a></div>
    </article>`).join("") : '<div class="empty-review">No stale references were found in the current scope.</div>';
}

function renderAll() {
  renderProductSummary();
  renderActivity();
  renderSources();
  renderReview();
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); showView(button.dataset.go); }));

$("#show-add-source").addEventListener("click", () => { $("#source-form").hidden = false; $("#source-title").focus(); });
$("#cancel-source").addEventListener("click", () => { $("#source-form").hidden = true; });
$("#source-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sources.push({
    id: `source-${Date.now()}`,
    product: $("#source-company").value.trim(), plan: $("#source-product").value.trim(),
    title: $("#source-title").value.trim(), url: $("#source-url").value.trim(),
    text: $("#source-text").value.trim(), mode: "Supplied text", lastChecked: "Just added", status: "Available",
  });
  currentResult = scanCurrent();
  activities.unshift({ title: "Evidence source added", detail: $("#source-title").value.trim(), time: "Just now" });
  event.target.reset();
  $("#source-company").value = "Chase";
  $("#source-product").value = "Freedom Flex";
  $("#source-form").hidden = true;
  renderAll();
});

$("#change-status").addEventListener("change", () => {
  const approved = $("#change-status").value === "approved";
  $("#scenario-note").innerHTML = approved
    ? "<strong>Approved-change mode.</strong> Only use this status for a change authorized by the organization that owns the content."
    : "<strong>Scenario only.</strong> This evaluates impact; it does not change Chase content or claim that an offer has changed.";
});

$("#change-form").addEventListener("submit", (event) => {
  event.preventDefault();
  currentChange = {
    company: $("#change-company").value.trim(), product: $("#change-product").value.trim(),
    kind: $("#change-kind").value, oldValue: $("#change-old").value.trim(),
    newValue: $("#change-new").value.trim(), status: $("#change-status").value,
  };
  try {
    currentResult = scanCurrent();
    activities.unshift({ title: "Readiness scan completed", detail: `${currentChange.product}: ${currentChange.oldValue} → ${currentChange.newValue}`, time: "Just now" });
    renderAll();
    showView("review");
  } catch (error) {
    $("#scenario-note").innerHTML = `<strong>Check the current claim.</strong> ${escapeHtml(error.message)}`;
  }
});

$("#export-review").addEventListener("click", () => {
  const report = { generated_at: new Date().toISOString(), change: currentChange, corpus_size: sources.length, ...currentResult };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "marketing-readiness-review.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

fetch("/report.json").then((response) => response.json()).then((report) => {
  const baseline = report.strategies.find((item) => item.strategy === "exact_keyword");
  const deterministic = report.strategies.find((item) => item.strategy === "deterministic_scoped");
  if (baseline) $("#benchmark-baseline").textContent = `${percentage(baseline.recall)} recall`;
  if (deterministic) $("#benchmark-deterministic").textContent = `${percentage(deterministic.recall)} recall`;
}).catch(() => {});

renderAll();
const initialView = location.hash.slice(1);
showView(["overview", "sources", "change", "review"].includes(initialView) ? initialView : "overview");
