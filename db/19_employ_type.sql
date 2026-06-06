-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 員工雇用類型：FT 月薪制 / PT 時薪制。需先跑過 db/12、db/15。

alter table public.staff add column if not exists employ_type text not null default 'FT'
  check (employ_type in ('FT','PT'));            -- FT 月薪 / PT 時薪
alter table public.staff add column if not exists hourly_rate numeric not null default 0;  -- PT 時薪

-- 薪資紀錄保留 PT 計算依據（FT 不用）
alter table public.payroll_records add column if not exists work_hours numeric not null default 0;  -- PT 本月工時
alter table public.payroll_records add column if not exists hourly_rate numeric not null default 0;  -- PT 時薪快照
