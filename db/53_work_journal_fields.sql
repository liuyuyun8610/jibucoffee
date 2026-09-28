-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 工作日誌加欄位：POS 營業額、尖峰時間、節慶／連假標注、是否雙倍薪資。需先跑過 db/52。

alter table public.work_journal add column if not exists pos_sales numeric;                     -- POS 營業額
alter table public.work_journal add column if not exists peak_time text;                        -- 尖峰時間紀錄
alter table public.work_journal add column if not exists holiday text;                          -- 特殊節慶／連假
alter table public.work_journal add column if not exists double_pay boolean not null default false; -- 是否雙倍薪資

select count(*) as table_ok from public.work_journal where double_pay = false;
