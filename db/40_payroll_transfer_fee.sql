-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 薪資發放的「跨行手續費」（員工不同銀行時的轉帳手續費，可為 0）。
-- 會記進帳本(扣帳戶餘額)，並加進損益的薪資津貼。
-- 可重複執行。
alter table public.payroll_records add column if not exists transfer_fee numeric not null default 0;
