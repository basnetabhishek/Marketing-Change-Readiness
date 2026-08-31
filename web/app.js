import { scanAssets } from "/engine.js";

const sourceTypeLabels = {
  webpage: "Webpage",
  file: "Uploaded file",
  email: "Email draft",
  paste: "Pasted copy",
};

const chaseSample = [
  {
    id: "sample-1", product: "Chase", plan: "Freedom Flex", title: "Freedom Flex product page",
    url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
    text: "0% intro APR for 15 months from account opening on purchases and balance transfers.",
    mode: "Webpage", sourceType: "webpage", lastChecked: "Sample snapshot", status: "Ready",
  },
  {
    id: "sample-2", product: "Chase", plan: "Freedom Flex", title: "Campaign email",
    url: "", text: "Pay no interest for the first fifteen months.",
    mode: "Email draft", sourceType: "email", lastChecked: "Sample snapshot", status: "Ready",
  },
  {
    id: "sample-3", product: "Chase", plan: "Freedom Flex", title: "Intro APR landing page",
    url: "https://creditcards.chase.com/0-intro-apr-credit-cards",
    text: "Enjoy a 15-month introductory period on eligible purchases.",
    mode: "Webpage", sourceType: "webpage", lastChecked: "Sample snapshot", status: "Ready",
  },
];

const emptyResult = () => ({ candidates: [], candidateCount: 0, reviewReduction: 0 });
let sources = [];
let currentChange = null;
let currentResult = emptyResult();
let hasRunScan = false;
let activities = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const percentage = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `source-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scanCurrent() {
  if (!currentChange || !sources.length) return emptyResult();
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

function groupByProduct() {
  return sources.reduce((groups, source) => {
    const key = `${source.product}|||${source.plan || "All products"}`;
    groups[key] = [...(groups[key] || []), source];
    return groups;
  }, {});
}

function renderProductSummary() {
  if (!sources.length) {
    $("#product-summary").innerHTML = '<div class="setup-prompt"><strong>No products in scope</strong><p>Add evidence to create your monitoring workspace.</p><button type="button" class="text-action" data-add-first>Add evidence →</button></div>';
    return;
  }
  const candidateIds = new Set(currentResult.candidates.map((candidate) => candidate.id));
  $("#product-summary").innerHTML = Object.values(groupByProduct()).map((items) => {
    const first = items[0];
    const matches = items.filter((item) => candidateIds.has(item.id)).length;
    return `
      <div class="product-row">
        <div><h3>${escapeHtml(first.product)} · ${escapeHtml(first.plan || "All products")}</h3><p>${items.length} evidence source${items.length === 1 ? "" : "s"} in this session</p></div>
        <span class="status-pill ${matches ? "warning" : ""}">${hasRunScan && matches ? `${matches} to review` : "Ready"}</span>
      </div>`;
  }).join("");
}

function renderActivity() {
  $("#activity-list").innerHTML = activities.length
    ? activities.slice(0, 4).map((activity) => `<div class="activity-row"><div><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.detail)}</p></div><time>${escapeHtml(activity.time)}</time></div>`).join("")
    : '<div class="setup-prompt"><strong>No activity yet</strong><p>Imported evidence and completed scans will appear here.</p></div>';
}

function sourceReference(source) {
  if (source.url) return new URL(source.url).hostname.replace(/^www\./, "");
  if (source.fileName) return source.fileName;
  if (source.subject) return source.subject;
  return `${source.text.length.toLocaleString()} characters`;
}

function renderSources() {
  $("#sources-empty").hidden = sources.length > 0;
  $("#sources-table").hidden = sources.length === 0;
  $("#source-rows").innerHTML = sources.map((source) => {
    const url = safeUrl(source.url);
    const reference = escapeHtml(sourceReference(source));
    const referenceMarkup = url
      ? `<a class="source-url" href="${url}" target="_blank" rel="noopener noreferrer">${reference}</a>`
      : `<span class="source-url">${reference}</span>`;
    return `<tr>
      <td><span class="source-title">${escapeHtml(source.title)}</span>${referenceMarkup}</td>
      <td>${escapeHtml(source.product)}<span class="source-url">${escapeHtml(source.plan || "All products")}</span></td>
      <td>${escapeHtml(source.mode)}</td><td>${escapeHtml(source.lastChecked)}</td>
      <td><span class="status-pill">${escapeHtml(source.status)}</span></td>
      <td><button class="row-action" type="button" data-remove-source="${escapeHtml(source.id)}" aria-label="Remove ${escapeHtml(source.title)}">Remove</button></td>
    </tr>`;
  }).join("");

  const selectedCompany = $("#change-company").value.trim().toLowerCase();
  const selectedProduct = $("#change-product").value.trim().toLowerCase();
  const groupIsIncluded = (items) => (!selectedCompany || items[0].product.toLowerCase() === selectedCompany)
    && (!selectedProduct || !items[0].plan || items[0].plan.toLowerCase() === selectedProduct);
  const includedCount = sources.filter((source) => (!selectedCompany || source.product.toLowerCase() === selectedCompany)
    && (!selectedProduct || !source.plan || source.plan.toLowerCase() === selectedProduct)).length;
  $("#scope-count").textContent = `${includedCount} of ${sources.length} source${sources.length === 1 ? "" : "s"} in current scope`;
  $("#scope-products").innerHTML = sources.length
    ? Object.values(groupByProduct()).map((items) => {
      const included = groupIsIncluded(items);
      return `<div class="scope-row"><div><strong>${escapeHtml(items[0].product)} · ${escapeHtml(items[0].plan || "All products")}</strong><p>${items.length} source${items.length === 1 ? "" : "s"}</p></div><span class="status-pill ${included ? "" : "is-muted"}">${included ? "Included" : "Excluded"}</span></div>`;
    }).join("")
    : '<div class="setup-prompt"><strong>Nothing to scan</strong><p>Add evidence from the Sources view.</p></div>';

  const companies = uniqueValues(sources.map((source) => source.product));
  const products = uniqueValues(sources.map((source) => source.plan));
  $("#company-options").innerHTML = companies.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#product-options").innerHTML = products.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#run-scan").disabled = sources.length === 0;
  updateScenarioNote();
}

function evidenceSnippet(text, evidence) {
  const index = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (index < 0) return text.slice(0, 180);
  const start = Math.max(0, index - 75);
  const end = Math.min(text.length, index + evidence.length + 75);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function highlightedClaim(text, evidence) {
  const snippet = evidenceSnippet(text, evidence);
  const index = snippet.toLowerCase().indexOf(evidence.toLowerCase());
  if (index < 0) return escapeHtml(snippet);
  return `${escapeHtml(snippet.slice(0, index))}<mark>${escapeHtml(snippet.slice(index, index + evidence.length))}</mark>${escapeHtml(snippet.slice(index + evidence.length))}`;
}

function renderReview() {
  const count = hasRunScan ? currentResult.candidateCount : 0;
  const excluded = sources.length - count;
  $("#review-count").textContent = count;
  $("#review-reduction").textContent = hasRunScan ? percentage(currentResult.reviewReduction) : "—";
  $("#review-context").textContent = hasRunScan ? `${currentChange.oldValue} → ${currentChange.newValue}` : "No scan yet";
  $("#review-subtitle").textContent = hasRunScan
    ? `${count} of ${sources.length} sources may still reference ${currentChange.oldValue}.`
    : "Add evidence and run a change event to create a review queue.";
  $("#nav-review-count").textContent = count;
  $("#nav-review-count").hidden = count === 0;
  $("#metric-sources").textContent = sources.length;
  $("#metric-source-note").textContent = sources.length ? `${sources.length} ready in this session` : "Add your first source";
  $("#metric-candidates").textContent = count;
  $("#metric-confidence").textContent = hasRunScan ? `${count} deterministic match${count === 1 ? "" : "es"}` : "No scan run yet";
  $("#metric-reduction").textContent = hasRunScan ? percentage(currentResult.reviewReduction) : "—";
  $("#metric-excluded").textContent = hasRunScan ? `${excluded} source${excluded === 1 ? "" : "s"} excluded` : "Waiting for evidence";
  $("#export-review").disabled = !hasRunScan;

  if (!hasRunScan) {
    $("#review-list").innerHTML = '<div class="empty-review">No scan has been run. Add evidence, then create a change event.</div>';
    return;
  }
  $("#review-list").innerHTML = count ? currentResult.candidates.map((candidate) => {
    const url = safeUrl(candidate.url);
    return `<article class="review-item">
      <div><span class="status-pill warning">Needs review</span><h3>${escapeHtml(candidate.title)}</h3><p class="claim">“${highlightedClaim(candidate.text, candidate.evidence)}”</p><p class="source-meta">${escapeHtml(candidate.product)} · ${escapeHtml(candidate.plan || "All products")} · ${escapeHtml(candidate.mode)}</p></div>
      <div class="review-side"><strong>${escapeHtml(candidate.evidence)}</strong><span>Deterministic match</span>${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">Open evidence ↗</a>` : '<span class="snapshot-label">Session snapshot</span>'}</div>
    </article>`;
  }).join("") : '<div class="empty-review"><strong>Scan complete—no matches.</strong><br />None of the in-scope evidence contained the old claim.</div>';
}

function renderAll() {
  renderProductSummary();
  renderActivity();
  renderSources();
  renderReview();
}

function activeSourceKind() {
  return $("input[name='source-kind']:checked").value;
}

function setSourceKind(kind) {
  $$(".source-kind").forEach((label) => label.classList.toggle("is-selected", label.querySelector("input").value === kind));
  $$("[data-source-kind]").forEach((panel) => { panel.hidden = panel.dataset.sourceKind !== kind; });
  $("#source-url").required = kind === "webpage";
  $("#source-file").required = kind === "file";
  $("#source-email-body").required = kind === "email";
  $("#source-paste-text").required = kind === "paste";
  $("#source-submit").firstChild.textContent = ({ webpage: "Fetch and add webpage ", file: "Import uploaded file ", email: "Add email draft ", paste: "Add pasted copy " })[kind];
  $("#source-form-status").textContent = "";
}

function openSourceForm() {
  $("#source-form").hidden = false;
  setSourceKind(activeSourceKind());
  $("#source-company").focus();
  $("#source-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cleanLocalText(raw, fileName = "") {
  if (/\.html?$/i.test(fileName)) {
    const documentCopy = new DOMParser().parseFromString(raw, "text/html");
    documentCopy.querySelectorAll("script,style,noscript,template,svg,iframe,object,embed").forEach((node) => node.remove());
    return (documentCopy.body?.textContent || "").replace(/\s+/g, " ").trim();
  }
  return raw.replace(/\0/g, "").trim();
}

function assertNotDuplicate(source) {
  const normalizedUrl = safeUrl(source.url).replace(/\/$/, "").toLowerCase();
  const duplicate = sources.some((existing) => {
    const sameUrl = normalizedUrl && safeUrl(existing.url).replace(/\/$/, "").toLowerCase() === normalizedUrl;
    const sameContent = existing.product.toLowerCase() === source.product.toLowerCase()
      && (existing.plan || "").toLowerCase() === (source.plan || "").toLowerCase()
      && existing.text.replace(/\s+/g, " ").toLowerCase() === source.text.replace(/\s+/g, " ").toLowerCase();
    return sameUrl || sameContent;
  });
  if (duplicate) throw new Error("That evidence source is already in this session.");
}

async function buildSourceFromForm() {
  const kind = activeSourceKind();
  const company = $("#source-company").value.trim();
  const product = $("#source-product").value.trim();
  const enteredTitle = $("#source-title").value.trim();
  const base = { id: createId(), product: company, plan: product, title: enteredTitle, sourceType: kind, mode: sourceTypeLabels[kind], lastChecked: "Just added", status: "Ready", url: "" };

  if (kind === "webpage") {
    const url = safeUrl($("#source-url").value.trim());
    if (!url) throw new Error("Enter a valid public http or https webpage URL.");
    const response = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const page = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(page.error || "The webpage could not be retrieved.");
    return { ...base, title: enteredTitle || page.title || new URL(page.finalUrl).hostname, url: page.finalUrl, text: page.text, lastChecked: "Fetched just now" };
  }

  if (kind === "file") {
    const file = $("#source-file").files[0];
    if (!file) throw new Error("Choose a supported marketing file.");
    if (file.size > 2_000_000) throw new Error("Choose a file smaller than 2 MB.");
    if (!/\.(txt|md|html?|csv|json)$/i.test(file.name)) throw new Error("Use a TXT, MD, HTML, CSV, or JSON file.");
    const text = cleanLocalText(await file.text(), file.name);
    return { ...base, title: enteredTitle || file.name, text, fileName: file.name, mimeType: file.type || "text/plain" };
  }

  if (kind === "email") {
    const subject = $("#source-email-subject").value.trim();
    const preheader = $("#source-email-preheader").value.trim();
    const body = $("#source-email-body").value.trim();
    return { ...base, title: enteredTitle || subject || "Email draft", subject, text: [subject, preheader, body].filter(Boolean).join("\n") };
  }

  return { ...base, title: enteredTitle || "Pasted marketing copy", text: $("#source-paste-text").value.trim() };
}

function setChangeForm(change) {
  $("#change-company").value = change?.company || "";
  $("#change-product").value = change?.product || "";
  $("#change-kind").value = change?.kind || "intro_apr";
  $("#change-old").value = change?.oldValue || "";
  $("#change-new").value = change?.newValue || "";
  $("#change-status").value = change?.status || "scenario";
}

function updateScenarioNote() {
  if (!sources.length) {
    $("#scenario-note").innerHTML = "<strong>Add evidence first.</strong> At least one ready source is required before running a scan.";
    return;
  }
  const approved = $("#change-status").value === "approved";
  $("#scenario-note").innerHTML = approved
    ? "<strong>Approved-change mode.</strong> Use this only for a change authorized by the organization that owns the evidence."
    : "<strong>Scenario only.</strong> This evaluates impact and does not change any external content.";
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); showView(button.dataset.go); }));

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-first]");
  if (addButton) { showView("sources"); openSourceForm(); return; }
  const removeButton = event.target.closest("[data-remove-source]");
  if (!removeButton) return;
  const removed = sources.find((source) => source.id === removeButton.dataset.removeSource);
  sources = sources.filter((source) => source.id !== removeButton.dataset.removeSource);
  if (!sources.length) { hasRunScan = false; currentResult = emptyResult(); }
  else if (hasRunScan) currentResult = scanCurrent();
  activities.unshift({ title: "Evidence removed", detail: removed?.title || "Source", time: "Just now" });
  renderAll();
});

$("#show-add-source").addEventListener("click", openSourceForm);
$("#cancel-source").addEventListener("click", () => { $("#source-form").hidden = true; $("#source-form-status").textContent = ""; });
$$('input[name="source-kind"]').forEach((input) => input.addEventListener("change", () => setSourceKind(input.value)));
$("#source-file").addEventListener("change", () => {
  const file = $("#source-file").files[0];
  if (file && !$("#source-title").value.trim()) $("#source-title").value = file.name.replace(/\.[^.]+$/, "");
});

$("#source-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#source-submit");
  submit.disabled = true;
  $("#source-form-status").className = "form-status is-loading";
  $("#source-form-status").textContent = activeSourceKind() === "webpage" ? "Retrieving and extracting the public page…" : "Reading evidence in this browser…";
  try {
    const source = await buildSourceFromForm();
    if (!source.product || !source.plan || !source.title) throw new Error("Company and product are required, and the source needs a recognizable title.");
    if (!source.text || source.text.trim().length < 10) throw new Error("The source needs at least 10 characters of readable marketing text.");
    assertNotDuplicate(source);
    sources.push({ ...source, text: source.text.slice(0, 200_000) });
    if (hasRunScan) currentResult = scanCurrent();
    if (sources.length === 1) {
      $("#change-company").value = source.product;
      $("#change-product").value = source.plan;
    }
    activities.unshift({ title: "Evidence added", detail: `${source.mode}: ${source.title}`, time: "Just now" });
    event.target.reset();
    $("input[name='source-kind'][value='webpage']").checked = true;
    setSourceKind("webpage");
    $("#source-form").hidden = true;
    renderAll();
  } catch (error) {
    $("#source-form-status").className = "form-status is-error";
    $("#source-form-status").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

$("#load-sample").addEventListener("click", () => {
  sources = chaseSample.map((source) => ({ ...source }));
  currentChange = { company: "Chase", product: "Freedom Flex", kind: "intro_apr", oldValue: "15 months", newValue: "18 months", status: "scenario" };
  currentResult = scanCurrent();
  hasRunScan = true;
  activities = [{ title: "Optional sample loaded", detail: "Three Chase evidence snapshots and an APR scenario.", time: "Just now" }];
  setChangeForm(currentChange);
  renderAll();
});

$("#change-status").addEventListener("change", updateScenarioNote);
$("#change-company").addEventListener("input", renderSources);
$("#change-product").addEventListener("input", renderSources);

$("#change-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!sources.length) { $("#scenario-note").innerHTML = "<strong>Add evidence first.</strong> At least one ready source is required before running a scan."; return; }
  currentChange = {
    company: $("#change-company").value.trim(), product: $("#change-product").value.trim(),
    kind: $("#change-kind").value, oldValue: $("#change-old").value.trim(),
    newValue: $("#change-new").value.trim(), status: $("#change-status").value,
  };
  try {
    currentResult = scanCurrent();
    hasRunScan = true;
    activities.unshift({ title: "Readiness scan completed", detail: `${currentChange.product}: ${currentChange.oldValue} → ${currentChange.newValue}`, time: "Just now" });
    renderAll();
    showView("review");
  } catch (error) {
    $("#scenario-note").innerHTML = `<strong>Check the current claim.</strong> ${escapeHtml(error.message)}`;
  }
});

$("#export-review").addEventListener("click", () => {
  if (!hasRunScan) return;
  const report = { generated_at: new Date().toISOString(), change: currentChange, corpus_size: sources.length, ...currentResult };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = "marketing-readiness-review.json";
  link.click();
  URL.revokeObjectURL(objectUrl);
});

fetch("/report.json").then((response) => response.json()).then((report) => {
  const baseline = report.strategies.find((item) => item.strategy === "exact_keyword");
  const deterministic = report.strategies.find((item) => item.strategy === "deterministic_scoped");
  if (baseline) $("#benchmark-baseline").textContent = `${percentage(baseline.recall)} recall`;
  if (deterministic) $("#benchmark-deterministic").textContent = `${percentage(deterministic.recall)} recall`;
}).catch(() => {});

setSourceKind("webpage");
renderAll();
const initialView = location.hash.slice(1);
showView(["overview", "sources", "change", "review"].includes(initialView) ? initialView : "overview");
