-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 維運紀錄：設備維修（叫修）紀錄 + 照片。僅 owner 可讀寫。需先跑過 db/12（is_owner()）。

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  repair_date date not null,                 -- 叫修時間
  equipment text,                            -- 設備名稱
  content text,                              -- 叫修內容
  cost numeric not null default 0,           -- 叫修費用
  vendor text,                               -- 廠商 / 師傅
  status text not null default 'open' check (status in ('open','done')),  -- 叫修中 / 已完成
  photo_path text,                           -- 照片（maintenance-photos bucket）
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_date_idx on public.maintenance_records(repair_date desc);

drop trigger if exists maintenance_updated_at on public.maintenance_records;
create trigger maintenance_updated_at
  before update on public.maintenance_records
  for each row execute function public.set_updated_at();

alter table public.maintenance_records enable row level security;

drop policy if exists "maintenance owner only" on public.maintenance_records;
create policy "maintenance owner only"
  on public.maintenance_records for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 照片 bucket（private）
insert into storage.buckets (id, name, public)
values ('maintenance-photos', 'maintenance-photos', false)
on conflict (id) do nothing;

drop policy if exists "maint photos owner all" on storage.objects;
create policy "maint photos owner all"
  on storage.objects for all to authenticated
  using (bucket_id = 'maintenance-photos' and public.is_owner())
  with check (bucket_id = 'maintenance-photos' and public.is_owner());
