-- 更新 footer Shop 清單：拿掉「日本選物 / 韓國選物 / 咖啡訂閱」，統一為「生活選物」
-- 跑於 Supabase SQL Editor（project ref: ntmvivvhdapbckljevck）

update public.site_settings
  set shop_items = E'濾掛咖啡\n原豆\n生活選物'
  where id = 1;
