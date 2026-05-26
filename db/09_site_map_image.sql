-- site_settings 加 map_image_url 欄位：首頁底部「來找一坨」地圖區的單張圖片
alter table public.site_settings
  add column if not exists map_image_url text;

comment on column public.site_settings.map_image_url is
  '首頁底部地圖區顯示的單張圖片 URL（手繪插畫地圖 / 截圖等）。前台 index.html .loc-map 渲染這張圖。';
