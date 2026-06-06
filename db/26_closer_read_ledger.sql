-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 讓日結者能讀帳本分錄（大交班對帳需即時讀帳戶實際餘額來校正）。需先跑過 db/24。

drop policy if exists "ledger read closer" on public.ledger_entries;
create policy "ledger read closer" on public.ledger_entries for select to authenticated
  using (public.is_daily_closer());
