-- ============================================================================
-- Per-campaign paging for the Tracking sheet.
--
-- The sheet used to read one flat page of the newest logs for the whole user
-- and slice it by campaign, so a post with hundreds of comments consumed the
-- whole budget and every quieter campaign rendered empty. PostgREST cannot
-- express "newest N per group", hence these two functions.
--
-- Both are SECURITY INVOKER, so the "own logs" RLS policy still decides what
-- comes back; the explicit user_id predicate is belt-and-braces and lets the
-- planner use automation_logs_user_idx.
--
-- Manual rows (the announcements posted from the sheet) are excluded. They are
-- fetched separately and unpaginated, because they drive the Comment box and
-- must not fall off the end of a page.
-- ============================================================================

create or replace function public.recent_automation_logs(p_per integer default 20)
returns table (
  id                 uuid,
  automation_id      uuid,
  comment_id         text,
  commenter_username text,
  comment_text       text,
  status             text,
  error              text,
  source             text,
  created_at         timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    r.id, r.automation_id, r.comment_id, r.commenter_username,
    r.comment_text, r.status, r.error, r.source, r.created_at
  from (
    select
      al.id, al.automation_id, al.comment_id, al.commenter_username,
      al.comment_text, al.status, al.error, al.source, al.created_at,
      -- automation_id is null for logs whose campaign was deleted; nulls share
      -- one partition, which is exactly the "Deleted automations" group.
      row_number() over (
        partition by al.automation_id
        order by al.created_at desc, al.id desc
      ) as rn
    from public.automation_logs al
    where al.user_id = auth.uid()
      and al.source is distinct from 'manual'
  ) r
  where r.rn <= greatest(p_per, 1);
$$;

-- Exact per-campaign totals. The chips used to be counted from whatever rows
-- happened to be fetched, which understated every busy campaign.
create or replace function public.automation_log_counts()
returns table (
  automation_id uuid,
  status        text,
  total         bigint
)
language sql
stable
set search_path = public
as $$
  select al.automation_id, al.status, count(*)::bigint
  from public.automation_logs al
  where al.user_id = auth.uid()
    and al.source is distinct from 'manual'
  group by al.automation_id, al.status;
$$;

grant execute on function public.recent_automation_logs(integer) to authenticated;
grant execute on function public.automation_log_counts() to authenticated;
