-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 庫存叫貨「分類」對應到損益表的哪個銷貨成本科目，讓損益能自動加總當月採購金額。
-- pnl_line 取值：cost_beans / cost_food / cost_packaging / cost_other_cogs / none（不列入）
-- 可重複執行。

create table if not exists public.pnl_cost_map (
  category text primary key,                 -- 叫貨/庫存的分類名稱
  pnl_line text not null default 'none',     -- 對應損益成本科目
  updated_at timestamptz not null default now()
);

drop trigger if exists pnl_cost_map_updated_at on public.pnl_cost_map;
create trigger pnl_cost_map_updated_at
  before update on public.pnl_cost_map
  for each row execute function public.set_updated_at();

alter table public.pnl_cost_map enable row level security;

drop policy if exists "pnl_cost_map owner only" on public.pnl_cost_map;
create policy "pnl_cost_map owner only"
  on public.pnl_cost_map for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
