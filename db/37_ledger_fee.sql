-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 帳本分錄加「手續費」欄位（例：轉帳/刷卡/LINE Pay 的手續費）。損益表會自動加總為「手續費」費用。
-- 可重複執行。
alter table public.ledger_entries add column if not exists fee numeric not null default 0;
