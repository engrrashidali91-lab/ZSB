(function () {
  const session = requireRole('accountant');
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  renderSidebar({
    containerId: 'navList',
    activeKey: 'dashboard',
    hideKeys: ['engineering', 'tenders', 'store', 'team-status'],
    hrefs: { projects: 'accountant-project.html' },
  });

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatMoney(n) {
    return 'PKR ' + Number(n || 0).toLocaleString('en-PK');
  }

  function pendingApprovals() {
    return (db.approvals || []).filter((a) => a.status === 'approved' && a.accountsStatus === 'awaiting_processing');
  }

  function processedApprovals() {
    return (db.approvals || []).filter((a) => a.accountsStatus === 'processed');
  }

  /* ---- stats ---- */

  function renderStats() {
    const pending = pendingApprovals();
    const processed = processedApprovals();
    const thisMonth = todayStr().slice(0, 7);
    const processedThisMonth = processed.filter((a) => (a.processedDate || '').slice(0, 7) === thisMonth);
    const disbursedThisMonth = processedThisMonth.reduce((sum, a) => sum + Number(a.amountPaid || 0), 0)
      + (db.payments || []).filter((p) => (p.date || '').slice(0, 7) === thisMonth).reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const tiles = [
      { label: 'Pending Processing', value: pending.length },
      { label: 'Processed This Month', value: processedThisMonth.length },
      { label: 'Disbursed This Month', value: formatMoney(disbursedThisMonth) },
      { label: 'Payments Logged', value: (db.payments || []).length },
    ];

    document.getElementById('statRow').innerHTML = tiles.map((t) => `
      <div class="stat-tile">
        <div class="num">${t.value}</div>
        <div class="label">${t.label}</div>
      </div>
    `).join('');
  }

  /* ---- pending processing ---- */

  function renderPending() {
    const el = document.getElementById('pendingBody');
    const items = pendingApprovals().sort((a, b) => (a.decidedDate < b.decidedDate ? 1 : -1));

    if (items.length === 0) {
      el.innerHTML = '<tr><td colspan="7" class="placeholder-note">Nothing waiting on Accounts.</td></tr>';
      return;
    }

    el.innerHTML = items.map((a) => `
      <tr>
        <td>${escapeHtml(a.id)}</td>
        <td>${escapeHtml(a.category)}</td>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(a.project || '—')}</td>
        <td>${escapeHtml(a.requestedBy || '—')}${a.department ? ` <span class="muted small">(${escapeHtml(a.department)})</span>` : ''}</td>
        <td>${formatDate(a.decidedDate)}</td>
        <td><button type="button" class="btn btn-primary btn-sm" data-process="${a.id}">Process payment</button></td>
      </tr>
    `).join('');

    el.querySelectorAll('[data-process]').forEach((btn) => {
      btn.addEventListener('click', () => openProcessModal(btn.dataset.process));
    });
  }

  /* ---- processed history ---- */

  function renderProcessed() {
    const el = document.getElementById('processedBody');
    const items = processedApprovals().sort((a, b) => (a.processedDate < b.processedDate ? 1 : -1));

    if (items.length === 0) {
      el.innerHTML = '<tr><td colspan="7" class="placeholder-note">Nothing processed yet.</td></tr>';
      return;
    }

    el.innerHTML = items.map((a) => `
      <tr>
        <td>${formatDate(a.processedDate)}</td>
        <td>${escapeHtml(a.category)}</td>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(a.project || '—')}</td>
        <td>${formatMoney(a.amountPaid)}</td>
        <td>${escapeHtml(a.paymentMethod)}</td>
        <td>${escapeHtml(a.voucherRef || '—')}</td>
      </tr>
    `).join('');
  }

  /* ---- process payment modal ---- */

  let activeApprovalId = null;

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

  function openProcessModal(id) {
    const approval = (db.approvals || []).find((a) => a.id === id);
    if (!approval) return;
    activeApprovalId = id;
    document.getElementById('processModalLabel').textContent = `${approval.id} · ${approval.category} — ${approval.title}`;
    document.getElementById('processAmount').value = '';
    document.getElementById('processMethod').value = 'Bank Transfer';
    document.getElementById('processVoucher').value = '';
    document.getElementById('processNote').value = '';
    document.getElementById('processError').hidden = true;
    openModal('processModal');
  }

  document.getElementById('confirmProcess').addEventListener('click', () => {
    const errorEl = document.getElementById('processError');
    const amountPaid = Number(document.getElementById('processAmount').value);

    if (!amountPaid || amountPaid <= 0) {
      errorEl.textContent = 'Enter the amount paid.';
      errorEl.hidden = false;
      return;
    }

    processApprovalPayment(db, activeApprovalId, {
      amountPaid,
      paymentMethod: document.getElementById('processMethod').value,
      voucherRef: document.getElementById('processVoucher').value.trim(),
      note: document.getElementById('processNote').value.trim(),
      processedBy: user.name,
    });

    saveDB(db);
    closeModal('processModal');
    renderStats();
    renderPending();
    renderProcessed();
    showToast('Payment recorded — marked processed.');
  });

  /* ---- record a payment (ad hoc) ---- */

  function renderPaymentFormOptions() {
    document.getElementById('paymentCategory').innerHTML = PAYMENT_CATEGORIES
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    document.getElementById('paymentProject').innerHTML = '<option value="">Not project-specific</option>'
      + db.projects.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  }

  function renderLedger() {
    const el = document.getElementById('ledgerBody');
    const items = (db.payments || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    if (items.length === 0) {
      el.innerHTML = '<tr><td colspan="7" class="placeholder-note">No payments recorded yet.</td></tr>';
      return;
    }

    el.innerHTML = items.map((p) => `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td>${escapeHtml(p.category)}</td>
        <td>${escapeHtml(p.payee)}</td>
        <td>${escapeHtml(p.project || '—')}</td>
        <td>${formatMoney(p.amount)}</td>
        <td>${escapeHtml(p.method)}</td>
        <td>${escapeHtml(p.recordedBy)}</td>
      </tr>
    `).join('');
  }

  document.getElementById('paymentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const payee = document.getElementById('paymentPayee').value.trim();
    const amount = Number(document.getElementById('paymentAmount').value);
    if (!payee || !amount || amount <= 0) {
      showToast('Add a payee and an amount before recording.');
      return;
    }

    if (!db.payments) db.payments = [];
    db.payments.push(makePayment(
      todayStr(),
      document.getElementById('paymentCategory').value,
      payee,
      amount,
      document.getElementById('paymentMethod').value,
      document.getElementById('paymentProject').value || null,
      document.getElementById('paymentNote').value.trim(),
      user.name,
    ));
    saveDB(db);
    e.target.reset();
    renderStats();
    renderLedger();
    showToast('Payment recorded.');
  });

  renderPaymentFormOptions();
  renderStats();
  renderPending();
  renderProcessed();
  renderLedger();
})();
