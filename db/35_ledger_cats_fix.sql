-- 在 Supabase SQL Editor 執行（jibucoffee 專案 ntmvivvhdapbckljevck）
-- 1) 清掉重複的帳本分類（之前 21_ledger.sql 被跑兩次造成每個分類各兩筆）
-- 2) 加唯一限制，之後不會再重複
-- 3) 補「水費」「電費」兩個支出分類（損益表要分開算）
-- 可重複執行。

-- 去重：同名同類只留最早一筆
delete from public.ledger_categories a
using public.ledger_categories b
where a.ctid > b.ctid and a.name = b.name and a.kind = b.kind;

-- 唯一限制（已存在就略過）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ledger_categories_name_kind_key'
  ) then
    alter table public.ledger_categories
      add constraint ledger_categories_name_kind_key unique (name, kind);
  end if;
end $$;

-- 補水費、電費（沿用 水電 的排序位置附近）
insert into public.ledger_categories (name, kind, sort_order) values
  ('水費','expense',4),
  ('電費','expense',5)
on conflict (name, kind) do nothing;
