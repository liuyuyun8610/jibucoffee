-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 老闆後台「損益預測」：每月損益各科目，一年 12 個月一列一月。僅老闆可讀寫。
-- 子分類小計（淨額/銷貨成本/毛利/可控/不可控/營業淨利）由前端即時算，不存。
-- 可重複執行。

create table if not exists public.pnl_monthly (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),

  -- 收入
  revenue_gross numeric not null default 0,   -- 內用 / 外帶收入
  discount      numeric not null default 0,   -- 折扣
  tax           numeric not null default 0,   -- 稅額

  -- 銷貨成本
  cost_beans      numeric not null default 0, -- 咖啡豆成本
  cost_food       numeric not null default 0, -- 食材成本
  cost_packaging  numeric not null default 0, -- 包裝 / 杯子成本
  cost_other_cogs numeric not null default 0, -- 其他（糖、餐巾紙等）

  -- 可控費用
  salary         numeric not null default 0,  -- 薪資津貼（含勞健保）
  misc_purchase  numeric not null default 0,  -- 雜項購置
  water_gas      numeric not null default 0,  -- 水費、瓦斯
  electric       numeric not null default 0,  -- 電費
  other_ctrl     numeric not null default 0,  -- 其他（可控）
  equip_repair   numeric not null default 0,  -- 設備維修費
  equip_maintain numeric not null default 0,  -- 設備保養費

  -- 不可控費用（多為固定）
  rent        numeric not null default 0,     -- 租金
  parking     numeric not null default 0,     -- 車位
  amort_decor numeric not null default 0,     -- 裝修攤提（7 年）
  amort_equip numeric not null default 0,     -- 設備折舊攤提（5 年）
  system_fee  numeric not null default 0,     -- 系統費用

  is_actual boolean not null default true,    -- true=實際已發生；false=預測（保留欄位）
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pnl_monthly_unique on public.pnl_monthly(year, month);

drop trigger if exists pnl_monthly_updated_at on public.pnl_monthly;
create trigger pnl_monthly_updated_at
  before update on public.pnl_monthly
  for each row execute function public.set_updated_at();

alter table public.pnl_monthly enable row level security;

drop policy if exists "pnl owner only" on public.pnl_monthly;
create policy "pnl owner only"
  on public.pnl_monthly for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
