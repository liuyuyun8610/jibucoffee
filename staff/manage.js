/* 一坨咖啡 後台 manage.html 邏輯（人事 / 薪資 / 營收）*/
(function () {
  'use strict';
  const { sb, requireAuth, signOut, formatCurrency, fmtDate, todayStr, calcOtPay, recalcTotal, toast, escapeHtml } = JB;
  const F = id => document.getElementById(id);

  let ME = null;
  let staffList = [];
  let categories = [];

  document.getElementById('logout').addEventListener('click', signOut);

  // 分頁切換
  function writeHash(tab, sub) {
    let h = tab;
    if (tab === 'people') h = `people${sub && sub !== 'hr' ? ':' + sub : ''}`;
    else if (tab === 'finance') h = `finance${sub && sub !== 'ledger' ? ':' + sub : ''}`;
    if (location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h);
  }
  function currentSub() {
    const a = document.querySelector('.subtab.active');
    return a ? a.dataset.sub : 'hr';
  }
  function activateSub(name) {
    if (!document.querySelector(`.subtab[data-sub="${name}"]`)) name = 'hr';
    document.querySelectorAll('.subtab').forEach(x => x.classList.toggle('active', x.dataset.sub === name));
    document.querySelectorAll('[data-subpane]').forEach(p => p.classList.toggle('hidden', p.dataset.subpane !== name));
    if (name === 'payroll') loadPayrollMonth();
    if (name === 'reviews') loadReviews();
    if (name === 'attend') loadAttendanceSummary();
    if (name === 'shifts') loadShifts();
    if (name === 'announce') loadAnnounce();
    writeHash('people', name);
  }
  // 財務分頁的子分頁（帳本 / 財務報表 / 財務設定）
  let curFsub = 'ledger';
  function activateFsub(name) {
    if (!document.querySelector(`.fsubtab[data-fsub="${name}"]`)) name = 'ledger';
    curFsub = name;
    document.querySelectorAll('.fsubtab').forEach(x => x.classList.toggle('active', x.dataset.fsub === name));
    document.querySelectorAll('[data-fsubpane]').forEach(p => p.classList.toggle('hidden', p.dataset.fsubpane !== name));
    if (name === 'ledger' || name === 'finset') loadLedger(); // 兩者都要帳戶清單（歸戶下拉）
    if (name === 'handover') loadHandover();
    if (name === 'reports') loadReports();
    writeHash('finance', name);
  }
  function activateTab(name, sub) {
    if (!document.querySelector(`.tab[data-tab="${name}"]`)) name = 'people';
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
    if (name === 'revenue') loadRevenue();
    if (name === 'pnl') loadPnl();
    if (name === 'inventory') loadInventory();
    if (name === 'maintenance') loadMaintenance();
    if (name === 'insights') loadInsights();
    if (name === 'people') activateSub(sub || currentSub());
    else if (name === 'finance') activateFsub(sub || curFsub);
    else writeHash(name);
  }

  document.querySelectorAll('.tab[data-tab]').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
  document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => activateSub(t.dataset.sub)));
  document.querySelectorAll('.fsubtab').forEach(t => t.addEventListener('click', () => activateFsub(t.dataset.fsub)));

  (async () => {
    const auth = await requireAuth({ role: 'owner' });
    if (!auth) return;
    ME = auth.staff;
    F('who').textContent = ME.name;
    F('app').style.opacity = 1;
    const { data: cats } = await sb.from('payroll_categories').select('*').order('created_at');
    categories = cats || [];
    await loadStaff();
    initPayrollNav();
    initAttendNav();
    initShiftNav();
    refreshReviewBadge();
    // 還原重整前所在的分頁（網址 hash）
    const hp = location.hash.slice(1).split(':');
    activateTab(hp[0] || 'people', hp[1]);
  })();

  async function loadStaff() {
    const { data } = await sb.from('staff').select('*').order('created_at');
    staffList = data || [];
    renderEmpList();
    renderPayEmpList();
  }

  /* ============================================================
   * 1) 人事管理
   * ========================================================== */
  function renderEmpList() {
    F('hrCount').textContent = staffList.length;
    F('empList').innerHTML = staffList.map(s => `
      <div class="list-row" data-id="${s.id}">
        <div class="flex">
          <div class="avatar">${escapeHtml((s.name || '?').slice(0,1))}</div>
          <div>
            <div style="font-weight:500">${escapeHtml(s.name)} ${s.role === 'owner' ? '<span class="badge badge-ok">管理者</span>' : ''} ${s.is_active === false ? '<span class="badge badge-wait">停用</span>' : ''}</div>
            <div class="faint">${escapeHtml(s.position || s.department || s.email || '')}</div>
          </div>
        </div>
        <span class="faint">${s.base_salary ? formatCurrency(s.base_salary) : ''} ›</span>
      </div>`).join('') || '<div class="list-row muted faint">尚無員工，點右上「新增員工」</div>';
    F('empList').querySelectorAll('.list-row[data-id]').forEach(row =>
      row.addEventListener('click', () => openEmpModal(row.dataset.id)));
  }

  const EMP_FIELDS = ['name','employee_no','role','department','position','hire_date','phone','employ_type','base_salary','hourly_rate','insured_salary','labor_insurance','health_insurance','pension','birthday','id_number','address','emergency_contact','emergency_phone','emergency_relation','bank_name','bank_account','bank_account_name'];
  let editingId = null;

  let origEmail = '';
  F('addEmp').addEventListener('click', () => openEmpModal(null));
  F('empCancel').addEventListener('click', () => F('empModal').classList.remove('show'));
  F('genPw').addEventListener('click', () => { F('e_password').value = randPw(); });

  function randPw() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = ''; const a = crypto.getRandomValues(new Uint32Array(8));
    for (let i = 0; i < 8; i++) s += c[a[i] % c.length];
    return s;
  }

  function openEmpModal(id) {
    editingId = id;
    const s = id ? staffList.find(x => x.id === id) : null;
    F('empModalTitle').textContent = s ? '編輯員工' : '新增員工';
    F('e_err').textContent = '';
    // 密碼欄只在新增時出現；email 兩種模式都可填／改
    F('pwField').style.display = s ? 'none' : 'block';
    F('e_email').value = s ? (s.email || '') : '';
    F('e_password').value = s ? '' : randPw();
    origEmail = s ? (s.email || '') : '';
    EMP_FIELDS.forEach(k => { if (F('e_' + k)) F('e_' + k).value = (s && s[k] != null) ? s[k] : (k === 'role' ? 'employee' : k === 'employ_type' ? 'FT' : ''); });
    F('e_can_daily_close').checked = !!(s && s.can_daily_close);

    // 編輯模式的額外動作（重設密碼 / 停用）
    const extra = F('editExtra'); extra.innerHTML = '';
    if (s) {
      const rp = document.createElement('button');
      rp.className = 'btn btn-ghost btn-sm'; rp.textContent = '重設密碼';
      rp.onclick = () => resetPassword(s);
      extra.appendChild(rp);
      const tg = document.createElement('button');
      tg.className = 'btn btn-ghost btn-sm';
      tg.textContent = s.is_active === false ? '重新啟用' : '停用';
      tg.onclick = () => toggleActive(s);
      extra.appendChild(tg);
    }
    F('empModal').classList.add('show');
  }

  function collectEmp() {
    const p = {};
    EMP_FIELDS.forEach(k => {
      let v = F('e_' + k) ? F('e_' + k).value.trim() : '';
      if (k === 'base_salary' || k === 'hourly_rate') v = v === '' ? 0 : Number(v);
      else if (k === 'insured_salary') v = v === '' ? null : Number(v);
      else if (k === 'employ_type') v = v || 'FT';
      else if (v === '') v = null;
      p[k] = v;
    });
    return p;
  }

  F('empSave').addEventListener('click', async () => {
    const btn = F('empSave'); F('e_err').textContent = '';
    const profile = collectEmp();
    profile.can_daily_close = F('e_can_daily_close').checked;
    if (!profile.name) { F('e_err').textContent = '請填姓名'; return; }
    btn.disabled = true; btn.textContent = '儲存中…';

    if (editingId) {
      const newEmail = F('e_email').value.trim();
      if (!newEmail) { btn.disabled = false; btn.textContent = '儲存'; F('e_err').textContent = '請填登入 Email'; return; }
      // email 有變更 → 走後端同步改 auth 帳號 + staff
      if (newEmail !== origEmail) {
        const { data, error: fErr } = await sb.functions.invoke('staff-admin', { body: { action: 'update_email', user_id: editingId, email: newEmail } });
        if (fErr || (data && data.error)) { btn.disabled = false; btn.textContent = '儲存'; F('e_err').textContent = '修改 Email 失敗：' + (data?.error || fErr.message); return; }
        origEmail = newEmail;
      }
      const { error } = await sb.from('staff').update(profile).eq('id', editingId);
      btn.disabled = false; btn.textContent = '儲存';
      if (error) { F('e_err').textContent = '儲存失敗：' + error.message; return; }
      toast('✅ 已更新'); F('empModal').classList.remove('show'); await loadStaff();
    } else {
      const email = F('e_email').value.trim();
      const password = F('e_password').value.trim();
      if (!email || !password) { btn.disabled = false; btn.textContent = '儲存'; F('e_err').textContent = '請填登入 Email 與臨時密碼'; return; }
      profile.email = email;
      const { data, error } = await sb.functions.invoke('staff-admin', { body: { action: 'create', email, password, profile } });
      btn.disabled = false; btn.textContent = '儲存';
      if (error || (data && data.error)) {
        F('e_err').textContent = '建立失敗：' + (data?.error || error.message);
        return;
      }
      F('empModal').classList.remove('show');
      toast('✅ 已建立帳號');
      alert(`已建立員工帳號：\n\nEmail：${email}\n臨時密碼：${password}\n\n請把這組帳密交給員工，並提醒他登入後到「個人資料」確認資料。`);
      await loadStaff();
    }
  });

  async function resetPassword(s) {
    const pw = prompt(`為「${s.name}」設定新密碼（直接交給員工）：`, randPw());
    if (!pw) return;
    const { data, error } = await sb.functions.invoke('staff-admin', { body: { action: 'reset_password', user_id: s.id, password: pw } });
    if (error || (data && data.error)) { toast('重設失敗：' + (data?.error || error.message), 'error'); return; }
    alert(`已重設「${s.name}」的密碼為：\n\n${pw}\n\n請交給員工。`);
  }

  async function toggleActive(s) {
    const next = !(s.is_active === false) ? false : true;
    const { error } = await sb.from('staff').update({ is_active: next }).eq('id', s.id);
    if (error) { toast('操作失敗：' + error.message, 'error'); return; }
    toast(next ? '已重新啟用' : '已停用');
    F('empModal').classList.remove('show'); await loadStaff();
  }

  /* ============================================================
   * 2) 薪資計算
   * ========================================================== */
  let pYear, pMonth, monthRecords = [], selectedEmpId = null, editRec = null, editItems = [], editEmp = null;

  function initPayrollNav() {
    const d = new Date();
    // 預設為上個月（本月發上個月薪資）
    pYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    pMonth = d.getMonth() === 0 ? 12 : d.getMonth();
    F('pm-prev').addEventListener('click', () => { shiftMonth(-1); });
    F('pm-next').addEventListener('click', () => { shiftMonth(1); });
  }
  function shiftMonth(dir) {
    let m = pMonth + dir, y = pYear;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    pYear = y; pMonth = m; selectedEmpId = null;
    loadPayrollMonth();
  }
  function renderPayEmpList() {
    F('payEmpList').innerHTML = staffList.filter(s => s.is_active !== false).map(s => {
      const rec = monthRecords.find(r => r.staff_id === s.id);
      return `<div class="list-row ${selectedEmpId === s.id ? 'active' : ''}" data-id="${s.id}">
        <div><div style="font-weight:500">${escapeHtml(s.name)}</div><div class="faint">${escapeHtml(s.position || '')}</div></div>
        ${rec ? `<span class="badge badge-ok">${formatCurrency(rec.total_pay)}</span>` : '<span class="badge badge-wait">未計算</span>'}
      </div>`;
    }).join('');
    F('payEmpList').querySelectorAll('.list-row[data-id]').forEach(row =>
      row.addEventListener('click', () => selectEmp(row.dataset.id)));
  }

  async function loadPayrollMonth() {
    F('pm-label').textContent = `薪資所屬 ${pYear}年${pMonth}月`;
    F('pm-paylabel').textContent = `${pMonth === 12 ? pYear + 1 : pYear}年${pMonth === 12 ? 1 : pMonth + 1}月發放`;
    const { data } = await sb.from('payroll_records').select('*').eq('year', pYear).eq('month', pMonth);
    monthRecords = data || [];
    renderPayEmpList();
    if (selectedEmpId) selectEmp(selectedEmpId); else F('payDetail').innerHTML = '<div class="card center-screen muted faint">← 選擇左側員工開始計算</div>';
  }

  // 加總某員工某月打卡時數（上班~下班），回傳小時（一位小數）
  async function attendanceHours(staffId, year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endD = new Date(year, month, 0);
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
    const { data } = await sb.from('attendance').select('clock_in,clock_out').eq('staff_id', staffId).gte('work_date', start).lte('work_date', endStr);
    let mins = 0;
    (data || []).forEach(a => { if (a.clock_in && a.clock_out) mins += (new Date(a.clock_out) - new Date(a.clock_in)) / 60000; });
    return Math.round(mins / 60 * 10) / 10;
  }

  async function selectEmp(empId) {
    selectedEmpId = empId;
    renderPayEmpList();
    const emp = staffList.find(s => s.id === empId);
    editEmp = emp;
    await ensureAccounts();
    const isPT = emp.employ_type === 'PT';
    const existing = monthRecords.find(r => r.staff_id === empId);
    if (existing) {
      const { data: items } = await sb.from('payroll_items').select('*').eq('payroll_id', existing.id);
      editRec = { ...existing };
      if (isPT && !editRec.hourly_rate) editRec.hourly_rate = emp.hourly_rate || 0;
      editItems = items || [];
    } else if (isPT) {
      const hrs = await attendanceHours(empId, pYear, pMonth);   // 自動帶入打卡時數
      editRec = {
        staff_id: empId, year: pYear, month: pMonth, base_salary: 0, work_days: 0, work_hours: hrs,
        hourly_rate: emp.hourly_rate || 0, ot_weekday_minutes: 0, ot_restday_minutes: 0, ot_pay: 0, total_pay: 0, note: '',
      };
      editItems = [];
    } else {
      editRec = {
        staff_id: empId, year: pYear, month: pMonth,
        base_salary: emp.base_salary || 0, work_days: 0,
        ot_weekday_minutes: 0, ot_restday_minutes: 0, ot_pay: 0, total_pay: emp.base_salary || 0, note: '',
      };
      editItems = [];
    }
    recalcPay();
    renderPayDetail(emp);
  }

  // 依雇用類型計算：PT=時薪×時數；FT=月薪+加班費。結果寫回 editRec。
  function recalcPay() {
    const add = editItems.filter(i => i.type === 'addition').reduce((s, i) => s + num(i.amount), 0);
    const ded = editItems.filter(i => i.type === 'deduction').reduce((s, i) => s + num(i.amount), 0);
    if (editEmp && editEmp.employ_type === 'PT') {
      const base = Math.round((editRec.hourly_rate || 0) * (editRec.work_hours || 0));
      editRec.base_salary = base; editRec.ot_pay = 0;
      editRec.total_pay = Math.round(base + add - ded);
    } else {
      const { otPay, total } = recalcTotal(editRec, editItems);
      editRec.ot_pay = otPay; editRec.total_pay = total;
    }
  }

  function renderPayDetail(emp) {
    const r = editRec;
    const isPT = emp.employ_type === 'PT';
    const hr = (r.base_salary || 0) / 240;
    const basicCard = isPT ? `
      <div class="card">
        <h2 class="card-h">${escapeHtml(emp.name)} <span class="badge badge-wait">PT 時薪制</span> — ${pYear}/${String(pMonth).padStart(2,'0')} 薪資</h2>
        <div class="grid3">
          <div class="field"><label class="label">時薪</label><input class="input" type="number" id="f_hourly" value="${r.hourly_rate || ''}"></div>
          <div class="field"><label class="label">本月工作時數 <button type="button" id="f_pullhours" class="btn btn-ghost btn-sm" style="padding:1px 8px;font-size:11px;margin-left:4px">↻ 帶入打卡</button></label><input class="input" type="number" id="f_hours" value="${r.work_hours || ''}"></div>
          <div class="field"><label class="label">薪資小計（時薪×時數）</label><input class="input" readonly id="f_basepay" value="${formatCurrency(r.base_salary || 0)}"></div>
        </div>
      </div>` : `
      <div class="card">
        <h2 class="card-h">${escapeHtml(emp.name)} — ${pYear}/${String(pMonth).padStart(2,'0')} 薪資</h2>
        <div class="grid3">
          <div class="field"><label class="label">月薪（底薪）</label><input class="input" type="number" id="f_base" value="${r.base_salary || ''}"></div>
          <div class="field"><label class="label">出勤天數</label><input class="input" type="number" id="f_days" value="${r.work_days || ''}"></div>
          <div class="field"><label class="label">時薪（底薪÷240）</label><input class="input" readonly value="${hr.toFixed(2)}"></div>
          <div class="field"><label class="label">平日加班（分鐘）</label><input class="input" type="number" id="f_wd" value="${r.ot_weekday_minutes || ''}"></div>
          <div class="field"><label class="label">休息日加班（分鐘）</label><input class="input" type="number" id="f_rd" value="${r.ot_restday_minutes || ''}"></div>
          <div class="field"><label class="label">加班費小計</label><input class="input" readonly id="f_otpay" value="${formatCurrency(r.ot_pay || 0)}"></div>
        </div>
        <div id="otDetail"></div>
      </div>`;
    F('payDetail').innerHTML = basicCard + `
      <div class="card">
        <div class="row-between" style="margin-bottom:10px">
          <h2 class="card-h" style="margin:0">自訂項目（獎金/扣款）</h2>
          <div class="flex">
            <button class="btn btn-ghost btn-sm" id="addAdd">＋ 加項</button>
            <button class="btn btn-ghost btn-sm" id="addDed">＋ 減項</button>
          </div>
        </div>
        <div id="itemList"></div>
      </div>
      <div class="card">
        <div class="row-between">
          <h2 class="card-h" style="margin:0">本月薪資合計</h2>
          <div style="font-family:var(--f-serif);font-size:24px;font-weight:700;color:var(--accent-deep)" id="f_total">${formatCurrency(r.total_pay || 0)}</div>
        </div>
        <div class="field mt8"><label class="label">備註</label><textarea class="input" id="f_note" rows="2">${escapeHtml(r.note || '')}</textarea></div>
        <button class="btn btn-primary btn-block" id="saveRec">儲存薪資記錄</button>
      </div>
      <div class="card">
        <h2 class="card-h">薪資發放紀錄</h2>
        <div id="payBox"></div>
      </div>
      <div class="card">
        <h2 class="card-h">本月打卡明細 <span class="faint" id="payAttSum"></span></h2>
        <div style="overflow-x:auto">
          <table class="tbl" id="payAttTable">
            <thead><tr><th>日期</th><th>上班</th><th>下班</th><th class="num">工時</th></tr></thead>
            <tbody><tr><td colspan="4" class="muted faint">載入中…</td></tr></tbody>
          </table>
        </div>
      </div>`;

    if (emp.employ_type === 'PT') {
      F('f_hourly').addEventListener('input', () => updateField('hourly_rate', num(F('f_hourly').value)));
      F('f_hours').addEventListener('input', () => updateField('work_hours', num(F('f_hours').value)));
      F('f_pullhours').addEventListener('click', async () => {
        const hrs = await attendanceHours(editRec.staff_id, pYear, pMonth);
        F('f_hours').value = hrs; updateField('work_hours', hrs); toast(`已帶入打卡時數 ${hrs} 小時`);
      });
    } else {
      F('f_base').addEventListener('input', () => updateField('base_salary', num(F('f_base').value)));
      F('f_days').addEventListener('input', () => { editRec.work_days = num(F('f_days').value); });
      F('f_wd').addEventListener('input', () => updateField('ot_weekday_minutes', num(F('f_wd').value)));
      F('f_rd').addEventListener('input', () => updateField('ot_restday_minutes', num(F('f_rd').value)));
    }
    F('f_note').addEventListener('input', () => { editRec.note = F('f_note').value; });
    F('addAdd').addEventListener('click', () => { editItems.push({ name: '', amount: 0, type: 'addition' }); renderItems(); refreshTotals(); });
    F('addDed').addEventListener('click', () => { editItems.push({ name: '', amount: 0, type: 'deduction' }); renderItems(); refreshTotals(); });
    F('saveRec').addEventListener('click', saveRecord);
    renderItems(); renderOtDetail(); renderPayBox();
    loadPayAttendance(editRec.staff_id);
  }

  async function loadPayAttendance(staffId) {
    const start = `${pYear}-${String(pMonth).padStart(2, '0')}-01`;
    const endD = new Date(pYear, pMonth, 0);
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
    const { data } = await sb.from('attendance').select('*').eq('staff_id', staffId).gte('work_date', start).lte('work_date', endStr).order('work_date');
    if (!F('payAttTable')) return;
    const recs = data || [];
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    const hhmm = t => t ? new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '—';
    let totalMin = 0;
    const wt = a => { if (!(a.clock_in && a.clock_out)) return '—'; const m = Math.round((new Date(a.clock_out) - new Date(a.clock_in)) / 60000); totalMin += m; return `${Math.floor(m / 60)}h${m % 60}m`; };
    const body = recs.map(a => `<tr><td style="white-space:nowrap">${a.work_date.replace(/-/g,'/').slice(5)} (${WEEK[new Date(a.work_date).getDay()]})</td><td>${hhmm(a.clock_in)}</td><td>${hhmm(a.clock_out)}</td><td class="num">${wt(a)}</td></tr>`).join('');
    F('payAttTable').querySelector('tbody').innerHTML = recs.length ? body : '<tr><td colspan="4" class="muted faint">本月無打卡紀錄</td></tr>';
    if (F('payAttSum')) F('payAttSum').textContent = recs.length ? `— 合計 ${Math.round(totalMin / 60 * 10) / 10} 小時` : '';
  }

  const num = v => Number(v) || 0;
  function updateField(k, v) { editRec[k] = v; refreshTotals(); renderOtDetail(); }
  function refreshTotals() {
    recalcPay();
    if (F('f_otpay')) F('f_otpay').value = formatCurrency(editRec.ot_pay || 0);
    if (F('f_basepay')) F('f_basepay').value = formatCurrency(editRec.base_salary || 0);
    if (F('f_total')) F('f_total').textContent = formatCurrency(editRec.total_pay || 0);
  }
  function renderOtDetail() {
    if (!F('otDetail')) return;   // PT 沒有加班明細區
    const r = editRec, hr = (r.base_salary || 0) / 240;
    const wdH = (r.ot_weekday_minutes || 0) / 60, rdH = (r.ot_restday_minutes || 0) / 60;
    if (!(wdH > 0 || rdH > 0)) { F('otDetail').innerHTML = ''; return; }
    let h = '<div class="ot-detail"><div style="font-weight:600;color:var(--accent-deep);margin-bottom:4px">加班費明細（勞基法§24）</div>';
    if (wdH > 0) {
      h += `<div>平日前2h：${Math.min(wdH,2).toFixed(2)}h × ${hr.toFixed(2)} × 4/3 = <b>${formatCurrency(Math.min(wdH,2)*hr*4/3)}</b></div>`;
      if (wdH > 2) h += `<div>平日2h後：${(wdH-2).toFixed(2)}h × ${hr.toFixed(2)} × 5/3 = <b>${formatCurrency((wdH-2)*hr*5/3)}</b></div>`;
    }
    if (rdH > 0) {
      h += `<div>休息日前2h：${Math.min(rdH,2).toFixed(2)}h × ${hr.toFixed(2)} × (1+4/3) = <b>${formatCurrency(Math.min(rdH,2)*hr*(1+4/3))}</b></div>`;
      if (rdH > 2) h += `<div>休息日2~8h：${(Math.min(rdH,8)-2).toFixed(2)}h × ${hr.toFixed(2)} × (1+5/3) = <b>${formatCurrency((Math.min(rdH,8)-2)*hr*(1+5/3))}</b></div>`;
      if (rdH > 8) h += `<div>休息日>8h：${(rdH-8).toFixed(2)}h × ${hr.toFixed(2)} × (1+8/3) = <b>${formatCurrency((rdH-8)*hr*(1+8/3))}</b></div>`;
    }
    F('otDetail').innerHTML = h + '</div>';
  }
  function renderItems() {
    if (!editItems.length) { F('itemList').innerHTML = '<p class="faint">點右上角新增獎金、全勤或扣項</p>'; return; }
    F('itemList').innerHTML = editItems.map((it, i) => `
      <div class="item-row">
        <span class="badge ${it.type === 'addition' ? 'badge-add' : 'badge-ded'}">${it.type === 'addition' ? '加' : '減'}</span>
        <select class="input" data-i="${i}" data-f="name" style="flex:1">
          <option value="">選擇項目…</option>
          ${categories.filter(c => c.type === it.type).map(c => `<option ${c.name === it.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          ${it.name && !categories.some(c => c.type === it.type && c.name === it.name) ? `<option selected>${escapeHtml(it.name)}</option>` : ''}
          <option value="__add__">＋ 新增類別…</option>
        </select>
        <input class="input" style="width:110px" type="number" placeholder="金額" data-i="${i}" data-f="amount" value="${it.amount || ''}">
        <button class="btn btn-danger btn-sm" data-del="${i}">✕</button>
      </div>`).join('');
    F('itemList').querySelectorAll('select[data-f="name"]').forEach(sel =>
      sel.addEventListener('change', async () => {
        const i = +sel.dataset.i;
        if (sel.value === '__add__') {
          const name = prompt('新增類別名稱：');
          if (name && name.trim()) {
            const type = editItems[i].type;
            const { data } = await sb.from('payroll_categories').insert({ name: name.trim(), type }).select().single();
            if (data) categories.push(data);
            editItems[i].name = name.trim();
          }
          renderItems();
        } else { editItems[i].name = sel.value; }
      }));
    F('itemList').querySelectorAll('input[data-f="amount"]').forEach(inp =>
      inp.addEventListener('input', () => { editItems[+inp.dataset.i].amount = num(inp.value); refreshTotals(); }));
    F('itemList').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => { editItems.splice(+b.dataset.del, 1); renderItems(); refreshTotals(); }));
  }

  async function saveRecord() {
    const btn = F('saveRec'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      staff_id: editRec.staff_id, year: pYear, month: pMonth,
      base_salary: editRec.base_salary || 0, work_days: editRec.work_days || 0,
      work_hours: editRec.work_hours || 0, hourly_rate: editRec.hourly_rate || 0,
      ot_weekday_minutes: editRec.ot_weekday_minutes || 0, ot_restday_minutes: editRec.ot_restday_minutes || 0,
      ot_pay: editRec.ot_pay || 0, total_pay: editRec.total_pay || 0, note: editRec.note || null,
    };
    const { data: saved, error } = await sb.from('payroll_records')
      .upsert(payload, { onConflict: 'staff_id,year,month' }).select().single();
    if (error) { btn.disabled = false; btn.textContent = '儲存薪資記錄'; toast('儲存失敗：' + error.message, 'error'); return; }
    // 重寫明細
    await sb.from('payroll_items').delete().eq('payroll_id', saved.id);
    const items = editItems.filter(i => i.name && i.amount).map(i => ({ payroll_id: saved.id, name: i.name, amount: i.amount, type: i.type }));
    if (items.length) await sb.from('payroll_items').insert(items);
    editRec = { ...saved };
    const idx = monthRecords.findIndex(r => r.staff_id === saved.staff_id);
    if (idx >= 0) monthRecords[idx] = saved; else monthRecords.push(saved);
    btn.disabled = false; btn.textContent = '儲存薪資記錄';
    toast('✅ 已存入薪資紀錄');
    renderPayEmpList(); renderPayBox();
  }

  /* 發放紀錄 + 憑證 */
  function renderPayBox() {
    const box = F('payBox');
    if (!editRec.id) { box.innerHTML = '<p class="faint">請先「儲存薪資記錄」，即可在此記錄發放與上傳轉帳憑證。</p>'; return; }
    if (editRec.paid_at) {
      box.innerHTML = `
        <div class="flex" style="color:var(--ok);font-weight:500"><span>✓ 已於 ${fmtDate(editRec.paid_at)} 發放</span></div>
        ${editRec.paid_note ? `<p class="faint mt8">備註：${escapeHtml(editRec.paid_note)}</p>` : ''}
        <div class="flex mt8">
          ${editRec.paid_proof_path ? '<button class="btn btn-ghost btn-sm" id="viewProof">看轉帳憑證</button>' : ''}
          <button class="btn btn-ghost btn-sm" id="editPay">修改</button>
          <button class="btn btn-danger btn-sm" id="clearPay">取消發放</button>
        </div>`;
      if (F('viewProof')) F('viewProof').addEventListener('click', viewProof);
      F('editPay').addEventListener('click', () => renderPayForm());
      F('clearPay').addEventListener('click', clearPayment);
    } else { renderPayForm(); }
  }
  function renderPayForm() {
    F('payBox').innerHTML = `
      <div class="grid2">
        <div class="field"><label class="label">入帳日期</label><input class="input" type="date" id="pay_date" value="${editRec.paid_at ? editRec.paid_at.slice(0,10) : todayStr()}"></div>
        <div class="field"><label class="label">備註（選填）</label><input class="input" id="pay_note" value="${escapeHtml(editRec.paid_note || '')}"></div>
      </div>
      <div class="field"><label class="label">出款帳戶（帳本扣款）</label><select class="input" id="pay_account">${accountOptions('')}</select></div>
      <div class="field"><label class="label">轉帳憑證圖片（選填）</label><input type="file" accept="image/*" id="pay_file"></div>
      <button class="btn btn-primary btn-sm" id="savePay">記錄發放</button>`;
    F('savePay').addEventListener('click', savePayment);
    if (editRec.id) (async () => {
      const { data: le } = await sb.from('ledger_entries').select('account_id').eq('source', 'payroll').eq('source_id', editRec.id).maybeSingle();
      if (le && F('pay_account')) F('pay_account').value = le.account_id;
    })();
  }
  async function savePayment() {
    const btn = F('savePay'); const date = F('pay_date').value;
    if (!date) { toast('請選擇入帳日期', 'error'); return; }
    btn.disabled = true; btn.textContent = '儲存中…';
    const patch = { paid_at: date, paid_note: F('pay_note').value.trim() || null };
    const file = F('pay_file').files[0];
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${editRec.staff_id}/${editRec.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('payroll-proofs').upload(path, file, { upsert: true });
      if (upErr) { btn.disabled = false; btn.textContent = '記錄發放'; toast('憑證上傳失敗：' + upErr.message, 'error'); return; }
      patch.paid_proof_path = path;
    }
    const { error } = await sb.from('payroll_records').update(patch).eq('id', editRec.id);
    btn.disabled = false; btn.textContent = '記錄發放';
    if (error) { toast('儲存失敗：' + error.message, 'error'); return; }
    Object.assign(editRec, patch);
    // 連動帳本：選了出款帳戶就記一筆「支出・薪資」
    const accId = F('pay_account') ? F('pay_account').value : '';
    await sb.from('ledger_entries').delete().eq('source', 'payroll').eq('source_id', editRec.id);
    if (accId) await sb.from('ledger_entries').insert({ account_id: accId, type: '支出', category: '薪資', amount: editRec.total_pay || 0, description: `薪資發放：${editEmp ? editEmp.name : ''} ${pYear}/${pMonth}`, entry_date: F('pay_date').value, source: 'payroll', source_id: editRec.id });
    toast('✅ 已記錄發放');
    renderPayBox();
  }
  async function clearPayment() {
    if (!confirm('確定取消此筆發放紀錄？憑證也會一併刪除。')) return;
    if (editRec.paid_proof_path) await sb.storage.from('payroll-proofs').remove([editRec.paid_proof_path]);
    const { error } = await sb.from('payroll_records').update({ paid_at: null, paid_note: null, paid_proof_path: null }).eq('id', editRec.id);
    if (error) { toast('操作失敗：' + error.message, 'error'); return; }
    await sb.from('ledger_entries').delete().eq('source', 'payroll').eq('source_id', editRec.id);
    editRec.paid_at = null; editRec.paid_note = null; editRec.paid_proof_path = null;
    renderPayBox();
  }
  async function viewProof() {
    const { data, error } = await sb.storage.from('payroll-proofs').createSignedUrl(editRec.paid_proof_path, 3600);
    if (error) { toast('讀取憑證失敗', 'error'); return; }
    window.open(data.signedUrl, '_blank');
  }

  /* ============================================================
   * 3) 營收預測
   * ========================================================== */
  let revRecords = [], laborByMonth = {}, revChart = null;

  async function loadRevenue() {
    const [{ data: rev }, { data: pays }] = await Promise.all([
      sb.from('revenue_records').select('*'),
      sb.from('payroll_records').select('year,month,total_pay'),
    ]);
    revRecords = (rev || []).sort((a, b) => a.year - b.year || a.month - b.month);
    laborByMonth = {};
    (pays || []).forEach(p => { const k = `${p.year}-${p.month}`; laborByMonth[k] = (laborByMonth[k] || 0) + Number(p.total_pay || 0); });
    renderRevTable(); renderRevChart(); renderForecast();
  }
  function monthKey(r) { return `${r.year}-${r.month}`; }
  function otherSum(r) { return (r.other_costs || []).reduce((s, c) => s + Number(c.amount || 0), 0); }
  function netOf(r) { return Number(r.revenue || 0) - (laborByMonth[monthKey(r)] || 0) - otherSum(r); }

  function renderRevTable() {
    const tb = F('revTable').querySelector('tbody');
    if (!revRecords.length) { tb.innerHTML = '<tr><td colspan="6" class="muted faint">尚無營收紀錄</td></tr>'; return; }
    tb.innerHTML = revRecords.map(r => {
      const labor = laborByMonth[monthKey(r)] || 0, net = netOf(r);
      return `<tr data-id="${r.id}" style="cursor:pointer">
        <td>${r.year}/${String(r.month).padStart(2,'0')}</td>
        <td class="num">${formatCurrency(r.revenue)}</td>
        <td class="num">${formatCurrency(labor)}</td>
        <td class="num">${formatCurrency(otherSum(r))}</td>
        <td class="num" style="color:${net >= 0 ? 'var(--ok)' : 'var(--danger)'};font-weight:600">${net >= 0 ? '' : '-'}${formatCurrency(Math.abs(net))}</td>
        <td class="num faint">編輯 ›</td></tr>`;
    }).join('');
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openRevModal(tr.dataset.id)));
  }

  function renderRevChart() {
    const labels = revRecords.map(r => `${r.month}月`);
    const revenue = revRecords.map(r => Number(r.revenue || 0));
    const net = revRecords.map(r => netOf(r));
    if (revChart) revChart.destroy();
    if (!revRecords.length) return;
    revChart = new Chart(F('revChart'), {
      type: 'line',
      data: { labels, datasets: [
        { label: '營收', data: revenue, borderColor: '#8b6f47', backgroundColor: 'rgba(139,111,71,.08)', tension: .3, fill: true },
        { label: '淨利', data: net, borderColor: '#6b8e6b', backgroundColor: 'rgba(107,142,107,.08)', tension: .3, fill: true },
      ]},
      options: { responsive: true, plugins: { legend: { labels: { font: { family: "'Noto Sans TC'" } } } },
        scales: { y: { ticks: { callback: v => 'NT$' + v.toLocaleString() } } } },
    });
  }

  // 線性回歸預估後續淨利
  function renderForecast() {
    const box = F('forecast');
    const nets = revRecords.map(netOf);
    if (nets.length < 2) { box.innerHTML = '<p class="faint">累積至少 2 個月資料後，這裡會顯示下個月賺/虧預估。</p>'; return; }
    const n = nets.length;
    const xs = nets.map((_, i) => i);
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = nets.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (nets[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den ? num / den : 0, intercept = my - slope * mx;
    const last = revRecords[n - 1];
    let cards = '';
    for (let k = 1; k <= 2; k++) {
      let m = last.month + k, y = last.year;
      while (m > 12) { m -= 12; y++; }
      const pred = Math.round(intercept + slope * (n - 1 + k));
      cards += `<div class="stat" style="flex:1">
        <div class="k">預估 ${y}/${String(m).padStart(2,'0')} 淨利</div>
        <div class="v" style="color:${pred >= 0 ? 'var(--ok)' : 'var(--danger)'}">${pred >= 0 ? '' : '-'}${formatCurrency(Math.abs(pred))}</div>
        <div class="faint">${pred >= 0 ? '預期會賺' : '⚠ 可能虧損'}</div>
      </div>`;
    }
    const trend = slope > 0 ? '上升 ↗' : slope < 0 ? '下滑 ↘' : '持平 →';
    box.innerHTML = `<div class="flex" style="gap:12px;align-items:stretch">${cards}</div>
      <p class="faint mt8">依近 ${n} 個月趨勢（${trend}）以線性外推估算，僅供參考。</p>`;
  }

  // 營收 modal
  let editRevId = null;
  F('addRev').addEventListener('click', () => openRevModal(null));
  F('rv_cancel').addEventListener('click', () => F('revModal').classList.remove('show'));
  F('rv_addCost').addEventListener('click', () => addCostRow('', ''));
  function addCostRow(name, amount) {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `<input class="input" placeholder="名稱（房租/進貨…）" value="${escapeHtml(name)}" style="flex:1">
      <input class="input" type="number" placeholder="金額" value="${amount}" style="width:110px">
      <button class="btn btn-danger btn-sm" type="button">✕</button>`;
    div.querySelector('button').onclick = () => div.remove();
    F('rv_costs').appendChild(div);
  }
  function openRevModal(id) {
    editRevId = id;
    const r = id ? revRecords.find(x => x.id === id) : null;
    const d = new Date();
    F('rv_year').value = r ? r.year : (d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear());
    F('rv_month').value = r ? r.month : (d.getMonth() === 0 ? 12 : d.getMonth());
    F('rv_revenue').value = r ? r.revenue : '';
    F('rv_note').value = r ? (r.note || '') : '';
    F('rv_err').textContent = '';
    F('rv_costs').innerHTML = '';
    (r && r.other_costs || []).forEach(c => addCostRow(c.name, c.amount));
    F('rv_delete').style.visibility = r ? 'visible' : 'hidden';
    F('revModal').classList.add('show');
  }
  function collectCosts() {
    return Array.from(F('rv_costs').children).map(div => {
      const [n, a] = div.querySelectorAll('input');
      return { name: n.value.trim(), amount: Number(a.value) || 0 };
    }).filter(c => c.name || c.amount);
  }
  F('rv_save').addEventListener('click', async () => {
    const btn = F('rv_save'); F('rv_err').textContent = '';
    const year = Number(F('rv_year').value), month = Number(F('rv_month').value);
    if (!year || !month || month < 1 || month > 12) { F('rv_err').textContent = '請填正確年月'; return; }
    btn.disabled = true; btn.textContent = '儲存中…';
    const payload = { year, month, revenue: Number(F('rv_revenue').value) || 0, other_costs: collectCosts(), note: F('rv_note').value.trim() || null };
    const { error } = await sb.from('revenue_records').upsert(payload, { onConflict: 'year,month' });
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('rv_err').textContent = '儲存失敗：' + error.message; return; }
    F('revModal').classList.remove('show'); toast('✅ 已儲存'); loadRevenue();
  });
  F('rv_delete').addEventListener('click', async () => {
    if (!editRevId || !confirm('確定刪除這筆營收紀錄？')) return;
    const { error } = await sb.from('revenue_records').delete().eq('id', editRevId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('revModal').classList.remove('show'); toast('已刪除'); loadRevenue();
  });

  /* ============================================================
   * 3.5) 損益預測（每月損益 + 年度預測 + 預測vs實際差異）
   * ========================================================== */
  const PNL_INPUTS = ['revenue_gross','discount','cost_beans','cost_food','cost_packaging','cost_other_cogs','salary','misc_purchase','water_gas','electric','other_ctrl','equip_repair','equip_maintain','rent','parking','amort_decor','amort_equip','system_fee'];
  const PNL_TAX_RATE = 5; // 營業稅 5%（收入為含稅）
  const PNL_FIXED = ['rent','parking','amort_decor','amort_equip','system_fee'];
  const PNL_LINES = [
    { group: '收入' },
    { key: 'revenue_gross', label: '內用 / 外帶收入' },
    { key: 'discount', label: '折扣（僅紀錄，不計入淨額）' },
    { calc: 'tax', label: '稅額（自動 5%）' },
    { calc: 'net_sales', label: '銷貨收入淨額（扣稅）', strong: true },
    { group: '銷貨成本' },
    { key: 'cost_beans', label: '咖啡豆成本' },
    { key: 'cost_food', label: '食材成本' },
    { key: 'cost_packaging', label: '包裝 / 杯子成本' },
    { key: 'cost_other_cogs', label: '其他（糖、餐巾紙等）' },
    { calc: 'cogs', label: '銷貨成本合計' },
    { calc: 'gross', label: '毛利', strong: true },
    { group: '可控費用' },
    { key: 'salary', label: '薪資津貼（含勞健保）' },
    { key: 'misc_purchase', label: '雜項購置' },
    { key: 'water_gas', label: '水費、瓦斯' },
    { key: 'electric', label: '電費' },
    { key: 'other_ctrl', label: '其他' },
    { key: 'equip_repair', label: '設備維修費' },
    { key: 'equip_maintain', label: '設備保養費' },
    { calc: 'ctrl', label: '可控費用合計' },
    { group: '不可控費用（多為固定）' },
    { key: 'rent', label: '租金' },
    { key: 'parking', label: '車位' },
    { key: 'amort_decor', label: '裝修攤提（7年）' },
    { key: 'amort_equip', label: '設備折舊攤提（5年）' },
    { key: 'system_fee', label: '系統費用' },
    { calc: 'unctrl', label: '不可控費用合計' },
    { calc: 'opnet', label: '營業淨利', strong: true },
  ];
  const PNL_FIXED_SEED = { rent: 28444, parking: 2500, amort_decor: 13773, amort_equip: 8333, system_fee: 4183 };
  // 從用戶截圖讀到的 1–5 月（需逐格核對，尤其 1 月薪資與空白格）
  const PNL_SEED = {
    1: { revenue_gross: 219704, discount: 1559, tax: 10462, cost_beans: 24230, cost_food: 10476, cost_other_cogs: 2962, salary: 12333, other_ctrl: 12570 },
    2: { revenue_gross: 203472, discount: 2156, tax: 9689, cost_beans: 4280, cost_food: 15716, cost_other_cogs: 1328, salary: 52971, other_ctrl: 511 },
    3: { revenue_gross: 212682, discount: 1255, tax: 10128, cost_beans: 28322, cost_food: 20828, cost_other_cogs: 1276, salary: 55582, misc_purchase: 6990, electric: 2648, other_ctrl: 1175, equip_repair: 1500, equip_maintain: 9500 },
    4: { revenue_gross: 215910, discount: 1253, tax: 10281, cost_beans: 15691, cost_food: 13880, salary: 52370 },
    5: { revenue_gross: 196898, discount: 1225, tax: 9376, cost_beans: 12758, cost_food: 12256, cost_packaging: 9215, salary: 47934, electric: 6951 },
  };

  let pnlYear = new Date().getFullYear();
  let pnlData = {};       // month -> DB row（手填）
  let pnlGrowth = 0;
  let pnlInited = false;
  // 自動連動來源
  let pnlAuto = {};                          // month -> { 損益key: 加總金額 }
  let pnlAutoSalary = {};                     // month -> 薪資總額（來自 payroll）
  let pnlMonPurchase = new Set();             // 有叫貨資料的月份
  let pnlMonPayroll = new Set();              // 有薪資資料的月份
  let pnlMonLedger = new Set();               // 有帳本(非進貨/薪資)支出的月份
  const PNL_COGS_KEYS = ['cost_beans','cost_food','cost_packaging','cost_other_cogs'];                       // 來自庫存叫貨
  const PNL_LEDGER_KEYS = ['rent','water_gas','electric','equip_repair','equip_maintain','misc_purchase','other_ctrl']; // 來自帳本
  function pnlIsAutoKey(key) { return key === 'salary' || PNL_COGS_KEYS.includes(key) || PNL_LEDGER_KEYS.includes(key); }

  // 自動連動的啟用月份（2026 年 6 月才正式啟用；之前是歷史資料、用手填值不自動覆蓋）
  function pnlAutoActive(m) { return !(pnlYear === 2026 && m < 6); }
  // 該月該科目的「自動值」：只有該科目當月真的有來源資料才回數字，否則 null（沿用手填/截圖值）
  function pnlAutoValue(m, key) {
    if (!pnlAutoActive(m)) return null;
    if (key === 'salary') return pnlMonPayroll.has(m) ? (pnlAutoSalary[m] || 0) : null;
    if (PNL_COGS_KEYS.includes(key) || PNL_LEDGER_KEYS.includes(key)) {
      return (pnlAuto[m] && pnlAuto[m][key] !== undefined) ? pnlAuto[m][key] : null;
    }
    return null;
  }

  function pnlCalc(v) {
    const tax = Math.round((v.revenue_gross || 0) * PNL_TAX_RATE / (100 + PNL_TAX_RATE)); // 含稅收入 → 稅額
    const net = (v.revenue_gross || 0) - tax; // 淨額＝收入−稅（折扣不計入）
    const cogs = (v.cost_beans || 0) + (v.cost_food || 0) + (v.cost_packaging || 0) + (v.cost_other_cogs || 0);
    const gross = net - cogs;
    const ctrl = (v.salary || 0) + (v.misc_purchase || 0) + (v.water_gas || 0) + (v.electric || 0) + (v.other_ctrl || 0) + (v.equip_repair || 0) + (v.equip_maintain || 0);
    const unctrl = (v.rent || 0) + (v.parking || 0) + (v.amort_decor || 0) + (v.amort_equip || 0) + (v.system_fee || 0);
    return { tax, net_sales: net, cogs, gross, ctrl, unctrl, opnet: gross - ctrl - unctrl };
  }
  function pnlIsActualMonth(m) { return !!pnlData[m] || pnlMonPurchase.has(m) || pnlMonPayroll.has(m) || pnlMonLedger.has(m); }
  function pnlFilledMonths() {  // 「實際」月份＝手填過 或 有叫貨/薪資/帳本來源
    const s = new Set();
    Object.keys(pnlData).forEach(m => s.add(Number(m)));
    pnlMonPurchase.forEach(m => s.add(m)); pnlMonPayroll.forEach(m => s.add(m)); pnlMonLedger.forEach(m => s.add(m));
    return [...s].sort((a, b) => a - b);
  }
  function pnlEffective(m, key) {   // 該月該科目實際值：自動優先，否則手填，否則0
    const auto = pnlAutoValue(m, key);
    if (auto !== null) return auto;
    if (pnlData[m]) return Number(pnlData[m][key] || 0);
    return 0;
  }
  function pnlForecastValue(key) {
    const months = pnlFilledMonths();
    if (!months.length) return 0;
    if (PNL_FIXED.includes(key)) return pnlEffective(months[months.length - 1], key); // 固定成本沿用最近月份
    const sum = months.reduce((s, m) => s + pnlEffective(m, key), 0);
    return Math.round(sum / months.length * (1 + pnlGrowth / 100)); // 變動成本＝平均×成長率
  }
  function pnlMonthValues(m) {
    const o = {}; const actual = pnlIsActualMonth(m);
    PNL_INPUTS.forEach(k => o[k] = actual ? pnlEffective(m, k) : pnlForecastValue(k));
    o.__actual = actual;
    return o;
  }

  async function loadPnl() {
    if (!pnlInited) {
      F('pnlPrevYear').addEventListener('click', () => { pnlYear--; loadPnl(); });
      F('pnlNextYear').addEventListener('click', () => { pnlYear++; loadPnl(); });
      F('pnlGrowth').addEventListener('input', () => { pnlGrowth = Number(F('pnlGrowth').value) || 0; renderPnlGrid(); });
      F('pnlSeed').addEventListener('click', pnlSeedData);
      pnlInited = true;
    }
    const [{ data, error }, purRes, payRes, mapRes, ledRes] = await Promise.all([
      sb.from('pnl_monthly').select('*').eq('year', pnlYear),
      sb.from('purchases').select('order_date,category,total_cost'),
      sb.from('payroll_records').select('year,month,total_pay').eq('year', pnlYear),
      sb.from('pnl_cost_map').select('*'),
      sb.from('ledger_entries').select('entry_date,category,amount,type,source'),
    ]);
    if (error) { toast('載入失敗：' + error.message, 'error'); return; }
    pnlData = {};
    (data || []).forEach(r => pnlData[r.month] = r);
    // 對應表
    costMap = {}; (mapRes.data || []).forEach(r => costMap[r.category] = r.pnl_line);
    pnlAuto = {};
    // 庫存叫貨 → 銷貨成本（只接受 COGS 科目；當年）
    pnlMonPurchase = new Set();
    (purRes.data || []).forEach(p => {
      if (!p.order_date || Number(p.order_date.slice(0, 4)) !== pnlYear) return;
      const line = costMap[p.category];
      if (!PNL_COGS_KEYS.includes(line)) return;
      const mo = Number(p.order_date.slice(5, 7));
      if (!pnlAuto[mo]) pnlAuto[mo] = {};
      pnlAuto[mo][line] = (pnlAuto[mo][line] || 0) + Number(p.total_cost || 0);
      pnlMonPurchase.add(mo);
    });
    // 帳本 → 其他費用（排除進貨/薪資自動分錄避免重複；只接受帳本可對應科目；當年）
    pnlMonLedger = new Set();
    (ledRes.data || []).forEach(e => {
      if (e.type !== '支出') return;
      if (e.source === 'purchase' || e.source === 'payroll') return;
      if (!e.entry_date || Number(e.entry_date.slice(0, 4)) !== pnlYear) return;
      const line = costMap[e.category];
      if (!PNL_LEDGER_KEYS.includes(line)) return;
      const mo = Number(e.entry_date.slice(5, 7));
      if (!pnlAuto[mo]) pnlAuto[mo] = {};
      pnlAuto[mo][line] = (pnlAuto[mo][line] || 0) + Number(e.amount || 0);
      pnlMonLedger.add(mo);
    });
    // 薪資 → salary
    pnlAutoSalary = {}; pnlMonPayroll = new Set();
    (payRes.data || []).forEach(r => { pnlAutoSalary[r.month] = (pnlAutoSalary[r.month] || 0) + Number(r.total_pay || 0); pnlMonPayroll.add(r.month); });
    F('pnlYearLabel').textContent = pnlYear;
    // 2026 年第一次打開、且還沒任何資料 → 自動帶入截圖讀到的 1–5 月（用老闆登入身分寫入）
    if (pnlYear === 2026 && Object.keys(pnlData).length === 0 && !localStorage.getItem('pnlSeeded2026')) {
      const ok = await pnlApplySeed(2026, true);
      if (ok) { localStorage.setItem('pnlSeeded2026', '1'); return loadPnl(); } // 重新載入即帶出 1–5 月 + 即時年度預測
    }
    renderPnlGrid();
  }

  const PNL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
  function renderPnlGrid() {
    const tbl = F('pnlGrid');
    const mv = {}, mc = {};
    PNL_MONTHS.forEach(m => { mv[m] = pnlMonthValues(m); mc[m] = pnlCalc(mv[m]); });
    let html = '<thead><tr><th style="min-width:150px; text-align:left">科目</th>';
    PNL_MONTHS.forEach(m => { const a = pnlIsActualMonth(m); html += `<th class="num" style="${a ? '' : 'opacity:.5'}">${m}月${a ? '' : '<br><span style="font-size:10px">預測</span>'}</th>`; });
    html += '<th class="num" style="min-width:88px">全年</th></tr></thead><tbody>';
    const srcLabel = (k) => k === 'salary' ? '薪資' : PNL_COGS_KEYS.includes(k) ? '庫存叫貨' : PNL_LEDGER_KEYS.includes(k) ? '帳本' : '';
    PNL_LINES.forEach(line => {
      if (line.group) { html += `<tr><td colspan="14" style="background:#f1ebe0; font-weight:600; font-size:12px; text-align:left">${line.group}</td></tr>`; return; }
      const lineAuto = pnlIsAutoKey(line.key);
      html += `<tr><td style="text-align:left; ${line.strong ? 'font-weight:700' : ''}">${line.label}${lineAuto ? ` <span class="faint" style="font-size:10px">自動·${srcLabel(line.key)}</span>` : ''}</td>`;
      if (line.key) {
        PNL_MONTHS.forEach(m => {
          const auto = pnlAutoValue(m, line.key);
          if (auto !== null) {
            html += `<td class="num" data-m="${m}" data-c2="${line.key}" title="自動帶自${srcLabel(line.key)}（去該頁修改）" style="background:#eaf1f6; color:#34627d; font-size:12px">${formatCurrency(auto)}</td>`;
          } else {
            const a = pnlIsActualMonth(m);
            const val = mv[m][line.key];
            html += `<td class="num"><input type="number" data-m="${m}" data-k="${line.key}" value="${val || ''}" style="width:74px; text-align:right; font-size:12px; padding:2px 4px; ${a ? '' : 'background:#f4f1ea; color:#9a9a9a; font-style:italic'}" /></td>`;
          }
        });
        html += `<td class="num" data-annk="${line.key}">${formatCurrency(PNL_MONTHS.reduce((s, m) => s + (mv[m][line.key] || 0), 0))}</td>`;
      } else {
        PNL_MONTHS.forEach(m => { html += `<td class="num" data-m="${m}" data-c="${line.calc}" style="${line.strong ? 'font-weight:700' : ''}">${formatCurrency(mc[m][line.calc])}</td>`; });
        html += `<td class="num" data-annc="${line.calc}" style="${line.strong ? 'font-weight:700' : ''}">${formatCurrency(PNL_MONTHS.reduce((s, m) => s + mc[m][line.calc], 0))}</td>`;
      }
      html += '</tr>';
    });
    tbl.innerHTML = html + '</tbody>';
    tbl.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('input', onPnlInput);
      inp.addEventListener('change', onPnlBlur);
    });
    pnlRenderSummary(); pnlRenderVariance();
  }

  function onPnlInput(e) {
    const m = Number(e.target.dataset.m), k = e.target.dataset.k;
    const val = e.target.value === '' ? 0 : Number(e.target.value);
    if (!pnlData[m]) {
      pnlData[m] = { year: pnlYear, month: m };
      PNL_INPUTS.forEach(kk => pnlData[m][kk] = pnlForecastValue(kk)); // 用預測值墊底，整欄一致
      F('pnlGrid').querySelectorAll(`input[data-m="${m}"]`).forEach(x => { x.style.background = ''; x.style.color = ''; x.style.fontStyle = ''; });
    }
    pnlData[m][k] = val;
    // 即時更新該欄小計 + 全年 + 摘要（不重建，保留游標）
    const v = {}; PNL_INPUTS.forEach(kk => v[kk] = pnlEffective(m, kk));
    const c = pnlCalc(v);
    ['tax','net_sales','cogs','gross','ctrl','unctrl','opnet'].forEach(ck => {
      const cell = F('pnlGrid').querySelector(`td[data-m="${m}"][data-c="${ck}"]`);
      if (cell) cell.textContent = formatCurrency(c[ck]);
    });
    pnlRefreshTotals();
  }
  function pnlRefreshTotals() {
    const mv = {}, mc = {};
    PNL_MONTHS.forEach(m => { mv[m] = pnlMonthValues(m); mc[m] = pnlCalc(mv[m]); });
    PNL_INPUTS.forEach(k => { const c = F('pnlGrid').querySelector(`td[data-annk="${k}"]`); if (c) c.textContent = formatCurrency(PNL_MONTHS.reduce((s, m) => s + (mv[m][k] || 0), 0)); });
    ['tax','net_sales','cogs','gross','ctrl','unctrl','opnet'].forEach(ck => { const c = F('pnlGrid').querySelector(`td[data-annc="${ck}"]`); if (c) c.textContent = formatCurrency(PNL_MONTHS.reduce((s, m) => s + mc[m][ck], 0)); });
    pnlRenderSummary(); pnlRenderVariance();
  }
  async function onPnlBlur(e) {
    const m = Number(e.target.dataset.m);
    if (!pnlData[m]) return;
    const payload = { year: pnlYear, month: m };
    PNL_INPUTS.forEach(k => payload[k] = Number(pnlData[m][k] || 0));
    const { error } = await sb.from('pnl_monthly').upsert(payload, { onConflict: 'year,month' });
    if (error) { toast('儲存失敗：' + error.message, 'error'); return; }
    renderPnlGrid(); // 重整，刷新其他月份的預測值
  }

  function pnlRenderSummary() {
    const mc = {}; PNL_MONTHS.forEach(m => mc[m] = pnlCalc(pnlMonthValues(m)));
    const filled = pnlFilledMonths();
    const annRev = PNL_MONTHS.reduce((s, m) => s + mc[m].net_sales, 0);
    const annNet = PNL_MONTHS.reduce((s, m) => s + mc[m].opnet, 0);
    const loss = PNL_MONTHS.filter(m => mc[m].net_sales > 0 && mc[m].opnet < 0).length; // 只算有收入的月份，避免未填月份假警報
    const cards = [
      ['全年營收（淨額）', formatCurrency(annRev), `已填 ${filled.length} 月＋預測 ${12 - filled.length} 月`, ''],
      ['全年營業淨利', formatCurrency(annNet), annNet >= 0 ? '預估獲利' : '預估虧損', annNet >= 0 ? '#2e7d32' : '#c0392b'],
      ['平均每月淨利', formatCurrency(Math.round(annNet / 12)), '', ''],
      ['可能虧損月數', loss + ' 個月', loss ? '注意現金流' : '全年皆獲利', loss ? '#c0392b' : '#2e7d32'],
    ];
    F('pnlSummary').innerHTML = cards.map(c => `<div class="card" style="margin:0; padding:12px"><div class="muted faint" style="font-size:12px">${c[0]}</div><div style="font-size:20px; font-weight:700; color:${c[3] || 'inherit'}">${c[1]}</div><div class="muted faint" style="font-size:11px">${c[2]}</div></div>`).join('');
  }
  function pnlRenderVariance() {
    const filled = pnlFilledMonths();
    const tb = F('pnlVariance').querySelector('tbody');
    if (filled.length < 2) { tb.innerHTML = '<tr><td colspan="4" class="muted faint">至少填 2 個月後，這裡會顯示每月淨利與平均的落差。</td></tr>'; return; }
    const mc = {}; filled.forEach(m => mc[m] = pnlCalc(pnlMonthValues(m)));
    const baseline = Math.round(filled.reduce((s, m) => s + mc[m].opnet, 0) / filled.length);
    tb.innerHTML = filled.map(m => {
      const act = mc[m].opnet, diff = act - baseline, col = diff >= 0 ? '#2e7d32' : '#c0392b';
      return `<tr><td>${m}月</td><td class="num">${formatCurrency(baseline)}</td><td class="num">${formatCurrency(act)}</td><td class="num" style="color:${col}">${diff >= 0 ? '+' : ''}${formatCurrency(diff)}</td></tr>`;
    }).join('');
  }
  async function pnlApplySeed(year, silent) {
    const rows = Object.keys(PNL_SEED).map(m => {
      const r = { year: year, month: Number(m) };
      PNL_INPUTS.forEach(k => r[k] = 0);
      Object.assign(r, PNL_FIXED_SEED, PNL_SEED[m]);
      return r;
    });
    const { error } = await sb.from('pnl_monthly').upsert(rows, { onConflict: 'year,month' });
    if (error) { toast('帶入失敗：' + error.message, 'error'); return false; }
    if (!silent) toast('✅ 已帶入 1–5 月，請逐格核對');
    return true;
  }
  async function pnlSeedData() {
    if (!confirm('用截圖讀到的 1–5 月數字帶入 ' + pnlYear + ' 年？\n（同月若已有資料會被覆蓋。帶入後請務必逐格核對，尤其 1 月薪資與各空白格。）')) return;
    if (await pnlApplySeed(pnlYear, false)) loadPnl();
  }

  /* ============================================================
   * 4) 庫存叫貨
   * ========================================================== */
  let purchases = [], stockItems = [], invLoaded = false, invMonthInited = false;
  let costMap = {};  // { 分類名稱: 損益科目key }

  // 損益成本對應可選的科目
  const PNL_MAP_OPTIONS = [
    { v: 'none', label: '— 不列入損益 —' },
    { v: 'cost_beans', label: '咖啡豆成本（叫貨）' },
    { v: 'cost_food', label: '食材成本（叫貨）' },
    { v: 'cost_packaging', label: '包裝 / 杯子成本（叫貨）' },
    { v: 'cost_other_cogs', label: '其他銷貨成本 糖餐巾紙（叫貨）' },
    { v: 'rent', label: '租金（帳本）' },
    { v: 'water_gas', label: '水費、瓦斯（帳本）' },
    { v: 'electric', label: '電費（帳本）' },
    { v: 'equip_repair', label: '設備維修費（帳本）' },
    { v: 'equip_maintain', label: '設備保養費（帳本）' },
    { v: 'misc_purchase', label: '雜項購置（帳本）' },
    { v: 'other_ctrl', label: '其他可控費用（帳本）' },
  ];
  let pnlLedgerCats = [];  // 帳本支出分類（排除自動的進貨/薪資）

  async function loadInventory() {
    const [{ data: pdata, error }, { data: sdata }, { data: mdata }, { data: lcats }] = await Promise.all([
      sb.from('purchases').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('stock_items').select('*').eq('is_active', true).order('sort_order').order('name'),
      sb.from('pnl_cost_map').select('*'),
      sb.from('ledger_categories').select('name,kind'),
    ]);
    if (error) { F('invTable').querySelector('tbody').innerHTML = `<tr><td colspan="8" class="muted faint">讀取失敗：${escapeHtml(error.message)}</td></tr>`; return; }
    purchases = pdata || [];
    stockItems = sdata || [];
    costMap = {}; (mdata || []).forEach(r => costMap[r.category] = r.pnl_line);
    // 帳本支出分類（進貨/薪資由叫貨/薪資自動算，不放進對應）
    pnlLedgerCats = [...new Set((lcats || []).filter(c => c.kind === 'expense' && c.name !== '進貨' && c.name !== '薪資').map(c => c.name))];
    invLoaded = true;
    fillYearSelect(F('inv_year'), purchases.map(p => p.order_date), F('inv_year').value);
    if (!invMonthInited) { F('inv_month').value = String(new Date().getMonth() + 1); invMonthInited = true; }  // 預設當月
    renderInventory();
    renderStockList();
    renderCostMap();
    fillItemSelect();
    refreshDatalists();
  }

  // 所有出現過的分類（庫存固定分類 + 品項分類 + 採購分類）
  function allCategories() {
    const set = new Set(['糖漿', '乳品', '茶包｜茶粉', '咖啡豆', '耗材']);
    stockItems.forEach(s => { if (s.category) set.add(s.category); });
    purchases.forEach(p => { if (p.category) set.add(p.category); });
    pnlLedgerCats.forEach(c => set.add(c));   // 帳本支出分類（房租/水費/電費/維修/雜支…）
    Object.keys(costMap).forEach(c => { if (c !== '進貨' && c !== '薪資') set.add(c); });
    return [...set].sort();
  }

  function renderCostMap() {
    const tb = F('costMapTable').querySelector('tbody');
    const cats = allCategories();
    if (!cats.length) { tb.innerHTML = '<tr><td colspan="2" class="muted faint">尚無分類，先去新增品項/叫貨並設定分類。</td></tr>'; return; }
    tb.innerHTML = cats.map(cat => {
      const cur = costMap[cat] || 'none';
      const opts = PNL_MAP_OPTIONS.map(o => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.label}</option>`).join('');
      return `<tr><td>${escapeHtml(cat)}</td><td><select class="input" data-cat="${escapeHtml(cat)}" style="width:auto; min-width:200px">${opts}</select></td></tr>`;
    }).join('');
    tb.querySelectorAll('select[data-cat]').forEach(sel => sel.addEventListener('change', () => saveCostMap(sel.dataset.cat, sel.value)));
  }

  async function saveCostMap(category, line) {
    costMap[category] = line;
    const { error } = await sb.from('pnl_cost_map').upsert({ category, pnl_line: line }, { onConflict: 'category' });
    if (error) { toast('儲存失敗：' + error.message, 'error'); return; }
    toast('✅ 已設定「' + category + '」');
  }

  // 依「大分類」過濾品項下拉；currentName 為編輯時既有值（保留可選）
  function fillItemSelect(currentName) {
    const cat = F('p_cat_filter') ? F('p_cat_filter').value : '';
    const items = (cat && cat !== '__custom__') ? stockItems.filter(s => s.category === cat) : [];
    const names = items.map(s => s.name);
    let html = '<option value="">選擇品項…</option>' +
      items.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.unit ? `（${escapeHtml(s.unit)}）` : ''}</option>`).join('');
    if (currentName && !names.includes(currentName)) html += `<option value="${escapeHtml(currentName)}" selected>${escapeHtml(currentName)}（清單外）</option>`;
    F('p_item').innerHTML = html;
    if (currentName) F('p_item').value = currentName;
  }

  function monthRange(which) {
    const d = new Date();
    let y = d.getFullYear(), m = d.getMonth(); // 0-based
    if (which === 'last') { m -= 1; if (m < 0) { m = 11; y--; } }
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const end = new Date(y, m + 1, 0);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return { start, end: endStr };
  }

  // 年份下拉共用：依資料的日期建年份選項 + 全部，預設今年
  function fillYearSelect(el, dates, keep) {
    const cur = String(new Date().getFullYear());
    const years = [...new Set(dates.map(d => (d || '').slice(0, 4)).filter(Boolean))];
    if (!years.includes(cur)) years.push(cur);
    years.sort().reverse();
    const sel = (keep && (years.includes(keep) || keep === 'all')) ? keep : cur;
    el.innerHTML = years.map(y => `<option value="${y}">${y}年</option>`).join('') + '<option value="all">全部</option>';
    el.value = sel;
  }

  F('inv_year').addEventListener('change', renderInventory);
  F('inv_month').addEventListener('change', renderInventory);

  function renderInventory() {
    const yr = F('inv_year').value, mo = F('inv_month').value;
    let rows = (yr === 'all') ? purchases : purchases.filter(p => (p.order_date || '').slice(0, 4) === yr);
    if (mo !== 'all') rows = rows.filter(p => Number((p.order_date || '').slice(5, 7)) === Number(mo));
    const total = rows.reduce((s, p) => s + Number(p.total_cost || 0), 0);
    F('inv_sum').textContent = `${rows.length} 筆・採購成本 ${formatCurrency(total)}`;

    const tb = F('invTable').querySelector('tbody');
    tb.innerHTML = rows.length ? rows.map(p => `
      <tr data-id="${p.id}" style="cursor:pointer">
        <td>${(p.order_date || '').replace(/-/g, '/').slice(5)}</td>
        <td>${escapeHtml(p.item_name)}${p.category ? ` <span class="faint">${escapeHtml(p.category)}</span>` : ''}</td>
        <td class="num">${p.quantity}</td>
        <td>${escapeHtml(p.unit || '')}</td>
        <td class="num">${p.unit_cost ? formatCurrency(p.unit_cost) : '—'}</td>
        <td class="num" style="font-weight:600">${formatCurrency(p.total_cost)}</td>
        <td class="faint">${escapeHtml(p.supplier || '')}</td>
        <td class="num faint">編輯 ›</td>
      </tr>`).join('') : '<tr><td colspan="8" class="muted faint">這段期間沒有叫貨紀錄</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openPurModal(tr.dataset.id)));

    renderInvRef();
  }

  // 叫貨參考：每個品項上次數量/日期、近期平均（近3次）、總花費
  function renderInvRef() {
    const byItem = {};
    // purchases 已依日期新到舊排序
    purchases.forEach(p => {
      const k = p.item_name;
      if (!byItem[k]) byItem[k] = [];
      byItem[k].push(p);
    });
    const items = Object.keys(byItem).sort((a, b) => byItem[b][0].order_date.localeCompare(byItem[a][0].order_date));
    const tb = F('invRefTable').querySelector('tbody');
    if (!items.length) { tb.innerHTML = '<tr><td colspan="6" class="muted faint">還沒有資料，新增幾筆叫貨後這裡就會出現參考數量</td></tr>'; return; }
    tb.innerHTML = items.map(name => {
      const list = byItem[name]; // 新到舊
      const last = list[0];
      const recent = list.slice(0, 3);
      const avg = recent.reduce((s, p) => s + Number(p.quantity || 0), 0) / recent.length;
      const spend = list.reduce((s, p) => s + Number(p.total_cost || 0), 0);
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td class="num" style="font-weight:600">${last.quantity} ${escapeHtml(last.unit || '')}</td>
        <td>${(last.order_date || '').replace(/-/g, '/')}</td>
        <td class="num">${avg.toFixed(avg % 1 ? 1 : 0)} ${escapeHtml(last.unit || '')}</td>
        <td class="num">${list.length}</td>
        <td class="num faint">${formatCurrency(spend)}</td>
      </tr>`;
    }).join('');
  }

  function refreshDatalists() {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    F('supList').innerHTML = uniq([...purchases.map(p => p.supplier), ...stockItems.map(s => s.vendor)]).map(v => `<option value="${escapeHtml(v)}">`).join('');
    F('svendorList').innerHTML = uniq(stockItems.map(s => s.vendor)).map(v => `<option value="${escapeHtml(v)}">`).join('');
  }

  /* ===== 庫存品項主檔 ===== */
  const UNIT_PRESETS = ['g', '磅', 'ml', '罐'];
  const STOCK_CATS = ['糖漿', '乳品', '茶包｜茶粉', '咖啡豆', '耗材'];
  let editStockId = null;

  function renderStockList() {
    F('stockCount').textContent = stockItems.length;
    const tb = F('stockTable').querySelector('tbody');
    if (!stockItems.length) { tb.innerHTML = '<tr><td colspan="7" class="muted faint">尚無品項，點「新增品項」建立叫貨用的清單</td></tr>'; return; }
    tb.innerHTML = stockItems.map(s => `
      <tr data-id="${s.id}" style="cursor:pointer">
        <td style="font-weight:500">${escapeHtml(s.name)}</td>
        <td style="white-space:nowrap">${escapeHtml(s.category || '')}</td>
        <td style="white-space:nowrap">${escapeHtml(s.capacity || '')}</td>
        <td style="white-space:nowrap">${escapeHtml(s.unit || '')}</td>
        <td class="num" style="white-space:nowrap">${s.cost ? formatCurrency(s.cost) : '—'}</td>
        <td class="faint">${escapeHtml(s.vendor || '')}</td>
        <td class="num faint">編輯 ›</td>
      </tr>`).join('');
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openStockModal(tr.dataset.id)));
  }

  F('stockToggle').addEventListener('click', () => {
    const hidden = F('stockBody').classList.toggle('hidden');
    F('stockChev').textContent = hidden ? '▸' : '▾';
  });

  function buildUnitOptions(current) {
    const units = [...new Set([...UNIT_PRESETS, ...stockItems.map(s => s.unit).filter(Boolean), current].filter(Boolean))];
    F('s_unit').innerHTML = '<option value="">—</option>'
      + units.map(u => `<option value="${escapeHtml(u)}" ${u === current ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')
      + '<option value="__add__">＋ 新增單位…</option>';
  }

  F('s_unit') && F('s_unit').addEventListener('change', () => {
    if (F('s_unit').value === '__add__') {
      const u = prompt('新增單位（例：包、箱、kg）：');
      buildUnitOptions(u && u.trim() ? u.trim() : '');
    }
  });

  function buildCategoryOptions(current) {
    const cats = [...new Set([...STOCK_CATS, ...stockItems.map(s => s.category).filter(Boolean), current].filter(Boolean))];
    F('s_category').innerHTML = '<option value="">—</option>'
      + cats.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')
      + '<option value="__add__">＋ 新增分類…</option>';
  }
  F('s_category') && F('s_category').addEventListener('change', () => {
    if (F('s_category').value === '__add__') {
      const c = prompt('新增分類：');
      buildCategoryOptions(c && c.trim() ? c.trim() : '');
    }
  });

  F('addStock').addEventListener('click', () => openStockModal(null));
  F('s_cancel').addEventListener('click', () => F('stockModal').classList.remove('show'));

  function openStockModal(id) {
    editStockId = id;
    const s = id ? stockItems.find(x => x.id === id) : null;
    F('stockModalTitle').textContent = s ? '編輯品項' : '新增品項';
    F('s_name').value = s ? s.name : '';
    F('s_cost').value = s ? (s.cost || '') : '';
    F('s_vendor').value = s ? (s.vendor || '') : '';
    F('s_capacity').value = s ? (s.capacity || '') : '';
    F('s_note').value = s ? (s.note || '') : '';
    buildUnitOptions(s ? (s.unit || '') : '');
    buildCategoryOptions(s ? (s.category || '') : '');
    F('s_err').textContent = '';
    F('s_delete').style.visibility = s ? 'visible' : 'hidden';
    F('stockModal').classList.add('show');
  }

  F('s_save').addEventListener('click', async () => {
    F('s_err').textContent = '';
    const name = F('s_name').value.trim();
    if (!name) { F('s_err').textContent = '請填品名'; return; }
    let unit = F('s_unit').value; if (unit === '__add__') unit = '';
    let category = F('s_category').value; if (category === '__add__') category = '';
    const btn = F('s_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      name, cost: Number(F('s_cost').value) || 0, category: category || null,
      vendor: F('s_vendor').value.trim() || null, unit: unit || null,
      capacity: F('s_capacity').value.trim() || null, note: F('s_note').value.trim() || null,
    };
    let error;
    if (editStockId) ({ error } = await sb.from('stock_items').update(payload).eq('id', editStockId));
    else ({ error } = await sb.from('stock_items').insert(payload));
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('s_err').textContent = '儲存失敗：' + error.message; return; }
    F('stockModal').classList.remove('show'); toast('✅ 已儲存'); loadInventory();
  });

  F('s_delete').addEventListener('click', async () => {
    if (!editStockId || !confirm('確定刪除這個品項？（不影響已存在的叫貨紀錄）')) return;
    const { error } = await sb.from('stock_items').delete().eq('id', editStockId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('stockModal').classList.remove('show'); toast('已刪除'); loadInventory();
  });

  // 叫貨選品項時自動帶入單位/廠商/成本
  F('p_item').addEventListener('change', () => {
    const s = stockItems.find(x => x.name === F('p_item').value);
    if (s) {
      F('p_unit').value = s.unit || '';
      F('p_supplier').value = s.vendor || '';
      F('p_cost').value = s.cost || '';
      calcSub();
    }
  });

  // 大分類（跟著庫存分類）→ 選好才選子品項；「自訂」可手打品項
  function buildPurCatOptions(current) {
    const cats = [...new Set(stockItems.map(s => s.category).filter(Boolean))]
      .sort((a, b) => (STOCK_CATS.indexOf(a) < 0 ? 99 : STOCK_CATS.indexOf(a)) - (STOCK_CATS.indexOf(b) < 0 ? 99 : STOCK_CATS.indexOf(b)));
    F('p_cat_filter').innerHTML = '<option value="">選分類…</option>'
      + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')
      + '<option value="__custom__">自訂</option>';
    F('p_cat_filter').value = current || '';
  }
  function onPurCatChange() {
    const custom = F('p_cat_filter').value === '__custom__';
    F('p_item').classList.toggle('hidden', custom);
    F('p_item_custom').classList.toggle('hidden', !custom);
    if (!custom) fillItemSelect();
  }
  F('p_cat_filter').addEventListener('change', onPurCatChange);

  // 叫貨 modal
  let editPurId = null;
  F('addPurchase').addEventListener('click', () => openPurModal(null));
  F('p_cancel').addEventListener('click', () => F('purModal').classList.remove('show'));
  function calcSub() {
    const sub = (Number(F('p_qty').value) || 0) * (Number(F('p_cost').value) || 0);
    F('p_subtotal').value = formatCurrency(sub);
    return sub;
  }
  F('p_qty').addEventListener('input', calcSub);
  F('p_cost').addEventListener('input', calcSub);

  async function openPurModal(id) {
    editPurId = id;
    const p = id ? purchases.find(x => x.id === id) : null;
    F('purModalTitle').textContent = p ? '編輯叫貨' : '新增叫貨';
    F('p_date').value = p ? p.order_date : todayStr();
    // 大分類：依品項在庫存的分類；庫存沒有此品項 → 自訂
    let cat = '';
    if (p) { const s = stockItems.find(x => x.name === p.item_name); cat = s ? (s.category || '') : '__custom__'; }
    buildPurCatOptions(cat);
    onPurCatChange();
    if (cat === '__custom__') F('p_item_custom').value = p ? p.item_name : '';
    else fillItemSelect(p ? p.item_name : null);
    F('p_qty').value = p ? p.quantity : '';
    F('p_unit').value = p ? (p.unit || '') : '';
    F('p_cost').value = p ? p.unit_cost : '';
    F('p_supplier').value = p ? (p.supplier || '') : '';
    F('p_note').value = p ? (p.note || '') : '';
    F('p_err').textContent = '';
    calcSub();
    F('p_delete').style.visibility = p ? 'visible' : 'hidden';
    await ensureAccounts();
    let accId = '';
    if (p) { const { data: le } = await sb.from('ledger_entries').select('account_id').eq('source', 'purchase').eq('source_id', p.id).maybeSingle(); accId = le ? le.account_id : ''; }
    F('p_account').innerHTML = accountOptions(accId);
    F('purModal').classList.add('show');
  }

  F('p_save').addEventListener('click', async () => {
    F('p_err').textContent = '';
    const cat = F('p_cat_filter').value;
    const custom = cat === '__custom__';
    const item = (custom ? F('p_item_custom').value : F('p_item').value).trim();
    const date = F('p_date').value;
    if (!date || !item) { F('p_err').textContent = '請選大分類與品項（自訂請填品項名稱）'; return; }
    const qty = Number(F('p_qty').value) || 0;
    const cost = Number(F('p_cost').value) || 0;
    const btn = F('p_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      order_date: date, item_name: item, category: (cat && !custom) ? cat : null,
      quantity: qty, unit: F('p_unit').value.trim() || null, unit_cost: cost, total_cost: qty * cost,
      supplier: F('p_supplier').value.trim() || null, note: F('p_note').value.trim() || null,
    };
    let saved, error;
    if (editPurId) ({ data: saved, error } = await sb.from('purchases').update(payload).eq('id', editPurId).select().single());
    else ({ data: saved, error } = await sb.from('purchases').insert(payload).select().single());
    if (error) { btn.disabled = false; btn.textContent = '儲存'; F('p_err').textContent = '儲存失敗：' + error.message; return; }
    // 連動帳本：選了付款帳戶就記一筆「支出・進貨」（重存先清舊的）
    const accId = F('p_account').value;
    await sb.from('ledger_entries').delete().eq('source', 'purchase').eq('source_id', saved.id);
    if (accId) await sb.from('ledger_entries').insert({ account_id: accId, type: '支出', category: '進貨', amount: payload.total_cost, description: `叫貨：${payload.item_name}`, entry_date: payload.order_date, source: 'purchase', source_id: saved.id });
    btn.disabled = false; btn.textContent = '儲存';
    F('purModal').classList.remove('show'); toast('✅ 已儲存'); loadInventory();
  });

  F('p_delete').addEventListener('click', async () => {
    if (!editPurId || !confirm('確定刪除這筆叫貨紀錄？')) return;
    await sb.from('ledger_entries').delete().eq('source', 'purchase').eq('source_id', editPurId);
    const { error } = await sb.from('purchases').delete().eq('id', editPurId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('purModal').classList.remove('show'); toast('已刪除'); loadInventory();
  });

  /* ============================================================
   * 5) 打卡審核（補打卡申請）
   * ========================================================== */
  let reviewMap = {};
  const KIND_LABEL = { clock_in: '上班', clock_out: '下班' };
  function hhmmIso(iso) { return iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : ''; }
  const nameOf = id => (staffList.find(s => s.id === id) || {}).name || '—';

  async function refreshReviewBadge() {
    const { count } = await sb.from('attendance_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const b = F('revBadge');
    if (count) { b.textContent = count; b.className = 'badge badge-ded'; b.style.marginLeft = '6px'; }
    else { b.textContent = ''; b.className = ''; }
  }

  async function loadReviews() {
    const { data } = await sb.from('attendance_requests').select('*').order('created_at', { ascending: false }).limit(60);
    const reqs = data || [];
    reviewMap = {}; reqs.forEach(r => reviewMap[r.id] = r);
    const pending = reqs.filter(r => r.status === 'pending');
    const done = reqs.filter(r => r.status !== 'pending').slice(0, 20);

    F('reviewPending').innerHTML = pending.length ? pending.map(r => `
      <div class="list-row" style="cursor:default">
        <div>
          <div style="font-weight:500">${escapeHtml(nameOf(r.staff_id))}　${r.work_date.replace(/-/g,'/')} 補${KIND_LABEL[r.kind]} ${hhmmIso(r.requested_time)}</div>
          <div class="faint">${escapeHtml(r.reason || '')}</div>
        </div>
        <div class="flex">
          <button class="btn btn-primary btn-sm" data-ok="${r.id}">核准</button>
          <button class="btn btn-ghost btn-sm" data-no="${r.id}">駁回</button>
          <button class="btn btn-danger btn-sm" data-del="${r.id}">刪除</button>
        </div>
      </div>`).join('') : '<p class="muted faint">目前沒有待審核的申請 🎉</p>';

    F('reviewDone').innerHTML = done.length ? done.map(r => {
      const st = r.status === 'approved' ? '<span class="badge badge-ok">已核准</span>' : '<span class="badge badge-ded">已駁回</span>';
      return `<div class="list-row" style="cursor:default"><div>${escapeHtml(nameOf(r.staff_id))}　${r.work_date.replace(/-/g,'/')} 補${KIND_LABEL[r.kind]} ${hhmmIso(r.requested_time)}</div><div class="flex" style="gap:8px;align-items:center">${st}<button class="btn btn-danger btn-sm" data-del="${r.id}">刪除</button></div></div>`;
    }).join('') : '<p class="muted faint">尚無紀錄</p>';

    F('reviewPending').querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => approveReq(reviewMap[b.dataset.ok])));
    F('reviewPending').querySelectorAll('[data-no]').forEach(b => b.addEventListener('click', () => rejectReq(reviewMap[b.dataset.no])));
    document.querySelectorAll('#reviewPending [data-del], #reviewDone [data-del]').forEach(b => b.addEventListener('click', () => deleteReq(reviewMap[b.dataset.del])));
  }
  async function deleteReq(req) {
    if (!req || !confirm('確定刪除這筆補打卡申請？（不影響已核准寫入的打卡紀錄）')) return;
    const { error } = await sb.from('attendance_requests').delete().eq('id', req.id);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    toast('已刪除'); loadReviews(); refreshReviewBadge();
  }

  async function approveReq(req) {
    if (!req) return;
    const field = req.kind === 'clock_in' ? 'clock_in' : 'clock_out';
    const { data: existing } = await sb.from('attendance').select('id').eq('staff_id', req.staff_id).eq('work_date', req.work_date).maybeSingle();
    let aerr;
    if (existing) ({ error: aerr } = await sb.from('attendance').update({ [field]: req.requested_time }).eq('id', existing.id));
    else ({ error: aerr } = await sb.from('attendance').insert({ staff_id: req.staff_id, work_date: req.work_date, [field]: req.requested_time }));
    if (aerr) { toast('寫入打卡失敗：' + aerr.message, 'error'); return; }
    const { error } = await sb.from('attendance_requests').update({ status: 'approved', reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    if (error) { toast('更新失敗：' + error.message, 'error'); return; }
    toast('✅ 已核准並記入打卡'); loadReviews(); refreshReviewBadge();
  }

  async function rejectReq(req) {
    if (!req || !confirm('確定駁回這筆補打卡申請？')) return;
    const { error } = await sb.from('attendance_requests').update({ status: 'rejected', reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    if (error) { toast('操作失敗：' + error.message, 'error'); return; }
    toast('已駁回'); loadReviews(); refreshReviewBadge();
  }

  /* ============================================================
   * 5d) 員工公告（老闆發布；員工首頁確認已讀）
   * ========================================================== */
  let annAt = null;
  async function loadAnnounce() {
    const { data } = await sb.from('site_settings').select('staff_announcement,staff_announcement_at').eq('id', 1).maybeSingle();
    F('annText').value = (data && data.staff_announcement) || '';
    annAt = (data && data.staff_announcement_at) || null;
    F('annMsg').textContent = '';
    renderAckList();
  }
  async function renderAckList() {
    if (!annAt) { F('annAckSum').textContent = ''; F('annAckList').innerHTML = '<p class="muted faint">尚未發布公告。</p>'; return; }
    const { data } = await sb.from('announcement_acks').select('staff_id,ack_at').eq('announced_at', annAt);
    const acks = data || [];
    const active = staffList.filter(s => s.is_active !== false);
    F('annAckSum').textContent = `・${acks.length}/${active.length} 已讀`;
    F('annAckList').innerHTML = active.length ? active.map(s => {
      const a = acks.find(x => x.staff_id === s.id);
      return `<div class="list-row" style="cursor:default"><div>${escapeHtml(s.name)}</div>${a ? `<span class="badge badge-ok">已讀 ${new Date(a.ack_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>` : '<span class="badge badge-wait">未讀</span>'}</div>`;
    }).join('') : '<p class="muted faint">尚無員工</p>';
  }
  async function saveAnnounce(clear) {
    const txt = clear ? '' : F('annText').value.trim();
    const btn = F('annSave'); btn.disabled = true; btn.textContent = '發布中…';
    const at = new Date().toISOString();
    const { error } = await sb.from('site_settings').update({ staff_announcement: txt || null, staff_announcement_at: txt ? at : null }).eq('id', 1);
    btn.disabled = false; btn.textContent = '發布公告';
    if (error) { F('annMsg').textContent = '失敗：' + error.message; return; }
    if (clear) F('annText').value = '';
    annAt = txt ? at : null;
    F('annMsg').textContent = txt ? '✅ 已發布，員工需重新確認' : '✅ 已清空公告';
    toast(txt ? '✅ 公告已發布' : '已清空公告'); renderAckList();
  }
  F('annSave').addEventListener('click', () => saveAnnounce(false));
  F('annClear').addEventListener('click', () => { if (confirm('確定清空公告？員工首頁將不再顯示。')) saveAnnounce(true); });

  /* ============================================================
   * 5b) 出勤總表（老闆看全部員工）
   * ========================================================== */
  let amYear, amMonth;
  function initAttendNav() {
    const d = new Date();
    amYear = d.getFullYear(); amMonth = d.getMonth() + 1;
    F('am-prev').addEventListener('click', () => { amMonth--; if (amMonth < 1) { amMonth = 12; amYear--; } loadAttendanceSummary(); });
    F('am-next').addEventListener('click', () => { amMonth++; if (amMonth > 12) { amMonth = 1; amYear++; } loadAttendanceSummary(); });
  }
  async function loadAttendanceSummary() {
    F('am-label').textContent = `${amYear}年${amMonth}月`;
    const start = `${amYear}-${String(amMonth).padStart(2, '0')}-01`;
    const endD = new Date(amYear, amMonth, 0);
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
    const { data } = await sb.from('attendance').select('*').gte('work_date', start).lte('work_date', endStr).order('work_date');
    const recs = data || [];
    const nameOf = id => (staffList.find(s => s.id === id) || {}).name || '—';
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    const wmin = a => (a.clock_in && a.clock_out) ? Math.round((new Date(a.clock_out) - new Date(a.clock_in)) / 60000) : 0;
    const fmtH = m => m ? `${Math.floor(m / 60)}h${m % 60}m` : '—';
    const hhmm = t => t ? new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '—';

    F('am-sum').textContent = `${recs.length} 筆打卡`;

    // 每人彙總
    const byEmp = {};
    recs.forEach(a => { const k = a.staff_id; if (!byEmp[k]) byEmp[k] = { days: 0, mins: 0 }; if (a.clock_in) byEmp[k].days++; byEmp[k].mins += wmin(a); });
    const ids = Object.keys(byEmp).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    F('attSummary').querySelector('tbody').innerHTML = ids.length
      ? ids.map(id => `<tr><td>${escapeHtml(nameOf(id))}</td><td class="num">${byEmp[id].days}</td><td class="num">${fmtH(byEmp[id].mins)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted faint">本月無出勤紀錄</td></tr>';

    // 明細
    F('attDetail').querySelector('tbody').innerHTML = recs.length
      ? recs.map(a => `<tr>
          <td style="white-space:nowrap">${a.work_date.replace(/-/g,'/').slice(5)} (${WEEK[new Date(a.work_date).getDay()]})</td>
          <td>${escapeHtml(nameOf(a.staff_id))}</td>
          <td>${hhmm(a.clock_in)}</td>
          <td>${hhmm(a.clock_out)}</td>
          <td class="num">${fmtH(wmin(a))}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="muted faint">本月無出勤紀錄</td></tr>';
  }

  /* ============================================================
   * 5c) 班表（老闆排班；員工在 me.html 看自己的）
   * ========================================================== */
  let smYear, smMonth, shiftList = [], editShiftId = null;
  function initShiftNav() {
    const d = new Date();
    smYear = d.getFullYear(); smMonth = d.getMonth() + 1;
    F('sm-prev').addEventListener('click', () => { smMonth--; if (smMonth < 1) { smMonth = 12; smYear--; } loadShifts(); });
    F('sm-next').addEventListener('click', () => { smMonth++; if (smMonth > 12) { smMonth = 1; smYear++; } loadShifts(); });
    F('addShift').addEventListener('click', () => openShiftModal(null));
    F('sh_cancel').addEventListener('click', () => F('shiftModal').classList.remove('show'));
    F('sh_save').addEventListener('click', saveShift);
    F('sh_delete').addEventListener('click', deleteShift);
  }
  async function loadShifts() {
    F('sm-label').textContent = `${smYear}年${smMonth}月`;
    const start = `${smYear}-${String(smMonth).padStart(2, '0')}-01`;
    const endD = new Date(smYear, smMonth, 0);
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
    const { data } = await sb.from('shifts').select('*').gte('work_date', start).lte('work_date', endStr)
      .order('work_date').order('start_time');
    shiftList = data || [];
    renderShifts();
  }
  function renderShifts() {
    const nameOf = id => (staffList.find(s => s.id === id) || {}).name || '—';
    const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
    F('sm-sum').textContent = `・${shiftList.length} 個班`;
    const first = new Date(smYear, smMonth - 1, 1);
    const days = new Date(smYear, smMonth, 0).getDate();
    const now = new Date();
    const todayS = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let html = WEEK.map(w => `<div class="cal-dow">${w}</div>`).join('');
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) html += '<div class="cal-cell pad"></div>';
    for (let d = 1; d <= days; d++) {
      const ds = `${smYear}-${String(smMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const chips = shiftList.filter(s => s.work_date === ds).map(s => {
        const t = `${s.start_time || ''}${s.end_time ? '~' + s.end_time : ''}`;
        return `<div class="cal-chip click" data-shift="${s.id}" title="${escapeHtml(nameOf(s.staff_id))} ${t}">${escapeHtml(nameOf(s.staff_id))}${s.start_time ? ' ' + s.start_time : ''}</div>`;
      }).join('');
      html += `<div class="cal-cell clickable${ds === todayS ? ' today' : ''}" data-add="${ds}"><div class="cal-dnum">${d}</div>${chips}</div>`;
    }
    F('shiftCal').innerHTML = html;
    F('shiftCal').querySelectorAll('[data-shift]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openShiftModal(el.dataset.shift); }));
    F('shiftCal').querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', () => openShiftModal(null, el.dataset.add)));
  }
  function openShiftModal(id, presetDate) {
    editShiftId = id;
    const s = id ? shiftList.find(x => x.id === id) : null;
    F('shiftModalTitle').textContent = s ? '編輯班次' : '排班';
    F('sh_staff').innerHTML = staffList.filter(x => x.is_active !== false)
      .map(x => `<option value="${x.id}">${escapeHtml(x.name)}${x.employ_type === 'PT' ? '（PT）' : ''}</option>`).join('');
    F('sh_staff').value = s ? s.staff_id : (staffList[0] ? staffList[0].id : '');
    F('sh_date').value = s ? s.work_date : (presetDate || `${smYear}-${String(smMonth).padStart(2, '0')}-01`);
    F('sh_start').value = s ? (s.start_time || '') : '';
    F('sh_end').value = s ? (s.end_time || '') : '';
    F('sh_note').value = s ? (s.note || '') : '';
    F('sh_err').textContent = '';
    F('sh_delete').style.visibility = s ? 'visible' : 'hidden';
    F('shiftModal').classList.add('show');
  }
  async function saveShift() {
    F('sh_err').textContent = '';
    const staff_id = F('sh_staff').value, date = F('sh_date').value;
    if (!staff_id || !date) { F('sh_err').textContent = '請選員工與日期'; return; }
    const btn = F('sh_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      staff_id, work_date: date,
      start_time: F('sh_start').value || null, end_time: F('sh_end').value || null,
      note: F('sh_note').value.trim() || null,
    };
    let error;
    if (editShiftId) ({ error } = await sb.from('shifts').update(payload).eq('id', editShiftId));
    else ({ error } = await sb.from('shifts').insert(payload));
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('sh_err').textContent = '儲存失敗：' + error.message; return; }
    F('shiftModal').classList.remove('show'); toast('✅ 已排班'); loadShifts();
  }
  async function deleteShift() {
    if (!editShiftId || !confirm('確定刪除這個班次？')) return;
    const { error } = await sb.from('shifts').delete().eq('id', editShiftId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('shiftModal').classList.remove('show'); toast('已刪除'); loadShifts();
  }

  /* ============================================================
   * 6) 維運紀錄
   * ========================================================== */
  let maintList = [], editMaintId = null, maintTagFilter = null, maintQuery = '';
  const parseTags = s => [...new Set((s || '').split(/[,，、]/).map(t => t.trim()).filter(Boolean))];

  async function loadMaintenance() {
    const { data, error } = await sb.from('maintenance_records').select('*').order('repair_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { F('maintTable').querySelector('tbody').innerHTML = `<tr><td colspan="6" class="muted faint">讀取失敗：${escapeHtml(error.message)}</td></tr>`; return; }
    maintList = data || [];
    fillYearSelect(F('maint_year'), maintList.map(m => m.repair_date), F('maint_year').value);
    renderMaintenance();
  }

  F('maint_year').addEventListener('change', renderMaintenance);

  function renderMaintenance() {
    // 標籤篩選列
    const allTags = [...new Set(maintList.flatMap(m => m.tags || []))].sort();
    F('maint_tagbar').innerHTML = allTags.length
      ? `<span class="mtag ${!maintTagFilter ? 'on' : ''}" data-tag="">全部</span>` +
        allTags.map(t => `<span class="mtag ${maintTagFilter === t ? 'on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
      : '';
    F('maint_tagbar').querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => {
      maintTagFilter = el.dataset.tag || null; renderMaintenance();
    }));

    const q = maintQuery.trim().toLowerCase();
    const yr = F('maint_year').value;
    let rows = maintList;                                  // 已依日期新→舊排序
    if (yr && yr !== 'all') rows = rows.filter(m => (m.repair_date || '').slice(0, 4) === yr);
    if (maintTagFilter) rows = rows.filter(m => (m.tags || []).includes(maintTagFilter));
    if (q) rows = rows.filter(m => `${m.equipment || ''} ${m.content || ''} ${(m.tags || []).join(' ')} ${m.vendor || ''}`.toLowerCase().includes(q));

    const total = rows.reduce((s, m) => s + Number(m.cost || 0), 0);
    F('maint_sum').textContent = `・${rows.length} 筆・累計 ${formatCurrency(total)}`;

    const tb = F('maintTable').querySelector('tbody');
    tb.innerHTML = rows.length ? rows.map(m => `
      <tr data-id="${m.id}" style="cursor:pointer">
        <td style="white-space:nowrap">${(m.repair_date || '').replace(/-/g,'/')}</td>
        <td>${escapeHtml(m.equipment || '')}</td>
        <td><div style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.content || '')}</div></td>
        <td class="num" style="white-space:nowrap">${formatCurrency(m.cost)}</td>
        <td style="white-space:nowrap">${m.status === 'done' ? '<span class="badge badge-ok">已完成</span>' : `<button class="btn btn-ghost btn-sm" data-done="${m.id}">✓ 完成</button>`}</td>
        <td class="num faint">編輯 ›</td>
      </tr>`).join('') : '<tr><td colspan="6" class="muted faint">沒有符合的維運紀錄</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openMaintModal(tr.dataset.id)));
    tb.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.disabled = true;
      const { error } = await sb.from('maintenance_records').update({ status: 'done' }).eq('id', b.dataset.done);
      if (error) { b.disabled = false; toast('操作失敗：' + error.message, 'error'); return; }
      toast('✅ 已標記完成'); loadMaintenance();
    }));
  }

  F('maint_search').addEventListener('input', () => { maintQuery = F('maint_search').value; renderMaintenance(); });

  F('addMaint').addEventListener('click', () => openMaintModal(null));
  F('m_cancel').addEventListener('click', () => F('maintModal').classList.remove('show'));

  function showMaintMode(mode) {
    F('maintRead').classList.toggle('hidden', mode !== 'read');
    F('maintEdit').classList.toggle('hidden', mode !== 'edit');
    F('maintModalTitle').textContent = mode === 'read' ? '維運紀錄' : (editMaintId ? '編輯維運紀錄' : '新增維運紀錄');
  }

  function openMaintModal(id) {
    editMaintId = id;
    const m = id ? maintList.find(x => x.id === id) : null;
    if (m) { renderMaintRead(m); showMaintMode('read'); }
    else { fillMaintEdit(null); showMaintMode('edit'); }
    F('maintModal').classList.add('show');
  }

  // 閱讀檢視（點進去先看，不直接可編輯；照片直接顯示）
  async function renderMaintRead(m) {
    F('rv_date').textContent = (m.repair_date || '').replace(/-/g, '/');
    F('rv_equipment').textContent = m.equipment || '—';
    F('rv_status').innerHTML = m.status === 'done' ? '<span class="badge badge-ok">已完成</span>' : '<span class="badge badge-wait">叫修中</span>';
    F('rv_cost').textContent = formatCurrency(m.cost);
    F('rv_vendor').textContent = m.vendor || '—';
    F('rv_tags').innerHTML = (m.tags && m.tags.length) ? m.tags.map(t => `<span class="mtag sm">${escapeHtml(t)}</span>`).join('') : '';
    F('rv_content').textContent = m.content || '（無）';
    F('rv_note_wrap').style.display = m.note ? '' : 'none';
    F('rv_note').textContent = m.note || '';
    const pbox = F('rv_photo'); pbox.innerHTML = '';
    if (m.photo_path) {
      pbox.innerHTML = '<div class="label">照片</div><p class="faint">載入中…</p>';
      const { data, error } = await sb.storage.from('maintenance-photos').createSignedUrl(m.photo_path, 3600);
      pbox.innerHTML = error ? '' : `<div class="label">照片</div><img src="${data.signedUrl}" style="max-width:100%;border-radius:10px;border:1px solid var(--line)">`;
    }
  }

  function fillMaintEdit(m) {
    F('m_date').value = m ? m.repair_date : todayStr();
    F('m_equipment').value = m ? (m.equipment || '') : '';
    F('m_cost').value = m ? m.cost : '';
    F('m_vendor').value = m ? (m.vendor || '') : '';
    F('m_status').value = m ? m.status : 'open';
    F('m_content').value = m ? (m.content || '') : '';
    F('m_tags').value = m && m.tags ? m.tags.join(', ') : '';
    F('mtagList').innerHTML = [...new Set(maintList.flatMap(x => x.tags || []))].map(t => `<option value="${escapeHtml(t)}">`).join('');
    F('m_note').value = m ? (m.note || '') : '';
    F('m_photo').value = '';
    F('m_err').textContent = '';
    F('m_delete').style.visibility = m ? 'visible' : 'hidden';
    F('m_photoExisting').innerHTML = '';
    if (m && m.photo_path) {
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'btn btn-ghost btn-sm'; a.textContent = '看現有照片';
      a.onclick = async () => { const { data, error } = await sb.storage.from('maintenance-photos').createSignedUrl(m.photo_path, 3600); if (!error) window.open(data.signedUrl, '_blank'); };
      F('m_photoExisting').appendChild(a);
    }
  }

  async function deleteMaint() {
    if (!editMaintId || !confirm('確定刪除這筆維運紀錄？')) return;
    const m = maintList.find(x => x.id === editMaintId);
    if (m && m.photo_path) await sb.storage.from('maintenance-photos').remove([m.photo_path]);
    const { error } = await sb.from('maintenance_records').delete().eq('id', editMaintId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('maintModal').classList.remove('show'); toast('已刪除'); loadMaintenance();
  }

  F('rv_edit').addEventListener('click', () => { fillMaintEdit(maintList.find(x => x.id === editMaintId)); showMaintMode('edit'); });
  F('rv_close').addEventListener('click', () => F('maintModal').classList.remove('show'));
  F('rv_delete').addEventListener('click', deleteMaint);

  F('m_save').addEventListener('click', async () => {
    F('m_err').textContent = '';
    const date = F('m_date').value;
    if (!date) { F('m_err').textContent = '請填時間'; return; }
    const btn = F('m_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      repair_date: date, equipment: F('m_equipment').value.trim() || null,
      content: F('m_content').value.trim() || null, cost: Number(F('m_cost').value) || 0,
      vendor: F('m_vendor').value.trim() || null, status: F('m_status').value,
      tags: parseTags(F('m_tags').value), note: F('m_note').value.trim() || null,
    };
    let rec, error;
    if (editMaintId) ({ data: rec, error } = await sb.from('maintenance_records').update(payload).eq('id', editMaintId).select().single());
    else ({ data: rec, error } = await sb.from('maintenance_records').insert(payload).select().single());
    if (error) { btn.disabled = false; btn.textContent = '儲存'; F('m_err').textContent = '儲存失敗：' + error.message; return; }
    const file = F('m_photo').files[0];
    if (file && rec) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${rec.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('maintenance-photos').upload(path, file, { upsert: true });
      if (!upErr) await sb.from('maintenance_records').update({ photo_path: path }).eq('id', rec.id);
      else toast('照片上傳失敗：' + upErr.message, 'error');
    }
    btn.disabled = false; btn.textContent = '儲存';
    F('maintModal').classList.remove('show'); toast('✅ 已儲存'); loadMaintenance();
  });

  F('m_delete').addEventListener('click', deleteMaint);

  /* ============================================================
   * 6b) 智慧分析（維運/叫貨年度統計）
   * ========================================================== */
  let izMaint = [], izPur = [];
  async function loadInsights() {
    const [{ data: m }, { data: p }] = await Promise.all([
      sb.from('maintenance_records').select('repair_date,equipment,cost,tags'),
      sb.from('purchases').select('order_date,item_name,category,quantity,total_cost'),
    ]);
    izMaint = m || []; izPur = p || [];
    fillYearSelect(F('iz_year'), [...izMaint.map(x => x.repair_date), ...izPur.map(x => x.order_date)], F('iz_year').value);
    renderInsights();
  }
  F('iz_year').addEventListener('change', renderInsights);
  function aggList(arr, keyFn, amtFn, qtyFn) {
    const m = {};
    arr.forEach(x => { const k = keyFn(x); if (!k) return; if (!m[k]) m[k] = { key: k, count: 0, sum: 0, qty: 0 }; m[k].count++; if (amtFn) m[k].sum += Number(amtFn(x)) || 0; if (qtyFn) m[k].qty += Number(qtyFn(x)) || 0; });
    return Object.values(m);
  }
  function topRows(list, sortKey, fmt, n = 8) {
    const s = [...list].sort((a, b) => b[sortKey] - a[sortKey]).slice(0, n);
    return s.length ? s.map((r, i) => `<div class="kv"><span class="k">${i + 1}. ${escapeHtml(r.key)}</span><span>${fmt(r)}</span></div>`).join('') : '<div class="kv"><span class="muted faint">無資料</span></div>';
  }
  function renderInsights() {
    const yr = F('iz_year').value;
    const m = yr === 'all' ? izMaint : izMaint.filter(x => (x.repair_date || '').slice(0, 4) === yr);
    const p = yr === 'all' ? izPur : izPur.filter(x => (x.order_date || '').slice(0, 4) === yr);
    F('iz_hint').textContent = `維運 ${m.length} 筆・叫貨 ${p.length} 筆`;
    const mByEq = aggList(m, x => x.equipment || '(未填設備)', x => x.cost);
    F('iz_m_count').innerHTML = topRows(mByEq, 'count', r => `${r.count} 次`);
    F('iz_m_cost').innerHTML = topRows(mByEq, 'sum', r => formatCurrency(r.sum));
    const tagAgg = {}; m.forEach(x => (x.tags || []).forEach(t => { tagAgg[t] = (tagAgg[t] || 0) + 1; }));
    F('iz_m_tags').innerHTML = topRows(Object.entries(tagAgg).map(([k, c]) => ({ key: k, count: c })), 'count', r => `${r.count} 次`);
    const pByItem = aggList(p, x => x.item_name, x => x.total_cost, x => x.quantity);
    F('iz_p_count').innerHTML = topRows(pByItem, 'count', r => `${r.count} 次・${r.qty} 件`);
    F('iz_p_cost').innerHTML = topRows(pByItem, 'sum', r => formatCurrency(r.sum));
    const pByCat = aggList(p, x => x.category || '(未分類)', x => x.total_cost);
    F('iz_p_cat').innerHTML = topRows(pByCat, 'sum', r => formatCurrency(r.sum));
  }

  /* ============================================================
   * 7) 帳本（帳戶 + 分錄；薪資/叫貨可選帳戶扣款）
   * ========================================================== */
  let accounts = [], ledgerEntries = [], ledgerCats = [], editAccountId = null, editEntryId = null, revSettings = {};

  // 給薪資/叫貨的帳戶下拉用（若帳本尚未建立則回空）
  async function ensureAccounts() {
    if (accounts.length) return;
    const { data } = await sb.from('accounts').select('*').eq('is_active', true).order('sort_order');
    accounts = data || [];
  }
  function accountOptions(selectedId, emptyLabel) {
    return `<option value="">${emptyLabel || '（不記帳）'}</option>` +
      accounts.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
  }

  async function loadLedger() {
    const [{ data: accs }, { data: ents }, { data: cats }, { data: cfg }] = await Promise.all([
      sb.from('accounts').select('*').order('sort_order').order('created_at'),
      sb.from('ledger_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('ledger_categories').select('*').order('kind').order('sort_order'),
      sb.from('site_settings').select('linepay_account_id,remit_account_id').eq('id', 1).maybeSingle(),
    ]);
    accounts = accs || []; ledgerEntries = ents || []; ledgerCats = cats || []; revSettings = cfg || {};
    fillYearSelect(F('led_year'), ledgerEntries.map(e => e.entry_date), F('led_year').value);
    F('led_account').innerHTML = '<option value="">全部帳戶</option>' + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    renderAccounts();
    renderRevenueSettings();
    renderLedger();
  }
  function renderRevenueSettings() {
    const opts = sel => '<option value="">（不記帳）</option>' + accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
    F('rev_linepay').innerHTML = opts(revSettings.linepay_account_id);
    F('rev_remit').innerHTML = opts(revSettings.remit_account_id);
    F('rev_msg').textContent = '';
  }
  F('rev_save').addEventListener('click', async () => {
    const btn = F('rev_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const { error } = await sb.from('site_settings').update({ linepay_account_id: F('rev_linepay').value || null, remit_account_id: F('rev_remit').value || null }).eq('id', 1);
    btn.disabled = false; btn.textContent = '儲存歸戶設定';
    if (error) { F('rev_msg').textContent = '儲存失敗：' + error.message; return; }
    revSettings.linepay_account_id = F('rev_linepay').value || null;
    revSettings.remit_account_id = F('rev_remit').value || null;
    F('rev_msg').textContent = '✅ 已儲存'; toast('✅ 歸戶設定已更新');
  });
  function accountBalance(id) {
    const a = accounts.find(x => x.id === id); if (!a) return 0;
    let bal = Number(a.initial_balance || 0);
    ledgerEntries.forEach(e => { if (e.account_id === id) bal += (e.type === '收入' || e.type === '轉入') ? Number(e.amount || 0) : -Number(e.amount || 0); });
    return bal;
  }
  function accName(id) { const a = accounts.find(x => x.id === id); return a ? a.name : '—'; }

  function renderAccounts() {
    F('accountCards').innerHTML = accounts.length ? accounts.map(a => `
      <div class="stat" data-acc="${a.id}" style="cursor:pointer">
        <div class="k">${escapeHtml(a.name)} <span class="faint">${escapeHtml(a.type)}</span></div>
        <div class="v">${formatCurrency(accountBalance(a.id))}</div>
      </div>`).join('') : '<p class="muted faint">尚無帳戶，點右上「新增帳戶」</p>';
    F('accountCards').querySelectorAll('[data-acc]').forEach(el => el.addEventListener('click', () => openAccountModal(el.dataset.acc)));
  }
  function renderLedger() {
    const yr = F('led_year').value, mo = F('led_month').value, acc = F('led_account').value;
    let rows = ledgerEntries;
    if (yr && yr !== 'all') rows = rows.filter(e => (e.entry_date || '').slice(0, 4) === yr);
    if (mo !== 'all') rows = rows.filter(e => Number((e.entry_date || '').slice(5, 7)) === Number(mo));
    if (acc) rows = rows.filter(e => e.account_id === acc);
    const inc = rows.filter(e => e.type === '收入' || e.type === '轉入').reduce((s, e) => s + Number(e.amount || 0), 0);
    const exp = rows.filter(e => e.type === '支出' || e.type === '轉出').reduce((s, e) => s + Number(e.amount || 0), 0);
    F('led_sum').textContent = `收入 ${formatCurrency(inc)}・支出 ${formatCurrency(exp)}・淨 ${formatCurrency(inc - exp)}`;
    const tb = F('ledTable').querySelector('tbody');
    tb.innerHTML = rows.length ? rows.map(e => {
      const isIn = e.type === '收入' || e.type === '轉入';
      const srcLabel = e.source === 'payroll' ? '薪資' : e.source === 'purchase' ? '叫貨' : e.source === 'maintenance' ? '維運' : '';
      return `<tr data-id="${e.id}" style="cursor:pointer">
        <td style="white-space:nowrap">${(e.entry_date || '').replace(/-/g,'/').slice(5)}</td>
        <td>${escapeHtml(accName(e.account_id))}</td>
        <td style="white-space:nowrap"><span class="badge ${isIn ? 'badge-ok' : 'badge-ded'}">${e.type}</span></td>
        <td>${escapeHtml(e.category || '')}${srcLabel ? ` <span class="faint">·${srcLabel}</span>` : ''}</td>
        <td class="num" style="white-space:nowrap;color:${isIn ? 'var(--ok)' : 'var(--danger)'}">${isIn ? '+' : '-'}${formatCurrency(e.amount)}</td>
        <td class="faint">${escapeHtml(e.description || '')}</td>
        <td class="num faint">${e.source === 'manual' ? '編輯 ›' : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="muted faint">沒有分錄</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', async () => {
      const e = ledgerEntries.find(x => x.id === tr.dataset.id);
      if (e && e.source === 'transfer') {
        if (!confirm('刪除這筆轉帳？（會一併刪除對應的轉出/轉入兩筆）')) return;
        await sb.from('ledger_entries').delete().eq('source', 'transfer').eq('source_id', e.source_id);
        await logLedger(e.id, 'delete', `刪除轉帳 ${formatCurrency(e.amount)}`, e, null);
        toast('已刪除轉帳'); loadLedger(); return;
      }
      openEntryModal(tr.dataset.id);  // 任何分錄都可編輯（含自動產生的）
    }));
  }
  F('led_year').addEventListener('change', renderLedger);
  F('led_month').addEventListener('change', renderLedger);
  F('led_account').addEventListener('change', renderLedger);

  // 帳戶 modal
  F('addAccount').addEventListener('click', () => openAccountModal(null));
  F('ac_cancel').addEventListener('click', () => F('accountModal').classList.remove('show'));
  function openAccountModal(id) {
    editAccountId = id;
    const a = id ? accounts.find(x => x.id === id) : null;
    F('accountModalTitle').textContent = a ? '編輯帳戶' : '新增帳戶';
    F('ac_name').value = a ? a.name : '';
    F('ac_type').value = a ? a.type : '現金';
    F('ac_initial').value = a ? a.initial_balance : '';
    F('ac_note').value = a ? (a.note || '') : '';
    F('ac_err').textContent = '';
    F('ac_delete').style.visibility = a ? 'visible' : 'hidden';
    F('accountModal').classList.add('show');
  }
  F('ac_save').addEventListener('click', async () => {
    const name = F('ac_name').value.trim();
    if (!name) { F('ac_err').textContent = '請填名稱'; return; }
    const btn = F('ac_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = { name, type: F('ac_type').value, initial_balance: Number(F('ac_initial').value) || 0, note: F('ac_note').value.trim() || null };
    let error;
    if (editAccountId) ({ error } = await sb.from('accounts').update(payload).eq('id', editAccountId));
    else ({ error } = await sb.from('accounts').insert(payload));
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('ac_err').textContent = '儲存失敗：' + error.message; return; }
    F('accountModal').classList.remove('show'); toast('✅ 已儲存'); loadLedger();
  });
  F('ac_delete').addEventListener('click', async () => {
    if (!editAccountId || !confirm('刪除帳戶？該帳戶的分錄會保留但失去關聯。')) return;
    const { error } = await sb.from('accounts').delete().eq('id', editAccountId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('accountModal').classList.remove('show'); toast('已刪除'); loadLedger();
  });

  // 分錄 modal
  F('addEntry').addEventListener('click', () => openEntryModal(null));
  F('en_cancel').addEventListener('click', () => F('entryModal').classList.remove('show'));
  F('en_type').addEventListener('change', applyEntryType);
  function applyEntryType() {
    const isT = F('en_type').value === '轉帳';
    F('en_to_field').style.display = isT ? '' : 'none';
    F('en_cat_field').style.display = isT ? 'none' : '';
    F('en_acc_label').textContent = isT ? '轉出帳戶 ★' : '帳戶 ★';
    if (!isT) fillEntryCats(F('en_category').value);
  }
  function fillEntryCats(cur) {
    const kind = F('en_type').value === '收入' ? 'income' : 'expense';
    const cats = ledgerCats.filter(c => c.kind === kind);
    let html = '<option value="">—</option>' + cats.map(c => `<option ${c.name === cur ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    if (cur && !cats.some(c => c.name === cur)) html += `<option selected>${escapeHtml(cur)}</option>`;
    F('en_category').innerHTML = html;
    if (cur) F('en_category').value = cur;
  }
  function openEntryModal(id) {
    editEntryId = id;
    const e = id ? ledgerEntries.find(x => x.id === id) : null;
    if (!accounts.length) { toast('請先新增至少一個帳戶'); return; }
    F('entryModalTitle').textContent = e ? '編輯分錄' : '新增分錄';
    F('en_type').value = e ? (e.type === '收入' ? '收入' : '支出') : '支出';
    F('en_date').value = e ? e.entry_date : todayStr();
    const accOpts = '<option value="">（無帳戶）</option>' + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    F('en_account').innerHTML = accOpts;
    F('en_account').value = e ? (e.account_id || '') : accounts[0].id;
    F('en_to_account').innerHTML = accOpts;
    if (accounts[1]) F('en_to_account').value = accounts[1].id;
    fillEntryCats(e ? e.category : '');
    applyEntryType();
    F('en_amount').value = e ? e.amount : '';
    F('en_desc').value = e ? (e.description || '') : '';
    F('en_err').textContent = '';
    F('en_delete').style.visibility = e ? 'visible' : 'hidden';
    F('entryModal').classList.add('show');
  }
  F('en_save').addEventListener('click', async () => {
    F('en_err').textContent = '';
    const type = F('en_type').value;
    const acc = F('en_account').value, amount = Number(F('en_amount').value) || 0;
    const date = F('en_date').value;
    if (!(amount > 0)) { F('en_err').textContent = '請填金額'; return; }
    const btn = F('en_save'); btn.disabled = true; btn.textContent = '儲存中…';

    if (type === '轉帳') {
      const to = F('en_to_account').value;
      if (!acc || !to || to === acc) { btn.disabled = false; btn.textContent = '儲存'; F('en_err').textContent = '請選不同的轉出/轉入帳戶'; return; }
      const gid = crypto.randomUUID();
      const desc = F('en_desc').value.trim() || `轉帳：${accName(acc)} → ${accName(to)}`;
      const { error } = await sb.from('ledger_entries').insert([
        { account_id: acc, type: '轉出', category: null, amount, description: desc, entry_date: date, source: 'transfer', source_id: gid },
        { account_id: to, type: '轉入', category: null, amount, description: desc, entry_date: date, source: 'transfer', source_id: gid },
      ]);
      btn.disabled = false; btn.textContent = '儲存';
      if (error) { F('en_err').textContent = '儲存失敗：' + error.message; return; }
      F('entryModal').classList.remove('show'); toast('✅ 已轉帳'); loadLedger();
      return;
    }

    const orig = editEntryId ? ledgerEntries.find(x => x.id === editEntryId) : null;
    const payload = { account_id: acc || null, type, category: F('en_category').value || null, amount, description: F('en_desc').value.trim() || null, entry_date: date, source: orig ? orig.source : 'manual', source_id: orig ? orig.source_id : null };
    let error;
    if (editEntryId) ({ error } = await sb.from('ledger_entries').update(payload).eq('id', editEntryId));
    else ({ error } = await sb.from('ledger_entries').insert(payload));
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('en_err').textContent = '儲存失敗：' + error.message; return; }
    if (editEntryId && orig) await logLedger(editEntryId, 'update', summarizeDiff(orig, payload), orig, payload);
    F('entryModal').classList.remove('show'); toast('✅ 已儲存'); loadLedger();
  });
  F('en_delete').addEventListener('click', async () => {
    if (!editEntryId || !confirm('刪除這筆分錄？')) return;
    const orig = ledgerEntries.find(x => x.id === editEntryId);
    const { error } = await sb.from('ledger_entries').delete().eq('id', editEntryId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    await logLedger(editEntryId, 'delete', `刪除：${orig ? (orig.category || orig.type) : ''} ${orig ? formatCurrency(orig.amount) : ''}`, orig, null);
    F('entryModal').classList.remove('show'); toast('已刪除'); loadLedger();
  });

  // ── 異動紀錄 ──────────────────────────────────────
  function summarizeDiff(before, after) {
    const fields = { account_id: '帳戶', type: '類型', category: '分類', amount: '金額', entry_date: '日期', description: '說明' };
    const an = id => (accounts.find(a => a.id === id) || {}).name || '無';
    const parts = [];
    Object.keys(fields).forEach(k => {
      let b = before ? before[k] : undefined, a = after[k];
      if (k === 'account_id') { b = an(b); a = an(a); }
      if ((b == null ? '' : b) !== (a == null ? '' : a)) parts.push(`${fields[k]} ${b == null || b === '' ? '空' : b}→${a == null || a === '' ? '空' : a}`);
    });
    return parts.join('，') || '無變更';
  }
  async function logLedger(entryId, action, summary, before, after) {
    await sb.from('ledger_logs').insert({ entry_id: entryId, action, summary, before: before || null, after: after || null, changed_by: ME.id, changed_at: new Date().toISOString() });
  }
  F('viewLogs').addEventListener('click', loadLogs);
  F('logs_close').addEventListener('click', () => F('logsModal').classList.remove('show'));
  async function loadLogs() {
    F('logsModal').classList.add('show');
    F('logsList').innerHTML = '<p class="muted faint">載入中…</p>';
    const { data } = await sb.from('ledger_logs').select('*').order('changed_at', { ascending: false }).limit(100);
    const nameOf = id => (staffList.find(s => s.id === id) || {}).name || '—';
    const recs = data || [];
    F('logsList').innerHTML = recs.length ? recs.map(l => `
      <div style="border-bottom:1px solid var(--line-soft);padding:9px 0">
        <div class="flex" style="justify-content:space-between"><span style="font-weight:500">${l.action === 'delete' ? '🗑 刪除' : '✏️ 編輯'}</span><span class="faint">${new Date(l.changed_at).toLocaleString('zh-TW')}・${escapeHtml(nameOf(l.changed_by))}</span></div>
        <div class="faint" style="margin-top:2px">${escapeHtml(l.summary || '')}</div>
      </div>`).join('') : '<p class="muted faint">尚無異動紀錄。</p>';
  }

  /* ============================================================
   * 7b) 大交班查詢（老闆看店員每日結帳）
   * ========================================================== */
  let hoList = [], editHoId = null;
  async function loadHandover() {
    const { data } = await sb.from('cash_counts').select('*').order('count_date', { ascending: false });
    hoList = data || [];
    fillYearSelect(F('ho_year'), hoList.map(r => r.count_date), F('ho_year').value);
    renderHandover();
  }
  F('ho_year').addEventListener('change', renderHandover);
  F('ho_month').addEventListener('change', renderHandover);
  F('ho_close').addEventListener('click', () => F('hoModal').classList.remove('show'));
  function renderHandover() {
    const yr = F('ho_year').value, mo = F('ho_month').value;
    let rows = hoList;
    if (yr !== 'all') rows = rows.filter(r => (r.count_date || '').slice(0, 4) === yr);
    if (mo !== 'all') rows = rows.filter(r => Number((r.count_date || '').slice(5, 7)) === Number(mo));
    F('ho_sum').textContent = `${rows.length} 天`;
    const nameOf = id => (staffList.find(s => s.id === id) || {}).name || '—';
    const tb = F('hoTable').querySelector('tbody');
    tb.innerHTML = rows.length ? rows.map(r => {
      const pur = r.purchases || [], purT = pur.reduce((s, p) => s + Number(p.amount || 0), 0);
      return `<tr data-id="${r.id}" style="cursor:pointer">
        <td style="white-space:nowrap">${r.count_date.replace(/-/g,'/')}</td>
        <td class="num">${formatCurrency(r.tray_total)}</td>
        <td class="num">${formatCurrency(r.safe_total)}</td>
        <td class="num" style="font-weight:600">${formatCurrency(r.total)}</td>
        <td class="faint">${pur.length ? `${pur.length}筆 ${formatCurrency(purT)}` : '—'}</td>
        <td class="faint">${escapeHtml(nameOf(r.counted_by))}</td>
        <td class="num faint">明細 ›</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="muted faint">這段期間沒有大交班紀錄</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openHandoverDetail(tr.dataset.id)));
  }
  F('ho_delete').addEventListener('click', async () => {
    const r = hoList.find(x => x.id === editHoId); if (!r) return;
    if (!confirm(`確定刪除 ${r.count_date.replace(/-/g,'/')} 的大交班紀錄？（會一併刪除當天大交班產生的採購與帳本分錄）`)) return;
    await sb.from('ledger_entries').delete().eq('source', 'daily').eq('entry_date', r.count_date);
    await sb.from('purchases').delete().eq('source', 'daily').eq('order_date', r.count_date);
    const { error } = await sb.from('cash_counts').delete().eq('id', editHoId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('hoModal').classList.remove('show'); toast('已刪除大交班'); loadHandover();
  });
  function openHandoverDetail(id) {
    editHoId = id;
    const r = hoList.find(x => x.id === id); if (!r) return;
    const DEN = [1000, 500, 100, 50, 10, 5, 1];
    const denRows = obj => DEN.filter(d => obj && obj[d]).map(d => `<div class="kv"><span class="k">${d}</span><span>${formatCurrency(obj[d])}</span></div>`).join('') || '<div class="kv"><span class="muted faint">—</span></div>';
    const pur = r.purchases || [];
    F('hoModalTitle').textContent = `大交班明細 ${r.count_date.replace(/-/g,'/')}`;
    F('hoDetail').innerHTML = `
      <div class="grid2">
        <div><p style="font-weight:600;margin:0 0 6px">錢盤 ${formatCurrency(r.tray_total)}</p>${denRows(r.tray)}</div>
        <div><p style="font-weight:600;margin:0 0 6px">金庫 ${formatCurrency(r.safe_total)}</p>${denRows(r.safe)}</div>
      </div>
      <div class="kv mt8" style="font-weight:700;border-top:1px solid var(--line);padding-top:8px"><span>店內現金</span><span>${formatCurrency(r.total)}</span></div>
      <div class="divider"></div>
      <p style="font-weight:600;margin:0 0 6px">當日採購</p>
      ${pur.length ? pur.map(p => `<div class="kv"><span class="k">${escapeHtml(p.name)} ×${p.qty}</span><span>${formatCurrency(p.amount)}</span></div>`).join('') : '<div class="kv"><span class="muted faint">無</span></div>'}
      ${r.note ? `<div class="divider"></div><p class="faint">備註：${escapeHtml(r.note)}</p>` : ''}`;
    F('hoModal').classList.add('show');
  }

  /* ============================================================
   * 8) 財務三大報表（用帳本資料即時算）
   * ========================================================== */
  let repAccounts = [], repEntries = [];
  async function loadReports() {
    const [{ data: accs }, { data: ents }] = await Promise.all([
      sb.from('accounts').select('*'),
      sb.from('ledger_entries').select('*'),
    ]);
    repAccounts = accs || []; repEntries = ents || [];
    fillYearSelect(F('rep_year'), repEntries.map(e => e.entry_date), F('rep_year').value);
    renderReports();
  }
  F('rep_year').addEventListener('change', renderReports);
  F('rep_month').addEventListener('change', renderReports);

  function renderReports() {
    const yr = F('rep_year').value, mo = F('rep_month').value;
    let pStart, pEnd, label;
    if (yr === 'all') { pStart = '0000-01-01'; pEnd = '9999-12-31'; label = '全部期間'; }
    else if (mo === 'all') { pStart = `${yr}-01-01`; pEnd = `${yr}-12-31`; label = `${yr}年`; }
    else { const m = String(mo).padStart(2, '0'); const last = new Date(Number(yr), Number(mo), 0).getDate(); pStart = `${yr}-${m}-01`; pEnd = `${yr}-${m}-${String(last).padStart(2, '0')}`; label = `${yr}年${mo}月`; }
    F('rep_pl_period').textContent = label;
    F('rep_hint').textContent = `期間 ${pStart.replace(/-/g,'/')} ~ ${pEnd.replace(/-/g,'/')}`;

    const period = repEntries.filter(e => e.entry_date >= pStart && e.entry_date <= pEnd);
    const sign = e => (e.type === '收入' || e.type === '轉入') ? Number(e.amount || 0) : -Number(e.amount || 0);
    const initSum = repAccounts.reduce((s, a) => s + Number(a.initial_balance || 0), 0);
    const hr = `<div class="divider"></div>`;
    const sub = t => `<p style="font-weight:600;margin:12px 0 6px">${t}</p>`;
    const kv = (k, v, color) => `<div class="kv"><span class="k">${escapeHtml(k)}</span><span${color ? ` style="color:${color}"` : ''}>${v}</span></div>`;
    const grp = type => { const m = {}; period.filter(e => e.type === type && e.category !== '大交班現金').forEach(e => { const c = e.category || '未分類'; m[c] = (m[c] || 0) + Number(e.amount || 0); }); return m; };
    const rows = m => Object.keys(m).length ? Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => kv(k, formatCurrency(v))).join('') : '<div class="kv"><span class="muted faint">—</span></div>';

    // 損益表
    const inc = grp('收入'), exp = grp('支出');
    const incT = Object.values(inc).reduce((s, v) => s + v, 0), expT = Object.values(exp).reduce((s, v) => s + v, 0);
    const net = incT - expT;
    F('rep_pl').innerHTML = sub('營業收入') + rows(inc) + kv('收入合計', `<b>${formatCurrency(incT)}</b>`) + hr
      + sub('營業支出') + rows(exp) + kv('支出合計', `<b>${formatCurrency(expT)}</b>`) + hr
      + `<div class="kv" style="font-size:16px;font-weight:700"><span>本期淨利</span><span style="color:${net >= 0 ? 'var(--ok)' : 'var(--danger)'}">${formatCurrency(net)}</span></div>`;

    // 現金流量表
    const opening = initSum + repEntries.filter(e => e.entry_date < pStart).reduce((s, e) => s + sign(e), 0);
    const inflow = period.filter(e => e.type === '收入').reduce((s, e) => s + Number(e.amount || 0), 0);
    const outflow = period.filter(e => e.type === '支出').reduce((s, e) => s + Number(e.amount || 0), 0);
    const ending = opening + inflow - outflow;
    F('rep_cf').innerHTML = kv('期初現金', formatCurrency(opening))
      + kv('本期現金流入（收入）', '+' + formatCurrency(inflow), 'var(--ok)')
      + kv('本期現金流出（支出）', '-' + formatCurrency(outflow), 'var(--danger)') + hr
      + `<div class="kv" style="font-weight:700"><span>期末現金</span><span>${formatCurrency(ending)}</span></div>`;

    // 資產負債表（期末）
    const accBalAt = id => initSum * 0 + (() => { const a = repAccounts.find(x => x.id === id); if (!a) return 0; return Number(a.initial_balance || 0) + repEntries.filter(e => e.account_id === id && e.entry_date <= pEnd).reduce((s, e) => s + sign(e), 0); })();
    const assetRows = repAccounts.length ? repAccounts.map(a => kv(a.name, formatCurrency(accBalAt(a.id)))).join('') : '<div class="kv"><span class="muted faint">尚無帳戶</span></div>';
    const totalAssets = repAccounts.reduce((s, a) => s + accBalAt(a.id), 0);
    F('rep_bs').innerHTML = sub('資產（現金及約當現金）') + assetRows + kv('資產合計', `<b>${formatCurrency(totalAssets)}</b>`) + hr
      + kv('負債（目前未追蹤應付）', formatCurrency(0)) + hr
      + `<div class="kv" style="font-weight:700"><span>業主權益</span><span>${formatCurrency(totalAssets)}</span></div>`;
  }
})();
