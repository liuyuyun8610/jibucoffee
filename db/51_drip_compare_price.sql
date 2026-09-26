-- 掛耳包網站：原價（有填且高於售價時，前台顯示劃線原價與「優惠」標）
alter table public.drip_products
  add column if not exists compare_at_price int check (compare_at_price is null or compare_at_price >= 0);
select count(*) as compare_col_ok from information_schema.columns
 where table_name = 'drip_products' and column_name = 'compare_at_price';
