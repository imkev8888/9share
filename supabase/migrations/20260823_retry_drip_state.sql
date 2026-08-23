-- ============================================================================
-- Background drip state for retrying failed auto-replies.
--
-- The drip is driven by a cron that fires every two minutes and sends at most
-- one message per invocation. That means the on/off switch, the tripped
-- circuit breaker and the randomized send gap all have to survive between
-- invocations, which is what this table holds.
--
-- Send *counts* are deliberately not stored here — they are derived from
-- automation_logs so there is a single source of truth and no drift.
-- ============================================================================

create table if not exists public.retry_drip_state (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  account_id      uuid not null references public.instagram_accounts (id) on delete cascade,
  -- Off by default: sending never starts without an explicit opt-in.
  enabled         boolean not null default false,
  -- Set when the circuit breaker trips. A halted drip never self-resumes.
  halted_reason   text,
  halted_at       timestamptz,
  -- Trips the breaker once a run starts failing repeatedly rather than
  -- grinding through the whole backlog against a broken API.
  consecutive_failures integer not null default 0,
  last_send_at    timestamptz,
  -- Persisted so the randomized gap is chosen once per send, not re-rolled on
  -- every invocation (which would bias the effective rate toward the minimum).
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
