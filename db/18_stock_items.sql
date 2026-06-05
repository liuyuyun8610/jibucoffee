-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 庫存表：叫貨品項主檔。叫貨時品項從這裡下拉選取。僅 owner 可讀寫。需先跑過 db/12。

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- 品名
  cost numeric not null default 0,           -- 成本（進貨單價）
  price numeric not null default 0,          -- 售價
  vendor text,                               -- 廠商名稱
  unit text,                                 -- 單位（g/磅/ml/罐…）
  category text,                             -- 分類（選填）
  note text,                                 -- 備註
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 若表已存在，補上新欄位（重跑安全）
alter table public.stock_items add column if not exists cost numeric not null default 0;
alter table public.stock_items add column if not exists price numeric not null default 0;
alter table public.stock_items add column if not exists vendor text;

create index if not exists stock_items_sort_idx on public.stock_items(sort_order, name);

drop trigger if exists stock_items_updated_at on public.stock_items;
create trigger stock_items_updated_at
  before update on public.stock_items
  for each row execute function public.set_updated_at();

alter table public.stock_items enable row level security;

drop policy if exists "stock_items owner only" on public.stock_items;
create policy "stock_items owner only"
  on public.stock_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 把現有叫貨紀錄裡出現過的品項，自動建進庫存表（方便沿用，不重複）
insert into public.stock_items (name, category, unit)
select distinct p.item_name, max(p.category), max(p.unit)
from public.purchases p
where p.item_name is not null
  and not exists (select 1 from public.stock_items s where s.name = p.item_name)
group by p.item_name;
