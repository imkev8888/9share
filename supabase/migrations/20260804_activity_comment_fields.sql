-- Activity comment moderation: store DM body, public reply, and source.
-- Safe to re-run.

alter table public.automation_logs
  add column if not exists dm_text text;

alter table public.automation_logs
  add column if not exists public_reply_text text;

alter table public.automation_logs
  add column if not exists public_reply_id text;

alter table public.automation_logs
  add column if not exists source text not null default 'automation';

-- Allow users to insert/update/delete their own logs (manual comments from Activity).
drop policy if exists "own logs" on public.automation_logs;
create policy "own logs" on public.automation_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
