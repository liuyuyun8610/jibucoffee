-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 員工公告：老闆在後台人事區設定，顯示在員工 App 首頁最上方；員工點「我已閱讀」確認。
-- 需先跑過 db/07（site_settings）、db/12（staff）。

-- 1) 公告內容 + 發布時間（時間當「版本」，更新後員工要重新確認）
alter table public.site_settings add column if not exists staff_announcement text;
alter table public.site_settings add column if not exists staff_announcement_at timestamptz;

-- 2) 已讀確認（一個員工對一個公告版本一筆）
create table if not exists public.announcement_acks (
  staff_id uuid not null references public.staff(id) on delete cascade,
  announced_at timestamptz not null,            -- 對應 site_settings.staff_announcement_at
  ack_at timestamptz not null default now(),
  primary key (staff_id, announced_at)
);

alter table public.announcement_acks enable row level security;

-- 員工讀自己的、老闆讀全部（後台看誰已讀）
drop policy if exists "ann_acks read own or owner" on public.announcement_acks;
create policy "ann_acks read own or owner" on public.announcement_acks for select to authenticated
  using (staff_id = auth.uid() or public.is_owner());

-- 員工只能幫自己標已讀
drop policy if exists "ann_acks self insert" on public.announcement_acks;
create policy "ann_acks self insert" on public.announcement_acks for insert to authenticated
  with check (staff_id = auth.uid());
