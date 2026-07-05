-- 43_shift_double_pay.sql
-- 班表可勾「雙倍薪資」：該天打卡工時以雙倍時薪計算。
-- 旗標放在 shifts（排班時決定）；薪資紀錄多存一欄 double_hours（一般時數沿用既有 work_hours）。

alter table public.shifts
  add column if not exists is_double_pay boolean not null default false;

alter table public.payroll_records
  add column if not exists double_hours numeric not null default 0;

comment on column public.shifts.is_double_pay is '此班為雙倍薪資，該天打卡工時 ×2 計薪';
comment on column public.payroll_records.double_hours is '本月雙倍薪資時數（一般時數存 work_hours）';
