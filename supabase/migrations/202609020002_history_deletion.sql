grant delete on public.ai_generations to authenticated;

drop policy if exists "ai_generations_delete_own" on public.ai_generations;
create policy "ai_generations_delete_own" on public.ai_generations for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
