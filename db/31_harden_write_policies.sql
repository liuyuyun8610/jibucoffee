-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 資安強化：把「任何登入者都能寫」的內容表，收緊成「只有老闆能寫」。
-- 原因：本站開放客戶註冊登入，客戶也是 authenticated；舊政策 using(true) 等於
--       任何註冊客戶都能竄改商品/菜單/公休日/網站設定(含公告與收入歸戶對照)。
-- 公開讀取（select）維持不變，只收緊寫入。需先跑過 db/12（is_owner）。

-- 1) 商品 products
drop policy if exists "Authenticated users can manage products" on public.products;
create policy "products owner write" on public.products for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 2) 菜單 menu_categories / menu_items
drop policy if exists "menu_categories_auth_write" on public.menu_categories;
create policy "menu_categories owner write" on public.menu_categories for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "menu_items_auth_write" on public.menu_items;
create policy "menu_items owner write" on public.menu_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 3) 公休日 closed_dates
drop policy if exists "Authenticated users can manage closed dates" on public.closed_dates;
drop policy if exists "closed_dates owner write" on public.closed_dates;
create policy "closed_dates owner write" on public.closed_dates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 4) 網站設定 site_settings（含公告、收入歸戶對照）：只有老闆能改/新增
drop policy if exists "Auth update site_settings" on public.site_settings;
create policy "site_settings owner update" on public.site_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Auth insert site_settings" on public.site_settings;
create policy "site_settings owner insert" on public.site_settings for insert to authenticated
  with check (public.is_owner());

-- 5) Storage：product-images bucket 的上傳/覆寫/刪除只有老闆
drop policy if exists "Authenticated can upload product images" on storage.objects;
create policy "product images owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_owner());

drop policy if exists "Authenticated can update product images" on storage.objects;
create policy "product images owner update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_owner());

drop policy if exists "Authenticated can delete product images" on storage.objects;
create policy "product images owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_owner());
