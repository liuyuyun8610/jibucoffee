-- 掛耳包網站（jibu-drip）：商品、設定、訂單
-- 客人不能直接讀寫訂單，只能透過 drip_place_order / drip_lookup / drip_report_payment 三個函式；
-- 金額一律在資料庫重算，不信任前端。後台讀寫限 owner（is_owner()，見 db/12）。

-- ===== 1. 商品 =====
create table if not exists public.drip_products (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  name text not null,
  subtitle text,               -- 例：衣索比亞 · 淺焙
  notes text,                  -- 風味描述
  spec text,                   -- 例：10 入／盒
  price int not null check (price >= 0),
  image_url text,
  stock int check (stock is null or stock >= 0),   -- null = 不控庫存
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drip_products_updated_at on public.drip_products;
create trigger drip_products_updated_at before update on public.drip_products
  for each row execute function public.set_updated_at();

alter table public.drip_products enable row level security;
drop policy if exists "drip_products read" on public.drip_products;
create policy "drip_products read" on public.drip_products for select
  using (is_active or public.is_owner());
drop policy if exists "drip_products owner write" on public.drip_products;
create policy "drip_products owner write" on public.drip_products for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ===== 2. 設定（單列） =====
create table if not exists public.drip_settings (
  id int primary key default 1 check (id = 1),
  is_open boolean not null default true,
  intro text not null default E'在家也能喝到店裡的那一杯。\n每週小批量烘焙，新鮮研磨後立刻封裝。',
  shipping_fee int not null default 100 check (shipping_fee >= 0),
  free_shipping_over int not null default 1000 check (free_shipping_over >= 0),  -- 0 = 不提供免運
  pickup_enabled boolean not null default true,
  pickup_note text not null default '請於付款確認後，營業時間內到店領取。',
  bank_info text not null default E'（示範）銀行代碼 000\n帳號 0000-0000-0000\n戶名 一坨咖啡',
  linepay_info text not null default '（示範）LINE Pay 付款請加官方帳號 @jibucoffee，告知訂單編號。',
  notice text not null default '付款確認後 3 個工作天內出貨。',
  updated_at timestamptz not null default now()
);
insert into public.drip_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists drip_settings_updated_at on public.drip_settings;
create trigger drip_settings_updated_at before update on public.drip_settings
  for each row execute function public.set_updated_at();

alter table public.drip_settings enable row level security;
drop policy if exists "drip_settings read" on public.drip_settings;
create policy "drip_settings read" on public.drip_settings for select using (true);
drop policy if exists "drip_settings owner write" on public.drip_settings;
create policy "drip_settings owner write" on public.drip_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ===== 3. 訂單 =====
create table if not exists public.drip_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'pending'
    check (status in ('pending','paid','shipped','picked_up','cancelled')),
  name text not null,
  phone text not null,
  email text,
  delivery text not null check (delivery in ('home','pickup')),
  address text,
  note text,
  pay_method text not null check (pay_method in ('transfer','linepay')),
  items jsonb not null,        -- [{id,name,spec,price,qty}]
  subtotal int not null,
  shipping int not null,
  total int not null,
  pay_last5 text,
  pay_reported_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drip_orders_created_idx on public.drip_orders (created_at desc);
create index if not exists drip_orders_phone_idx on public.drip_orders (phone, created_at desc);

drop trigger if exists drip_orders_updated_at on public.drip_orders;
create trigger drip_orders_updated_at before update on public.drip_orders
  for each row execute function public.set_updated_at();

alter table public.drip_orders enable row level security;
drop policy if exists "drip_orders owner all" on public.drip_orders;
create policy "drip_orders owner all" on public.drip_orders for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ===== 4. 下單 =====
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

  -- 同一支電話一小時最多 5 筆，擋灌單
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
                                         'price', pr.price, 'qty', q);
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
                                  pay_method, items, subtotal, shipping, total)
  values (c, trim(p_name), ph, nullif(trim(p_email),''), p_delivery,
          case when p_delivery = 'home' then trim(p_address) end,
          nullif(trim(p_note),''), p_pay, lines, sub, ship, sub + ship);

  return jsonb_build_object('code', c, 'subtotal', sub, 'shipping', ship, 'total', sub + ship);
end $$;

-- ===== 5. 查訂單（編號 + 電話） =====
create or replace function public.drip_lookup(p_code text, p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code, 'status', status, 'items', items,
    'subtotal', subtotal, 'shipping', shipping, 'total', total,
    'delivery', delivery, 'pay_method', pay_method,
    'pay_reported', pay_last5 is not null, 'created_at', created_at)
  from public.drip_orders
  where code = upper(trim(p_code))
    and phone = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
$$;

-- ===== 6. 回報付款（轉帳後五碼） =====
create or replace function public.drip_report_payment(p_code text, p_phone text, p_last5 text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(p_last5,'') !~ '^[0-9A-Za-z]{3,10}$' then raise exception '請填寫帳號後五碼'; end if;
  update public.drip_orders set pay_last5 = p_last5, pay_reported_at = now()
   where code = upper(trim(p_code))
     and phone = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
     and status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.drip_place_order(jsonb,text,text,text,text,text,text,text) from public;
revoke all on function public.drip_lookup(text,text) from public;
revoke all on function public.drip_report_payment(text,text,text) from public;
grant execute on function public.drip_place_order(jsonb,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.drip_lookup(text,text) to anon, authenticated;
grant execute on function public.drip_report_payment(text,text,text) to anon, authenticated;

-- ===== 7. 示範商品（之後在後台改掉） =====
insert into public.drip_products (sort_order, name, subtitle, notes, spec, price)
select * from (values
  (1, '一坨招牌', '配方 · 中焙', '黑糖、可可、烤堅果，加奶也好喝。', '10 入／盒', 380),
  (2, '耶加雪菲', '衣索比亞 · 淺焙', '茉莉花、檸檬皮、紅茶尾韻。', '10 入／盒', 450),
  (3, '薇薇特南果', '瓜地馬拉 · 中焙', '黑巧克力、焦糖、柔和果酸。', '10 入／盒', 420)
) v(a,b,c,d,e,f)
where not exists (select 1 from public.drip_products);

select (select count(*) from public.drip_products) as products_ok,
       (select count(*) from public.drip_settings) as settings_ok,
       (select count(*) from public.drip_orders) as orders_ok;
