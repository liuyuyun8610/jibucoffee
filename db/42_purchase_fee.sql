-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 叫貨的「手續費」（轉帳/匯款手續費）。會記進該筆進貨的帳本分錄 fee，扣帳戶餘額、進損益手續費。
-- 可重複執行。
alter table public.purchases add column if not exists fee numeric not null default 0;
