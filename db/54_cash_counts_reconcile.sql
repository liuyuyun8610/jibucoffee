-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 大交班現金對帳：前日留存金額＋今日現金營業收入－現金採購＝應有金額，與實際點鈔比出短溢。需先跑過 db/22。

alter table public.cash_counts add column if not exists prev_amount numeric;     -- 前日留存金額
alter table public.cash_counts add column if not exists cash_revenue numeric;    -- 今日現金營業收入
alter table public.cash_counts add column if not exists expected_total numeric;  -- 應有實際金額
alter table public.cash_counts add column if not exists diff numeric;            -- 短溢（實際－應有；正＝溢、負＝短）

select count(*) as table_ok from public.cash_counts where diff is null;
