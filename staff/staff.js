/* 一坨咖啡 內部員工系統 — 共用層
 * 依賴：window.supabase（CDN）、window.JIBU_CONFIG（../config.js）
 * 用法：頁面依序載入 supabase-js → ../config.js → staff.js
 */
(function () {
  'use strict';

  const cfg = window.JIBU_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ── 金額格式（比照 ERP utils.ts）──────────────────────
  function formatCurrency(n) {
    const v = Math.round(Number(n) || 0);
    return 'NT$' + v.toLocaleString('en-US');
  }

  // ── 日期格式 ─────────────────────────────────────────
  function fmtDate(s) {
    if (!s) return '';
    return s.length >= 10 ? s.slice(0, 10).replace(/-/g, '/') : s;
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── 台灣勞基法 §24 加班費（逐字移植 PayrollClient.tsx）──
  function calcOtPay(baseSalary, weekdayOtMinutes, restdayOtMinutes) {
    if (!(baseSalary > 0)) return 0;
    const hr = baseSalary / 240; // 時薪 = 月薪 ÷ 240

    // 平日加班：前 2h ×4/3，之後 ×5/3
    const wdH = (weekdayOtMinutes || 0) / 60;
    const wdFirst2 = Math.min(wdH, 2);
    const wdRest = Math.max(wdH - 2, 0);
    const wdPay = wdFirst2 * hr * (4 / 3) + wdRest * hr * (5 / 3);

    // 休息日加班：前 2h ×(1+4/3)，2~8h ×(1+5/3)，>8h ×(1+8/3)
    const rdH = (restdayOtMinutes || 0) / 60;
    const rdFirst2 = Math.min(rdH, 2);
    const rdNext6 = Math.max(Math.min(rdH - 2, 6), 0);
    const rdOver8 = Math.max(rdH - 8, 0);
    const rdPay =
      rdFirst2 * hr * (1 + 4 / 3) +
      rdNext6 * hr * (1 + 5 / 3) +
      rdOver8 * hr * (1 + 8 / 3);

    return wdPay + rdPay;
  }

  // 薪資合計：底薪 + 加班費 + 加項 − 減項（台幣取整）
  function recalcTotal(rec, items) {
    const otPay = calcOtPay(rec.base_salary || 0, rec.ot_weekday_minutes || 0, rec.ot_restday_minutes || 0);
    const add = (items || []).filter(i => i.type === 'addition').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const ded = (items || []).filter(i => i.type === 'deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { otPay: Math.round(otPay), total: Math.round((rec.base_salary || 0) + otPay + add - ded) };
  }

  // ── 登入守衛 ─────────────────────────────────────────
  // requireAuth({ role:'owner' }) → 回傳 {user, staff}；失敗則導向登入頁
  async function requireAuth(opts) {
    opts = opts || {};
    // 用本地 session 判斷登入狀態（不打網路，手機/WebView 較穩，不會被彈回登入）
    const { data: { session } } = await sb.auth.getSession();
    const user = session && session.user;
    if (!user) { location.replace('login.html'); return null; }

    const { data: staff, error } = await sb
      .from('staff').select('*').eq('id', user.id).maybeSingle();

    // 讀取失敗（連線問題）：不要登出，回登入頁讓使用者重試
    if (error) { location.replace('login.html'); return null; }
    // 有 auth 帳號但不是員工（例如官網會員）→ 登出踢回
    if (!staff || staff.is_active === false) {
      await sb.auth.signOut();
      location.replace('login.html?denied=1');
      return null;
    }
    // 需要 owner 但身分是 employee → 踢回員工頁
    if (opts.role === 'owner' && staff.role !== 'owner') {
      location.replace('me.html');
      return null;
    }
    return { user, staff };
  }

  async function signOut() {
    await sb.auth.signOut();
    location.replace('login.html');
  }

  // ── 簡易 toast ───────────────────────────────────────
  function toast(msg, kind) {
    let el = document.getElementById('jb-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'jb-toast';
      el.className = 'jb-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'jb-toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'jb-toast'; }, 3000);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  window.JB = {
    sb,
    formatCurrency, fmtDate, todayStr,
    calcOtPay, recalcTotal,
    requireAuth, signOut,
    toast, escapeHtml,
  };
})();
