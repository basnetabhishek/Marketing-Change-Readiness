const SOURCE_TYPES = new Set(["webpage", "file", "email", "paste"]);
const CHANGE_KINDS = new Set(["intro_apr", "price", "promotion", "trial"]);
const CHANGE_STATUSES = new Set(["scenario", "approved"]);
const MAX_TEXT = 200_000;
const MAX_FILE_BYTES = 2_000_000;

function text(value, max = MAX_TEXT) {
  return String(value || "").trim().slice(0, max);
}

function safeWebUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function validateSource(input = {}, userId) {
  const sourceType = SOURCE_TYPES.has(input.sourceType) ? input.sourceType : "paste";
  const source = {
    id: input.id,
    user_id: userId,
    company: text(input.product, 120),
    product: text(input.plan, 120),
    title: text(input.title, 220),
    source_type: sourceType,
    mode: text(input.mode, 80),
    url: safeWebUrl(input.url) || null,
    content_text: text(input.text),
    file_name: text(input.fileName, 240) || null,
    mime_type: text(input.mimeType, 120) || null,
    file_path: text(input.filePath, 500) || null,
    status: "Ready",
  };
  if (!/^[0-9a-f-]{36}$/i.test(source.id || "")) throw new Error("Evidence needs a valid identifier.");
  if (!source.company || !source.product || !source.title) throw new Error("Company, product, and source title are required.");
  if (source.content_text.length < 10) throw new Error("Evidence needs at least 10 readable characters.");
  return source;
}

export function validateChange(input = {}, userId) {
  const change = input.change || {};
  const row = {
    id: input.id,
    user_id: userId,
    company: text(change.company, 120),
    product: text(change.product, 120),
    kind: CHANGE_KINDS.has(change.kind) ? change.kind : "promotion",
    old_value: text(change.oldValue, 120),
    new_value: text(change.newValue, 120),
    status: CHANGE_STATUSES.has(change.status) ? change.status : "scenario",
    result: input.result && typeof input.result === "object" ? input.result : {},
    corpus_size: Math.max(0, Math.min(100_000, Number(input.corpusSize) || 0)),
  };
  if (!/^[0-9a-f-]{36}$/i.test(row.id || "")) throw new Error("Scan needs a valid identifier.");
  if (!row.company || !row.product || !row.old_value || !row.new_value) throw new Error("The saved scan is missing its change details.");
  return row;
}

export function validateMonitoring(input = {}) {
  const id = text(input.sourceId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid source identifier.");
  return { id, enabled: input.enabled === true };
}

export function decodeUpload(input = {}) {
  const fileName = text(input.fileName, 240);
  const inferredTypes = {
    txt: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html", csv: "text/csv",
    json: "application/json", pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const extension = fileName.split(".").pop()?.toLowerCase();
  const mimeType = text(input.mimeType, 120) || inferredTypes[extension] || "application/octet-stream";
  if (!/\.(txt|md|html?|csv|json|pdf|docx)$/i.test(fileName)) throw new Error("Use a TXT, MD, HTML, CSV, JSON, PDF, or DOCX file.");
  const bytes = Buffer.from(String(input.base64 || ""), "base64");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error("Choose a non-empty file no larger than 2 MB.");
  if (extension === "pdf" && bytes.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("The selected file is not a readable PDF.");
  if (extension === "docx") {
    if (bytes.subarray(0, 2).toString("ascii") !== "PK") throw new Error("The selected file is not a readable DOCX document.");
    validateDocxArchive(bytes);
  }
  return { bytes, fileName, mimeType };
}

function validateDocxArchive(bytes) {
  let offset = 0;
  let entries = 0;
  let expandedBytes = 0;
  let hasDocument = false;
  while (offset + 46 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error("The selected DOCX archive is malformed.");
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries += 1;
    expandedBytes += uncompressedSize;
    if (name === "word/document.xml") hasDocument = true;
    if (entries > 2_000 || uncompressedSize > 8_000_000 || expandedBytes > 20_000_000) {
      throw new Error("The DOCX document expands beyond the safe processing limit.");
    }
    offset = end;
  }
  if (!entries || !hasDocument) throw new Error("The selected file is not a readable DOCX document.");
}

export async function extractUploadText(bytes, fileName) {
  if (/\.pdf$/i.test(fileName)) {
    const module = await import("pdf-parse");
    const parser = new module.PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      return text(parsed.text);
    } finally {
      await parser.destroy();
    }
  }
  if (/\.docx$/i.test(fileName)) {
    const module = await import("mammoth");
    const mammoth = module.default || module;
    const parsed = await mammoth.extractRawText({ buffer: bytes });
    return text(parsed.value);
  }
  const raw = bytes.toString("utf8").replace(/\0/g, "");
  if (/\.html?$/i.test(fileName)) {
    return text(raw
      .replace(/<(script|style|noscript|template|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " "));
  }
  return text(raw);
}

export function sourceFromRow(row) {
  return {
    id: row.id,
    product: row.company,
    plan: row.product,
    title: row.title,
    sourceType: row.source_type,
    mode: row.mode,
    url: row.url || "",
    text: row.content_text,
    fileName: row.file_name || undefined,
    mimeType: row.mime_type || undefined,
    filePath: row.file_path || undefined,
    lastChecked: row.last_checked_at ? new Date(row.last_checked_at).toLocaleString() : row.created_at ? new Date(row.created_at).toLocaleString() : "Saved",
    status: row.status || "Ready",
    monitoringEnabled: Boolean(row.monitoring_enabled),
    contentHash: row.content_hash || undefined,
    lastCheckedAt: row.last_checked_at || undefined,
    lastChangedAt: row.last_changed_at || undefined,
    monitorError: row.monitor_error || undefined,
    createdAt: row.created_at,
  };
}

export function snapshotFromRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.fetch_status,
    changed: Boolean(row.changed),
    finalUrl: row.final_url || "",
    error: row.error_message || "",
    fetchedAt: row.fetched_at,
  };
}

export function changeFromRow(row) {
  return {
    id: row.id,
    change: {
      company: row.company,
      product: row.product,
      kind: row.kind,
      oldValue: row.old_value,
      newValue: row.new_value,
      status: row.status,
    },
    result: row.result || {},
    corpusSize: row.corpus_size,
    createdAt: row.created_at,
  };
}
