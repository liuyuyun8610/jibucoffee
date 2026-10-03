-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 大交班短溢原因：短溢不是 ±0 時，員工可填寫原因。需先跑過 db/54。

alter table public.cash_counts add column if not exists diff_reason text;  -- 短溢原因

select count(*) as table_ok from public.cash_counts where diff_reason is null;
