-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 日結採購：店員日結時記「當天用錢盤現金付的叫貨」，自動寫進 purchases + ledger_entries(從錢盤)。
-- 需先跑過 db/12、db/21、db/22、db/23。

-- 欄位
alter table public.cash_counts add column if not exists purchases jsonb not null default '[]'::jsonb;  -- 當日採購明細快照
alter table public.purchases add column if not exists source text not null default 'manual';            -- manual / daily
alter table public.purchases add column if not exists source_id uuid;

-- 「可日結者」= owner 或被授權的在職員工
create or replace function public.is_daily_closer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and is_active and (role = 'owner' or can_daily_close))
$$;

-- 日結者可讀庫存品項（挑品項用）
drop policy if exists "stock_items read closer" on public.stock_items;
create policy "stock_items read closer" on public.stock_items for select to authenticated using (public.is_daily_closer());

-- 日結者可讀帳戶（找錢盤）
drop policy if exists "accounts read closer" on public.accounts;
create policy "accounts read closer" on public.accounts for select to authenticated using (public.is_daily_closer());

-- 日結者可新增叫貨、刪除自己日結產生的(source='daily')
drop policy if exists "purchases closer insert" on public.purchases;
create policy "purchases closer insert" on public.purchases for insert to authenticated with check (public.is_daily_closer());
drop policy if exists "purchases closer delete" on public.purchases;
create policy "purchases closer delete" on public.purchases for delete to authenticated using (public.is_daily_closer() and source = 'daily');

-- 日結者可新增分錄、刪除自己日結產生的(source='daily')
drop policy if exists "ledger closer insert" on public.ledger_entries;
create policy "ledger closer insert" on public.ledger_entries for insert to authenticated with check (public.is_daily_closer());
drop policy if exists "ledger closer delete" on public.ledger_entries;
create policy "ledger closer delete" on public.ledger_entries for delete to authenticated using (public.is_daily_closer() and source = 'daily');
