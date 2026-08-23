-- Preserve automations and history when a channel is disconnected.
-- Applied remotely; kept for repo parity.
--
-- Disconnecting a channel deletes its instagram_accounts / facebook_pages row.
-- The child foreign keys cascaded, so every automation, tracking row and
-- activity log for that channel was deleted with it and could not be recovered
-- by reconnecting.

-- ---------------------------------------------------------------------------
-- 1. Cascade -> set null, so deleting a channel can never destroy an
--    automation or its history. Drops by discovered name because the
--    constraints were created inline and may not use the default naming.
-- ---------------------------------------------------------------------------
alter table public.automations     alter column account_id drop not null;
alter table public.automation_logs alter column account_id drop not null;

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

-- ---------------------------------------------------------------------------
-- 2. A disconnected automation has no channel at all. The old check demanded
--    exactly one, which would make the "set null" above fail. Still forbid
--    an automation belonging to both an Instagram account and a Page.
-- ---------------------------------------------------------------------------
alter table public.automations
  drop constraint if exists automations_channel_check;
alter table public.automations
  add constraint automations_channel_check
  check (((account_id is not null)::int + (fb_page_id is not null)::int) <= 1);

-- ---------------------------------------------------------------------------
-- 3. Remember the external channel each automation belongs to. Our surrogate
--    id changes when a channel row is deleted and recreated, but the
--    Instagram ig_user_id and Facebook page_id are stable, so a reconnect can
--    find the automations it orphaned and adopt them back.
-- ---------------------------------------------------------------------------
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
