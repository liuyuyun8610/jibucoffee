-- 在 Supabase SQL Editor 執行
-- 老闆私人行事曆：只有 owner 讀得到、寫得了（員工查詢會拿到空集合）

create table if not exists public.owner_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists owner_events_date_idx on public.owner_events(date);

alter table public.owner_events enable row level security;

drop policy if exists "owner_events owner only" on public.owner_events;
create policy "owner_events owner only"
  on public.owner_events for all
  to authenticated
  using (public.is_owner()) with check (public.is_owner());
