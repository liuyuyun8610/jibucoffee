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
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const name = t.dataset.tab;
    document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
    if (name === 'revenue') loadRevenue();
    if (name === 'payroll') loadPayrollMonth();
  }));

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
})();
