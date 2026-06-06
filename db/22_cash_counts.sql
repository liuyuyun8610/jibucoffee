-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 每日結帳（日結）：店員下班點鈔，錢盤 + 金庫各面額張數，加總 = 當日店內現金。
-- 在職員工皆可填寫/查看（店內現金為共用資訊）。需先跑過 db/12。

create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null unique,           -- 一天一筆
  tray jsonb not null default '{}'::jsonb,    -- 錢盤各面額張數 {"1000":n,...}
  safe jsonb not null default '{}'::jsonb,    -- 金庫各面額張數
  tray_total numeric not null default 0,
  safe_total numeric not null default 0,
  total numeric not null default 0,           -- = tray_total + safe_total（當日店內現金）
  note text,
  counted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_counts_date_idx on public.cash_counts(count_date desc);

drop trigger if exists cash_counts_updated_at on public.cash_counts;
create trigger cash_counts_updated_at before update on public.cash_counts for each row execute function public.set_updated_at();

alter table public.cash_counts enable row level security;

-- 在職員工可讀
drop policy if exists "cash_counts read staff" on public.cash_counts;
create policy "cash_counts read staff" on public.cash_counts for select to authenticated
  using (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active));

-- 在職員工可新增/更新（店員下班填）
drop policy if exists "cash_counts write staff" on public.cash_counts;
create policy "cash_counts write staff" on public.cash_counts for insert to authenticated
  with check (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active));
drop policy if exists "cash_counts update staff" on public.cash_counts;
create policy "cash_counts update staff" on public.cash_counts for update to authenticated
  using (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active))
  with check (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active));

-- 只有 owner 能刪
drop policy if exists "cash_counts owner delete" on public.cash_counts;
create policy "cash_counts owner delete" on public.cash_counts for delete to authenticated using (public.is_owner());
