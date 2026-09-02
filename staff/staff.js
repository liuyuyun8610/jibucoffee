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

  // ── 手繪風線條小圖示（stroke SVG，取代 emoji）────────
  const _svg = inner => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const icons = {
    moon: _svg('<path d="M19.5 13.8A7.8 7.8 0 1 1 10.2 4.5a6.3 6.3 0 0 0 9.3 9.3z"/><path d="M17.4 4.4v2.6M16.1 5.7h2.6"/>'),
    lock: _svg('<rect x="5" y="10.5" width="14" height="9.5" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.2" r="1.1" fill="currentColor" stroke="none"/>'),
    star: _svg('<path d="M12 4.5l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z"/>'),
    cal: _svg('<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10.5h16M8.5 4v3.5M15.5 4v3.5"/><path d="M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" stroke-width="2.4"/>'),
    qr: _svg('<rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.8"/><rect x="13" y="4.5" width="6.5" height="6.5" rx="1.8"/><rect x="4.5" y="13" width="6.5" height="6.5" rx="1.8"/><path d="M13.5 13.5h2.8v2.8h-2.8zM19.5 13.5v2M16.5 19.5h3"/>'),
    sun: _svg('<circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/>'),
    heart: _svg('<path d="M12 19.5s-7.5-4.6-7.5-9.3A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7.5 2.8c0 4.7-7.5 9.3-7.5 9.3z"/>'),
    coffee: _svg('<path d="M5 10.5h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5z"/><path d="M16 12h1.3a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.3 4.5c0 1.2 1 1.3 1 2.5M12 4.5c0 1.2 1 1.3 1 2.5"/>'),
    cake: _svg('<rect x="4.5" y="11.5" width="15" height="8" rx="2"/><path d="M4.5 15c1.3 1.1 2.5-.9 3.8 0s2.4.9 3.7 0 2.4.9 3.7 0 2.5 1.1 3.8 0"/><path d="M8 11.5V9M12 11.5V9M16 11.5V9"/><path d="M8 6.3v.01M12 6.3v.01M16 6.3v.01" stroke-width="2.4"/>'),
    food: _svg('<path d="M7.8 4.5V20M5.8 4.5v3.7a2 2 0 0 0 4 0V4.5"/><path d="M17 4.5c-1.8 1.6-2.2 6.2-.6 8.2V20"/>'),
    gift: _svg('<rect x="4.5" y="10" width="15" height="9.5" rx="1.8"/><path d="M4.5 13.5h15M12 10v9.5"/><path d="M12 10s-4.3.3-4.3-2.5c0-1.8 2.8-1.8 4.3 2.5zM12 10s4.3.3 4.3-2.5c0-1.8-2.8-1.8-4.3 2.5z"/>'),
    plane: _svg('<path d="M4.5 12.7L19.5 5l-3.8 14.5-4-6.2z"/><path d="M11.7 13.3L19.5 5"/>'),
    car: _svg('<path d="M5.5 13.2l1.3-3.7A2 2 0 0 1 8.7 8h6.6a2 2 0 0 1 1.9 1.5l1.3 3.7"/><rect x="4" y="13.2" width="16" height="4.8" rx="1.8"/><path d="M7.5 15.6h.01M16.5 15.6h.01" stroke-width="2.4"/>'),
    home: _svg('<path d="M4.5 11L12 4.5 19.5 11"/><path d="M6.5 9.5V19.5h11V9.5"/><path d="M10 19.5v-4.7h4v4.7"/>'),
    medical: _svg('<circle cx="12" cy="12" r="7.5"/><path d="M12 9v6M9 12h6"/>'),
    tooth: _svg('<path d="M8.4 4.8c-2.3 0-3.9 1.7-3.9 4.1 0 3.8 1.6 5.7 2.4 9.2.2 1 1.6 1 1.8 0 .4-1.6.8-3.2 3.3-3.2s2.9 1.6 3.3 3.2c.2 1 1.6 1 1.8 0 .8-3.5 2.4-5.4 2.4-9.2 0-2.4-1.6-4.1-3.9-4.1-1.4 0-2.2.7-3.6.7s-2.2-.7-3.6-.7z"/>'),
    scissors: _svg('<circle cx="6.5" cy="7" r="2.2"/><circle cx="6.5" cy="17" r="2.2"/><path d="M8.4 8.3L19 17M8.4 15.7L19 7"/>'),
    camera: _svg('<rect x="4" y="7.8" width="16" height="11.2" rx="2.5"/><path d="M9 7.8l1.2-2.3h3.6L15 7.8"/><circle cx="12" cy="13.2" r="3"/>'),
    music: _svg('<path d="M9.2 17.3V6l9-1.8v11"/><circle cx="7" cy="17.3" r="2.2"/><circle cx="16" cy="15.2" r="2.2"/>'),
    book: _svg('<path d="M12 6.4C10 4.9 7 4.9 4.5 5.8v12.8c2.5-.9 5.5-.9 7.5.6 2-1.5 5-1.5 7.5-.6V5.8C17 4.9 14 4.9 12 6.4z"/><path d="M12 6.4v12.8"/>'),
    pencil: _svg('<path d="M14.7 5.3l4 4L8.2 19.8l-4.7 1.2 1.2-4.7z"/><path d="M12.7 7.3l4 4"/>'),
    phone: _svg('<path d="M7.2 4.5h3.4l1.2 4-2.4 1.5a11.5 11.5 0 0 0 4.6 4.6l1.5-2.4 4 1.2v3.4a1.9 1.9 0 0 1-2 1.9A13.7 13.7 0 0 1 5.3 6.5a1.9 1.9 0 0 1 1.9-2z"/>'),
    wrench: _svg('<path d="M14.7 6.2a4.2 4.2 0 0 0-5.3 5.1l-4.7 4.7a1.9 1.9 0 0 0 2.7 2.7l4.7-4.7a4.2 4.2 0 0 0 5.1-5.3l-2.7 2.7-2.1-.4-.4-2.1z"/>'),
    bag: _svg('<path d="M6.2 8.5h11.6l-1 11H7.2z"/><path d="M9 8.5V7.3a3 3 0 0 1 6 0v1.2"/>'),
    coin: _svg('<circle cx="12" cy="12" r="7.5"/><path d="M14.7 9.3c-2.7-1.4-5.2-.2-4.9 1.6.4 2 5.1.7 5.4 2.8.3 1.9-2.6 3-5.2 1.6M12 6.8v1.5M12 15.7v1.5"/>'),
    paw: _svg('<path d="M12 12.5c-2.4 0-4.3 1.7-4.3 3.6 0 1.4 1 2.4 2.3 2.4 1 0 1.4-.5 2-.5s1 .5 2 .5c1.3 0 2.3-1 2.3-2.4 0-1.9-1.9-3.6-4.3-3.6z"/><circle cx="6.6" cy="10.8" r="1.5"/><circle cx="10" cy="7.8" r="1.5"/><circle cx="14" cy="7.8" r="1.5"/><circle cx="17.4" cy="10.8" r="1.5"/>'),
    leaf: _svg('<path d="M6 18C6 10 10 6 19 5c-1 9-5 13-13 13z"/><path d="M6 18c2-5 5-8 9-10"/>'),
    people: _svg('<circle cx="9" cy="8.8" r="2.8"/><path d="M4.5 19c.5-3 2.2-4.6 4.5-4.6s4 1.6 4.5 4.6"/><circle cx="16.6" cy="9.3" r="2.3"/><path d="M15.2 14.6c2.4-.2 3.8 1.4 4.3 4.4"/>'),
    bell: _svg('<path d="M12 4.5a5.5 5.5 0 0 0-5.5 5.5c0 4-1.5 5.2-1.5 5.2h14s-1.5-1.2-1.5-5.2A5.5 5.5 0 0 0 12 4.5z"/><path d="M10.3 18.2a1.8 1.8 0 0 0 3.4 0"/>'),
  };
  // 私人行程可挑的圖示（挑選器順序）
  const eventIcons = ['lock', 'heart', 'star', 'sun', 'moon', 'coffee', 'cake', 'food', 'gift',
    'plane', 'car', 'home', 'cal', 'medical', 'tooth', 'scissors', 'camera', 'music', 'book',
    'pencil', 'phone', 'wrench', 'bag', 'coin', 'paw', 'leaf', 'people', 'bell'];

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
    icons, eventIcons,
  };
})();
