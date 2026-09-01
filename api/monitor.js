import postgres from "postgres";

import { fetchPublicPage } from "./extract.js";
import { compareSnapshot, cronRequestAuthorized } from "../server/monitoring.js";

const BATCH_SIZE = 5;

export async function monitorDueSources(sql, { fetchPage = fetchPublicPage, now = () => new Date() } = {}) {
  const sources = await sql`
    select id, user_id, url, content_text, content_hash
    from public.sources
    where monitoring_enabled = true
      and source_type = 'webpage'
      and url is not null
    order by last_checked_at asc nulls first, created_at asc
    limit ${BATCH_SIZE}
  `;
  const results = [];

  for (const source of sources) {
    const checkedAt = now().toISOString();
    try {
      const page = await fetchPage(source.url);
      const comparison = compareSnapshot(source.content_text, page.text, source.content_hash || "");
      const status = comparison.changed ? "changed" : "unchanged";
      await sql.begin(async (transaction) => {
        await transaction`
          insert into public.source_snapshots
            (source_id, user_id, fetch_status, changed, content_hash, content_text, final_url, fetched_at)
          values
            (${source.id}, ${source.user_id}, ${status}, ${comparison.changed}, ${comparison.currentHash}, ${page.text}, ${page.finalUrl}, ${checkedAt})
        `;
        await transaction`
          update public.sources
          set content_text = ${page.text},
              url = ${page.finalUrl},
              content_hash = ${comparison.currentHash},
              last_checked_at = ${checkedAt},
              last_changed_at = case when ${comparison.changed} then ${checkedAt}::timestamptz else last_changed_at end,
              monitor_error = null,
              status = ${comparison.changed ? "Changed" : "Ready"}
          where id = ${source.id}
        `;
      });
      results.push({ sourceId: source.id, status });
    } catch (error) {
      const message = String(error?.message || "The page could not be checked.").slice(0, 500);
      await sql.begin(async (transaction) => {
        await transaction`
          insert into public.source_snapshots
            (source_id, user_id, fetch_status, changed, error_message, fetched_at)
          values
            (${source.id}, ${source.user_id}, 'error', false, ${message}, ${checkedAt})
        `;
        await transaction`
          update public.sources
          set last_checked_at = ${checkedAt}, monitor_error = ${message}, status = 'Check failed'
          where id = ${source.id}
        `;
      });
      results.push({ sourceId: source.id, status: "error" });
    }
  }

  return results;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: "Scheduled monitoring is not configured." });
  if (!cronRequestAuthorized(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized." });

  const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "";
  if (!databaseUrl) return res.status(503).json({ error: "The saved workspace database is not connected." });

  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false, connect_timeout: 10, idle_timeout: 2 });
  try {
    const results = await monitorDueSources(sql);
    return res.status(200).json({ ok: true, checked: results.length, results });
  } catch (error) {
    console.error("Scheduled monitoring failed", error);
    return res.status(500).json({ error: "Scheduled monitoring could not complete." });
  } finally {
    await sql.end({ timeout: 2 });
  }
}
