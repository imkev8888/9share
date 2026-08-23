-- ============================================================================
-- Queue marker for recovering failed auto-replies.
--
-- Sending is no longer something the system decides on its own. A row is only
-- delivered once it has been explicitly queued from the Tracking sheet, and
-- this column is that intent.
--
-- The row keeps status = 'failed' while queued, so every existing count,
-- index and view stays truthful; only the intent to send is recorded here.
-- ============================================================================

alter table public.automation_logs
  add column if not exists retry_queued_at timestamptz;

-- Drives the delivery worker's "is there anything to send?" lookup.
create index if not exists automation_logs_retry_queue_idx
  on public.automation_logs (account_id, retry_queued_at)
  where retry_queued_at is not null;
