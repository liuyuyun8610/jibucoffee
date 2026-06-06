-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 班表：老闆排班、員工可看自己的班。需先跑過 db/12。

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  start_time text,                           -- '09:00'
  end_time text,                             -- '17:00'
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shifts_staff_date_idx on public.shifts(staff_id, work_date);
create index if not exists shifts_date_idx on public.shifts(work_date);

drop trigger if exists shifts_updated_at on public.shifts;
create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

alter table public.shifts enable row level security;

-- 員工看自己的、老闆看全部
drop policy if exists "shifts read own or owner" on public.shifts;
create policy "shifts read own or owner"
  on public.shifts for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

-- 只有老闆能排班（增刪改）
drop policy if exists "shifts owner write" on public.shifts;
create policy "shifts owner write"
  on public.shifts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
