import { readFile } from "node:fs/promises";

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "";
if (!databaseUrl) {
  console.log("Cloud database not connected; migration skipped.");
  process.exit(0);
}

const migrations = [
  ["202608300001_saved_workspaces", "../supabase/migrations/202608300001_saved_workspaces.sql"],
  ["202608310001_scheduled_monitoring", "../supabase/migrations/202608310001_scheduled_monitoring.sql"],
  ["202609010001_ai_readiness", "../supabase/migrations/202609010001_ai_readiness.sql"],
  ["202609020001_monitoring_alerts", "../supabase/migrations/202609020001_monitoring_alerts.sql"],
];
const { default: postgres } = await import("postgres");
const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false, connect_timeout: 10, idle_timeout: 2 });

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(`
      create table if not exists public._mcr_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    for (const [migrationId, path] of migrations) {
      const applied = await transaction`select 1 from public._mcr_migrations where id = ${migrationId}`;
      if (applied.length) continue;
      const migration = await readFile(new URL(path, import.meta.url), "utf8");
      await transaction.unsafe(migration);
      await transaction`insert into public._mcr_migrations (id) values (${migrationId})`;
      console.log(`Applied database migration ${migrationId}.`);
    }
  });
} finally {
  await sql.end({ timeout: 2 });
}
