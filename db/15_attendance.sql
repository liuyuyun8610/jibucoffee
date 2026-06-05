-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 員工打卡：每人每天一筆，記上班/下班時間。需先跑過 db/12（is_owner()）。

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_unique on public.attendance(staff_id, work_date);
create index if not exists attendance_date_idx on public.attendance(work_date desc);

drop trigger if exists attendance_updated_at on public.attendance;
create trigger attendance_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

alter table public.attendance enable row level security;

-- 員工讀/寫自己的、老闆看全部
drop policy if exists "attendance read own or owner" on public.attendance;
create policy "attendance read own or owner"
  on public.attendance for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

drop policy if exists "attendance self insert" on public.attendance;
create policy "attendance self insert"
  on public.attendance for insert to authenticated
  with check (staff_id = auth.uid() or public.is_owner());

drop policy if exists "attendance self update" on public.attendance;
create policy "attendance self update"
  on public.attendance for update to authenticated
  using (staff_id = auth.uid() or public.is_owner())
  with check (staff_id = auth.uid() or public.is_owner());

drop policy if exists "attendance owner delete" on public.attendance;
create policy "attendance owner delete"
  on public.attendance for delete to authenticated
  using (public.is_owner());
