-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- LINE Pay 抽成 2.3%：把過去所有「LINE Pay 收入」分錄補上 2.3% 手續費。
-- 需先跑過 db/37（fee 欄位）。可重複執行（會以最新金額重算）。
update public.ledger_entries
set fee = round(amount * 0.023)
where type = '收入' and category = 'LINE Pay';
