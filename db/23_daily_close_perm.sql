-- 在 Supabase SQL Editor 執行（jibucoffee 專案）
-- 日結權限：staff.can_daily_close（預設關閉，只有 owner 在後台逐一開啟）。需先跑過 db/12、db/19。

alter table public.staff add column if not exists can_daily_close boolean not null default false;

-- 更新欄位保護：非 owner 不能自己改這些（補上 employ_type/hourly_rate/can_daily_close）
create or replace function public.protect_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    new.role             := old.role;
    new.base_salary      := old.base_salary;
    new.insured_salary   := old.insured_salary;
    new.employee_no      := old.employee_no;
    new.department       := old.department;
    new.position         := old.position;
    new.hire_date        := old.hire_date;
    new.labor_insurance  := old.labor_insurance;
    new.health_insurance := old.health_insurance;
    new.pension          := old.pension;
    new.is_active        := old.is_active;
    new.name             := old.name;
    new.employ_type      := old.employ_type;
    new.hourly_rate      := old.hourly_rate;
    new.can_daily_close  := old.can_daily_close;
  end if;
  return new;
end;
$$;
