-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 大交班周轉金對帳：今日現金收入－現金支出＋前日留存周轉金－匯款金額＝本日應有周轉金，與實際清點（錢盤＋金庫）比出短溢。需先跑過 db/22。

alter table public.cash_counts add column if not exists prev_amount numeric;     -- 前日留存周轉金
alter table public.cash_counts add column if not exists cash_revenue numeric;    -- 今日現金收入
alter table public.cash_counts add column if not exists expected_total numeric;  -- 本日應有周轉金
alter table public.cash_counts add column if not exists diff numeric;            -- 短溢（實際－應有；正＝溢、負＝短）

select count(*) as table_ok from public.cash_counts where diff is null;
