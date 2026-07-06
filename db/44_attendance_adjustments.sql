-- 44_attendance_adjustments.sql
-- 打卡工時「審核修正」：老闆可手動覆蓋某人某天的工時（例：遲到有原因不扣）。
-- 只有老闆能寫；員工只能讀自己的（不能自己改，避免作弊）。需先跑過 db/12(is_owner)+db/15(attendance)。

create table if not exists public.attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  minutes numeric not null,       -- 審核後的工時（分鐘），覆蓋自動計算
  note text,                      -- 修正原因（選填）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists att_adj_unique on public.attendance_adjustments(staff_id, work_date);

drop trigger if exists att_adj_updated_at on public.attendance_adjustments;
create trigger att_adj_updated_at
  before update on public.attendance_adjustments
  for each row execute function public.set_updated_at();

alter table public.attendance_adjustments enable row level security;

-- 讀：自己的 或 老闆
drop policy if exists "att_adj read own or owner" on public.attendance_adjustments;
create policy "att_adj read own or owner"
  on public.attendance_adjustments for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

-- 寫（新增/修改/刪除）：只有老闆
drop policy if exists "att_adj owner write" on public.attendance_adjustments;
create policy "att_adj owner write"
  on public.attendance_adjustments for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

comment on table public.attendance_adjustments is '老闆審核修正的每日工時（分鐘），覆蓋打卡自動計算';

-- PT 薪資「需補時數」：整天沒打卡時手動補的時數（加在打卡時數之上）
alter table public.payroll_records
  add column if not exists makeup_hours numeric not null default 0;
alter table public.payroll_records
  add column if not exists makeup_double_hours numeric not null default 0;
comment on column public.payroll_records.makeup_hours is '手動補的一般時數（無打卡）';
comment on column public.payroll_records.makeup_double_hours is '手動補的雙倍時數（無打卡）';
