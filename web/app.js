import { groundedDisplayReview, scanAssets } from "/engine.js";

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

const emptyResult = () => ({ candidates: [], candidateCount: 0, reviewReduction: 0, scanMode: "deterministic", aiStatus: "not_requested" });
let sources = [];
let currentChange = null;
let currentResult = emptyResult();
let hasRunScan = false;
let activities = [];
let historyItems = [];
let monitoringHistory = [];
let monitoringAlerts = [];
let monitoringPreferences = { emailAlertsEnabled: false, emailAlertsAvailable: false };
let monitoringRefreshInFlight = false;
let authMode = "signin";
let cloudState = { configured: false, user: null, demo: false, ready: false };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const percentage = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

function usingCloud() {
  return Boolean(cloudState.configured && cloudState.user && !cloudState.demo);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The saved workspace request failed.");
  return data;
}

function formatDate(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Saved" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

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
  return { ...scanAssets({
    assets: sources,
    product: currentChange.company,
    plan: currentChange.product,
    kind: currentChange.kind,
    oldValue: currentChange.oldValue,
  }), scanMode: "deterministic", aiStatus: "not_requested" };
}

function selectedScanMode() {
  return $("input[name='scan-mode']:checked")?.value || "deterministic";
}

function updateScanModeAvailability() {
  const smart = $("input[name='scan-mode'][value='smart']");
  const deterministic = $("input[name='scan-mode'][value='deterministic']");
  if (!smart || !deterministic) return;
  smart.disabled = !usingCloud();
  if (!usingCloud() && smart.checked) deterministic.checked = true;
  $$(".scan-mode").forEach((label) => label.classList.toggle("is-selected", label.querySelector("input").checked));
  $("#scan-mode-status").textContent = usingCloud()
    ? "Smart Scan sends up to 8 in-scope evidence excerpts to Groq, then validates every returned quote against your saved source."
    : "Sign in to use Smart Scan. Deterministic scanning remains available in browser demo mode.";
}

async function runSmartScan(scanId) {
  const data = await apiRequest("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ scanId, change: currentChange }),
  });
  return data.result;
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
        <div><h3>${escapeHtml(first.product)} · ${escapeHtml(first.plan || "All products")}</h3><p>${items.length} evidence source${items.length === 1 ? "" : "s"} ${usingCloud() ? "saved" : "in this session"}</p></div>
        <span class="status-pill ${matches || items.some((item) => item.status === "Changed") ? "warning" : ""}">${hasRunScan && matches ? `${matches} to review` : items.some((item) => item.status === "Changed") ? "Page changed" : "Ready"}</span>
      </div>`;
  }).join("");
}

function renderActivity() {
  $("#activity-list").innerHTML = activities.length
    ? activities.slice(0, 4).map((activity) => `<div class="activity-row"><div><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.detail)}</p></div><time>${escapeHtml(activity.time)}</time></div>`).join("")
    : '<div class="setup-prompt"><strong>No activity yet</strong><p>Imported evidence and completed scans will appear here.</p></div>';
}

function renderAlerts() {
  const openAlerts = monitoringAlerts.filter((alert) => alert.status === "open");
  const count = openAlerts.length;
  $("#nav-alert-count").textContent = count;
  $("#nav-alert-count").hidden = count === 0;
  const toggle = $("#email-alerts-toggle");
  toggle.checked = Boolean(monitoringPreferences.emailAlertsEnabled);
  toggle.disabled = !usingCloud() || !monitoringPreferences.emailAlertsAvailable;
  $("#email-alerts-note").textContent = !usingCloud()
    ? "Sign in to receive persistent in-app monitoring alerts."
    : monitoringPreferences.emailAlertsAvailable
      ? monitoringPreferences.emailAlertsEnabled ? "Email and in-app alerts are active." : "In-app alerts are active. Turn on email when you want an additional notification."
      : "In-app alerts are active. Email delivery can be connected later without changing the monitoring workflow.";
  $("#alert-list").innerHTML = openAlerts.length
    ? openAlerts.map((alert) => `<article class="monitoring-alert ${escapeHtml(alert.severity)}">
        <div><span class="status-pill ${alert.severity === "critical" ? "warning" : ""}">${escapeHtml(alert.severity === "critical" ? "Old claim found" : alert.severity === "warning" ? "Review wording" : "Page changed")}</span><h3>${escapeHtml(alert.title)}</h3><p>${escapeHtml(alert.detail)}</p>${alert.evidence ? `<blockquote>“${escapeHtml(alert.evidence)}”</blockquote>` : ""}<small>${escapeHtml(formatDate(alert.createdAt))}${alert.emailStatus === "sent" ? " · Email sent" : ""}</small></div>
        <div class="alert-actions">${alert.result?.change ? `<button class="row-action" type="button" data-open-alert="${escapeHtml(alert.id)}">Open review</button>` : ""}<button class="row-action" type="button" data-review-alert="${escapeHtml(alert.id)}">Mark reviewed</button></div>
      </article>`).join("")
    : '<div class="setup-prompt alert-empty"><strong>No open monitoring alerts</strong><p>When a monitored webpage changes, its automatic rescan will appear here.</p></div>';
}

function renderHistory() {
  const target = $("#history-list");
  if (!target) return;
  target.innerHTML = historyItems.length
    ? historyItems.map((item) => {
      const result = item.result || emptyResult();
      const change = item.change || {};
      const method = result.scanMode === "ai_assisted" ? "Smart Scan" : result.scanMode === "deterministic_fallback" ? "Smart fallback" : "Deterministic";
      return `<button class="history-item" type="button" data-open-history="${escapeHtml(item.id)}">
        <div><time>${escapeHtml(formatDate(item.createdAt))}</time><h3>${escapeHtml(change.company)} · ${escapeHtml(change.product)}</h3><p>${escapeHtml(change.oldValue)} → ${escapeHtml(change.newValue)} · ${escapeHtml(change.status === "approved" ? "Approved change" : "Scenario")}</p></div>
        <div class="history-metrics"><span><strong>${Number(result.candidateCount) || 0}</strong>Candidates</span><span><strong>${percentage(Number(result.reviewReduction) || 0)}</strong>${escapeHtml(method)}</span></div>
      </button>`;
    }).join("")
    : '<div class="empty-history"><strong>No saved scans yet</strong>Run a readiness scan and it will appear here.</div>';
}

function renderWorkspaceChrome() {
  const cloud = usingCloud();
  const monitoredCount = sources.filter((source) => source.monitoringEnabled).length;
  $("#workspace-status").textContent = cloud ? monitoredCount ? `${monitoredCount} page${monitoredCount === 1 ? "" : "s"} checked daily` : "Saved workspace active" : cloudState.configured ? "Browser demo active" : "Browser workspace ready";
  $("#workspace-mode").textContent = cloud ? "Cloud saved" : "Session only";
  $("#activity-mode").textContent = cloud ? "Saved history" : "This session";
  $("#account-button").textContent = cloud ? "Sign out" : cloudState.configured ? "Sign in" : "Cloud setup pending";
  $("#capability-note").innerHTML = cloud
    ? "<strong>Automatic monitoring ready:</strong> Public webpage sources can be checked immediately or once each day. Changed pages are retained as timestamped evidence."
    : cloudState.configured
      ? "<strong>Browser demo mode:</strong> This session is not saved. Sign in whenever you want a private, refresh-safe workspace."
      : "<strong>Browser demo mode:</strong> The cloud workspace has not been connected yet, so this session is cleared on refresh.";
  updateScanModeAvailability();
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
    const statusClass = ["Changed", "Check failed"].includes(source.status) ? "warning" : "";
    const monitoringActions = source.sourceType === "webpage" && url
      ? `<div class="source-actions"><button class="row-action" type="button" data-check-source="${escapeHtml(source.id)}" ${usingCloud() ? "" : "disabled"}>Check now</button><button class="row-action" type="button" data-toggle-monitor="${escapeHtml(source.id)}" data-enabled="${source.monitoringEnabled ? "true" : "false"}" ${usingCloud() ? "" : "disabled"}>${source.monitoringEnabled ? "Pause daily" : "Monitor daily"}</button><button class="row-action danger" type="button" data-remove-source="${escapeHtml(source.id)}" aria-label="Remove ${escapeHtml(source.title)}">Remove</button></div>`
      : `<button class="row-action danger" type="button" data-remove-source="${escapeHtml(source.id)}" aria-label="Remove ${escapeHtml(source.title)}">Remove</button>`;
    return `<tr>
      <td><span class="source-title">${escapeHtml(source.title)}</span>${referenceMarkup}</td>
      <td>${escapeHtml(source.product)}<span class="source-url">${escapeHtml(source.plan || "All products")}</span></td>
      <td>${escapeHtml(source.mode)}</td><td>${escapeHtml(source.lastChecked)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(source.status)}</span>${source.monitoringEnabled ? '<span class="source-url">Daily monitoring on</span>' : ""}</td>
      <td>${monitoringActions}</td>
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
  if (!evidence) return escapeHtml(evidenceSnippet(text, "").slice(0, 180));
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
  const method = currentResult.scanMode === "ai_assisted" ? "Smart Scan" : currentResult.scanMode === "deterministic_fallback" ? "Safe fallback" : "Deterministic";
  $("#review-method").textContent = hasRunScan ? method : "—";
  $("#review-subtitle").textContent = hasRunScan
    ? `${count} of ${sources.length} sources may still reference ${currentChange.oldValue}.`
    : "Add evidence and run a change event to create a review queue.";
  $("#nav-review-count").textContent = count;
  $("#nav-review-count").hidden = count === 0;
  $("#metric-sources").textContent = sources.length;
  $("#metric-source-note").textContent = sources.length ? `${sources.length} ready ${usingCloud() ? "and saved" : "in this session"}` : "Add your first source";
  $("#metric-candidates").textContent = count;
  $("#metric-confidence").textContent = hasRunScan
    ? currentResult.scanMode === "ai_assisted" ? `${count} evidence-verified candidate${count === 1 ? "" : "s"}` : `${count} deterministic match${count === 1 ? "" : "es"}`
    : "No scan run yet";
  $("#metric-reduction").textContent = hasRunScan ? percentage(currentResult.reviewReduction) : "—";
  $("#metric-excluded").textContent = hasRunScan ? `${excluded} source${excluded === 1 ? "" : "s"} excluded` : "Waiting for evidence";
  $("#export-review").disabled = !hasRunScan;

  if (!hasRunScan) {
    $("#review-list").innerHTML = '<div class="empty-review">No scan has been run. Add evidence, then create a change event.</div>';
    return;
  }
  const fallbackNote = currentResult.scanMode === "deterministic_fallback"
    ? `<div class="capability-note"><strong>Deterministic safety net used:</strong> ${escapeHtml(currentResult.message || "Smart verification was temporarily unavailable.")}</div>`
    : "";
  $("#review-list").innerHTML = fallbackNote + (count ? currentResult.candidates.map((candidate) => {
    const url = safeUrl(candidate.url);
    const ai = groundedDisplayReview(candidate);
    const label = ai?.impact === "affected" ? "Affected" : ai?.impact === "uncertain" ? "Check needed" : "Needs review";
    const retrieval = Array.isArray(candidate.retrieval) ? candidate.retrieval : ["deterministic"];
    const retrievalTags = retrieval.map((item) => `<span class="retrieval-tag">${escapeHtml(item === "semantic" ? "Semantic retrieval" : "Deterministic rule")}</span>`).join("");
    const explanation = ai ? `<p class="ai-explanation"><strong>Why:</strong> ${escapeHtml(ai.explanation || "Evidence requires human confirmation.")}${ai.recommendedAction ? `<br /><strong>Next:</strong> ${escapeHtml(ai.recommendedAction)}` : ""}</p>` : "";
    const deterministicConfidence = ai?.confidenceSource === "deterministic";
    const sideValue = deterministicConfidence ? "Confirmed" : ai ? percentage(ai.confidence) : candidate.evidence;
    const sideLabel = deterministicConfidence ? "Rule-backed evidence" : ai ? "AI confidence" : "Deterministic match";
    return `<article class="review-item">
      <div><span class="status-pill warning">${escapeHtml(label)}</span><h3>${escapeHtml(candidate.title)}</h3><p class="claim">“${highlightedClaim(candidate.text, candidate.evidence)}”</p><p class="source-meta">${escapeHtml(candidate.product)} · ${escapeHtml(candidate.plan || "All products")} · ${escapeHtml(candidate.mode)}</p><div class="retrieval-tags">${retrievalTags}</div>${explanation}</div>
      <div class="review-side"><strong>${escapeHtml(sideValue)}</strong><span>${escapeHtml(sideLabel)}</span>${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">Open evidence ↗</a>` : '<span class="snapshot-label">Saved snapshot</span>'}</div>
    </article>`;
  }).join("") : `<div class="empty-review"><strong>Scan complete—no matches.</strong><br />${currentResult.scanMode === "ai_assisted" ? "No in-scope evidence expressed or implied the old claim." : "None of the in-scope evidence contained the old claim."}</div>`);
}

function renderAll() {
  renderProductSummary();
  renderActivity();
  renderAlerts();
  renderSources();
  renderReview();
  renderHistory();
  renderWorkspaceChrome();
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
  if (duplicate) throw new Error("That evidence source is already in this workspace.");
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
    if (!/\.(txt|md|html?|csv|json|pdf|docx)$/i.test(file.name)) throw new Error("Use a TXT, MD, HTML, CSV, JSON, PDF, or DOCX file.");
    if (usingCloud()) return { ...base, title: enteredTitle || file.name, fileName: file.name, mimeType: file.type || "application/octet-stream", pendingFile: file };
    if (/\.(pdf|docx)$/i.test(file.name)) throw new Error("Sign in to extract and save PDF or DOCX evidence. Browser demo mode supports text-based files.");
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function saveSource(source) {
  if (!usingCloud()) return source;
  const data = source.pendingFile
    ? await apiRequest("/api/workspace", { method: "POST", body: JSON.stringify({
      action: "uploadSource",
      source: { ...source, pendingFile: undefined },
      file: { fileName: source.pendingFile.name, mimeType: source.pendingFile.type, base64: await fileToBase64(source.pendingFile) },
    }) })
    : await apiRequest("/api/workspace", { method: "POST", body: JSON.stringify({ action: "saveSource", source }) });
  return data.source;
}

async function saveChange(change, result, id = createId()) {
  const item = { id, change, result, corpusSize: sources.length, createdAt: new Date().toISOString() };
  if (!usingCloud()) return item;
  const data = await apiRequest("/api/workspace", { method: "POST", body: JSON.stringify({ action: "saveChange", ...item }) });
  return data.item;
}

function activitiesFromWorkspace() {
  const sourceActivity = sources.map((source) => ({
    title: "Evidence saved", detail: `${source.mode}: ${source.title}`, time: formatDate(source.createdAt), createdAt: source.createdAt,
  }));
  const changeActivity = historyItems.map((item) => ({
    title: "Readiness scan completed", detail: `${item.change.product}: ${item.change.oldValue} → ${item.change.newValue}`, time: formatDate(item.createdAt), createdAt: item.createdAt,
  }));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const monitoringActivity = monitoringHistory.map((item) => {
    const source = sourceById.get(item.sourceId);
    const title = item.status === "changed" ? "Monitored page changed" : item.status === "error" ? "Page check failed" : "Monitored page checked";
    const detail = `${source?.title || "Webpage"}${item.error ? `: ${item.error}` : item.changed ? ": visible text changed" : ": no visible change"}`;
    return { title, detail, time: formatDate(item.fetchedAt), createdAt: item.fetchedAt };
  });
  const alertActivity = monitoringAlerts.map((item) => ({
    title: item.status === "reviewed" ? "Monitoring alert reviewed" : item.title,
    detail: item.detail,
    time: formatDate(item.createdAt),
    createdAt: item.createdAt,
  }));
  return [...sourceActivity, ...changeActivity, ...monitoringActivity, ...alertActivity].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function loadWorkspace() {
  const data = await apiRequest("/api/workspace");
  sources = data.sources || [];
  historyItems = data.history || [];
  monitoringHistory = data.monitoringHistory || [];
  monitoringAlerts = data.alerts || [];
  monitoringPreferences = data.preferences || { emailAlertsEnabled: false, emailAlertsAvailable: false };
  activities = activitiesFromWorkspace();
  currentChange = null;
  currentResult = emptyResult();
  hasRunScan = false;
  renderAll();
}

async function refreshMonitoringFeed() {
  if (!usingCloud() || monitoringRefreshInFlight || document.hidden) return;
  monitoringRefreshInFlight = true;
  try {
    const data = await apiRequest("/api/workspace");
    sources = data.sources || [];
    historyItems = data.history || [];
    monitoringHistory = data.monitoringHistory || [];
    monitoringAlerts = data.alerts || [];
    monitoringPreferences = data.preferences || monitoringPreferences;
    activities = activitiesFromWorkspace();
    renderAll();
  } finally {
    monitoringRefreshInFlight = false;
  }
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

document.addEventListener("click", async (event) => {
  const addButton = event.target.closest("[data-add-first]");
  if (addButton) { showView("sources"); openSourceForm(); return; }
  const historyButton = event.target.closest("[data-open-history]");
  if (historyButton) {
    const item = historyItems.find((entry) => entry.id === historyButton.dataset.openHistory);
    if (!item) return;
    currentChange = { ...item.change };
    currentResult = item.result || emptyResult();
    hasRunScan = true;
    setChangeForm(currentChange);
    renderAll();
    showView("review");
    return;
  }
  const openAlertButton = event.target.closest("[data-open-alert]");
  if (openAlertButton) {
    const alert = monitoringAlerts.find((item) => item.id === openAlertButton.dataset.openAlert);
    if (!alert?.result?.change) return;
    currentChange = { ...alert.result.change };
    currentResult = { ...alert.result, scanMode: "automatic_deterministic" };
    hasRunScan = true;
    setChangeForm(currentChange);
    renderAll();
    showView("review");
    return;
  }
  const reviewAlertButton = event.target.closest("[data-review-alert]");
  if (reviewAlertButton) {
    reviewAlertButton.disabled = true;
    try {
      const data = await apiRequest("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ action: "reviewAlert", alertId: reviewAlertButton.dataset.reviewAlert }),
      });
      monitoringAlerts = monitoringAlerts.map((item) => item.id === data.alert.id ? data.alert : item);
      activities = activitiesFromWorkspace();
      renderAll();
    } catch (error) {
      reviewAlertButton.disabled = false;
      $("#email-alerts-note").textContent = error.message;
    }
    return;
  }
  const toggleButton = event.target.closest("[data-toggle-monitor]");
  if (toggleButton) {
    toggleButton.disabled = true;
    const enabled = toggleButton.dataset.enabled !== "true";
    try {
      const data = await apiRequest("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ action: "setMonitoring", sourceId: toggleButton.dataset.toggleMonitor, enabled }),
      });
      sources = sources.map((source) => source.id === data.source.id ? data.source : source);
      activities.unshift({ title: enabled ? "Daily monitoring enabled" : "Daily monitoring paused", detail: data.source.title, time: "Just now" });
      renderAll();
    } catch (error) {
      toggleButton.disabled = false;
      $("#capability-note").innerHTML = `<strong>Monitoring was not changed.</strong> ${escapeHtml(error.message)}`;
    }
    return;
  }
  const checkButton = event.target.closest("[data-check-source]");
  if (checkButton) {
    checkButton.disabled = true;
    checkButton.textContent = "Checking…";
    try {
      const data = await apiRequest("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ action: "checkSource", sourceId: checkButton.dataset.checkSource }),
      });
      sources = sources.map((source) => source.id === data.source.id ? data.source : source);
      monitoringHistory.unshift(data.snapshot);
      if (data.alert) monitoringAlerts.unshift(data.alert);
      activities = activitiesFromWorkspace();
      if (hasRunScan) currentResult = scanCurrent();
      renderAll();
    } catch (error) {
      $("#capability-note").innerHTML = `<strong>The page check failed.</strong> ${escapeHtml(error.message)}`;
      checkButton.disabled = false;
      checkButton.textContent = "Check now";
    }
    return;
  }
  const removeButton = event.target.closest("[data-remove-source]");
  if (!removeButton) return;
  const removed = sources.find((source) => source.id === removeButton.dataset.removeSource);
  if (usingCloud()) {
    removeButton.disabled = true;
    try {
      await apiRequest(`/api/workspace?sourceId=${encodeURIComponent(removeButton.dataset.removeSource)}`, { method: "DELETE" });
    } catch (error) {
      removeButton.disabled = false;
      $("#capability-note").innerHTML = `<strong>Could not remove evidence.</strong> ${escapeHtml(error.message)}`;
      return;
    }
  }
  sources = sources.filter((source) => source.id !== removeButton.dataset.removeSource);
  monitoringHistory = monitoringHistory.filter((item) => item.sourceId !== removeButton.dataset.removeSource);
  monitoringAlerts = monitoringAlerts.filter((item) => item.sourceId !== removeButton.dataset.removeSource);
  if (!sources.length) { hasRunScan = false; currentResult = emptyResult(); }
  else if (hasRunScan) currentResult = scanCurrent();
  activities.unshift({ title: "Evidence removed", detail: removed?.title || "Source", time: "Just now" });
  renderAll();
});

$("#show-add-source").addEventListener("click", openSourceForm);
$("#email-alerts-toggle").addEventListener("change", async (event) => {
  const toggle = event.currentTarget;
  const enabled = toggle.checked;
  toggle.disabled = true;
  try {
    const data = await apiRequest("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "setEmailAlerts", enabled }),
    });
    monitoringPreferences = data.preferences;
  } catch (error) {
    toggle.checked = !enabled;
    $("#email-alerts-note").textContent = error.message;
  } finally {
    renderAlerts();
  }
});
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
    let source = await buildSourceFromForm();
    if (!source.product || !source.plan || !source.title) throw new Error("Company and product are required, and the source needs a recognizable title.");
    if (!source.pendingFile && (!source.text || source.text.trim().length < 10)) throw new Error("The source needs at least 10 characters of readable marketing text.");
    if (source.pendingFile) {
      const duplicateFile = sources.some((existing) => existing.product.toLowerCase() === source.product.toLowerCase()
        && (existing.plan || "").toLowerCase() === (source.plan || "").toLowerCase()
        && (existing.fileName || "").toLowerCase() === source.fileName.toLowerCase());
      if (duplicateFile) throw new Error("That evidence file is already in this workspace.");
    } else {
      assertNotDuplicate(source);
    }
    source = await saveSource(source);
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

$("#load-sample").addEventListener("click", async () => {
  const button = $("#load-sample");
  button.disabled = true;
  try {
    const sampleSources = chaseSample.map((source) => ({ ...source, id: createId() }));
    sources = usingCloud() ? await Promise.all(sampleSources.map(saveSource)) : sampleSources;
  currentChange = { company: "Chase", product: "Freedom Flex", kind: "intro_apr", oldValue: "15 months", newValue: "18 months", status: "scenario" };
  currentResult = scanCurrent();
  hasRunScan = true;
  activities = [{ title: "Optional sample loaded", detail: "Three Chase evidence snapshots and an APR scenario.", time: "Just now" }];
  setChangeForm(currentChange);
  renderAll();
  } catch (error) {
    $("#capability-note").innerHTML = `<strong>Could not load the sample.</strong> ${escapeHtml(error.message)}`;
  } finally {
    button.disabled = false;
  }
});

$("#change-status").addEventListener("change", updateScenarioNote);
$("#change-company").addEventListener("input", renderSources);
$("#change-product").addEventListener("input", renderSources);
$$('input[name="scan-mode"]').forEach((input) => input.addEventListener("change", updateScanModeAvailability));

$("#change-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sources.length) { $("#scenario-note").innerHTML = "<strong>Add evidence first.</strong> At least one ready source is required before running a scan."; return; }
  const button = $("#run-scan");
  const scanId = createId();
  currentChange = {
    company: $("#change-company").value.trim(), product: $("#change-product").value.trim(),
    kind: $("#change-kind").value, oldValue: $("#change-old").value.trim(),
    newValue: $("#change-new").value.trim(), status: $("#change-status").value,
  };
  button.disabled = true;
  button.firstChild.textContent = selectedScanMode() === "smart" && usingCloud() ? "Running Smart Scan… " : "Running deterministic scan… ";
  $("#scenario-note").innerHTML = selectedScanMode() === "smart" && usingCloud()
    ? "<strong>Smart Scan running.</strong> Reviewing the bounded in-scope evidence and validating every AI quote against the saved source."
    : "<strong>Deterministic scan running.</strong> Checking normalized values inside the selected company and product scope.";
  try {
    currentResult = selectedScanMode() === "smart" && usingCloud() ? await runSmartScan(scanId) : scanCurrent();
    hasRunScan = true;
    const historyItem = await saveChange(currentChange, currentResult, scanId);
    historyItems.unshift(historyItem);
    activities.unshift({
      title: currentResult.scanMode === "ai_assisted" ? "Smart Scan completed" : currentResult.scanMode === "deterministic_fallback" ? "Smart Scan used safety fallback" : "Readiness scan completed",
      detail: `${currentChange.product}: ${currentChange.oldValue} → ${currentChange.newValue}`,
      time: "Just now",
    });
    renderAll();
    showView("review");
  } catch (error) {
    $("#scenario-note").innerHTML = `<strong>Check the current claim.</strong> ${escapeHtml(error.message)}`;
  } finally {
    button.disabled = sources.length === 0;
    button.firstChild.textContent = "Run readiness scan ";
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

function setAuthMode(mode) {
  authMode = mode;
  $$('[data-auth-mode]').forEach((button) => button.classList.toggle("is-active", button.dataset.authMode === mode));
  $("#auth-title").textContent = mode === "signup" ? "Create your private workspace" : "Keep your evidence between visits";
  $("#auth-submit").firstChild.textContent = mode === "signup" ? "Create account " : "Sign in ";
  $("#auth-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("#auth-status").textContent = "";
}

function showAuthGate() {
  $("#auth-gate").hidden = false;
  setAuthMode(authMode);
  setTimeout(() => $("#auth-email").focus(), 0);
}

async function refreshAuthState() {
  const status = await apiRequest("/api/auth?action=status");
  cloudState = { configured: Boolean(status.configured), user: status.user || null, demo: false, ready: true };
  if (!cloudState.configured) {
    cloudState.demo = true;
    renderAll();
    return;
  }
  if (!cloudState.user) {
    renderAll();
    showAuthGate();
    return;
  }
  $("#auth-gate").hidden = true;
  const smartMode = $("input[name='scan-mode'][value='smart']");
  if (smartMode) smartMode.checked = true;
  await loadWorkspace();
}

$$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

$("#continue-demo").addEventListener("click", () => {
  cloudState.demo = true;
  $("#auth-gate").hidden = true;
  renderAll();
});

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#auth-submit");
  submit.disabled = true;
  $("#auth-status").className = "form-status is-loading";
  $("#auth-status").textContent = authMode === "signup" ? "Creating your workspace…" : "Signing in…";
  try {
    const data = await apiRequest(`/api/auth?action=${authMode}`, {
      method: "POST",
      body: JSON.stringify({ email: $("#auth-email").value, password: $("#auth-password").value }),
    });
    if (data.needsConfirmation) {
      setAuthMode("signin");
      $("#auth-status").className = "form-status is-loading";
      $("#auth-status").textContent = "Check your email, confirm the account, then sign in.";
      return;
    }
    await refreshAuthState();
  } catch (error) {
    $("#auth-status").className = "form-status is-error";
    $("#auth-status").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

$("#account-button").addEventListener("click", async () => {
  if (usingCloud()) {
    try {
      await apiRequest("/api/auth?action=signout", { method: "POST", body: "{}" });
    } finally {
      sources = [];
      historyItems = [];
      monitoringHistory = [];
      monitoringAlerts = [];
      monitoringPreferences = { emailAlertsEnabled: false, emailAlertsAvailable: false };
      activities = [];
      currentChange = null;
      currentResult = emptyResult();
      hasRunScan = false;
      cloudState.user = null;
      cloudState.demo = false;
      renderAll();
      showAuthGate();
    }
    return;
  }
  if (cloudState.configured) showAuthGate();
});

setSourceKind("webpage");
renderAll();
const initialView = location.hash.slice(1);
showView(["overview", "sources", "change", "review", "history"].includes(initialView) ? initialView : "overview");
setInterval(() => refreshMonitoringFeed().catch(() => null), 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshMonitoringFeed().catch(() => null);
});
refreshAuthState().catch((error) => {
  cloudState = { configured: false, user: null, demo: true, ready: true };
  $("#capability-note").innerHTML = `<strong>Browser demo mode:</strong> ${escapeHtml(error.message)}`;
  renderAll();
});
