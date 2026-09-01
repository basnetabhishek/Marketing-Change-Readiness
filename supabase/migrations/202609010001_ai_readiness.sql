create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'complete', 'error')),
  model text not null,
  embedding_model text not null,
  prompt_hash text not null,
  result jsonb not null default '{}'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, scan_id)
);

create table if not exists public.source_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  content_hash text not null,
  embedding jsonb not null,
  token_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, model, content_hash)
);

create index if not exists ai_generations_user_created_idx on public.ai_generations(user_id, created_at desc);
create index if not exists source_embeddings_user_source_idx on public.source_embeddings(user_id, source_id);

alter table public.ai_generations enable row level security;
alter table public.source_embeddings enable row level security;

revoke all on public.ai_generations, public.source_embeddings from anon, authenticated;
grant select, insert, update on public.ai_generations to authenticated;
grant select, insert on public.source_embeddings to authenticated;

drop policy if exists "ai_generations_select_own" on public.ai_generations;
drop policy if exists "ai_generations_insert_own" on public.ai_generations;
drop policy if exists "ai_generations_update_own" on public.ai_generations;
drop policy if exists "source_embeddings_select_own" on public.source_embeddings;
drop policy if exists "source_embeddings_insert_own" on public.source_embeddings;

create policy "ai_generations_select_own" on public.ai_generations for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "ai_generations_insert_own" on public.ai_generations for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "ai_generations_update_own" on public.ai_generations for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "source_embeddings_select_own" on public.source_embeddings for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "source_embeddings_insert_own" on public.source_embeddings for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.sources
      where sources.id = source_id and sources.user_id = (select auth.uid())
    )
  );

