-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 資安強化(小)：大交班主紀錄 cash_counts 的寫入，從「任何在職員工」收緊成「可大交班者」(owner 或 can_daily_close)。
-- 讀取維持在職員工皆可(店內現金為共用資訊)。正常流程走 daily-close edge function(service_role)不受影響。
-- 需先跑過 db/22、db/24(is_daily_closer)。

drop policy if exists "cash_counts write staff" on public.cash_counts;
create policy "cash_counts write closer" on public.cash_counts for insert to authenticated
  with check (public.is_daily_closer());

drop policy if exists "cash_counts update staff" on public.cash_counts;
create policy "cash_counts update closer" on public.cash_counts for update to authenticated
  using (public.is_daily_closer()) with check (public.is_daily_closer());
