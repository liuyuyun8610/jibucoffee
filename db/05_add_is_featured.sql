-- 在 Supabase SQL Editor 執行
-- 加「店主推薦」欄位，前台首頁推薦區塊用

alter table public.products
  add column if not exists is_featured boolean not null default false;

create index if not exists products_featured_idx
  on public.products(sort_order)
  where is_featured = true and is_active = true;
