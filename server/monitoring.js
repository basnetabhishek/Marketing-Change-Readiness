import { createHash } from "node:crypto";
import { scanAssets } from "../web/engine.js";

export function normalizeSnapshotText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function snapshotHash(value) {
  return createHash("sha256").update(normalizeSnapshotText(value)).digest("hex");
}

export function compareSnapshot(previousText, nextText, previousHash = "") {
  const currentHash = snapshotHash(nextText);
  const baselineHash = previousHash || snapshotHash(previousText);
  return {
    changed: Boolean(baselineHash && baselineHash !== currentHash),
    previousHash: baselineHash,
    currentHash,
  };
}

export function cronRequestAuthorized(authorization, secret = process.env.CRON_SECRET) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export function buildMonitoringAlert({ source, change = null, snapshotId, createdAt = new Date().toISOString(), emailEnabled = false }) {
  const asset = {
    id: source.id,
    product: source.company,
    plan: source.product,
    title: source.title,
    text: source.content_text,
    url: source.url || "",
    mode: source.mode || "Webpage",
  };
  let scanResult = { candidates: [], candidateCount: 0, reviewReduction: 1 };
  let scanError = "";
  if (change) {
    try {
      scanResult = scanAssets({
        assets: [asset],
        product: change.company,
        plan: change.product,
        kind: change.kind,
        oldValue: change.old_value,
      });
    } catch (error) {
      scanError = String(error?.message || "Automatic comparison was unavailable.").slice(0, 300);
    }
  }
  const match = scanResult.candidates[0] || null;
  const changeLabel = change ? `${change.old_value} → ${change.new_value}` : "No saved change event";
  const severity = match ? "critical" : change ? "warning" : "info";
  const title = match ? "Changed page still contains the old claim" : change ? "Page changed; old claim was not found" : "Monitored page changed";
  const detail = match
    ? `${source.title} changed and still contains ${match.evidence}. Review it against ${changeLabel}.`
    : change
      ? `${source.title} changed. The deterministic rescan did not find ${change.old_value}; review the new wording for semantic or visual changes.`
      : `${source.title} changed, but no saved change event exists for ${source.company} · ${source.product}.`;
  return {
    user_id: source.user_id,
    source_id: source.id,
    snapshot_id: snapshotId,
    change_event_id: change?.id || null,
    status: "open",
    severity,
    title,
    detail,
    evidence: match?.evidence || null,
    result: {
      scanMode: "automatic_deterministic",
      scanError: scanError || undefined,
      candidateCount: scanResult.candidateCount,
      reviewReduction: scanResult.reviewReduction,
      candidates: scanResult.candidates,
      change: change ? {
        company: change.company,
        product: change.product,
        kind: change.kind,
        oldValue: change.old_value,
        newValue: change.new_value,
        status: change.status,
      } : null,
    },
    email_status: emailEnabled && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM ? "pending" : "not_configured",
    created_at: createdAt,
  };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export async function sendMonitoringAlertEmail({ to, alert, appUrl = process.env.PUBLIC_APP_URL || "https://marketing-change-readiness.vercel.app" }) {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_FROM || !to) return { status: "not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `monitoring-alert-${alert.snapshot_id}`,
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM,
      to: [to],
      subject: `[Marketing readiness] ${alert.title}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><h1 style="font-size:24px">${escapeHtml(alert.title)}</h1><p>${escapeHtml(alert.detail)}</p>${alert.evidence ? `<p><strong>Verified evidence:</strong> “${escapeHtml(alert.evidence)}”</p>` : ""}<p><a href="${escapeHtml(appUrl)}#overview">Open the readiness workspace</a></p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
  return { status: "sent" };
}
