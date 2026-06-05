-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 「內部資料」：每個菜單品項的做法 / SOP（飲料做法、甜點烤箱分鐘數、飯糰微波時間…）
-- 員工可讀、只有 owner 可改。需先跑過 db/12（is_owner() 由那支建立）。

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id int,                          -- 對應 menu_items.id（可空，內部專用品項可不綁）
  category_id int,                           -- 對應 menu_categories.id
  category_name text,                        -- 分類名稱（去正規化，菜單改了也留得住）
  name text not null,                        -- 品項名稱
  content text,                              -- 做法 / SOP 內容（多行純文字）
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_cat_idx on public.recipes(category_id, sort_order);

drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- RLS：在職員工可讀、只有 owner 可寫
alter table public.recipes enable row level security;

drop policy if exists "recipes read staff" on public.recipes;
create policy "recipes read staff"
  on public.recipes for select to authenticated
  using (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active));

drop policy if exists "recipes owner write" on public.recipes;
create policy "recipes owner write"
  on public.recipes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 從現有菜單匯入所有上架品項成空白條目（可重複執行，不會重複匯入）
insert into public.recipes (menu_item_id, category_id, category_name, name, sort_order)
select mi.id, mi.category_id, mc.name_zh, mi.name_zh, mi.sort_order
from public.menu_items mi
join public.menu_categories mc on mc.id = mi.category_id
where mi.is_active = true
  and not exists (select 1 from public.recipes r where r.menu_item_id = mi.id);
