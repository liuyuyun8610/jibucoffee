-- 商品分類簡化：japan / korea 全部合併為 goods（統稱「生活選物」）
-- 前台 index.html 已經把 category != 'coffee' 都算選物，所以這只是讓後台分類乾淨。
update public.products
  set category = 'goods'
  where category in ('japan', 'korea');
