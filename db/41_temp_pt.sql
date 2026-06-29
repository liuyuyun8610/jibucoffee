-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 臨時 PT：老闆在排班頁新增(自填名字)，臨時 PT 用公開打卡頁(免登入/免APP)點自己名字打卡。
-- 可重複執行。

create table if not exists public.temp_pt_shifts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  name text not null,
  start_time text,                  -- '09:00'
  end_time text,                    -- '17:00'
  clock_in timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists temp_pt_date_idx on public.temp_pt_shifts(work_date);

alter table public.temp_pt_shifts enable row level security;

-- 老闆：完整讀寫
drop policy if exists "temp_pt owner all" on public.temp_pt_shifts;
create policy "temp_pt owner all" on public.temp_pt_shifts
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 公開打卡頁(未登入 anon)：只能讀「當天」的名單（看到名字打卡用）
drop policy if exists "temp_pt anon read today" on public.temp_pt_shifts;
create policy "temp_pt anon read today" on public.temp_pt_shifts
  for select to anon using (work_date = (now() at time zone 'Asia/Taipei')::date);

-- 打卡 RPC：security definer，只改當天、且尚未打的時間，anon 可呼叫
create or replace function public.pt_clock(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'in' then
    update public.temp_pt_shifts set clock_in = now()
      where id = p_id and work_date = (now() at time zone 'Asia/Taipei')::date and clock_in is null;
  elsif p_action = 'out' then
    update public.temp_pt_shifts set clock_out = now()
      where id = p_id and work_date = (now() at time zone 'Asia/Taipei')::date and clock_out is null;
  end if;
end;
$$;
grant execute on function public.pt_clock(uuid, text) to anon;
