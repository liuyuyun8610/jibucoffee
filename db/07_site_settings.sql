-- 在 Supabase SQL Editor 執行
-- 全站設定 singleton 表（footer 文案、店家資訊、Shop/About/Help 清單）

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  brand_tagline text not null default E'一杯咖啡的時間，是一天當中最安靜的儀式。\n我們相信，慢一點，也是一種前進。',
  address text not null default '',
  phone text not null default '',
  hours text not null default '',
  shop_items text not null default E'濾掛咖啡\n原豆\n生活選物',
  about_items text not null default E'聯絡我們|#contact\nInstagram|https://instagram.com/jibucoffee',
  help_items text not null default E'隱私條款\n退款政策\n配送說明\nFAQ',
  updated_at timestamptz not null default now()
);

-- 確保 id=1 那筆存在
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- updated_at trigger
drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- RLS
alter table public.site_settings enable row level security;

drop policy if exists "Public read site_settings" on public.site_settings;
create policy "Public read site_settings"
  on public.site_settings for select
  using (true);

drop policy if exists "Auth update site_settings" on public.site_settings;
create policy "Auth update site_settings"
  on public.site_settings for update
  to authenticated
  using (true) with check (true);

drop policy if exists "Auth insert site_settings" on public.site_settings;
create policy "Auth insert site_settings"
  on public.site_settings for insert
  to authenticated
  with check (true);
