-- 掛耳包網站 v2：分類、首頁輪播、商品詳細、會員
-- 需先跑過 db/49。會員用 Supabase Auth（Google／Email），與員工同一個 auth；
-- 員工資料表都以 staff(id) 外鍵保護，會員登入後寫不進去、也讀不到。

-- ===== 1. 分類 =====
create table if not exists public.drip_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,30}$'),
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.drip_categories enable row level security;
drop policy if exists "drip_categories read" on public.drip_categories;
create policy "drip_categories read" on public.drip_categories for select using (is_active or public.is_owner());
drop policy if exists "drip_categories owner write" on public.drip_categories;
create policy "drip_categories owner write" on public.drip_categories for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

insert into public.drip_categories (slug, name, sort_order) values
  ('drip', '掛耳包', 1), ('goods', '選品', 2)
on conflict (slug) do nothing;

-- ===== 2. 商品加欄位 =====
alter table public.drip_products
  add column if not exists category text not null default 'drip'
    references public.drip_categories(slug) on update cascade,
  add column if not exists description text,          -- 詳細頁長文
  add column if not exists gallery text[] not null default '{}',  -- 詳細頁更多照片
  add column if not exists badge text,                  -- 例：新品、限定
  add column if not exists is_featured boolean not null default false;  -- 首頁「推薦」

-- ===== 3. 首頁輪播 =====
create table if not exists public.drip_banners (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  image_url text,
  title text,
  subtitle text,
  link text,                 -- 例：#/c/drip 或 #/p/<id>
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.drip_banners enable row level security;
drop policy if exists "drip_banners read" on public.drip_banners;
create policy "drip_banners read" on public.drip_banners for select using (is_active or public.is_owner());
drop policy if exists "drip_banners owner write" on public.drip_banners;
create policy "drip_banners owner write" on public.drip_banners for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

insert into public.drip_banners (sort_order, title, subtitle, link)
select 1, '在家，也是一坨咖啡', '每週小批量烘焙的掛耳包', '#/c/drip'
where not exists (select 1 from public.drip_banners);

-- ===== 4. 會員資料 =====
create table if not exists public.drip_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text check (length(name) <= 40),
  phone text check (length(phone) <= 20),
  address text check (length(address) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists drip_members_updated_at on public.drip_members;
create trigger drip_members_updated_at before update on public.drip_members
  for each row execute function public.set_updated_at();

alter table public.drip_members enable row level security;
drop policy if exists "drip_members self" on public.drip_members;
create policy "drip_members self" on public.drip_members for all to authenticated
  using (id = auth.uid() or public.is_owner()) with check (id = auth.uid());

-- ===== 5. 訂單綁會員 =====
alter table public.drip_orders
  add column if not exists member_id uuid references auth.users(id) on delete set null;
create index if not exists drip_orders_member_idx on public.drip_orders (member_id, created_at desc);

drop policy if exists "drip_orders member read" on public.drip_orders;
create policy "drip_orders member read" on public.drip_orders for select to authenticated
  using (member_id = auth.uid());

-- 會員付款回報也走 drip_report_payment（要電話），不開放會員直接改訂單。

-- ===== 6. 下單函式：登入時記下會員 =====
create or replace function public.drip_place_order(
  p_items jsonb, p_name text, p_phone text, p_email text,
  p_delivery text, p_address text, p_note text, p_pay text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.drip_settings;
  it jsonb;
  pr public.drip_products;
  q int;
  lines jsonb := '[]'::jsonb;
  sub int := 0;
  ship int := 0;
  c text;
  ph text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  select * into s from public.drip_settings where id = 1;
  if not s.is_open then raise exception '目前暫停接單'; end if;

  if length(trim(coalesce(p_name,''))) not between 1 and 40 then raise exception '請填寫姓名'; end if;
  if length(ph) not between 8 and 12 then raise exception '請填寫正確的電話'; end if;
  if p_delivery not in ('home','pickup') then raise exception '請選擇取貨方式'; end if;
  if p_delivery = 'pickup' and not s.pickup_enabled then raise exception '目前不提供到店自取'; end if;
  if p_delivery = 'home' and length(trim(coalesce(p_address,''))) < 6 then raise exception '請填寫完整地址'; end if;
  if p_pay not in ('transfer','linepay') then raise exception '請選擇付款方式'; end if;
  if length(coalesce(p_note,'')) > 300 or length(coalesce(p_address,'')) > 200
     or length(coalesce(p_email,'')) > 120 then raise exception '資料過長'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 20 then raise exception '購物袋是空的'; end if;

  if (select count(*) from public.drip_orders
      where phone = ph and created_at > now() - interval '1 hour') >= 5 then
    raise exception '下單次數過多，請稍後再試';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::int;
    if q is null or q < 1 or q > 50 then raise exception '數量不正確'; end if;
    select * into pr from public.drip_products
      where id = (it->>'id')::uuid and is_active for update;
    if not found then raise exception '有商品已下架，請重新整理'; end if;
    if pr.stock is not null then
      if pr.stock < q then raise exception '「%」庫存不足（剩 %）', pr.name, pr.stock; end if;
      update public.drip_products set stock = stock - q where id = pr.id;
    end if;
    sub := sub + pr.price * q;
    lines := lines || jsonb_build_object('id', pr.id, 'name', pr.name, 'spec', pr.spec,
                                         'price', pr.price, 'qty', q, 'image_url', pr.image_url);
  end loop;

  if p_delivery = 'home' and not (s.free_shipping_over > 0 and sub >= s.free_shipping_over) then
    ship := s.shipping_fee;
  end if;

  loop
    c := 'JB' || to_char(now() at time zone 'Asia/Taipei', 'MMDD') || '-'
         || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.drip_orders where code = c);
  end loop;

  insert into public.drip_orders (code, name, phone, email, delivery, address, note,
                                  pay_method, items, subtotal, shipping, total, member_id)
  values (c, trim(p_name), ph, nullif(trim(p_email),''), p_delivery,
          case when p_delivery = 'home' then trim(p_address) end,
          nullif(trim(p_note),''), p_pay, lines, sub, ship, sub + ship, auth.uid());

  -- 會員：順手記住這次的收件資料
  if auth.uid() is not null then
    insert into public.drip_members (id, name, phone, address)
    values (auth.uid(), trim(p_name), ph, case when p_delivery = 'home' then trim(p_address) end)
    on conflict (id) do update set name = excluded.name, phone = excluded.phone,
      address = coalesce(excluded.address, public.drip_members.address);
  end if;

  return jsonb_build_object('code', c, 'subtotal', sub, 'shipping', ship, 'total', sub + ship);
end $$;

revoke all on function public.drip_place_order(jsonb,text,text,text,text,text,text,text) from public;
grant execute on function public.drip_place_order(jsonb,text,text,text,text,text,text,text) to anon, authenticated;

-- ===== 7. 示範商品補分類與推薦 =====
update public.drip_products set is_featured = true, badge = '招牌'
 where name = '一坨招牌' and badge is null;
update public.drip_products set badge = '新品'
 where name = '耶加雪菲' and badge is null;

select (select count(*) from public.drip_categories) as categories_ok,
       (select count(*) from public.drip_banners) as banners_ok,
       (select count(*) from information_schema.columns
         where table_name = 'drip_orders' and column_name = 'member_id') as member_col_ok;
