-- 在 Supabase SQL Editor 執行
-- 加入 2 個 soft thumbnail 系列商品

insert into public.products (sort_order, name, name_jp, price, image_url, category, origin, meta_left, description, external_url, is_active) values
  (60, 'Jack, Chick', 'soft thumbnail Jack', 500,
   'shop/jack-chick.jpg', 'goods', 'Design · soft thumbnail', 'Plush Mini',
   'soft thumbnail「Chick」系列 Jack 號 — 想永遠當一隻黃色小雞的小生物。「想到未來會長出雞冠、每天清晨要扯著嗓子啼叫，光是想就像恐怖片。」尺寸 2.5 × 2.5 × 2.5 cm。',
   'https://softthumbnail.com/product/detail.html?product_no=217&cate_no=23&display_group=1',
   true),
  (70, 'Carol, Thief', 'soft thumbnail Carol', 1350,
   'shop/carol-thief.jpg', 'goods', 'Design · soft thumbnail', 'Plush Doll',
   'soft thumbnail「Carol」系列・Thief 款，戴眼罩的聖誕老人扮裝小偷。「Carol, GET ALL!」的節慶玩味設定，限定包裝。',
   'https://intl.heights-store.com/product/carol-thief/81586/',
   true);
