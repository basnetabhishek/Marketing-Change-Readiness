create extension if not exists pgcrypto;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 1 and 120),
  product text not null check (char_length(product) between 1 and 120),
  title text not null check (char_length(title) between 1 and 220),
  source_type text not null check (source_type in ('webpage', 'file', 'email', 'paste')),
  mode text not null,
  url text,
  content_text text not null check (char_length(content_text) between 10 and 200000),
  file_name text,
  mime_type text,
  file_path text,
  status text not null default 'Ready',
  created_at timestamptz not null default now()
);

create table if not exists public.change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  product text not null,
  kind text not null check (kind in ('intro_apr', 'price', 'promotion', 'trial')),
  old_value text not null,
  new_value text not null,
  status text not null check (status in ('scenario', 'approved')),
  result jsonb not null default '{}'::jsonb,
  corpus_size integer not null default 0 check (corpus_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists sources_user_created_idx on public.sources(user_id, created_at);
create index if not exists change_events_user_created_idx on public.change_events(user_id, created_at desc);

alter table public.sources enable row level security;
alter table public.change_events enable row level security;

revoke all on public.sources, public.change_events from anon, authenticated;
grant select, insert, delete on public.sources to authenticated;
grant select, insert, delete on public.change_events to authenticated;

drop policy if exists "sources_select_own" on public.sources;
drop policy if exists "sources_insert_own" on public.sources;
drop policy if exists "sources_delete_own" on public.sources;
drop policy if exists "changes_select_own" on public.change_events;
drop policy if exists "changes_insert_own" on public.change_events;
drop policy if exists "changes_delete_own" on public.change_events;

create policy "sources_select_own" on public.sources for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "sources_insert_own" on public.sources for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "sources_delete_own" on public.sources for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "changes_select_own" on public.change_events for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "changes_insert_own" on public.change_events for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "changes_delete_own" on public.change_events for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  2000000,
  array[
    'text/plain', 'text/markdown', 'text/html', 'text/csv', 'application/json',
    'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidence_insert_own" on storage.objects;
drop policy if exists "evidence_select_own" on storage.objects;
drop policy if exists "evidence_delete_own" on storage.objects;

create policy "evidence_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "evidence_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "evidence_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
