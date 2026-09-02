-- 在 Supabase SQL Editor 執行
-- 私人行程加 icon 欄位（存圖示代號，前端對照 JB.icons）

alter table public.owner_events add column if not exists icon text;
