import { dataRequest, getSession, json, readJson, sameOriginRequest, storageRequest } from "../server/supabase.js";
import { changeFromRow, decodeUpload, extractUploadText, sourceFromRow, validateChange, validateSource } from "../server/workspace.js";

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
      const [sourcesResult, historyResult] = await Promise.all([
        dataRequest("sources?select=*&order=created_at.asc", session.token),
        dataRequest("change_events?select=*&order=created_at.desc&limit=100", session.token),
      ]);
      if (!sourcesResult.ok) return json(res, sourcesResult.status, { error: databaseError(sourcesResult) });
      if (!historyResult.ok) return json(res, historyResult.status, { error: databaseError(historyResult) });
      return json(res, 200, {
        sources: sourcesResult.data.map(sourceFromRow),
        history: historyResult.data.map(changeFromRow),
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
