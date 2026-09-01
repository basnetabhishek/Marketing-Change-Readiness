import { dataRequest, getSession, json, readJson, sameOriginRequest, storageRequest } from "../server/supabase.js";
import { fetchPublicPage } from "./extract.js";
import { compareSnapshot } from "../server/monitoring.js";
import { changeFromRow, decodeUpload, extractUploadText, snapshotFromRow, sourceFromRow, validateChange, validateMonitoring, validateSource } from "../server/workspace.js";

function databaseError(result) {
  return result.data?.message || result.data?.hint || "The workspace database request failed.";
}

function safeFileName(value) {
  return String(value || "file").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

export default async function handler(req, res) {
  if (["POST", "DELETE"].includes(req.method) && !sameOriginRequest(req)) return json(res, 403, { error: "Cross-site request blocked." });
  const session = await getSession(req, res);
  if (!session) return json(res, 401, { error: "Sign in to use the saved workspace." });

  try {
    if (req.method === "GET") {
      const [sourcesResult, historyResult, snapshotsResult] = await Promise.all([
        dataRequest("sources?select=*&order=created_at.asc", session.token),
        dataRequest("change_events?select=*&order=created_at.desc&limit=100", session.token),
        dataRequest("source_snapshots?select=id,source_id,fetch_status,changed,final_url,error_message,fetched_at&order=fetched_at.desc&limit=100", session.token),
      ]);
      if (!sourcesResult.ok) return json(res, sourcesResult.status, { error: databaseError(sourcesResult) });
      if (!historyResult.ok) return json(res, historyResult.status, { error: databaseError(historyResult) });
      if (!snapshotsResult.ok) return json(res, snapshotsResult.status, { error: databaseError(snapshotsResult) });
      return json(res, 200, {
        sources: sourcesResult.data.map(sourceFromRow),
        history: historyResult.data.map(changeFromRow),
        monitoringHistory: snapshotsResult.data.map(snapshotFromRow),
      });
    }

    if (req.method === "DELETE") {
      const id = new URL(req.url, "https://local.invalid").searchParams.get("sourceId");
      if (!/^[0-9a-f-]{36}$/i.test(id || "")) return json(res, 400, { error: "Invalid source identifier." });
      const existing = await dataRequest(`sources?id=eq.${encodeURIComponent(id)}&select=file_path`, session.token);
      if (!existing.ok) return json(res, existing.status, { error: databaseError(existing) });
      const deleted = await dataRequest(`sources?id=eq.${encodeURIComponent(id)}`, session.token, { method: "DELETE" });
      if (!deleted.ok) return json(res, deleted.status, { error: databaseError(deleted) });
      const path = existing.data?.[0]?.file_path;
      if (path) await storageRequest(path, session.token, { method: "DELETE" });
      return json(res, 200, { ok: true });
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
    const body = await readJson(req);

    if (body.action === "setMonitoring") {
      const setting = validateMonitoring(body);
      const existing = await dataRequest(`sources?id=eq.${encodeURIComponent(setting.id)}&select=*`, session.token);
      if (!existing.ok) return json(res, existing.status, { error: databaseError(existing) });
      const source = existing.data?.[0];
      if (!source) return json(res, 404, { error: "Evidence source not found." });
      if (setting.enabled && (source.source_type !== "webpage" || !source.url)) {
        return json(res, 400, { error: "Automatic monitoring is available for public webpage sources." });
      }
      const result = await dataRequest(`sources?id=eq.${encodeURIComponent(setting.id)}`, session.token, {
        method: "PATCH", body: { monitoring_enabled: setting.enabled }, prefer: "return=representation",
      });
      if (!result.ok) return json(res, result.status, { error: databaseError(result) });
      return json(res, 200, { source: sourceFromRow(result.data[0]) });
    }

    if (body.action === "checkSource") {
      const setting = validateMonitoring(body);
      const existing = await dataRequest(`sources?id=eq.${encodeURIComponent(setting.id)}&select=*`, session.token);
      if (!existing.ok) return json(res, existing.status, { error: databaseError(existing) });
      const source = existing.data?.[0];
      if (!source || source.source_type !== "webpage" || !source.url) {
        return json(res, 404, { error: "A monitored webpage source was not found." });
      }
      const fetchedAt = new Date().toISOString();
      try {
        const page = await fetchPublicPage(source.url);
        const comparison = compareSnapshot(source.content_text, page.text, source.content_hash || "");
        const fetchStatus = comparison.changed ? "changed" : "unchanged";
        const snapshotResult = await dataRequest("source_snapshots", session.token, {
          method: "POST",
          body: {
            source_id: source.id, user_id: session.user.id, fetch_status: fetchStatus,
            changed: comparison.changed, content_hash: comparison.currentHash,
            content_text: page.text, final_url: page.finalUrl, fetched_at: fetchedAt,
          },
          prefer: "return=representation",
        });
        if (!snapshotResult.ok) return json(res, snapshotResult.status, { error: databaseError(snapshotResult) });
        const patch = {
          content_text: page.text, url: page.finalUrl, content_hash: comparison.currentHash,
          last_checked_at: fetchedAt, monitor_error: null, status: comparison.changed ? "Changed" : "Ready",
          ...(comparison.changed ? { last_changed_at: fetchedAt } : {}),
        };
        const sourceResult = await dataRequest(`sources?id=eq.${encodeURIComponent(source.id)}`, session.token, {
          method: "PATCH", body: patch, prefer: "return=representation",
        });
        if (!sourceResult.ok) return json(res, sourceResult.status, { error: databaseError(sourceResult) });
        return json(res, 200, { source: sourceFromRow(sourceResult.data[0]), snapshot: snapshotFromRow(snapshotResult.data[0]) });
      } catch (error) {
        const message = String(error.message || "The webpage could not be checked.").slice(0, 500);
        await dataRequest("source_snapshots", session.token, {
          method: "POST",
          body: { source_id: source.id, user_id: session.user.id, fetch_status: "error", changed: false, error_message: message, fetched_at: fetchedAt },
        });
        await dataRequest(`sources?id=eq.${encodeURIComponent(source.id)}`, session.token, {
          method: "PATCH", body: { last_checked_at: fetchedAt, monitor_error: message, status: "Check failed" },
        });
        return json(res, 422, { error: message });
      }
    }

    if (body.action === "saveChange") {
      const row = validateChange(body, session.user.id);
      const result = await dataRequest("change_events", session.token, { method: "POST", body: row, prefer: "return=representation" });
      if (!result.ok) return json(res, result.status, { error: databaseError(result) });
      return json(res, 201, { item: changeFromRow(result.data[0]) });
    }

    if (body.action === "uploadSource") {
      const upload = decodeUpload(body.file);
      const extracted = await extractUploadText(upload.bytes, upload.fileName);
      const source = { ...body.source, text: extracted, fileName: upload.fileName, mimeType: upload.mimeType };
      const path = `${session.user.id}/${source.id}/${safeFileName(upload.fileName)}`;
      const uploaded = await storageRequest(path, session.token, { bytes: upload.bytes, contentType: upload.mimeType });
      if (!uploaded.ok) return json(res, uploaded.status, { error: uploaded.data?.message || "The evidence file could not be stored." });
      const row = validateSource({ ...source, filePath: path }, session.user.id);
      const result = await dataRequest("sources", session.token, { method: "POST", body: row, prefer: "return=representation" });
      if (!result.ok) {
        await storageRequest(path, session.token, { method: "DELETE" });
        return json(res, result.status, { error: databaseError(result) });
      }
      return json(res, 201, { source: sourceFromRow(result.data[0]) });
    }

    if (body.action === "saveSource") {
      const row = validateSource(body.source, session.user.id);
      const result = await dataRequest("sources", session.token, { method: "POST", body: row, prefer: "return=representation" });
      if (!result.ok) return json(res, result.status, { error: databaseError(result) });
      return json(res, 201, { source: sourceFromRow(result.data[0]) });
    }

    return json(res, 400, { error: "Unknown workspace action." });
  } catch (error) {
    return json(res, 400, { error: error.message || "Workspace request failed." });
  }
}
