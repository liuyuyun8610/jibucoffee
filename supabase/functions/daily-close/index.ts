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

    // 自由輸入品項可選的損益科目（與後台損益表 key 一致）
    const PNL_OK = ['cost_beans', 'cost_food', 'cost_packaging', 'cost_other_cogs', 'misc_purchase', 'equip_repair', 'equip_maintain', 'water_gas', 'electric', 'other_ctrl'];
    // 0) 採購明細：庫存品項查成本；自由輸入品項（沒建庫存，例如蝦皮一次性採購）直接用填的金額
    const lines: any[] = [];
    for (const p of (b.purchases || [])) {
      if (p.custom) {
        const amt = Number(p.amount) || 0;
        const pnl = PNL_OK.includes(p.pnl_line) ? p.pnl_line : null;
        if (p.name && amt > 0) lines.push({ name: String(p.name), qty: 1, cost: amt, unit: null, category: '臨時採購', vendor: null, custom: true, pnl_line: pnl });
        continue;
      }
      const { data: st } = await admin.from('stock_items').select('*').eq('name', p.name).maybeSingle();
      lines.push({ name: p.name, qty: Number(p.qty) || 0, cost: st ? Number(st.cost || 0) : 0, unit: st?.unit ?? null, category: st?.category ?? null, vendor: st?.vendor ?? null });
    }

    // 1) 大交班主紀錄
    await admin.from('cash_counts').upsert({
      count_date: cd, tray: b.tray || {}, safe: b.safe || {},
      tray_total: Number(b.tray_total) || 0, safe_total: Number(b.safe_total) || 0, total: Number(b.total) || 0,
      linepay_total: Number(b.linepay_total) || 0, remit_total: Number(b.remit_total) || 0,
      prev_amount: b.prev_amount == null ? null : Number(b.prev_amount) || 0,
      cash_revenue: b.cash_revenue == null ? null : Number(b.cash_revenue) || 0,
      expected_total: b.expected_total == null ? null : Number(b.expected_total) || 0,
      diff: b.diff == null ? null : Number(b.diff) || 0,
      diff_reason: b.diff_reason || null,
      note: b.note || null, counted_by: user.id,
      purchases: lines.map(l => ({ name: l.name, qty: l.qty, amount: l.qty * l.cost, ...(l.custom ? { custom: true, pnl_line: l.pnl_line } : {}) })),
    }, { onConflict: 'count_date' });

    // 2) 清掉當天大交班自動產生的分錄與叫貨
    await admin.from('ledger_entries').delete().eq('source', 'daily').eq('entry_date', cd);
    await admin.from('purchases').delete().eq('source', 'daily').eq('order_date', cd);

    // 3) 帳戶
    const { data: accs } = await admin.from('accounts').select('*');
    const byName = (n: string) => (accs || []).find((a: any) => a.name === n);
    const acTray = byName('錢盤'), acSafe = byName('金庫');
    const payAcc = acTray || (accs || [])[0] || null;

    // 4) 採購：寫叫貨 + 進貨分錄（從付款帳戶）
    if (lines.length) {
      await admin.from('purchases').insert(lines.map(l => ({ order_date: cd, item_name: l.name, category: l.category, quantity: l.qty, unit: l.unit, unit_cost: l.cost, total_cost: l.qty * l.cost, supplier: l.vendor, source: 'daily', pnl_line: l.pnl_line || null })));
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

    // 6) 非現金收入：LINE Pay / 匯款 各自歸戶（後台 site_settings 設定的帳戶），記成收入分錄（不碰現金對帳）
    const { data: cfg } = await admin.from('site_settings').select('linepay_account_id,remit_account_id').eq('id', 1).maybeSingle();
    // LINE Pay 抽成 2.3%，自動記成手續費（匯款無手續費）
    const LINEPAY_FEE_RATE = 0.023;
    const nonCash = [
      { amt: Number(b.linepay_total) || 0, acc: cfg?.linepay_account_id, cat: 'LINE Pay', desc: '大交班 LINE Pay 收入', feeRate: LINEPAY_FEE_RATE },
      { amt: Number(b.remit_total)   || 0, acc: cfg?.remit_account_id,   cat: '匯款',     desc: '大交班 匯款收入', feeRate: 0 },
    ].filter(x => x.amt > 0 && x.acc);
    if (nonCash.length) {
      await admin.from('ledger_entries').insert(nonCash.map(x => ({ account_id: x.acc, type: '收入', category: x.cat, amount: x.amt, fee: Math.round(x.amt * x.feeRate), description: x.desc, entry_date: cd, source: 'daily' })));
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
