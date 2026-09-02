-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 臨時 PT 進薪資：每班記時薪、老闆可審核修正工時並寫原因。
-- 薪資頁「臨時PT」列表用這些欄位算薪資，會自動進損益的「薪資津貼」；
-- 選了發放帳戶則同步記一筆帳本「支出・薪資」（source = 'temp_pt'，source_id = 該班 id）。
-- 需先跑過 db/41_temp_pt.sql。可重複執行。

alter table public.temp_pt_shifts add column if not exists hourly_rate numeric not null default 0;
alter table public.temp_pt_shifts add column if not exists adj_minutes numeric;   -- 審核修正工時（分鐘）；null = 依打卡＋班表規則自動算
alter table public.temp_pt_shifts add column if not exists adj_note text;         -- 修正原因

comment on column public.temp_pt_shifts.hourly_rate is '臨時PT 時薪（排班時填，薪資頁可改）';
comment on column public.temp_pt_shifts.adj_minutes is '老闆審核修正的工時（分鐘），null 表示依打卡自動計算';
comment on column public.temp_pt_shifts.adj_note is '審核修正原因';
