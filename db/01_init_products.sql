-- 在 Supabase SQL Editor 執行（新專案 jibucoffee）
-- 一坨咖啡商品後台 schema + RLS + Storage bucket

-- ===== 1. products 表 =====
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  name text not null,
  name_jp text,
  price int not null,
  image_url text,
  category text not null default 'goods',
  origin text,
  meta_left text,
  description text,
  external_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_sort_idx
  on public.products(sort_order) where is_active = true;

-- ===== 2. updated_at 自動更新 trigger =====
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ===== 3. RLS =====
alter table public.products enable row level security;

drop policy if exists "Anyone can view active products" on public.products;
create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true);

drop policy if exists "Authenticated users can manage products" on public.products;
create policy "Authenticated users can manage products"
  on public.products for all
  to authenticated
  using (true)
  with check (true);

-- ===== 4. Storage bucket =====
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated can upload product images" on storage.objects;
create policy "Authenticated can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "Authenticated can update product images" on storage.objects;
create policy "Authenticated can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated can delete product images" on storage.objects;
create policy "Authenticated can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');
