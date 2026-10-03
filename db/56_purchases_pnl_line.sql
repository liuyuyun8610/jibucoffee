-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 叫貨可直接指定損益科目：大交班「自由輸入品項」選的科目存在這裡，損益表優先用它（沒填才依分類對應 pnl_cost_map）。

alter table public.purchases add column if not exists pnl_line text;  -- 損益科目 key（例：cost_food、misc_purchase）

select count(*) as table_ok from public.purchases where pnl_line is null;
