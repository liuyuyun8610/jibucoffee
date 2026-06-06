-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 帳本分錄異動紀錄：任何人編輯/刪除分錄都留下紀錄。需先跑過 db/12、db/21、db/24。

create table if not exists public.ledger_logs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid,
  action text not null,                      -- update / delete
  summary text,                              -- 人類可讀的變更摘要
  before jsonb,
  after jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists ledger_logs_changed_idx on public.ledger_logs(changed_at desc);
create index if not exists ledger_logs_entry_idx on public.ledger_logs(entry_id);

alter table public.ledger_logs enable row level security;

-- owner 可讀全部
drop policy if exists "ledger_logs read owner" on public.ledger_logs;
create policy "ledger_logs read owner" on public.ledger_logs for select to authenticated using (public.is_owner());

-- owner 或日結者皆可寫入（任何編輯者都會留下紀錄）
drop policy if exists "ledger_logs insert" on public.ledger_logs;
create policy "ledger_logs insert" on public.ledger_logs for insert to authenticated
  with check (public.is_owner() or public.is_daily_closer());
