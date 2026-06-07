-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 員工班表月曆要看到「全體」班次（自己的醒目）。需先跑過 db/12、db/20。
-- 注意：不開放 staff 全表（含薪資/身分證/銀行帳號），姓名改走只回 id+name 的函式。

-- 1) shifts 讀取放寬：在職員工皆可讀全部班次（寫入仍只有老闆）
drop policy if exists "shifts read own or owner" on public.shifts;
drop policy if exists "shifts read all active staff" on public.shifts;
create policy "shifts read all active staff" on public.shifts for select to authenticated
  using (exists (select 1 from public.staff s where s.id = auth.uid() and s.is_active));

-- 2) 員工花名冊（只回 id + 姓名，給班表月曆顯示同事名字用）
create or replace function public.staff_roster()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name
  from public.staff s
  where s.is_active
    and exists (select 1 from public.staff c where c.id = auth.uid() and c.is_active)
$$;
grant execute on function public.staff_roster() to authenticated;
