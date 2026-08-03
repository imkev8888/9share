-- Cross Post + RBAC (applied remotely; kept for repo parity)
-- Defaults: access_automation=true, access_platform_sync_post=false

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_automation boolean not null default true,
  access_platform_sync_post boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (user_id, access_automation, access_platform_sync_post)
select id, true, false from auth.users
on conflict (user_id) do nothing;

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

create index if not exists cross_posts_user_idx
  on public.cross_posts (user_id, created_at desc);

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

create index if not exists cross_post_media_post_idx
  on public.cross_post_media (cross_post_id, sort_order);

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

create index if not exists cross_post_targets_post_idx
  on public.cross_post_targets (cross_post_id);

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

create index if not exists threads_accounts_user_idx
  on public.threads_accounts (user_id);

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

create index if not exists linkedin_accounts_user_idx
  on public.linkedin_accounts (user_id);

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  status text not null default 'unknown',
  label text,
  last_checked_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint mcp_connections_platform_check
    check (platform in ('rednote', 'wechat'))
);

insert into public.mcp_connections (platform, status, label)
values
  ('rednote', 'unknown', 'Company RedNote'),
  ('wechat', 'unknown', 'Company WeChat Moments')
on conflict (platform) do nothing;

-- Storage bucket (public read so Graph can fetch media URLs)
insert into storage.buckets (id, name, public)
values ('cross_post_media', 'cross_post_media', true)
on conflict (id) do nothing;

alter table public.user_profiles enable row level security;
alter table public.cross_posts enable row level security;
alter table public.cross_post_media enable row level security;
alter table public.cross_post_targets enable row level security;
alter table public.threads_accounts enable row level security;
alter table public.linkedin_accounts enable row level security;
alter table public.mcp_connections enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles
  for select using (auth.uid() = user_id);

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own on public.user_profiles
  for update using (auth.uid() = user_id);

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own on public.user_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists cross_posts_all_own on public.cross_posts;
create policy cross_posts_all_own on public.cross_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cross_post_media_via_post on public.cross_post_media;
create policy cross_post_media_via_post on public.cross_post_media
  for all using (
    exists (
      select 1 from public.cross_posts p
      where p.id = cross_post_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cross_posts p
      where p.id = cross_post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists cross_post_targets_via_post on public.cross_post_targets;
create policy cross_post_targets_via_post on public.cross_post_targets
  for all using (
    exists (
      select 1 from public.cross_posts p
      where p.id = cross_post_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cross_posts p
      where p.id = cross_post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists threads_accounts_all_own on public.threads_accounts;
create policy threads_accounts_all_own on public.threads_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists linkedin_accounts_all_own on public.linkedin_accounts;
create policy linkedin_accounts_all_own on public.linkedin_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists mcp_connections_select_auth on public.mcp_connections;
create policy mcp_connections_select_auth on public.mcp_connections
  for select to authenticated using (true);

drop policy if exists cross_post_media_storage_select on storage.objects;
create policy cross_post_media_storage_select on storage.objects
  for select using (bucket_id = 'cross_post_media');

drop policy if exists cross_post_media_storage_insert on storage.objects;
create policy cross_post_media_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cross_post_media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cross_post_media_storage_delete on storage.objects;
create policy cross_post_media_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'cross_post_media' and (storage.foldername(name))[1] = auth.uid()::text);
