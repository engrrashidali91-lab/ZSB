(function () {
  const session = requireRole('accountant');
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const myProjects = getProjectsForUser(db, user);

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('project');
  let currentProjectId = (requestedId && myProjects.some((p) => p.id === requestedId))
    ? requestedId
    : (myProjects.length ? myProjects[0].id : null);

  const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  renderSidebar({
    containerId: 'navList',
    activeKey: 'projects',
    hideKeys: ['engineering', 'tenders', 'store', 'team-status'],
    hrefs: { dashboard: 'accountant-dashboard.html' },
  });

  function currentProject() {
    return db.projects.find((p) => p.id === currentProjectId);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatMoney(n) {
    return 'PKR ' + Number(n || 0).toLocaleString('en-PK');
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  /* ---- project selector / header ---- */

  function renderProjectSelect() {
    const el = document.getElementById('projectSelect');
    if (myProjects.length === 0) {
      el.innerHTML = '<option>No projects assigned</option>';
      el.disabled = true;
      return;
    }
    el.innerHTML = myProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    el.value = currentProjectId;
    el.addEventListener('change', () => {
      window.location.href = `accountant-project.html?project=${el.value}`;
    });
  }

  function renderHeader() {
    const project = currentProject();
    document.getElementById('projectTitle').textContent = project.name;
    const meta = PROJECT_STATUS[project.status];
    document.getElementById('statusBadge').className = `badge ${meta.badgeClass}`;
    document.getElementById('statusBadge').textContent = meta.label;
  }

  /* ---- project details: Date of Award / Cost / Work Order ---- */

  function renderDetails() {
    const accounts = ensureProjectAccounts(currentProject());
    document.getElementById('detailDateOfAward').value = accounts.dateOfAward || '';
    document.getElementById('detailCost').value = accounts.cost == null ? '' : accounts.cost;
    document.getElementById('detailWorkOrder').value = accounts.workOrder || '';
  }

  document.getElementById('detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const accounts = ensureProjectAccounts(currentProject());
    accounts.dateOfAward = document.getElementById('detailDateOfAward').value || null;
    const costVal = document.getElementById('detailCost').value;
    accounts.cost = costVal === '' ? null : Number(costVal);
    accounts.workOrder = document.getElementById('detailWorkOrder').value.trim();
    saveDB(db);
    showToast('Project details saved.');
  });

  /* ---- top stats: Total In / Total Out / Balance ---- */

  function renderStats() {
    const accounts = ensureProjectAccounts(currentProject());
    const totalIn = computeInTotal(accounts);
    const totalOut = computeOutTotal(accounts);
    const balance = totalIn - totalOut;

    const tiles = [
      { label: 'Total In', value: formatMoney(totalIn) },
      { label: 'Total Out', value: formatMoney(totalOut) },
      { label: 'Balance', value: formatMoney(balance) },
    ];

    const statRowEl = document.getElementById('statRow');
    statRowEl.style.gridTemplateColumns = 'repeat(3, 1fr)';
    statRowEl.innerHTML = tiles.map((t) => `
      <div class="stat-tile">
        <div class="num">${t.value}</div>
        <div class="label">${t.label}</div>
      </div>
    `).join('');
  }

  /* ---- IN tab ---- */

  function renderInActivities() {
    const accounts = ensureProjectAccounts(currentProject());
    const el = document.getElementById('inActivities');

    el.innerHTML = accounts.in.activities.map((activity) => {
      if (activity.kind === 'bills') return renderBillsActivityCard(activity, accounts);
      return renderSimpleActivityCard(activity);
    }).join('');

    el.querySelectorAll('[data-add-bill]').forEach((btn) => {
      btn.addEventListener('click', () => openBillModal(btn.dataset.addBill));
    });
    el.querySelectorAll('[data-add-activity-entry]').forEach((btn) => {
      btn.addEventListener('click', () => openActivityEntryModal(btn.dataset.addActivityEntry));
    });
    el.querySelectorAll('[data-delete-bill]').forEach((btn) => {
      btn.addEventListener('click', () => deleteBillEntry(btn.dataset.activity, btn.dataset.deleteBill));
    });
    el.querySelectorAll('[data-delete-activity-entry]').forEach((btn) => {
      btn.addEventListener('click', () => deleteActivityEntry(btn.dataset.activity, btn.dataset.deleteActivityEntry));
    });
  }

  function renderBillsActivityCard(activity, accounts) {
    const total = computeActivityTotal(activity);
    const grossTotal = activity.entries.reduce((sum, e) => sum + Number(e.grossAmount || 0), 0);
    const deductionCols = accounts.deductionTypes;

    const rows = activity.entries.length === 0
      ? `<tr><td colspan="${5 + deductionCols.length}" class="placeholder-note">No bills recorded yet.</td></tr>`
      : activity.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => `
        <tr>
          <td>${escapeHtml(e.serialNo || '—')}</td>
          <td>${formatDate(e.date)}</td>
          <td>${formatMoney(e.grossAmount)}</td>
          ${deductionCols.map((d) => `<td>${formatMoney((e.deductions || {})[d.key] || 0)}</td>`).join('')}
          <td><strong>${formatMoney(computeBillNet(e))}</strong></td>
          <td><button type="button" class="file-icon-btn" data-activity="${activity.id}" data-delete-bill="${e.id}" title="Remove bill">${ICON_TRASH}</button></td>
        </tr>
      `).join('');

    return `
      <section class="card" style="margin-bottom:16px;">
        <div class="section-title" style="margin-bottom:10px;">
          <h2>${escapeHtml(activity.name)}</h2>
          <button type="button" class="btn btn-primary btn-sm" data-add-bill="${activity.id}">+ Add bill</button>
        </div>
        <div class="table-scroll">
          <table class="doc-table">
            <thead>
              <tr>
                <th>Serial No.</th>
                <th>Date</th>
                <th>Gross Amount</th>
                ${deductionCols.map((d) => `<th>${escapeHtml(d.label)}</th>`).join('')}
                <th>Net Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="muted small" style="margin-top:12px; display:flex; gap:18px; flex-wrap:wrap;">
          <span>Gross Amount total: <strong>${formatMoney(grossTotal)}</strong></span>
          <span>Net Amount total: <strong>${formatMoney(total)}</strong></span>
        </div>
      </section>
    `;
  }

  function renderSimpleActivityCard(activity) {
    const total = computeActivityTotal(activity);
    const rows = activity.entries.length === 0
      ? '<tr><td colspan="4" class="placeholder-note">No entries yet.</td></tr>'
      : activity.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => `
        <tr>
          <td>${formatDate(e.date)}</td>
          <td>${escapeHtml(e.description || '—')}</td>
          <td>${formatMoney(e.amount)}</td>
          <td><button type="button" class="file-icon-btn" data-activity="${activity.id}" data-delete-activity-entry="${e.id}" title="Remove entry">${ICON_TRASH}</button></td>
        </tr>
      `).join('');

    return `
      <section class="card" style="margin-bottom:16px;">
        <div class="section-title" style="margin-bottom:10px;">
          <h2>${escapeHtml(activity.name)}</h2>
          <button type="button" class="btn btn-primary btn-sm" data-add-activity-entry="${activity.id}">+ Add entry</button>
        </div>
        <div class="table-scroll">
          <table class="doc-table compact">
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="muted small" style="margin-top:12px;">Net Amount: <strong>${formatMoney(total)}</strong></div>
      </section>
    `;
  }

  document.getElementById('addActivityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('newActivityName');
    const name = nameEl.value.trim();
    if (!name) return;
    const accounts = ensureProjectAccounts(currentProject());
    accounts.in.activities.push(makeInActivity(name, 'simple'));
    saveDB(db);
    nameEl.value = '';
    renderInActivities();
    showToast(`"${name}" activity added.`);
  });

  function findActivity(id) {
    return ensureProjectAccounts(currentProject()).in.activities.find((a) => a.id === id);
  }

  function deleteBillEntry(activityId, entryId) {
    const activity = findActivity(activityId);
    if (!activity) return;
    activity.entries = activity.entries.filter((e) => e.id !== entryId);
    saveDB(db);
    renderInActivities();
    renderStats();
  }

  function deleteActivityEntry(activityId, entryId) {
    const activity = findActivity(activityId);
    if (!activity) return;
    activity.entries = activity.entries.filter((e) => e.id !== entryId);
    saveDB(db);
    renderInActivities();
    renderStats();
  }

  /* ---- OUT tab ---- */

  function renderOutCategories() {
    const accounts = ensureProjectAccounts(currentProject());
    const el = document.getElementById('outCategories');

    el.innerHTML = accounts.out.categories.map((category) => {
      const categoryTotal = computeCategoryTotal(category);
      const subsectionsHtml = category.subsections.map((sub) => {
        const subTotal = computeSubsectionTotal(sub);
        const rows = sub.entries.length === 0
          ? '<tr><td colspan="5" class="placeholder-note">No expenses yet.</td></tr>'
          : sub.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => `
            <tr>
              <td>${formatDate(e.date)}</td>
              <td>${escapeHtml(e.payee)}</td>
              <td>${formatMoney(e.amount)}</td>
              <td>${escapeHtml(e.note || '—')}</td>
              <td><button type="button" class="file-icon-btn" data-category="${category.key}" data-subsection="${sub.key}" data-delete-out="${e.id}" title="Remove expense">${ICON_TRASH}</button></td>
            </tr>
          `).join('');

        return `
          <div style="margin-bottom:16px;">
            <div class="section-title" style="margin-bottom:8px;">
              <h3 style="margin:0; font-size:14px;">${escapeHtml(sub.label)}</h3>
              <button type="button" class="btn btn-secondary btn-sm" data-add-out="${category.key}" data-add-out-sub="${sub.key}">+ Add expense</button>
            </div>
            <div class="table-scroll">
              <table class="doc-table compact">
                <thead><tr><th>Date</th><th>Paid to</th><th>Amount</th><th>Note</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="muted small" style="margin-top:8px;">Subtotal: <strong>${formatMoney(subTotal)}</strong></div>
          </div>
        `;
      }).join('');

      return `
        <section class="card" style="margin-bottom:16px;">
          <div class="section-title" style="margin-bottom:12px;">
            <h2>${escapeHtml(category.label)}</h2>
            <span class="badge badge-approved">${category.label} Expense: ${formatMoney(categoryTotal)}</span>
          </div>
          ${subsectionsHtml}
        </section>
      `;
    }).join('');

    el.querySelectorAll('[data-add-out]').forEach((btn) => {
      btn.addEventListener('click', () => openOutEntryModal(btn.dataset.addOut, btn.dataset.addOutSub));
    });
    el.querySelectorAll('[data-delete-out]').forEach((btn) => {
      btn.addEventListener('click', () => deleteOutEntry(btn.dataset.category, btn.dataset.subsection, btn.dataset.deleteOut));
    });
  }

  function findSubsection(categoryKey, subsectionKey) {
    const accounts = ensureProjectAccounts(currentProject());
    const category = accounts.out.categories.find((c) => c.key === categoryKey);
    return category ? category.subsections.find((s) => s.key === subsectionKey) : null;
  }

  function deleteOutEntry(categoryKey, subsectionKey, entryId) {
    const sub = findSubsection(categoryKey, subsectionKey);
    if (!sub) return;
    sub.entries = sub.entries.filter((e) => e.id !== entryId);
    saveDB(db);
    renderOutCategories();
    renderStats();
  }

  /* ---- tabs ---- */

  document.querySelectorAll('#accountTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#accountTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = true; });
      btn.classList.add('active');
      document.querySelector(`[data-panel="${btn.dataset.tab}"]`).hidden = false;
    });
  });

  /* ---- modals ---- */

  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  /* ---- bill modal ---- */

  let activeBillActivityId = null;

  function renderBillDeductionFields() {
    const accounts = ensureProjectAccounts(currentProject());
    document.getElementById('billDeductionFields').innerHTML = accounts.deductionTypes.map((d) => `
      <label>${escapeHtml(d.label)}
        <input type="number" min="0" class="bill-deduction-input" data-deduction-key="${d.key}" placeholder="0" />
      </label>
    `).join('');
  }

  function openBillModal(activityId) {
    activeBillActivityId = activityId;
    document.getElementById('billSerialNo').value = '';
    document.getElementById('billDate').value = todayStr();
    document.getElementById('billGrossAmount').value = '';
    document.getElementById('billNewDeductionLabel').value = '';
    document.getElementById('billError').hidden = true;
    renderBillDeductionFields();
    openModal('billModal');
  }

  document.getElementById('addDeductionTypeBtn').addEventListener('click', () => {
    const labelEl = document.getElementById('billNewDeductionLabel');
    const label = labelEl.value.trim();
    if (!label) return;
    const accounts = ensureProjectAccounts(currentProject());
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || uid('ded');
    if (accounts.deductionTypes.some((d) => d.key === key)) {
      showToast('That deduction column already exists.');
      return;
    }
    accounts.deductionTypes.push({ key, label });
    saveDB(db);
    labelEl.value = '';
    renderBillDeductionFields();
    renderInActivities();
    showToast(`"${label}" deduction column added.`);
  });

  document.getElementById('confirmBill').addEventListener('click', () => {
    const errorEl = document.getElementById('billError');
    const date = document.getElementById('billDate').value;
    const grossAmount = Number(document.getElementById('billGrossAmount').value);

    if (!date || !grossAmount || grossAmount <= 0) {
      errorEl.textContent = 'Add a date and a gross amount.';
      errorEl.hidden = false;
      return;
    }

    const deductions = {};
    document.querySelectorAll('.bill-deduction-input').forEach((input) => {
      deductions[input.dataset.deductionKey] = Number(input.value || 0);
    });

    const activity = findActivity(activeBillActivityId);
    activity.entries.push({
      id: uid('bill'),
      serialNo: document.getElementById('billSerialNo').value.trim(),
      date, grossAmount, deductions,
    });
    saveDB(db);
    closeModal('billModal');
    renderInActivities();
    renderStats();
    showToast('Bill added.');
  });

  /* ---- simple activity entry modal ---- */

  let activeEntryActivityId = null;

  function openActivityEntryModal(activityId) {
    activeEntryActivityId = activityId;
    const activity = findActivity(activityId);
    document.getElementById('activityEntryTitle').textContent = `Add entry — ${activity.name}`;
    document.getElementById('activityEntryDate').value = todayStr();
    document.getElementById('activityEntryDesc').value = '';
    document.getElementById('activityEntryAmount').value = '';
    document.getElementById('activityEntryError').hidden = true;
    openModal('activityEntryModal');
  }

  document.getElementById('confirmActivityEntry').addEventListener('click', () => {
    const errorEl = document.getElementById('activityEntryError');
    const date = document.getElementById('activityEntryDate').value;
    const amount = Number(document.getElementById('activityEntryAmount').value);

    if (!date || !amount || amount <= 0) {
      errorEl.textContent = 'Add a date and an amount.';
      errorEl.hidden = false;
      return;
    }

    const activity = findActivity(activeEntryActivityId);
    activity.entries.push({
      id: uid('ie'),
      date,
      description: document.getElementById('activityEntryDesc').value.trim(),
      amount,
    });
    saveDB(db);
    closeModal('activityEntryModal');
    renderInActivities();
    renderStats();
    showToast('Entry added.');
  });

  /* ---- OUT entry modal ---- */

  let activeOutCategoryKey = null;
  let activeOutSubsectionKey = null;

  function openOutEntryModal(categoryKey, subsectionKey) {
    activeOutCategoryKey = categoryKey;
    activeOutSubsectionKey = subsectionKey;
    const sub = findSubsection(categoryKey, subsectionKey);
    document.getElementById('outEntryTitle').textContent = `Add expense — ${sub.label}`;
    document.getElementById('outEntryDate').value = todayStr();
    document.getElementById('outEntryPayee').value = '';
    document.getElementById('outEntryAmount').value = '';
    document.getElementById('outEntryNote').value = '';
    document.getElementById('outEntryError').hidden = true;
    openModal('outEntryModal');
  }

  document.getElementById('confirmOutEntry').addEventListener('click', () => {
    const errorEl = document.getElementById('outEntryError');
    const date = document.getElementById('outEntryDate').value;
    const payee = document.getElementById('outEntryPayee').value.trim();
    const amount = Number(document.getElementById('outEntryAmount').value);

    if (!date || !payee || !amount || amount <= 0) {
      errorEl.textContent = 'Add a date, who this was paid to, and an amount.';
      errorEl.hidden = false;
      return;
    }

    const sub = findSubsection(activeOutCategoryKey, activeOutSubsectionKey);
    sub.entries.push({
      id: uid('oe'),
      date, payee, amount,
      note: document.getElementById('outEntryNote').value.trim(),
    });
    saveDB(db);
    closeModal('outEntryModal');
    renderOutCategories();
    renderStats();
    showToast('Expense recorded.');
  });

  /* ---- init ---- */

  renderProjectSelect();
  if (currentProjectId) {
    renderHeader();
    renderDetails();
    renderStats();
    renderInActivities();
    renderOutCategories();
  }
})();
