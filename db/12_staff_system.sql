-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 一坨咖啡「內部員工系統」schema：人事 / 薪資 / 營收 + RLS + 憑證 bucket
-- 與對外官網的 products/menu/site_settings 完全獨立，互不影響。

-- ============================================================
-- 0. 角色判斷函式（security definer，避開 staff 政策遞迴）
-- ============================================================
-- 注意：函式先建空殼，staff 表建立後再 create or replace 真正邏輯。
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select false $$;

-- ============================================================
-- 1. staff 員工主表（id = auth.users.id）
-- ============================================================
create table if not exists public.staff (
  id uuid primary key,                       -- = auth.users.id
  name text not null,
  employee_no text,
  role text not null default 'employee' check (role in ('owner','employee')),
  email text,
  phone text,
  birthday date,
  id_number text,
  address text,
  emergency_contact text,
  emergency_phone text,
  emergency_relation text,
  bank_name text,
  bank_account text,
  bank_account_name text,
  department text,
  position text,
  hire_date date,
  base_salary numeric not null default 0,    -- 月薪（底薪）
  insured_salary numeric,                    -- 投保薪資級距
  labor_insurance text,                      -- 勞保狀態
  health_insurance text,                     -- 健保狀態
  pension text,                              -- 勞退提撥
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- 真正的 is_owner() 邏輯（staff 表已存在）
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid() and role = 'owner' and is_active = true
  )
$$;

-- 員工自助更新時，鎖住敏感欄位（薪資/投保/角色/員編/到職日）：
-- 非 owner 的更新一律保留舊值，員工只能改聯絡/銀行/緊急聯絡等資料。
create or replace function public.protect_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    new.role              := old.role;
    new.base_salary       := old.base_salary;
    new.insured_salary    := old.insured_salary;
    new.employee_no       := old.employee_no;
    new.department        := old.department;
    new.position          := old.position;
    new.hire_date         := old.hire_date;
    new.labor_insurance   := old.labor_insurance;
    new.health_insurance  := old.health_insurance;
    new.pension           := old.pension;
    new.is_active         := old.is_active;
    new.name              := old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_protect_columns on public.staff;
create trigger staff_protect_columns
  before update on public.staff
  for each row execute function public.protect_staff_columns();

-- ============================================================
-- 2. payroll_records 薪資紀錄
-- ============================================================
create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  year int not null,
  month int not null,
  base_salary numeric not null default 0,
  work_days int not null default 0,
  ot_weekday_minutes int not null default 0,
  ot_restday_minutes int not null default 0,
  ot_pay numeric not null default 0,
  total_pay numeric not null default 0,
  note text,
  paid_at date,
  paid_note text,
  paid_proof_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payroll_records_unique
  on public.payroll_records(staff_id, year, month);

drop trigger if exists payroll_records_updated_at on public.payroll_records;
create trigger payroll_records_updated_at
  before update on public.payroll_records
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. payroll_items 薪資明細（加項/減項）
-- ============================================================
create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.payroll_records(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  type text not null check (type in ('addition','deduction'))
);

create index if not exists payroll_items_payroll_idx
  on public.payroll_items(payroll_id);

-- ============================================================
-- 4. payroll_categories 自訂薪資項目
-- ============================================================
create table if not exists public.payroll_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('addition','deduction')),
  created_at timestamptz not null default now()
);

-- 預設項目
insert into public.payroll_categories (name, type) values
  ('交通津貼','addition'),
  ('全勤獎金','addition'),
  ('年終獎金','addition'),
  ('專案獎金','addition'),
  ('勞保費','deduction'),
  ('健保費','deduction'),
  ('請假扣款','deduction'),
  ('所得稅','deduction')
on conflict do nothing;

-- ============================================================
-- 5. revenue_records 營收紀錄（人事成本不存，讀取時即時加總薪資）
-- ============================================================
create table if not exists public.revenue_records (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null,
  revenue numeric not null default 0,
  other_costs jsonb not null default '[]'::jsonb,   -- [{name, amount}]
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists revenue_records_unique
  on public.revenue_records(year, month);

drop trigger if exists revenue_records_updated_at on public.revenue_records;
create trigger revenue_records_updated_at
  before update on public.revenue_records
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. RLS
-- ============================================================
alter table public.staff enable row level security;
alter table public.payroll_records enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_categories enable row level security;
alter table public.revenue_records enable row level security;

-- staff：員工看自己、老闆看全部；只有老闆能增刪改
drop policy if exists "staff read own or owner all" on public.staff;
create policy "staff read own or owner all"
  on public.staff for select to authenticated
  using (id = auth.uid() or public.is_owner());

drop policy if exists "staff self update" on public.staff;
create policy "staff self update"
  on public.staff for update to authenticated
  using (id = auth.uid() or public.is_owner())
  with check (id = auth.uid() or public.is_owner());

drop policy if exists "staff owner insert" on public.staff;
create policy "staff owner insert"
  on public.staff for insert to authenticated
  with check (public.is_owner());

drop policy if exists "staff owner delete" on public.staff;
create policy "staff owner delete"
  on public.staff for delete to authenticated
  using (public.is_owner());

-- payroll_records：員工讀自己、老闆全權
drop policy if exists "payroll read own or owner" on public.payroll_records;
create policy "payroll read own or owner"
  on public.payroll_records for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

drop policy if exists "payroll owner write" on public.payroll_records;
create policy "payroll owner write"
  on public.payroll_records for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- payroll_items：員工讀自己對應的、老闆全權
drop policy if exists "payroll_items read own or owner" on public.payroll_items;
create policy "payroll_items read own or owner"
  on public.payroll_items for select to authenticated
  using (
    public.is_owner() or exists (
      select 1 from public.payroll_records r
      where r.id = payroll_id and r.staff_id = auth.uid()
    )
  );

drop policy if exists "payroll_items owner write" on public.payroll_items;
create policy "payroll_items owner write"
  on public.payroll_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- payroll_categories：所有員工可讀（選單用）、老闆可寫
drop policy if exists "categories read authed" on public.payroll_categories;
create policy "categories read authed"
  on public.payroll_categories for select to authenticated
  using (true);

drop policy if exists "categories owner write" on public.payroll_categories;
create policy "categories owner write"
  on public.payroll_categories for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- revenue_records：僅老闆
drop policy if exists "revenue owner only" on public.revenue_records;
create policy "revenue owner only"
  on public.revenue_records for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ============================================================
-- 7. Storage：轉帳憑證（private）
--    路徑慣例 {staff_id}/{recordId}/{uuid}.ext
-- ============================================================
insert into storage.buckets (id, name, public)
values ('payroll-proofs', 'payroll-proofs', false)
on conflict (id) do nothing;

drop policy if exists "proofs read own or owner" on storage.objects;
create policy "proofs read own or owner"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payroll-proofs'
    and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_owner() )
  );

drop policy if exists "proofs owner insert" on storage.objects;
create policy "proofs owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'payroll-proofs' and public.is_owner());

drop policy if exists "proofs owner update" on storage.objects;
create policy "proofs owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'payroll-proofs' and public.is_owner());

drop policy if exists "proofs owner delete" on storage.objects;
create policy "proofs owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'payroll-proofs' and public.is_owner());

-- ============================================================
-- 8. Seed 老闆帳號 ★★ 必改 ★★
--    把下面的 email 換成「你登入咖啡後台用的那個 email」，
--    這支帳號必須已經在 Supabase Auth 裡存在（你現在登入 admin.html 用的）。
--    執行後它會成為唯一的 owner，才能進 manage.html。
-- ============================================================
insert into public.staff (id, name, role, email)
select u.id, '管理者', 'owner', u.email
from auth.users u
where u.email in (
  'liuyuyun8610@gmail.com',                   -- 老闆後台登入 email
  'voyagechochi@yahoo.com.tw'                 -- 第二位管理者
)
on conflict (id) do update set role = 'owner', is_active = true;
