create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  snapshot_id uuid not null references public.source_snapshots(id) on delete cascade,
  change_event_id uuid references public.change_events(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  severity text not null check (severity in ('critical', 'warning', 'info')),
  title text not null,
  detail text not null,
  evidence text,
  result jsonb not null default '{}'::jsonb,
  email_status text not null default 'not_configured' check (email_status in ('not_configured', 'pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (snapshot_id)
);

create table if not exists public.monitoring_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitoring_alerts_user_status_created_idx
  on public.monitoring_alerts(user_id, status, created_at desc);

alter table public.monitoring_alerts enable row level security;
alter table public.monitoring_preferences enable row level security;

revoke all on public.monitoring_alerts, public.monitoring_preferences from anon, authenticated;
grant select, insert, update on public.monitoring_alerts to authenticated;
grant select, insert, update on public.monitoring_preferences to authenticated;

drop policy if exists "monitoring_alerts_select_own" on public.monitoring_alerts;
drop policy if exists "monitoring_alerts_insert_own" on public.monitoring_alerts;
drop policy if exists "monitoring_alerts_update_own" on public.monitoring_alerts;

create policy "monitoring_alerts_select_own" on public.monitoring_alerts for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "monitoring_alerts_insert_own" on public.monitoring_alerts for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.sources
      where sources.id = source_id and sources.user_id = (select auth.uid())
    )
  );
create policy "monitoring_alerts_update_own" on public.monitoring_alerts for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "monitoring_preferences_select_own" on public.monitoring_preferences;
drop policy if exists "monitoring_preferences_insert_own" on public.monitoring_preferences;
drop policy if exists "monitoring_preferences_update_own" on public.monitoring_preferences;

create policy "monitoring_preferences_select_own" on public.monitoring_preferences for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "monitoring_preferences_insert_own" on public.monitoring_preferences for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "monitoring_preferences_update_own" on public.monitoring_preferences for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
