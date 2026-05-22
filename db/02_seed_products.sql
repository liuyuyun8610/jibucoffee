-- Seed: 把 5 個現有商品塞進 products 表
-- 在 Supabase SQL Editor 跑（要在 01_init_products.sql 之後）

-- 先清空（如果重跑用）
-- delete from public.products;

insert into public.products (sort_order, name, name_jp, price, image_url, category, origin, meta_left, description, external_url, is_active) values
  (10, '一坨經典 濾掛', 'JIBU Classic', 55,
   'shop/jibu-classic.jpg', 'coffee', 'Coffee · Taipei', 'Drip Bag',
   '精選莊園豆，小批量手工烘焙的日常單品濾掛。柔順、平衡，適合每日早晨。',
   null, true),

  (20, '草莓淡雪 濾掛', 'Strawberry Snow', 65,
   'shop/jibu-strawberry.jpg', 'coffee', 'Coffee · Taipei', 'Drip Bag',
   '淺焙日曬豆，帶有草莓與淡雪般的清甜尾韻。冷沖熱沖皆適合。',
   null, true),

  (30, '橘色笑臉雙把手馬克杯', 'nounou Jean Mug', 1380,
   'shop/nounou-mug.jpg', 'korea', 'Korea · nounou', '280ml Ceramic',
   '韓國 nounou 品牌手作陶瓷馬克杯。容量 280ml，直徑 8.2cm，高 7.8cm。表面流釉痕跡為手作特性。不可放洗碗機、不可使用鋼絲刷或漂白成分。',
   'https://www.blueorangedaily.com/products/nounou-橘色笑臉雙把手馬克杯-누누의-jean-머그-입니다',
   true),

  (40, 'Childman 鑰匙圈・Robert 63', 'Robert 63, business attire', 1300,
   'shop/childman-keychain.webp', 'goods', 'Design · soft thumbnail', 'Keychain',
   'THE SPAACE × soft thumbnail 聯名「Childman」系列，Robert 63 西裝大叔造型。一個迷你的奇妙存在，掛在鑰匙圈上每天陪你出門。',
   'https://www.thespaace.com/collections/lifestyle-brand-softthumbnail/products/9324905480-00',
   true),

  (50, 'Jihoo 7, Child', 'soft thumbnail Jihoo', 1300,
   'shop/jihoo-keychain.jpg', 'goods', 'Design · soft thumbnail', 'Plush Doll',
   'soft thumbnail「Child」系列小小孩玩偶，Jihoo 7 號。「지후는 학습지 선생님의 방문 시간을 제외하고는 항상 씩씩합니다」(除了學習老師來訪時間之外總是元氣滿滿)。尺寸 7 × 2 × 9 cm。',
   'https://softthumbnail.com/product/detail.html?product_no=202&cate_no=23&display_group=1',
   true);
