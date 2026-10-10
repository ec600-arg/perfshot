-- PerfShot subscriber table
create table if not exists public.subscribers (
  email                text primary key,
  status               text not null default 'active',  -- active | cancelled | expired
  ls_subscription_id   text,
  ls_customer_id       text,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Block all direct access from the client — only edge functions (service role) can read/write
alter table public.subscribers enable row level security;
-- No RLS policies = no client access at all (edge functions use service role, bypass RLS)
