-- 在 Supabase SQL Editor 執行
-- 取消店主推薦機制，把 05 加上去的欄位 + index 拿掉

drop index if exists public.products_featured_idx;

alter table public.products
  drop column if exists is_featured;
