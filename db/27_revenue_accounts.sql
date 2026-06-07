-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 大交班非現金收入：LINE Pay 歸「玉山公司戶」、匯款 歸「玉山個人戶」。
-- 歸戶對照存 site_settings（後台老闆端帳本可改、設了即鎖；員工只填金額）。
-- 需先跑過 db/07（site_settings）、db/21（accounts/ledger）、db/22（cash_counts）。

-- 1) 大交班多記兩筆非現金收入金額
alter table public.cash_counts add column if not exists linepay_total numeric not null default 0;
alter table public.cash_counts add column if not exists remit_total   numeric not null default 0;

-- 2) 收入歸戶對照（site_settings 單例）
alter table public.site_settings add column if not exists linepay_account_id uuid references public.accounts(id) on delete set null;
alter table public.site_settings add column if not exists remit_account_id   uuid references public.accounts(id) on delete set null;

-- 3) 預設帳戶：玉山公司戶 / 玉山個人戶（沒有才建，type=銀行）
insert into public.accounts (name, type, sort_order)
select '玉山公司戶','銀行',10 where not exists (select 1 from public.accounts where name='玉山公司戶');
insert into public.accounts (name, type, sort_order)
select '玉山個人戶','銀行',11 where not exists (select 1 from public.accounts where name='玉山個人戶');

-- 4) 套上預設歸戶（只在尚未設定時自動帶入，避免覆蓋後台改過的設定）
update public.site_settings
set linepay_account_id = (select id from public.accounts where name='玉山公司戶' limit 1)
where id = 1 and linepay_account_id is null;
update public.site_settings
set remit_account_id = (select id from public.accounts where name='玉山個人戶' limit 1)
where id = 1 and remit_account_id is null;
