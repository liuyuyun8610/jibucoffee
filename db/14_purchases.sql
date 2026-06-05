-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 「庫存叫貨」：每次叫貨的品項數量與採購成本紀錄，供日後叫貨參考。
-- 僅 owner 可讀寫。需先跑過 db/12（is_owner()）。

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,                  -- 叫貨日期
  item_name text not null,                   -- 品項
  category text,                             -- 分類（牛奶/咖啡豆/包材…）
  quantity numeric not null default 0,       -- 數量
  unit text,                                 -- 單位（瓶/箱/包/份）
  unit_cost numeric not null default 0,      -- 單價
  total_cost numeric not null default 0,     -- 小計 = 數量 × 單價
  supplier text,                             -- 廠商
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchases_date_idx on public.purchases(order_date desc);
create index if not exists purchases_item_idx on public.purchases(item_name);

drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

drop policy if exists "purchases owner only" on public.purchases;
create policy "purchases owner only"
  on public.purchases for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
