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
    const h = tab === 'people' ? `people${sub && sub !== 'hr' ? ':' + sub : ''}` : tab;
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
    writeHash('people', name);
  }
  function activateTab(name, sub) {
    if (!document.querySelector(`.tab[data-tab="${name}"]`)) name = 'people';
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
    if (name === 'revenue') loadRevenue();
    if (name === 'inventory') loadInventory();
    if (name === 'maintenance') loadMaintenance();
    if (name === 'people') activateSub(sub || currentSub());
    else writeHash(name);
  }

  document.querySelectorAll('.tab[data-tab]').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
  document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => activateSub(t.dataset.sub)));

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

  const EMP_FIELDS = ['name','employee_no','role','department','position','hire_date','phone','base_salary','insured_salary','labor_insurance','health_insurance','pension'];
  let editingId = null;

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
    // 新增才顯示 email/密碼欄
    F('empAuthFields').style.display = s ? 'none' : 'block';
    F('e_email').value = ''; F('e_password').value = s ? '' : randPw();
    EMP_FIELDS.forEach(k => { if (F('e_' + k)) F('e_' + k).value = (s && s[k] != null) ? s[k] : (k === 'role' ? 'employee' : ''); });

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
      if (k === 'base_salary') v = v === '' ? 0 : Number(v);
      else if (k === 'insured_salary') v = v === '' ? null : Number(v);
      else if (v === '') v = null;
      p[k] = v;
    });
    return p;
  }

  F('empSave').addEventListener('click', async () => {
    const btn = F('empSave'); F('e_err').textContent = '';
    const profile = collectEmp();
    if (!profile.name) { F('e_err').textContent = '請填姓名'; return; }
    btn.disabled = true; btn.textContent = '儲存中…';

    if (editingId) {
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
  let pYear, pMonth, monthRecords = [], selectedEmpId = null, editRec = null, editItems = [];

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

  async function selectEmp(empId) {
    selectedEmpId = empId;
    renderPayEmpList();
    const emp = staffList.find(s => s.id === empId);
    const existing = monthRecords.find(r => r.staff_id === empId);
    if (existing) {
      const { data: items } = await sb.from('payroll_items').select('*').eq('payroll_id', existing.id);
      editRec = { ...existing };
      editItems = items || [];
    } else {
      editRec = {
        staff_id: empId, year: pYear, month: pMonth,
        base_salary: emp.base_salary || 0, work_days: 0,
        ot_weekday_minutes: 0, ot_restday_minutes: 0, ot_pay: 0, total_pay: emp.base_salary || 0, note: '',
      };
      editItems = [];
    }
    const { otPay, total } = recalcTotal(editRec, editItems);
    editRec.ot_pay = otPay; editRec.total_pay = total;
    renderPayDetail(emp);
  }

  function renderPayDetail(emp) {
    const r = editRec;
    const hr = (r.base_salary || 0) / 240;
    const wdH = (r.ot_weekday_minutes || 0) / 60, rdH = (r.ot_restday_minutes || 0) / 60;
    F('payDetail').innerHTML = `
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
      </div>
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
      </div>`;

    F('f_base').addEventListener('input', () => updateField('base_salary', num(F('f_base').value)));
    F('f_days').addEventListener('input', () => { editRec.work_days = num(F('f_days').value); });
    F('f_wd').addEventListener('input', () => updateField('ot_weekday_minutes', num(F('f_wd').value)));
    F('f_rd').addEventListener('input', () => updateField('ot_restday_minutes', num(F('f_rd').value)));
    F('f_note').addEventListener('input', () => { editRec.note = F('f_note').value; });
    F('addAdd').addEventListener('click', () => { editItems.push({ name: '', amount: 0, type: 'addition' }); renderItems(); refreshTotals(); });
    F('addDed').addEventListener('click', () => { editItems.push({ name: '', amount: 0, type: 'deduction' }); renderItems(); refreshTotals(); });
    F('saveRec').addEventListener('click', saveRecord);
    renderItems(); renderOtDetail(); renderPayBox();
  }

  const num = v => Number(v) || 0;
  function updateField(k, v) { editRec[k] = v; refreshTotals(); renderOtDetail(); }
  function refreshTotals() {
    const { otPay, total } = recalcTotal(editRec, editItems);
    editRec.ot_pay = otPay; editRec.total_pay = total;
    if (F('f_otpay')) F('f_otpay').value = formatCurrency(otPay);
    if (F('f_total')) F('f_total').textContent = formatCurrency(total);
  }
  function renderOtDetail() {
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
      <div class="field"><label class="label">轉帳憑證圖片（選填）</label><input type="file" accept="image/*" id="pay_file"></div>
      <button class="btn btn-primary btn-sm" id="savePay">記錄發放</button>`;
    F('savePay').addEventListener('click', savePayment);
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
    toast('✅ 已記錄發放');
    renderPayBox();
  }
  async function clearPayment() {
    if (!confirm('確定取消此筆發放紀錄？憑證也會一併刪除。')) return;
    if (editRec.paid_proof_path) await sb.storage.from('payroll-proofs').remove([editRec.paid_proof_path]);
    const { error } = await sb.from('payroll_records').update({ paid_at: null, paid_note: null, paid_proof_path: null }).eq('id', editRec.id);
    if (error) { toast('操作失敗：' + error.message, 'error'); return; }
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
   * 4) 庫存叫貨
   * ========================================================== */
  let purchases = [], stockItems = [], invLoaded = false;

  async function loadInventory() {
    const [{ data: pdata, error }, { data: sdata }] = await Promise.all([
      sb.from('purchases').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('stock_items').select('*').eq('is_active', true).order('sort_order').order('name'),
    ]);
    if (error) { F('invTable').querySelector('tbody').innerHTML = `<tr><td colspan="8" class="muted faint">讀取失敗：${escapeHtml(error.message)}</td></tr>`; return; }
    purchases = pdata || [];
    stockItems = sdata || [];
    invLoaded = true;
    renderInventory();
    renderStockList();
    fillItemSelect();
    refreshDatalists();
  }

  // 把庫存品項填進叫貨的品項下拉；currentName 為編輯時的既有值（即使已停用也保留可選）
  function fillItemSelect(currentName) {
    const sel = F('p_item');
    const names = stockItems.map(s => s.name);
    let html = '<option value="">選擇品項…</option>' +
      stockItems.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.unit ? `（${escapeHtml(s.unit)}）` : ''}</option>`).join('');
    if (currentName && !names.includes(currentName)) html += `<option value="${escapeHtml(currentName)}" selected>${escapeHtml(currentName)}（清單外）</option>`;
    sel.innerHTML = html;
    if (currentName) sel.value = currentName;
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

  F('inv_range').addEventListener('change', renderInventory);

  function renderInventory() {
    const which = F('inv_range').value;
    let rows = purchases;
    if (which !== 'all') {
      const { start, end } = monthRange(which);
      rows = purchases.filter(p => p.order_date >= start && p.order_date <= end);
    }
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
    F('pcatList').innerHTML = uniq(purchases.map(p => p.category)).map(v => `<option value="${escapeHtml(v)}">`).join('');
    F('supList').innerHTML = uniq([...purchases.map(p => p.supplier), ...stockItems.map(s => s.vendor)]).map(v => `<option value="${escapeHtml(v)}">`).join('');
    F('svendorList').innerHTML = uniq(stockItems.map(s => s.vendor)).map(v => `<option value="${escapeHtml(v)}">`).join('');
  }

  /* ===== 庫存品項主檔 ===== */
  const UNIT_PRESETS = ['g', '磅', 'ml', '罐'];
  let editStockId = null;

  function renderStockList() {
    if (!stockItems.length) { F('stockList').innerHTML = '<p class="muted faint">尚無品項，點「新增品項」建立叫貨用的清單</p>'; return; }
    F('stockList').innerHTML = stockItems.map(s => `
      <span class="chip" data-id="${s.id}" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;margin:0 6px 8px 0;font-size:13px">
        <b style="font-weight:500">${escapeHtml(s.name)}</b>
        ${s.unit ? `<span class="faint">${escapeHtml(s.unit)}</span>` : ''}
        ${s.cost ? `<span class="faint">成本${formatCurrency(s.cost)}</span>` : ''}
        ${s.price ? `<span class="faint">售${formatCurrency(s.price)}</span>` : ''}
      </span>`).join('');
    F('stockList').querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => openStockModal(el.dataset.id)));
  }

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

  F('addStock').addEventListener('click', () => openStockModal(null));
  F('s_cancel').addEventListener('click', () => F('stockModal').classList.remove('show'));

  function openStockModal(id) {
    editStockId = id;
    const s = id ? stockItems.find(x => x.id === id) : null;
    F('stockModalTitle').textContent = s ? '編輯品項' : '新增品項';
    F('s_name').value = s ? s.name : '';
    F('s_cost').value = s ? (s.cost || '') : '';
    F('s_price').value = s ? (s.price || '') : '';
    F('s_vendor').value = s ? (s.vendor || '') : '';
    F('s_note').value = s ? (s.note || '') : '';
    buildUnitOptions(s ? (s.unit || '') : '');
    F('s_err').textContent = '';
    F('s_delete').style.visibility = s ? 'visible' : 'hidden';
    F('stockModal').classList.add('show');
  }

  F('s_save').addEventListener('click', async () => {
    F('s_err').textContent = '';
    const name = F('s_name').value.trim();
    if (!name) { F('s_err').textContent = '請填品名'; return; }
    let unit = F('s_unit').value; if (unit === '__add__') unit = '';
    const btn = F('s_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      name, cost: Number(F('s_cost').value) || 0, price: Number(F('s_price').value) || 0,
      vendor: F('s_vendor').value.trim() || null, unit: unit || null, note: F('s_note').value.trim() || null,
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

  // 叫貨選品項時自動帶入單位/成本
  F('p_item').addEventListener('change', () => {
    const s = stockItems.find(x => x.name === F('p_item').value);
    if (s) {
      if (s.unit) F('p_unit').value = s.unit;
      if (s.cost && !Number(F('p_cost').value)) { F('p_cost').value = s.cost; calcSub(); }
      if (s.category && !F('p_category').value) F('p_category').value = s.category;
    }
  });

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

  function openPurModal(id) {
    editPurId = id;
    const p = id ? purchases.find(x => x.id === id) : null;
    F('purModalTitle').textContent = p ? '編輯叫貨' : '新增叫貨';
    F('p_date').value = p ? p.order_date : todayStr();
    fillItemSelect(p ? p.item_name : null);
    F('p_category').value = p ? (p.category || '') : '';
    F('p_qty').value = p ? p.quantity : '';
    F('p_unit').value = p ? (p.unit || '') : '';
    F('p_cost').value = p ? p.unit_cost : '';
    F('p_supplier').value = p ? (p.supplier || '') : '';
    F('p_note').value = p ? (p.note || '') : '';
    F('p_err').textContent = '';
    calcSub();
    F('p_delete').style.visibility = p ? 'visible' : 'hidden';
    F('purModal').classList.add('show');
  }

  F('p_save').addEventListener('click', async () => {
    F('p_err').textContent = '';
    const item = F('p_item').value.trim();
    const date = F('p_date').value;
    if (!date || !item) { F('p_err').textContent = '請填叫貨日期與品項'; return; }
    const qty = Number(F('p_qty').value) || 0;
    const cost = Number(F('p_cost').value) || 0;
    const btn = F('p_save'); btn.disabled = true; btn.textContent = '儲存中…';
    const payload = {
      order_date: date, item_name: item, category: F('p_category').value.trim() || null,
      quantity: qty, unit: F('p_unit').value.trim() || null, unit_cost: cost, total_cost: qty * cost,
      supplier: F('p_supplier').value.trim() || null, note: F('p_note').value.trim() || null,
    };
    let error;
    if (editPurId) ({ error } = await sb.from('purchases').update(payload).eq('id', editPurId));
    else ({ error } = await sb.from('purchases').insert(payload));
    btn.disabled = false; btn.textContent = '儲存';
    if (error) { F('p_err').textContent = '儲存失敗：' + error.message; return; }
    F('purModal').classList.remove('show'); toast('✅ 已儲存'); loadInventory();
  });

  F('p_delete').addEventListener('click', async () => {
    if (!editPurId || !confirm('確定刪除這筆叫貨紀錄？')) return;
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
        </div>
      </div>`).join('') : '<p class="muted faint">目前沒有待審核的申請 🎉</p>';

    F('reviewDone').innerHTML = done.length ? done.map(r => {
      const st = r.status === 'approved' ? '<span class="badge badge-ok">已核准</span>' : '<span class="badge badge-ded">已駁回</span>';
      return `<div class="list-row" style="cursor:default"><div>${escapeHtml(nameOf(r.staff_id))}　${r.work_date.replace(/-/g,'/')} 補${KIND_LABEL[r.kind]} ${hhmmIso(r.requested_time)}</div>${st}</div>`;
    }).join('') : '<p class="muted faint">尚無紀錄</p>';

    F('reviewPending').querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => approveReq(reviewMap[b.dataset.ok])));
    F('reviewPending').querySelectorAll('[data-no]').forEach(b => b.addEventListener('click', () => rejectReq(reviewMap[b.dataset.no])));
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
   * 6) 維運紀錄
   * ========================================================== */
  let maintList = [], editMaintId = null, maintTagFilter = null, maintQuery = '';
  const parseTags = s => [...new Set((s || '').split(/[,，、]/).map(t => t.trim()).filter(Boolean))];

  async function loadMaintenance() {
    const { data, error } = await sb.from('maintenance_records').select('*').order('repair_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { F('maintTable').querySelector('tbody').innerHTML = `<tr><td colspan="7" class="muted faint">讀取失敗：${escapeHtml(error.message)}</td></tr>`; return; }
    maintList = data || [];
    renderMaintenance();
  }

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
    let rows = maintList;                                  // 已依日期新→舊排序
    if (maintTagFilter) rows = rows.filter(m => (m.tags || []).includes(maintTagFilter));
    if (q) rows = rows.filter(m => `${m.equipment || ''} ${m.content || ''} ${(m.tags || []).join(' ')} ${m.vendor || ''}`.toLowerCase().includes(q));

    const total = rows.reduce((s, m) => s + Number(m.cost || 0), 0);
    F('maint_sum').textContent = `・${rows.length} 筆・累計 ${formatCurrency(total)}`;

    const tb = F('maintTable').querySelector('tbody');
    tb.innerHTML = rows.length ? rows.map(m => `
      <tr data-id="${m.id}" style="cursor:pointer">
        <td style="white-space:nowrap">${(m.repair_date || '').replace(/-/g,'/')}</td>
        <td>${escapeHtml(m.equipment || '')}</td>
        <td>${escapeHtml((m.content || '').slice(0,28))}${(m.content || '').length > 28 ? '…' : ''}${(m.tags && m.tags.length) ? `<div style="margin-top:4px">${m.tags.map(t => `<span class="mtag sm">${escapeHtml(t)}</span>`).join('')}</div>` : ''}</td>
        <td class="num" style="white-space:nowrap">${formatCurrency(m.cost)}</td>
        <td style="white-space:nowrap">${m.status === 'done' ? '<span class="badge badge-ok">已完成</span>' : '<span class="badge badge-wait">叫修中</span>'}</td>
        <td>${m.photo_path ? '📷' : ''}</td>
        <td class="num faint">編輯 ›</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted faint">沒有符合的維運紀錄</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openMaintModal(tr.dataset.id)));
  }

  F('maint_search').addEventListener('input', () => { maintQuery = F('maint_search').value; renderMaintenance(); });

  F('addMaint').addEventListener('click', () => openMaintModal(null));
  F('m_cancel').addEventListener('click', () => F('maintModal').classList.remove('show'));

  function openMaintModal(id) {
    editMaintId = id;
    const m = id ? maintList.find(x => x.id === id) : null;
    F('maintModalTitle').textContent = m ? '編輯維運紀錄' : '新增維運紀錄';
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
    F('maintModal').classList.add('show');
  }

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

  F('m_delete').addEventListener('click', async () => {
    if (!editMaintId || !confirm('確定刪除這筆維運紀錄？')) return;
    const m = maintList.find(x => x.id === editMaintId);
    if (m && m.photo_path) await sb.storage.from('maintenance-photos').remove([m.photo_path]);
    const { error } = await sb.from('maintenance_records').delete().eq('id', editMaintId);
    if (error) { toast('刪除失敗：' + error.message, 'error'); return; }
    F('maintModal').classList.remove('show'); toast('已刪除'); loadMaintenance();
  });
})();
