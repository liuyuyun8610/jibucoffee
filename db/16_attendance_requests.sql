-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 補打卡申請：員工提出 → owner 審核 → 核准後才寫入 attendance。需先跑過 db/12、db/15。

create table if not exists public.attendance_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('clock_in','clock_out')),  -- 補上班 / 補下班
  requested_time timestamptz not null,                          -- 申請的打卡時間
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists att_req_status_idx on public.attendance_requests(status, created_at desc);
create index if not exists att_req_staff_idx on public.attendance_requests(staff_id, created_at desc);

alter table public.attendance_requests enable row level security;

-- 員工讀自己的、老闆讀全部
drop policy if exists "att_req read own or owner" on public.attendance_requests;
create policy "att_req read own or owner"
  on public.attendance_requests for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

-- 員工只能幫自己送申請
drop policy if exists "att_req self insert" on public.attendance_requests;
create policy "att_req self insert"
  on public.attendance_requests for insert to authenticated
  with check (staff_id = auth.uid());

-- 只有老闆能審核（改 status）
drop policy if exists "att_req owner update" on public.attendance_requests;
create policy "att_req owner update"
  on public.attendance_requests for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "att_req owner delete" on public.attendance_requests;
create policy "att_req owner delete"
  on public.attendance_requests for delete to authenticated
  using (public.is_owner());
