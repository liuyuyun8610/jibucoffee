// 一坨咖啡 — 員工帳號管理 Edge Function
// 只有 owner 能呼叫；用 service_role 建立 auth 帳號 / 重設密碼。
// 部署：supabase functions deploy staff-admin --project-ref ntmvivvhdapbckljevck
// 需設環境變數：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（部署時通常自動帶入 URL，service role 需自設）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1) 驗證呼叫者
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: '未授權' }, 401);
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return json({ error: '未授權' }, 401);

    // 2) 確認呼叫者是 owner
    const { data: caller } = await admin.from('staff').select('role,is_active').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'owner' || caller.is_active === false) {
      return json({ error: '只有管理者可以執行此操作' }, 403);
    }

    const body = await req.json();
    const action = body.action;

    // 3) 建立員工帳號
    if (action === 'create') {
      const { email, password, profile } = body;
      if (!email || !password) return json({ error: '缺少 email 或密碼' }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (cErr || !created.user) return json({ error: cErr?.message || '建立帳號失敗' }, 400);

      // 濾掉 null/空字串，讓資料表的預設值生效（避免 not-null 欄位如 base_salary 被塞 null）
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(profile || {})) {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      }
      const row = { id: created.user.id, email, role: 'employee', ...clean };
      const { error: iErr } = await admin.from('staff').insert(row);
      if (iErr) {
        // 回滾：刪掉剛建立的 auth 帳號，避免孤兒
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: '寫入員工資料失敗：' + iErr.message }, 400);
      }
      return json({ ok: true, id: created.user.id });
    }

    // 4) 重設密碼
    if (action === 'reset_password') {
      const { user_id, password } = body;
      if (!user_id || !password) return json({ error: '缺少參數' }, 400);
      const { error: rErr } = await admin.auth.admin.updateUserById(user_id, { password });
      if (rErr) return json({ error: rErr.message }, 400);
      return json({ ok: true });
    }

    // 5) 修改登入 Email（同步改 auth 帳號 + staff 表）
    if (action === 'update_email') {
      const { user_id, email } = body;
      if (!user_id || !email) return json({ error: '缺少參數' }, 400);
      const { error: eErr } = await admin.auth.admin.updateUserById(user_id, { email, email_confirm: true });
      if (eErr) return json({ error: eErr.message }, 400);
      const { error: sErr } = await admin.from('staff').update({ email }).eq('id', user_id);
      if (sErr) return json({ error: '帳號已改，但寫入員工資料失敗：' + sErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: '未知的 action' }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
