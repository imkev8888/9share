-- ============================================================================
-- 9share — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Connected Instagram accounts (one user can connect multiple IG accounts)
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_accounts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  ig_user_id           text not null unique,
  username             text,
  name                 text,
  profile_picture_url  text,
  access_token         text not null,
  token_expires_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists instagram_accounts_user_id_idx
  on public.instagram_accounts (user_id);

-- ---------------------------------------------------------------------------
-- Automations — one per post/reel "campaign". Each post can have its own DM.
-- ---------------------------------------------------------------------------
create table if not exists public.automations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  account_id        uuid not null references public.instagram_accounts (id) on delete cascade,
  ig_media_id       text not null,
  media_permalink   text,
  media_thumbnail   text,
  media_caption     text,
  name              text not null default 'Untitled campaign',
  -- Optional trigger keyword. If null/empty -> fires on ANY comment.
  keyword           text,
  -- The DM template sent to the commenter.
  dm_message        text not null,
  -- Optional public reply left under the comment.
  public_reply      text,
  is_active         boolean not null default true,
  sent_count        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Only one automation per media per account.
  unique (account_id, ig_media_id)
);

create index if not exists automations_account_media_idx
  on public.automations (account_id, ig_media_id);

-- ---------------------------------------------------------------------------
-- Logs — every comment we processed and what happened.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_logs (
  id                  uuid primary key default gen_random_uuid(),
  automation_id       uuid references public.automations (id) on delete set null,
  account_id          uuid references public.instagram_accounts (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete cascade,
  comment_id          text,
  commenter_id        text,
  commenter_username  text,
  comment_text        text,
  status              text not null default 'sent', -- sent | failed | skipped
  error               text,
  created_at          timestamptz not null default now()
);

create index if not exists automation_logs_user_idx
  on public.automation_logs (user_id, created_at desc);

-- Prevent double-DMing the same comment (idempotency for webhook retries).
create unique index if not exists automation_logs_comment_unique
  on public.automation_logs (comment_id)
  where comment_id is not null and status = 'sent';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_instagram_accounts_updated_at on public.instagram_accounts;
create trigger set_instagram_accounts_updated_at
  before update on public.instagram_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists set_automations_updated_at on public.automations;
create trigger set_automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — users only ever touch their own rows.
-- The webhook/OAuth callback use the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.instagram_accounts enable row level security;
alter table public.automations        enable row level security;
alter table public.automation_logs    enable row level security;

drop policy if exists "own accounts" on public.instagram_accounts;
create policy "own accounts" on public.instagram_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own automations" on public.automations;
create policy "own automations" on public.automations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own logs" on public.automation_logs;
create policy "own logs" on public.automation_logs
  for select using (auth.uid() = user_id);
