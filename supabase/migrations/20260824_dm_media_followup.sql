-- ============================================================================
-- Pictures and video for the auto-reply.
--
-- Meta drops media attachments from a private reply silently, so a campaign's
-- image cannot ride along with the auto-DM. What is allowed is a button in
-- that first DM: the person taps it, a normal 24-hour messaging window opens,
-- and the media follows.
--
-- Hence three pieces of state: what to send (dm_attachments), what the button
-- says (dm_button_label), and who to send it to once they tap (recipient_id on
-- the log row, which is the Instagram-scoped id Meta hands back from the
-- private reply).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Campaign: the media and the button that unlocks it.
-- ---------------------------------------------------------------------------
alter table public.automations
  add column if not exists dm_attachments jsonb not null default '[]'::jsonb;

-- Free text, whatever the user wants the button to say. Meta truncates past 20
-- characters, so the app refuses longer labels rather than ship a clipped one.
alter table public.automations
  add column if not exists dm_button_label text;

-- ---------------------------------------------------------------------------
-- 2. Log: who we can message, and whether the media already went out.
-- ---------------------------------------------------------------------------
alter table public.automation_logs
  add column if not exists recipient_id text;

alter table public.automation_logs
  add column if not exists followup_sent_at timestamptz;

alter table public.automation_logs
  add column if not exists followup_error text;

-- Drives "does this person have media waiting?" when a DM or a tap arrives.
create index if not exists automation_logs_recipient_idx
  on public.automation_logs (account_id, recipient_id, created_at desc)
  where recipient_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Storage. Public, because Meta fetches the URL itself when it delivers
--    the attachment — a signed URL would expire and cannot be handed over.
--    Policies mirror the cross_post_media ones: anyone may read, but a user
--    may only write and delete under their own id prefix.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('automation_media', 'automation_media', true)
on conflict (id) do nothing;

drop policy if exists automation_media_storage_select on storage.objects;
create policy automation_media_storage_select on storage.objects
  for select using (bucket_id = 'automation_media');

drop policy if exists automation_media_storage_insert on storage.objects;
create policy automation_media_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'automation_media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists automation_media_storage_delete on storage.objects;
create policy automation_media_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'automation_media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
