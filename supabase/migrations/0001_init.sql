-- Aangan Studio call agent — schema.
-- Run once in Supabase → SQL Editor. RLS stays ON: only the server, holding the
-- service-role key, ever reads or writes. The browser never touches these tables.

create table if not exists public.designers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  specialties text[] default '{}',          -- {home}, {office}, or both
  active      boolean default true,
  created_at  timestamptz default now()
);

create table if not exists public.calls (
  id             uuid primary key default gen_random_uuid(),
  vaani_call_id  text unique not null,      -- idempotency key for retried webhooks
  caller_number  text,
  status         text,
  started_at     timestamptz,
  ended_at       timestamptz,
  duration_sec   integer default 0,
  after_hours    boolean,
  recording_url  text,
  summary        text,
  collected      jsonb default '{}'::jsonb, -- lead fields, redaction audit, raw payload shape
  transcript     jsonb default '[]'::jsonb,

  classification text check (classification in ('qualified','not_fit','pricing_ask','complaint','unclear')),
  fit_reason     text,
  asked_pricing  boolean default false,     -- recorded, never a reason to decline
  handoff_note   text,

  designer_id    uuid references public.designers(id),
  booked_slot    timestamptz,
  claimed_by     text,
  claimed_at     timestamptz,
  reschedule_requested_at timestamptz,

  hubspot_deal_id   text,
  email_message_id  text,

  showed_up         boolean,                -- filled in by the studio afterwards
  project_won       boolean,
  project_value_inr numeric,

  cost_voice_inr numeric default 0,
  cost_llm_inr   numeric default 0,
  created_at     timestamptz default now()
);

create index if not exists calls_started_at_idx on public.calls (started_at desc);
create index if not exists calls_classification_idx on public.calls (classification);

alter table public.designers enable row level security;
alter table public.calls     enable row level security;
-- No policies on purpose: with RLS on and no policy, anon and authenticated get
-- nothing. The service-role key bypasses RLS, which is why it stays server-side.

create or replace view public.daily_metrics with (security_invoker = true) as
select
  date_trunc('day', started_at at time zone 'Asia/Kolkata')::date as day,
  count(*)                                                as calls,
  count(*) filter (where after_hours)                     as after_hours_calls,
  count(*) filter (where classification = 'qualified')    as qualified,
  count(*) filter (where booked_slot is not null)         as booked,
  count(*) filter (where showed_up)                       as showed_up,
  count(*) filter (where project_won)                     as won,
  coalesce(sum(project_value_inr) filter (where project_won), 0) as won_value_inr,
  round(sum(cost_voice_inr + cost_llm_inr)::numeric, 2)   as cost_inr
from public.calls
where started_at is not null
group by 1
order by 1 desc;
