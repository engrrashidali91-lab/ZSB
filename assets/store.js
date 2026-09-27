(function () {
  const session = requireAnyRole(HEAD_ROLES);
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const myProjects = getProjectsForUser(db, user);
  const isOwnDepartment = user.department === 'store';
  const deptLabel = DEPARTMENT_LABELS[user.department] || user.department;

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('project');
  let currentProjectId = (requestedId && myProjects.some((p) => p.id === requestedId))
    ? requestedId
    : (myProjects.length ? myProjects[0].id : null);

  const FILE_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICON_LOCK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const ICON_WARNING = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  const ICON_INFO = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('roleTag').textContent = `${deptLabel} — Department Head`;
  document.getElementById('sidebarNote').innerHTML = getSidebarNoteHtml(user);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('deptBanner').innerHTML = isOwnDepartment ? '' :
    `<div class="banner info">${ICON_LOCK} You're viewing Store &amp; Inventory read-only — this isn't your department.</div>`;

  function currentProject() {
    return db.projects.find((p) => p.id === currentProjectId);
  }

  function isReadOnly() {
    return !isOwnDepartment || currentProject().status === 'closed';
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  /* ---- project selector / header / banner ---- */

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
      window.location.href = `store.html?project=${el.value}`;
    });
  }

  function renderHeader() {
    const project = currentProject();
    document.getElementById('projectContextLine').textContent = `${project.code} · ${project.name} · ${project.client}`;

    const meta = PROJECT_STATUS[project.status];
    document.getElementById('statusBadge').className = `badge ${meta.badgeClass}`;
    document.getElementById('statusBadge').textContent = meta.label;

    const bannerEl = document.getElementById('statusBanner');
    if (project.status === 'closed') {
      bannerEl.innerHTML = `<div class="banner warning">${ICON_LOCK} This project is closed. Stock records are read-only.</div>`;
    } else if (project.status === 'pending') {
      bannerEl.innerHTML = `<div class="banner info">${ICON_INFO} This project hasn't kicked off yet. You can still record materials ahead of mobilisation.</div>`;
    } else if (project.status === 'delayed') {
      bannerEl.innerHTML = `<div class="banner warning">${ICON_WARNING} This project is flagged as delayed. Keep stock records current so management can see where things stand.</div>`;
    } else {
      bannerEl.innerHTML = '';
    }

    updateActionButtonsState();
  }

  function updateActionButtonsState() {
    const readOnly = isReadOnly();
    const title = !isOwnDepartment ? 'Store & Inventory isn\'t your department.' : (readOnly ? 'This project is closed.' : '');
    ['newMaterialBtn', 'newMovementBtn'].forEach((id) => {
      const btn = document.getElementById(id);
      btn.disabled = readOnly;
      btn.title = title;
    });
  }

  /* ---- Materials ---- */

  function findMaterial(materialId) {
    return currentProject().departments.storeSite.materials.find((m) => m.id === materialId);
  }

  function renderMaterials() {
    const project = currentProject();
    const el = document.getElementById('materialTableBody');
    el.innerHTML = '';
    const readOnly = isReadOnly();

    const materials = project.departments.storeSite.materials || [];

    if (materials.length === 0) {
      el.innerHTML = '<tr><td colspan="6"><div class="empty-state">No materials recorded yet. Use "+ Add material" to add the first one.</div></td></tr>';
      return;
    }

    materials.forEach((m) => {
      const pct = m.in > 0 ? Math.round((m.remaining / m.in) * 100) : 0;
      const barColor = m.low ? 'var(--red)' : 'var(--blue)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="doc-type">${escapeHtml(m.name)}</td>
        <td class="progress-cell">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%; background:${barColor};"></div></div>
          <div class="progress-pct">${m.remaining.toLocaleString('en-GB')} ${escapeHtml(m.unit)}</div>
        </td>
        <td class="small muted">${m.in.toLocaleString('en-GB')}</td>
        <td class="small muted">${m.out.toLocaleString('en-GB')}</td>
        <td>${m.low ? '<span class="badge badge-stale">Low</span>' : '<span class="badge badge-approved">OK</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" data-record="${m.id}" ${readOnly ? 'disabled' : ''}>Record movement</button></td>
      `;
      el.appendChild(tr);
    });

    el.querySelectorAll('[data-record]').forEach((btn) => {
      btn.addEventListener('click', () => openMovementModal(btn.dataset.record));
    });
  }

  /* ---- Stock Ledger ---- */

  function renderLedger() {
    const project = currentProject();
    const el = document.getElementById('ledgerBody');
    el.innerHTML = '';

    const ledger = (project.departments.storeSite.ledger || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    if (ledger.length === 0) {
      el.innerHTML = '<tr><td colspan="6"><div class="empty-state">No stock movements logged for this project yet.</div></td></tr>';
      return;
    }

    ledger.forEach((entry) => {
      const badgeClass = entry.type === 'IN' ? 'badge-approved' : 'badge-progress';
      const fileBtn = entry.file
        ? `<button class="file-btn ${FILE_KIND_CLASS[entry.file.kind] || FILE_KIND_CLASS.File}" data-voucher-file="${entry.id}" title="${escapeHtml(entry.file.name)}">${FILE_ICON} ${escapeHtml(entry.voucherId)}</button>`
        : `<button class="file-btn file-generic" data-voucher="${escapeHtml(entry.voucherId)}">${FILE_ICON} ${escapeHtml(entry.voucherId)}</button>`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small muted">${formatDate(entry.date)}</td>
        <td><span class="badge ${badgeClass}">${entry.type}</span></td>
        <td class="doc-type">${escapeHtml(entry.material)}</td>
        <td>${entry.qty.toLocaleString('en-GB')}</td>
        <td class="muted small">${escapeHtml(entry.description)}</td>
        <td>${fileBtn}</td>
      `;
      el.appendChild(tr);
    });

    el.querySelectorAll('[data-voucher]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast(`Opening voucher "${btn.dataset.voucher}"… (demo only, no real file)`);
      });
    });
    el.querySelectorAll('[data-voucher-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = ledger.find((e) => e.id === btn.dataset.voucherFile);
        showToast(`Opening "${entry.file.name}"… (demo only, no real file)`);
      });
    });
  }

  /* ---- render everything ---- */

  function renderAll() {
    renderHeader();
    renderMaterials();
    renderLedger();
  }

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

  /* ---- New material ---- */

  document.getElementById('newMaterialBtn').addEventListener('click', () => {
    if (isReadOnly()) return;
    document.getElementById('newMaterialName').value = '';
    document.getElementById('newMaterialUnit').value = '';
    document.getElementById('newMaterialOpening').value = '';
    document.getElementById('newMaterialError').hidden = true;
    openModal('newMaterialModal');
  });

  document.getElementById('confirmNewMaterial').addEventListener('click', () => {
    const errEl = document.getElementById('newMaterialError');
    const name = document.getElementById('newMaterialName').value.trim();
    const unit = document.getElementById('newMaterialUnit').value.trim();
    const opening = Math.max(0, parseInt(document.getElementById('newMaterialOpening').value, 10) || 0);

    if (!name || !unit) {
      errEl.textContent = 'Material name and unit are both required.';
      errEl.hidden = false;
      return;
    }

    const project = currentProject();
    if (project.departments.storeSite.materials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'A material with that name already exists for this project.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;

    const date = todayStr();
    const material = makeMaterial(name, unit, opening, 0);
    project.departments.storeSite.materials.push(material);

    let note = `Added material — ${name}.`;
    if (opening > 0) {
      project.departments.storeSite.ledger.push(makeLedgerEntry(date, 'IN', name, opening, 'Opening stock', '—'));
      note = `Added material — ${name} (opening stock: ${opening.toLocaleString('en-GB')} ${unit}).`;
    }
    if (!project.departments.storeSite.activity) project.departments.storeSite.activity = [];
    project.departments.storeSite.activity.push(makeActivity(date, name, note, user.name));

    saveDB(db);
    closeModal('newMaterialModal');
    renderMaterials();
    renderLedger();
    showToast('Material added.');
  });

  /* ---- Record stock movement ---- */

  function populateMovementMaterialSelect(preselectId) {
    const materials = currentProject().departments.storeSite.materials || [];
    const select = document.getElementById('movementMaterial');
    if (materials.length === 0) {
      select.innerHTML = '<option value="">Add a material first…</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = materials.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
    if (preselectId) select.value = preselectId;
  }

  /* Add (IN) vs Reduce (OUT) read differently in real use — a delivery
     needs a receipt/invoice as evidence it arrived, an issuance needs a
     reason it left — so the modal's wording (and the INV-/GP- convention
     already used in the seeded ledger) follows whichever is selected,
     rather than one generic "description"/"voucher" pair for both. */
  function syncMovementFieldsForType() {
    const isIn = document.getElementById('movementType').value === 'IN';
    document.getElementById('movementDescriptionLabel').textContent = isIn ? 'Receipt details' : 'Reason for issue';
    document.getElementById('movementDescription').placeholder = isIn ? 'e.g. Delivery — Al-Fateh Traders' : 'e.g. Issued to Block C slab';
    document.getElementById('movementVoucherLabel').textContent = isIn ? 'Invoice / receipt no.' : 'Gate pass / reference no.';
    document.getElementById('movementVoucherId').placeholder = isIn ? 'e.g. INV-1050' : 'e.g. GP-2211';
    document.getElementById('movementFileLabel').textContent = isIn ? 'Attach receipt (optional)' : 'Attach gate pass (optional)';
  }

  document.getElementById('movementType').addEventListener('change', syncMovementFieldsForType);

  function openMovementModal(preselectMaterialId) {
    if (isReadOnly()) return;
    populateMovementMaterialSelect(preselectMaterialId);
    document.getElementById('movementType').value = 'IN';
    document.getElementById('movementQty').value = '';
    document.getElementById('movementDescription').value = '';
    document.getElementById('movementVoucherId').value = '';
    document.getElementById('movementFile').value = '';
    document.getElementById('movementError').hidden = true;
    syncMovementFieldsForType();
    openModal('movementModal');
  }

  document.getElementById('newMovementBtn').addEventListener('click', () => openMovementModal(null));

  document.getElementById('confirmMovement').addEventListener('click', () => {
    const errEl = document.getElementById('movementError');
    const materialId = document.getElementById('movementMaterial').value;
    const type = document.getElementById('movementType').value;
    const qty = parseInt(document.getElementById('movementQty').value, 10);
    const description = document.getElementById('movementDescription').value.trim();
    const voucherId = document.getElementById('movementVoucherId').value.trim();

    if (!materialId) {
      errEl.textContent = 'Add a material before recording a movement.';
      errEl.hidden = false;
      return;
    }
    if (!qty || qty <= 0) {
      errEl.textContent = 'Enter a quantity greater than zero.';
      errEl.hidden = false;
      return;
    }
    if (!description || !voucherId) {
      errEl.textContent = type === 'IN'
        ? 'Receipt details and an invoice/receipt number are both required.'
        : 'A reason for the issue and a gate pass/reference number are both required.';
      errEl.hidden = false;
      return;
    }

    const material = findMaterial(materialId);
    if (type === 'OUT' && qty > material.remaining) {
      errEl.textContent = `Not enough stock — only ${material.remaining.toLocaleString('en-GB')} ${material.unit} remaining.`;
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;

    const date = todayStr();
    const fileInput = document.getElementById('movementFile');
    const file = fileInput.files[0] ? makeFile(fileInput.files[0].name, user.name, date, detectFileKind(fileInput.files[0].name)) : null;

    if (type === 'IN') {
      material.in += qty;
    } else {
      material.out += qty;
    }
    recomputeMaterial(material);

    const project = currentProject();
    project.departments.storeSite.ledger.push(makeLedgerEntry(date, type, material.name, qty, description, voucherId, file));

    const activityNote = type === 'IN'
      ? `Recorded delivery of ${qty.toLocaleString('en-GB')} ${material.unit} — ${description}.`
      : `Issued ${qty.toLocaleString('en-GB')} ${material.unit} — ${description}.`;
    if (!project.departments.storeSite.activity) project.departments.storeSite.activity = [];
    project.departments.storeSite.activity.push(makeActivity(date, material.name, activityNote, user.name));

    saveDB(db);
    closeModal('movementModal');
    renderMaterials();
    renderLedger();
    showToast(`${type === 'IN' ? 'Delivery' : 'Issuance'} recorded.`);
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'store',
    hideKeys: ['projects', 'team-status'],
    hrefs: { dashboard: 'dashboard.html', engineering: 'engineering.html', tenders: 'tenders.html' },
  });

  renderProjectSelect();

  if (!currentProjectId) {
    document.getElementById('projectContextLine').textContent = 'No projects assigned yet.';
    document.getElementById('newMaterialBtn').disabled = true;
    document.getElementById('newMovementBtn').disabled = true;
  } else {
    renderAll();
  }
})();
