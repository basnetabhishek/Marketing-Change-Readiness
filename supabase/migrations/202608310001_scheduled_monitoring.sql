alter table public.sources
  add column if not exists monitoring_enabled boolean not null default false,
  add column if not exists content_hash text,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_changed_at timestamptz,
  add column if not exists monitor_error text;

create table if not exists public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fetch_status text not null check (fetch_status in ('changed', 'unchanged', 'error')),
  changed boolean not null default false,
  content_hash text,
  content_text text,
  final_url text,
  error_message text,
  fetched_at timestamptz not null default now()
);

create index if not exists source_snapshots_user_fetched_idx
  on public.source_snapshots(user_id, fetched_at desc);
create index if not exists source_snapshots_source_fetched_idx
  on public.source_snapshots(source_id, fetched_at desc);
create index if not exists sources_monitoring_due_idx
  on public.sources(monitoring_enabled, last_checked_at)
  where monitoring_enabled = true and source_type = 'webpage';

alter table public.source_snapshots enable row level security;

revoke all on public.source_snapshots from anon, authenticated;
grant select, insert on public.source_snapshots to authenticated;
grant update on public.sources to authenticated;

drop policy if exists "sources_update_own" on public.sources;
drop policy if exists "snapshots_select_own" on public.source_snapshots;
drop policy if exists "snapshots_insert_own" on public.source_snapshots;

create policy "sources_update_own" on public.sources for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "snapshots_select_own" on public.source_snapshots for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "snapshots_insert_own" on public.source_snapshots for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.sources
      where sources.id = source_id and sources.user_id = (select auth.uid())
    )
  );
