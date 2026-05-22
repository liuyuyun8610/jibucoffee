-- 在 Supabase SQL Editor 執行
-- 休假日表（每筆一天，連續日期靠多筆組成）

create table if not exists public.closed_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists closed_dates_date_idx on public.closed_dates(date);

alter table public.closed_dates enable row level security;

drop policy if exists "Anyone can view closed dates" on public.closed_dates;
create policy "Anyone can view closed dates"
  on public.closed_dates for select
  using (true);

drop policy if exists "Authenticated users can manage closed dates" on public.closed_dates;
create policy "Authenticated users can manage closed dates"
  on public.closed_dates for all
  to authenticated
  using (true) with check (true);
