-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- LINE Pay 收入自動扣 2.3% 手續費：用 trigger，免部署 Edge Function。
-- 任何「LINE Pay 收入」分錄(大交班自動 or 手動)寫入/更新時，自動把 fee 設為金額×2.3%。
-- 需先跑過 db/37（fee 欄位）。可重複執行。

create or replace function public.set_linepay_fee()
returns trigger
language plpgsql
as $$
begin
  if new.type = '收入' and new.category = 'LINE Pay' then
    new.fee := round(new.amount * 0.023);
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_linepay_fee on public.ledger_entries;
create trigger ledger_linepay_fee
  before insert or update on public.ledger_entries
  for each row execute function public.set_linepay_fee();

-- 順手把現有的 LINE Pay 收入也補上（等同 db/38，確保一致）
update public.ledger_entries
set fee = round(amount * 0.023)
where type = '收入' and category = 'LINE Pay' and fee <> round(amount * 0.023);
