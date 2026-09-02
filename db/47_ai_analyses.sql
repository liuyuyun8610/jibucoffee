-- 在 Supabase SQL Editor 執行
-- AI 財務分析紀錄：每次分析自動存檔，只有 owner 看得到

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  year int,
  content text not null,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);

create index if not exists ai_analyses_created_idx on public.ai_analyses(created_at desc);

alter table public.ai_analyses enable row level security;

drop policy if exists "ai_analyses owner only" on public.ai_analyses;
create policy "ai_analyses owner only"
  on public.ai_analyses for all
  to authenticated
  using (public.is_owner()) with check (public.is_owner());
