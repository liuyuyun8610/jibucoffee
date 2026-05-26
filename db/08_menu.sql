-- ============================================================
-- 一坨咖啡 菜單系統
--   - menu_categories：分類（義式 / 不是咖啡 / 食物 / 手沖）
--   - menu_items：品項
--   - 公開可讀（前台 menu.html）、authenticated 可寫（後台）
-- 跑於 Supabase SQL Editor（project ref: ntmvivvhdapbckljevck）
-- ============================================================

-- ===== Tables =====
create table if not exists public.menu_categories (
  id          bigserial primary key,
  key         text unique not null,                 -- 'espresso' / 'not_coffee' / 'food' / 'pour_over'
  name_zh     text not null,
  name_en     text not null,
  layout      text not null default 'single',       -- 'single' | 'two_col' | 'four_col'
  footer_note text,                                 -- 區塊底部備註，例如「＋20 換燕麥奶」
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.menu_items (
  id            bigserial primary key,
  category_id   bigint not null references public.menu_categories(id) on delete cascade,
  name_zh       text not null,
  name_en       text,
  price         text,                               -- 字串：可空（如「期間限定款」）
  flavor        text,                               -- 手沖：風味描述
  process_method text,                              -- 手沖：處理法
  note          text,                               -- 單品註記（如「+10 烤花生糖漿」）
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint menu_items_unique unique (category_id, name_zh)
);

create index if not exists menu_items_category_sort_idx
  on public.menu_items (category_id, sort_order);

-- ===== RLS =====
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='menu_categories' and policyname='menu_categories_public_read') then
    create policy "menu_categories_public_read" on public.menu_categories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='menu_categories' and policyname='menu_categories_auth_write') then
    create policy "menu_categories_auth_write" on public.menu_categories for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='menu_items' and policyname='menu_items_public_read') then
    create policy "menu_items_public_read" on public.menu_items for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='menu_items' and policyname='menu_items_auth_write') then
    create policy "menu_items_auth_write" on public.menu_items for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ===== Seed: 分類 =====
insert into public.menu_categories (key, name_zh, name_en, layout, footer_note, sort_order) values
  ('espresso',   '義式咖啡', 'ESPRESSO',   'single',   '＋20 換燕麥奶　　＋15 多一份濃縮', 1),
  ('not_coffee', '不是咖啡', 'NOT COFFEE', 'two_col',  null, 2),
  ('food',       '一些吃的', 'FOOD',       'two_col',  null, 3),
  ('pour_over',  '手沖',     'POUR OVER',  'four_col', null, 4)
on conflict (key) do nothing;

-- ===== Seed: 品項 =====
do $$
declare cat_id bigint;
begin
  -- 義式咖啡
  select id into cat_id from public.menu_categories where key='espresso';
  insert into public.menu_items (category_id, name_zh, name_en, price, sort_order) values
    (cat_id, '濃縮',                 'Espresso',                          '65',  1),
    (cat_id, '美式',                 'Americano',                         '110', 2),
    (cat_id, '柳橙美式(冰)',         'Orange Americano',                  '135', 3),
    (cat_id, '葡萄美式(冰)',         'Grape Americano',                   '135', 4),
    (cat_id, '青蘋果氣泡美式(冰)',   'Green Apple Sparkling Americano',   '180', 5),
    (cat_id, '拿鐵',                 'Latte',                             '130', 6),
    (cat_id, '抹茶咖啡',             'Matcha Espresso Fusion',            '160', 7),
    (cat_id, '烤花生拿鐵',           'Peanut Latte',                      '150', 8),
    (cat_id, '香草拿鐵',             'Vanilla Latte',                     '150', 9),
    (cat_id, '焦糖醬拿鐵',           'Caramel Latte',                     '150', 10),
    (cat_id, '黑糖拿鐵',             'Brown Latte',                       '150', 11),
    (cat_id, '鹹奶油摩卡',           'Salt WP Mocha',                     '180', 12),
    (cat_id, '愛爾蘭拿鐵（無酒）',   'Irish Latte (alcohol free)',        '180', 13),
    (cat_id, '期間限定款（問老闆）', 'Seasonal special (ask me)',         null,  14)
  on conflict (category_id, name_zh) do nothing;

  -- 不是咖啡
  select id into cat_id from public.menu_categories where key='not_coffee';
  insert into public.menu_items (category_id, name_zh, name_en, price, sort_order) values
    (cat_id, '烤布雷紅茶拿鐵(熱)',           'Creme Brulee Black Tea Latte',         '150', 1),
    (cat_id, '玄米抹茶拿鐵(熱)',             'Genmai Matcha Latte',                  '155', 2),
    (cat_id, '焙茶拿鐵',                     'Hojicha Tea Latte',                    '155', 3),
    (cat_id, '秋蜜烏龍紅茶',                 'Oolong Black Tea',                     '110', 4),
    (cat_id, '春泉烏龍茶',                   'Oolong Tea',                           '110', 5),
    (cat_id, '黑糖/焦糖醬牛奶',              'Milk',                                 '150', 6),
    (cat_id, '荔枝/葡萄/青蘋果氣泡飲',       'Soda Drink',                           '110', 7),
    (cat_id, '可提娜黑可可',                 'Cotina Chocolate (+10 peanut syrup)',  '160', 8),
    (cat_id, '無咖啡因洋甘菊(熱)',           'Chamomile',                            '110', 9),
    (cat_id, '蕎麥奶茶',                     'Buckwheat Milk Tea',                   '160', 10)
  on conflict (category_id, name_zh) do nothing;

  update public.menu_items set note='+10 烤花生糖漿'
    where category_id=cat_id and name_zh='可提娜黑可可';

  -- 一些吃的
  select id into cat_id from public.menu_categories where key='food';
  insert into public.menu_items (category_id, name_zh, name_en, price, sort_order) values
    (cat_id, '巴斯克',           'Basque Cheese Cake',         '120', 1),
    (cat_id, '葡萄乾司康',       'Raisin Scone',               '60',  2),
    (cat_id, '毛豆菜舖小飯糰',   'Edamame Small Rice Balls',   '60',  3),
    (cat_id, '鹹蛋黃磅蛋糕',     'Salted Egg Yolk Pound Cake', '120', 4),
    (cat_id, '大蒜吐司',         'Garlic Toast',               '80',  5),
    (cat_id, '時不時出現的東東（看小黑板）', '(On blackboard)',  null,  6)
  on conflict (category_id, name_zh) do nothing;

  -- 手沖
  select id into cat_id from public.menu_categories where key='pour_over';
  insert into public.menu_items (category_id, name_zh, flavor, process_method, price, sort_order) values
    (cat_id, '馬拉威 藝妓',                    '花香 / 水蜜桃 / 蜂蜜',          '白蜜處理',         '280', 1),
    (cat_id, '瓜地馬拉微特南果',              '紫花香 / 藍莓果醬 / 酒',        '水洗法',           '250', 2),
    (cat_id, '衣索比亞谷吉',                  '茉莉花香 / 杏桃 / 香吉士',      '厭氧水洗',         '200', 3),
    (cat_id, '肯亞',                          '甜橙 / 蘋果 / 黑醋栗',          '水洗法',           '200', 4),
    (cat_id, '台東流淚谷',                    '熱帶水果 / 蜂蜜 / 酒香',        '厭氧發酵',         '230', 5),
    (cat_id, '哥倫比亞聖文森小農',            '麥芽糖 / 甜瓜 / 檸檬',          '水洗法',           '200', 6),
    (cat_id, '哥倫比亞淡雪草莓',              '草莓酒香 / 葡萄 / 熱帶水果',    '草莓酒日曬',       '200', 7),
    (cat_id, '莫札特哥斯大黎加',              '草莓 / 玫瑰 / 甜果香氣',        '葡萄乾發酵',       '200', 8),
    (cat_id, '衣索比亞西達摩美花處理廠',      '白花香 / 荔枝甜 / 果汁',        '水洗法',           '250', 9),
    (cat_id, '泰國清萊 東方美人',             '東方美人茶 / 葡萄乾 / 蜜棗',    '雙重厭氧蜜處理',   '220', 10),
    (cat_id, '哥斯大黎加布蘭卡芒果莊園',      '龍眼乾 / 夏威夷果 / 百香果汁甜', '百香蜜處理',       '200', 11),
    (cat_id, '哥倫比亞瑪格麗特莊園',          '荔枝香 / 帶核水果 / 奶油可可',  '雙重厭氧處理',     '250', 12),
    (cat_id, '環遊系列（問老闆）',            null,                            null,               null,  13)
  on conflict (category_id, name_zh) do nothing;
end $$;
