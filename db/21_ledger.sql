-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 帳本（簡化版）：帳戶 + 分錄 + 分類。餘額即時算（期初 + 分錄加總）。僅 owner。需先跑過 db/12。

-- 1) 帳戶（帳本）
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- 例：現金、台新銀行
  type text not null default '現金' check (type in ('現金','銀行','其他')),
  initial_balance numeric not null default 0,-- 期初餘額
  note text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 分錄分類
create table if not exists public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.ledger_categories (name, kind, sort_order) values
  ('咖啡銷售','income',1),('餐點銷售','income',2),('其他收入','income',9),
  ('進貨','expense',1),('薪資','expense',2),('房租','expense',3),
  ('水電','expense',4),('維修','expense',5),('雜支','expense',8),('其他支出','expense',9)
on conflict do nothing;

-- 3) 分錄
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  type text not null check (type in ('收入','支出','轉入','轉出')),
  category text,
  amount numeric not null default 0,
  description text,
  entry_date date not null,
  source text not null default 'manual',     -- manual / payroll / purchase / maintenance
  source_id uuid,                            -- 對應來源紀錄 id（薪資/叫貨…），方便連動刪除
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_entries_account_idx on public.ledger_entries(account_id, entry_date desc);
create index if not exists ledger_entries_source_idx on public.ledger_entries(source, source_id);

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts for each row execute function public.set_updated_at();
drop trigger if exists ledger_entries_updated_at on public.ledger_entries;
create trigger ledger_entries_updated_at before update on public.ledger_entries for each row execute function public.set_updated_at();

-- RLS：帳本僅 owner
alter table public.accounts enable row level security;
alter table public.ledger_categories enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists "accounts owner" on public.accounts;
create policy "accounts owner" on public.accounts for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "ledger_cats owner" on public.ledger_categories;
create policy "ledger_cats owner" on public.ledger_categories for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "ledger_entries owner" on public.ledger_entries;
create policy "ledger_entries owner" on public.ledger_entries for all to authenticated using (public.is_owner()) with check (public.is_owner());
