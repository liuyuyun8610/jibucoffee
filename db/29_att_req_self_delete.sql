-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 補打卡申請：允許「老闆」或「申請人本人」刪除（原本只有老闆）。需先跑過 db/16。

drop policy if exists "att_req owner delete" on public.attendance_requests;
drop policy if exists "att_req owner or self delete" on public.attendance_requests;
create policy "att_req owner or self delete"
  on public.attendance_requests for delete to authenticated
  using (public.is_owner() or staff_id = auth.uid());
