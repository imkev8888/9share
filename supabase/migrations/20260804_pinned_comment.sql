alter table public.automations
  add column if not exists pinned_comment_id text;
