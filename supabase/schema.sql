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
  -- Personalized DM body that was actually sent (Private Reply).
  dm_text             text,
  -- Public reply we left under the comment (if any).
  public_reply_text   text,
  public_reply_id     text,
  -- 'automation' = webhook-triggered; 'manual' = posted from Tracking.
  source              text not null default 'automation',
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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- Facebook Pages support (comment-to-Messenger automation)
-- Additive migration — safe to re-run on an existing database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Connected Facebook Pages (one user can connect multiple Pages)
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_pages (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  page_id            text not null unique,
  page_name          text,
  picture_url        text,
  -- Long-lived Page access token (does not expire under normal conditions).
  page_access_token  text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists facebook_pages_user_id_idx
  on public.facebook_pages (user_id);

-- ---------------------------------------------------------------------------
-- Automations: add multi-platform columns.
-- For Facebook rows, ig_media_id stores the Facebook post id.
-- ---------------------------------------------------------------------------
alter table public.automations
  add column if not exists platform text not null default 'instagram';

alter table public.automations
  add column if not exists fb_page_id uuid references public.facebook_pages (id) on delete cascade;

-- Instagram-only automations required account_id; now exactly one of
-- account_id / fb_page_id must be set.
alter table public.automations
  alter column account_id drop not null;

alter table public.automations
  drop constraint if exists automations_channel_check;
alter table public.automations
  add constraint automations_channel_check
  check (
    ((account_id is not null)::int + (fb_page_id is not null)::int) = 1
  );

-- Only one automation per Facebook post per Page.
create unique index if not exists automations_fb_page_post_unique
  on public.automations (fb_page_id, ig_media_id)
  where fb_page_id is not null;

create index if not exists automations_fb_page_media_idx
  on public.automations (fb_page_id, ig_media_id);

-- ---------------------------------------------------------------------------
-- Logs: attribute Facebook sends to their Page.
-- ---------------------------------------------------------------------------
alter table public.automation_logs
  add column if not exists fb_page_id uuid references public.facebook_pages (id) on delete cascade;

-- Fast lookup for "have we already messaged this commenter for this post?"
-- (one DM per person per automation).
create index if not exists automation_logs_automation_commenter_idx
  on public.automation_logs (automation_id, commenter_id)
  where status = 'sent';

-- ---------------------------------------------------------------------------
-- updated_at trigger + RLS for facebook_pages
-- ---------------------------------------------------------------------------
drop trigger if exists set_facebook_pages_updated_at on public.facebook_pages;
create trigger set_facebook_pages_updated_at
  before update on public.facebook_pages
  for each row execute function public.set_updated_at();

alter table public.facebook_pages enable row level security;

drop policy if exists "own pages" on public.facebook_pages;
create policy "own pages" on public.facebook_pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Activity moderation fields on automation_logs (additive).
-- ---------------------------------------------------------------------------
alter table public.automation_logs
  add column if not exists dm_text text;

alter table public.automation_logs
  add column if not exists public_reply_text text;

alter table public.automation_logs
  add column if not exists public_reply_id text;

alter table public.automation_logs
  add column if not exists source text not null default 'automation';

-- Which of our comments is pinned on this post (app + best-effort Graph pin).
alter table public.automations
  add column if not exists pinned_comment_id text;

-- ============================================================================
-- Cross Post + RBAC (see migrations/20260804_user_profiles_and_cross_post.sql)
-- ============================================================================

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_automation boolean not null default true,
  access_platform_sync_post boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cross_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  caption text not null default '',
  title text,
  tags text[] not null default '{}',
  media_type text not null default 'image',
  status text not null default 'draft',
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cross_post_media (
  id uuid primary key default gen_random_uuid(),
  cross_post_id uuid not null references public.cross_posts (id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime text,
  width integer,
  height integer,
  duration_sec numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cross_post_targets (
  id uuid primary key default gen_random_uuid(),
  cross_post_id uuid not null references public.cross_posts (id) on delete cascade,
  platform text not null,
  account_ref text,
  status text not null default 'queued',
  progress integer not null default 0,
  error text,
  external_post_id text,
  permalink text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.threads_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  threads_user_id text not null unique,
  username text,
  name text,
  access_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linkedin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  linkedin_member_urn text not null unique,
  name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  status text not null default 'unknown',
  label text,
  last_checked_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Preserve automations and history when a channel is disconnected
-- (see migrations/20260823_preserve_automations_on_disconnect.sql)
-- ============================================================================

alter table public.automations     alter column account_id drop not null;
alter table public.automation_logs alter column account_id drop not null;

-- Cascade -> set null on every channel foreign key.
do $$
declare
  target  record;
  fk_name text;
begin
  for target in
    select *
    from (values
      ('automations',     'account_id', 'instagram_accounts'),
      ('automations',     'fb_page_id', 'facebook_pages'),
      ('automation_logs', 'account_id', 'instagram_accounts'),
      ('automation_logs', 'fb_page_id', 'facebook_pages')
    ) as t (child, col, parent)
  loop
    select c.conname
      into fk_name
      from pg_constraint c
     where c.conrelid = format('public.%I', target.child)::regclass
       and c.contype = 'f'
       and c.conkey = array[(
             select a.attnum
               from pg_attribute a
              where a.attrelid = format('public.%I', target.child)::regclass
                and a.attname = target.col
           )];

    if fk_name is not null then
      execute format(
        'alter table public.%I drop constraint %I',
        target.child, fk_name
      );
    end if;

    execute format(
      'alter table public.%I add constraint %I'
      ' foreign key (%I) references public.%I (id) on delete set null',
      target.child,
      format('%s_%s_fkey', target.child, target.col),
      target.col,
      target.parent
    );
  end loop;
end $$;

-- A disconnected automation has no channel at all.
alter table public.automations
  drop constraint if exists automations_channel_check;
alter table public.automations
  add constraint automations_channel_check
  check (((account_id is not null)::int + (fb_page_id is not null)::int) <= 1);

-- Stable external channel id (ig_user_id / page_id) so a reconnect can adopt
-- back the automations its disconnect orphaned.
alter table public.automations
  add column if not exists channel_ref text;

update public.automations a
   set channel_ref = i.ig_user_id
  from public.instagram_accounts i
 where a.account_id = i.id
   and a.channel_ref is null;

update public.automations a
   set channel_ref = p.page_id
  from public.facebook_pages p
 where a.fb_page_id = p.id
   and a.channel_ref is null;

create index if not exists automations_channel_ref_idx
  on public.automations (channel_ref);

-- ============================================================================
-- Queue marker for recovering failed auto-replies.
--
-- A failed row is only delivered once it has been explicitly queued from the
-- Tracking sheet. The row keeps status = 'failed' while queued, so existing
-- counts and indexes stay truthful; only the intent to send lives here.
-- ============================================================================

alter table public.automation_logs
  add column if not exists retry_queued_at timestamptz;

create index if not exists automation_logs_retry_queue_idx
  on public.automation_logs (account_id, retry_queued_at)
  where retry_queued_at is not null;

-- ============================================================================
-- Delivery state for the queued retry worker.
--
-- The worker fires every two minutes and sends at most one message per
-- invocation, so the randomized send gap and a tripped circuit breaker have to
-- survive between invocations. Send counts are derived from automation_logs
-- rather than stored here.
-- ============================================================================

create table if not exists public.retry_drip_state (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  account_id      uuid not null references public.instagram_accounts (id) on delete cascade,
  enabled         boolean not null default false,
  halted_reason   text,
  halted_at       timestamptz,
  consecutive_failures integer not null default 0,
  last_send_at    timestamptz,
  next_send_after timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id)
);

create index if not exists retry_drip_state_user_idx
  on public.retry_drip_state (user_id);

drop trigger if exists set_retry_drip_state_updated_at on public.retry_drip_state;
create trigger set_retry_drip_state_updated_at
  before update on public.retry_drip_state
  for each row execute function public.set_updated_at();

alter table public.retry_drip_state enable row level security;

drop policy if exists "own drip state" on public.retry_drip_state;
create policy "own drip state" on public.retry_drip_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
