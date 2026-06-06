// 一坨咖啡 — 大交班結算（service role，原子處理採購+現金對帳）
// 部署：supabase functions deploy daily-close --project-ref ntmvivvhdapbckljevck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: '未授權' }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: '未授權' }, 401);
    const { data: caller } = await admin.from('staff').select('role,is_active,can_daily_close').eq('id', user.id).maybeSingle();
    if (!caller || caller.is_active === false || !(caller.role === 'owner' || caller.can_daily_close)) return json({ error: '沒有結帳權限' }, 403);

    const b = await req.json();
    const cd = b.count_date;
    if (!cd) return json({ error: '缺少日期' }, 400);

    // 1) 大交班主紀錄
    await admin.from('cash_counts').upsert({
      count_date: cd, tray: b.tray || {}, safe: b.safe || {},
      tray_total: Number(b.tray_total) || 0, safe_total: Number(b.safe_total) || 0, total: Number(b.total) || 0,
      note: b.note || null, counted_by: user.id, purchases: b.purchases || [],
    }, { onConflict: 'count_date' });

    // 2) 清掉當天大交班自動產生的分錄與叫貨
    await admin.from('ledger_entries').delete().eq('source', 'daily').eq('entry_date', cd);
    await admin.from('purchases').delete().eq('source', 'daily').eq('order_date', cd);

    // 3) 帳戶
    const { data: accs } = await admin.from('accounts').select('*');
    const byName = (n: string) => (accs || []).find((a: any) => a.name === n);
    const acTray = byName('錢盤'), acSafe = byName('金庫');
    const payAcc = acTray || (accs || [])[0] || null;

    // 4) 採購：查庫存成本 → 寫叫貨 + 進貨分錄（從付款帳戶）
    const lines: any[] = [];
    for (const p of (b.purchases || [])) {
      const { data: st } = await admin.from('stock_items').select('*').eq('name', p.name).maybeSingle();
      lines.push({ name: p.name, qty: Number(p.qty) || 0, cost: st ? Number(st.cost || 0) : 0, unit: st?.unit ?? null, category: st?.category ?? null, vendor: st?.vendor ?? null });
    }
    if (lines.length) {
      await admin.from('purchases').insert(lines.map(l => ({ order_date: cd, item_name: l.name, category: l.category, quantity: l.qty, unit: l.unit, unit_cost: l.cost, total_cost: l.qty * l.cost, supplier: l.vendor, source: 'daily' })));
      await admin.from('ledger_entries').insert(lines.map(l => ({ account_id: payAcc ? payAcc.id : null, type: '支出', category: '進貨', amount: l.qty * l.cost, description: `大交班採購：${l.name}`, entry_date: cd, source: 'daily' })));
    }

    // 5) 對帳：讀帳戶實際餘額，補一筆讓餘額＝點到的數字
    const recon = async (acc: any, target: number) => {
      const { data: ents } = await admin.from('ledger_entries').select('type,amount').eq('account_id', acc.id);
      const bal = Number(acc.initial_balance || 0) + (ents || []).reduce((s: number, e: any) => s + ((e.type === '收入' || e.type === '轉入') ? Number(e.amount || 0) : -Number(e.amount || 0)), 0);
      const d = target - bal;
      if (d) await admin.from('ledger_entries').insert({ account_id: acc.id, type: d >= 0 ? '收入' : '支出', category: '大交班現金', amount: Math.abs(d), description: '大交班結算', entry_date: cd, source: 'daily' });
    };
    if (acTray && acSafe) { await recon(acTray, Number(b.tray_total) || 0); await recon(acSafe, Number(b.safe_total) || 0); }
    else if (payAcc) { await recon(payAcc, Number(b.total) || 0); }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
