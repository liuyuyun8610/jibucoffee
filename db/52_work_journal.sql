-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 工作日誌：店主每天的工作紀錄。僅 owner 可讀寫。需先跑過 db/12（is_owner()）。

create table if not exists public.work_journal (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,                    -- 日期
  title text,                                -- 標題（選填）
  content text,                              -- 內容
  tags text[] not null default '{}',         -- 標籤
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_journal_date_idx on public.work_journal(log_date desc);

drop trigger if exists work_journal_updated_at on public.work_journal;
create trigger work_journal_updated_at
  before update on public.work_journal
  for each row execute function public.set_updated_at();

alter table public.work_journal enable row level security;

drop policy if exists "work journal owner only" on public.work_journal;
create policy "work journal owner only"
  on public.work_journal for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

select count(*) as table_ok from public.work_journal;
