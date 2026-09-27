(function () {
  const session = requireRole('admin');
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const projects = getProjectsForUser(db, user);

  /* userDept maps a project.departments key onto the value stored in
     user.department — they differ for Store & Inventory (storeSite vs
     store), so anything that needs to find "the head of this department"
     goes through this table rather than assuming the keys match. */
  const DEPTS = [
    { key: 'engineering', label: 'Engineering', userDept: 'engineering' },
    { key: 'tenders', label: 'Tenders', userDept: 'tenders' },
    { key: 'storeSite', label: 'Store / Site', userDept: 'store' },
    { key: 'general', label: 'General', userDept: 'general' },
  ];

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('project');
  let activeProjectId = (requestedId && projects.some((p) => p.id === requestedId))
    ? requestedId
    : (projects.length ? projects[0].id : null);
  let activeDeptKey = 'engineering';
  let activeHeadTab = 'today';

  const FILE_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICON_CHECK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  function badgeHtml(status) {
    const cls = status === 'Approved' ? 'badge-approved' : status === 'In Progress' ? 'badge-progress' : 'badge-draft';
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentProject() {
    return projects.find((p) => p.id === activeProjectId);
  }

  /* ---- project selector + header (one project at a time — the multi-
     project list already lives on the Operations Overview, so this page
     doesn't repeat it) ---- */

  function renderProjectSelect() {
    const el = document.getElementById('projectSelect');
    if (projects.length === 0) {
      el.innerHTML = '<option>No projects</option>';
      el.disabled = true;
      return;
    }
    el.disabled = false;
    el.innerHTML = projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    el.value = activeProjectId;
  }

  document.getElementById('projectSelect').addEventListener('change', (e) => {
    window.location.href = `admin-reports.html?project=${e.target.value}`;
  });

  function renderHeader() {
    const project = currentProject();
    document.getElementById('projectContextLine').textContent = `${project.code} · ${project.name} · ${project.client}`;
    const meta = PROJECT_STATUS[project.status];
    document.getElementById('statusBadge').className = `badge ${meta.badgeClass}`;
    document.getElementById('statusBadge').textContent = meta.label;
  }

  /* ---- stats, scoped to the one selected project ---- */

  function renderStats() {
    const project = currentProject();
    const meta = PROJECT_STATUS[project.status];
    const overall = computeEngineeringProgress(project);
    const inProgressDocs = project.departments.engineering.documents.filter((d) => d.status === 'In Progress').length;

    document.getElementById('statRow').innerHTML = `
      <div class="stat-tile"><div class="num">${meta.label}</div><div class="label">Status</div></div>
      <div class="stat-tile"><div class="num">${overall === null ? '—' : overall + '%'}</div><div class="label">Engineering progress</div></div>
      <div class="stat-tile"><div class="num">${inProgressDocs}</div><div class="label">Engineering activities in progress</div></div>
    `;
  }

  /* ---- project completion: high-level only ----
     Deliberately just one progress line per tracked department (Engineering,
     Tenders) — the per-document, per-task breakdown already lives one click
     away in the department tabs below, so this card stays a summary, not a
     second copy of the same detail. Once every tracked department reads
     100%, Admin gets a one-click way to mark the whole project Completed —
     status doesn't flip on its own the moment the last task ticks, since
     that's a real decision (client sign-off, handover, etc.), not something
     that should happen silently while nobody's looking. */

  function renderCompletionCard() {
    const project = currentProject();
    const el = document.getElementById('completionCard');
    if (!project) { el.innerHTML = ''; return; }

    const rows = DEPARTMENTS_WITH_TASK_PROGRESS.map((deptKey) => {
      const pct = computeDeptProgress(project, deptKey);
      return { label: DEPARTMENT_LABELS[deptKey] || deptKey, pct };
    });

    const rowsHtml = rows.map((r) => `
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="muted small" style="width:110px; flex-shrink:0;">${escapeHtml(r.label)}</span>
        <div class="progress-track" style="margin:0;"><div class="${r.pct === 100 ? 'progress-fill complete' : 'progress-fill'}" style="width:${r.pct === null ? 0 : r.pct}%"></div></div>
        <span class="progress-pct" style="width:90px; flex-shrink:0; text-align:right;">${r.pct === null ? 'No activities yet' : r.pct + '%'}</span>
      </div>
    `).join('');

    let actionHtml = '';
    if (project.status === 'closed') {
      actionHtml = `
        <div class="alert-card success" style="margin-top:14px;">
          ${ICON_CHECK}
          <div class="body"><div class="title">Project marked Completed</div></div>
        </div>
      `;
    } else if (isProjectFullyComplete(project)) {
      actionHtml = `
        <div class="alert-card success" style="margin-top:14px;">
          ${ICON_CHECK}
          <div class="body" style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <div class="title">All departments have completed their activities</div>
              <p class="muted small" style="margin:0;">Every tracked department is at 100%. Ready to close this project out.</p>
            </div>
            <button class="btn btn-primary btn-sm" id="markCompletedBtn">Mark project as Completed</button>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="card-head"><h2>Project Completion</h2></div>
      <div style="display:flex; flex-direction:column; gap:10px;">${rowsHtml}</div>
      ${actionHtml}
    `;

    const btn = document.getElementById('markCompletedBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        project.status = 'closed';
        saveDB(db);
        renderHeader();
        renderStats();
        renderCompletionCard();
        showToast('Project marked as Completed.');
      });
    }
  }

  /* ---- department tabs + content ---- */

  function renderDeptTabs() {
    const tabsEl = document.getElementById('deptTabs');
    tabsEl.innerHTML = '';
    DEPTS.forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (d.key === activeDeptKey ? ' active' : '');
      btn.textContent = d.label;
      btn.addEventListener('click', () => {
        activeDeptKey = d.key;
        renderDeptTabs();
        renderDeptContent();
        renderHeadStatus();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderDocumentsDept(contentEl, dept) {
    if (!dept || !dept.documents || dept.documents.length === 0) {
      contentEl.innerHTML = '<p class="placeholder-note">No activities logged for this department yet.</p>';
      return;
    }

    const rows = dept.documents.map((doc) => {
      const fillClass = doc.progress >= 100 ? 'progress-fill complete' : 'progress-fill';
      const tasks = doc.tasks || [];
      const taskCaption = tasks.length
        ? `${doc.progress}% <span class="muted">· ${tasks.filter((t) => t.done).length}/${tasks.length} tasks</span>`
        : `${doc.progress}%`;
      return `
        <tr>
          <td class="doc-type">${escapeHtml(doc.type)}</td>
          <td>${escapeHtml(doc.title)}</td>
          <td class="progress-cell">
            <div class="progress-track"><div class="${fillClass}" style="width:${doc.progress}%"></div></div>
            <div class="progress-pct">${taskCaption}</div>
          </td>
          <td>${badgeHtml(doc.status)}</td>
          <td class="small muted">${escapeHtml(doc.lastUpdatedBy)}<br>${formatDate(doc.lastUpdatedDate)}</td>
          <td><button class="btn btn-secondary btn-sm" data-view="${doc.id}">View</button></td>
        </tr>
      `;
    }).join('');

    contentEl.innerHTML = `
      <div class="table-scroll">
        <table class="doc-table">
          <thead>
            <tr><th>Type</th><th>Title</th><th class="progress-cell">Progress</th><th>Status</th><th>Last updated</th><th>Actions</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    contentEl.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = dept.documents.find((d) => d.id === btn.dataset.view);
        openDocDetailModal(doc);
      });
    });
  }

  /* ---- document detail modal — a read-only look at one activity: its
     overall progress, its checklist, its attached files, and its history,
     all in one place instead of a bare "download" action. ---- */

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

  function openDocDetailModal(doc) {
    document.getElementById('docDetailLabel').textContent = `${doc.type} — ${doc.title}`;
    const badgeEl = document.getElementById('docDetailBadge');
    badgeEl.className = `badge ${doc.status === 'Approved' ? 'badge-approved' : doc.status === 'In Progress' ? 'badge-progress' : 'badge-draft'}`;
    badgeEl.textContent = doc.status;
    document.getElementById('docDetailMeta').textContent = `Last updated by ${doc.lastUpdatedBy} · ${formatDate(doc.lastUpdatedDate)}`;

    const tasks = doc.tasks || [];
    const doneCount = tasks.filter((t) => t.done).length;
    document.getElementById('docDetailProgressFill').style.width = `${doc.progress}%`;
    document.getElementById('docDetailProgressLabel').textContent = tasks.length
      ? `${doneCount} of ${tasks.length} tasks complete — ${doc.progress}%${doc.progress >= 100 ? ' · Approved' : ''}`
      : `${doc.progress}% complete`;

    document.getElementById('docDetailTaskList').innerHTML = tasks.length
      ? tasks.map((t) => `
          <li class="task-row${t.done ? ' done' : ''}">
            <span class="task-check"><span class="task-title">${t.done ? '✓' : '○'} ${escapeHtml(t.title)}</span></span>
            <span class="task-meta">
              ${t.isFinal ? '<span class="badge badge-final">Final</span>' : ''}
              ${t.done ? `<span class="muted small">${escapeHtml(t.completedBy)} · ${formatDate(t.completedDate)}</span>` : ''}
            </span>
          </li>
        `).join('')
      : '<li class="placeholder-note">No checklist on this document.</li>';

    const files = doc.files || [];
    const filesEl = document.getElementById('docDetailFiles');
    filesEl.innerHTML = files.length
      ? `<div class="file-row">${files.map((f) => `<button class="file-btn ${FILE_KIND_CLASS[f.kind] || FILE_KIND_CLASS.File}" data-detail-file="${f.id}" title="${escapeHtml(f.name)}">${FILE_ICON} ${escapeHtml(f.name)}</button>`).join('')}</div>`
      : '<p class="no-files-note">No files attached yet.</p>';
    filesEl.querySelectorAll('[data-detail-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const file = files.find((f) => f.id === btn.dataset.detailFile);
        showToast(`Opening "${file.name}"… (demo only, no real file)`);
      });
    });

    const history = (doc.history || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    document.getElementById('docDetailHistory').innerHTML = history.length
      ? history.map((h) => `
          <li>
            <div class="activity-meta"><span>${formatDate(h.date)}</span><span>${h.progress}%</span></div>
            <div>${escapeHtml(h.note)}</div>
          </li>
        `).join('')
      : '<li class="placeholder-note">No history recorded.</li>';

    openModal('docDetailModal');
  }

  function renderStoreDept(contentEl, dept) {
    const materials = (dept && dept.materials) || [];
    const ledger = ((dept && dept.ledger) || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    const materialRows = materials.length
      ? materials.map((m) => {
        const pct = m.in > 0 ? Math.round((m.remaining / m.in) * 100) : 0;
        const barColor = m.low ? 'var(--red)' : 'var(--blue)';
        return `
          <tr>
            <td class="doc-type">${escapeHtml(m.name)}</td>
            <td class="progress-cell">
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%; background:${barColor};"></div></div>
              <div class="progress-pct">${m.remaining.toLocaleString('en-GB')} ${escapeHtml(m.unit)}</div>
            </td>
            <td class="small muted">${m.in.toLocaleString('en-GB')}</td>
            <td class="small muted">${m.out.toLocaleString('en-GB')}</td>
            <td>${m.low ? '<span class="badge badge-stale">Low</span>' : '<span class="badge badge-approved">OK</span>'}</td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="5"><div class="empty-state">No stock recorded for this project yet.</div></td></tr>';

    const ledgerRows = ledger.length
      ? ledger.map((entry) => {
        const badgeClass = entry.type === 'IN' ? 'badge-approved' : 'badge-progress';
        const fileBtn = entry.file
          ? `<button class="file-btn ${FILE_KIND_CLASS[entry.file.kind] || FILE_KIND_CLASS.File}" data-voucher-file="${entry.id}" title="${escapeHtml(entry.file.name)}">${FILE_ICON} ${escapeHtml(entry.voucherId)}</button>`
          : `<button class="file-btn file-generic" data-voucher="${escapeHtml(entry.voucherId)}">${FILE_ICON} ${escapeHtml(entry.voucherId)}</button>`;
        return `
          <tr>
            <td class="small muted">${formatDate(entry.date)}</td>
            <td><span class="badge ${badgeClass}">${entry.type}</span></td>
            <td class="doc-type">${escapeHtml(entry.material)}</td>
            <td>${entry.qty.toLocaleString('en-GB')}</td>
            <td class="muted small">${escapeHtml(entry.description)}</td>
            <td>${fileBtn}</td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="6"><div class="empty-state">No stock movements logged for this project yet.</div></td></tr>';

    contentEl.innerHTML = `
      <h2 style="margin:0 0 12px;">Materials</h2>
      <div class="table-scroll">
        <table class="doc-table">
          <thead><tr><th>Material</th><th class="progress-cell">Remaining</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
          <tbody>${materialRows}</tbody>
        </table>
      </div>
      <h2 style="margin:20px 0 12px;">Stock Ledger — In / Out</h2>
      <div class="table-scroll">
        <table class="doc-table">
          <thead><tr><th>Date</th><th>Type</th><th>Material</th><th>Qty</th><th>Description</th><th>Voucher</th></tr></thead>
          <tbody>${ledgerRows}</tbody>
        </table>
      </div>
    `;

    contentEl.querySelectorAll('[data-voucher]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast(`Opening voucher "${btn.dataset.voucher}"… (demo only, no real file)`);
      });
    });
    contentEl.querySelectorAll('[data-voucher-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = ledger.find((e) => e.id === btn.dataset.voucherFile);
        showToast(`Opening "${entry.file.name}"… (demo only, no real file)`);
      });
    });
  }

  function renderDeptContent() {
    const project = currentProject();
    const contentEl = document.getElementById('deptContent');
    const dept = project.departments[activeDeptKey];

    if (activeDeptKey === 'engineering' || activeDeptKey === 'tenders') {
      renderDocumentsDept(contentEl, dept);
    } else if (activeDeptKey === 'storeSite') {
      renderStoreDept(contentEl, dept);
    } else {
      contentEl.innerHTML = '<p class="placeholder-note">Full editing for General isn\'t built yet in this prototype — there\'s no data logged for it either.</p>';
    }
  }

  /* ---- department head status: outstanding approvals, messages and
     instructions for whoever heads the currently selected department on
     this project — replaces a raw activity log with the thing Admin
     actually wants to know while looking at one department: is anything
     of this head's still waiting on someone? ---- */

  function renderHeadStatus() {
    const project = currentProject();
    const deptMeta = DEPTS.find((d) => d.key === activeDeptKey);
    const head = getHeadForProject(db, project, deptMeta.userDept);
    const bodyEl = document.getElementById('headStatusBody');
    const deptLabelText = DEPARTMENT_LABELS[deptMeta.userDept] || deptMeta.label;

    if (!head) {
      bodyEl.innerHTML = `<p class="placeholder-note">No head assigned to ${escapeHtml(deptLabelText)} for this project.</p>`;
      return;
    }

    const deptActivity = (project.departments[activeDeptKey] && project.departments[activeDeptKey].activity) || [];
    const todaysActivity = deptActivity.filter((a) => a.user === head.name && a.date === todayStr());

    const pendingApprovals = (db.approvals || []).filter((a) => a.requestedBy === head.name && (a.status || 'pending') === 'pending' && (!a.project || a.project === project.name));
    const openMessages = (db.headMessages || []).filter((m) => m.fromName === head.name && !m.acknowledged && (!m.project || m.project === project.name));

    const toHeadsItems = (db.headRequests || [])
      .filter((r) => r.fromName === head.name && (!r.project || r.project === project.name))
      .map((r) => ({
        toLabel: `To ${DEPARTMENT_LABELS[r.toDepartment] || r.toDepartment}`,
        text: r.message,
        date: r.date,
        acknowledged: r.acknowledged,
        responseText: r.responseText,
        responseFile: r.responseFile,
        respondedDate: r.respondedDate,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // The receiving side of the same "Inbox" this head sees on their own
    // Dashboard — instructions Admin sent them, plus requests other heads
    // sent them — so Admin can see whether something is sitting unanswered
    // in this head's inbox, not just what they've sent out.
    const inboxItems = (db.adminInstructions || [])
      .filter((i) => i.toDepartment === head.department && (!i.project || i.project === project.name))
      .map((i) => ({ fromLabel: 'Admin', text: i.message, date: i.date, acknowledged: i.acknowledged, responseText: i.responseText, responseFile: i.responseFile, respondedDate: i.respondedDate }))
      .concat((db.headRequests || [])
        .filter((r) => r.toDepartment === head.department && (!r.project || r.project === project.name))
        .map((r) => ({ fromLabel: `${r.fromName} (${r.fromDepartment})`, text: r.message, date: r.date, acknowledged: r.acknowledged, responseText: r.responseText, responseFile: r.responseFile, respondedDate: r.respondedDate })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const counts = { today: todaysActivity.length, admin: pendingApprovals.length + openMessages.length, heads: toHeadsItems.length, inbox: inboxItems.filter((i) => !i.acknowledged).length };
    const tabBadge = (n) => (n > 0 ? ` <span class="badge badge-progress">${n}</span>` : '');

    bodyEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div class="user-avatar">${escapeHtml(initials(head.name))}</div>
        <div>
          <strong style="display:block; font-size:14px;">${escapeHtml(head.name)}</strong>
          <span class="muted small">${escapeHtml(deptLabelText)} — Department Head</span>
        </div>
      </div>
      <nav class="tabs" id="headStatusTabs" style="margin-bottom:12px;">
        <button class="tab-btn${activeHeadTab === 'today' ? ' active' : ''}" data-head-tab="today">Today's activity${tabBadge(counts.today)}</button>
        <button class="tab-btn${activeHeadTab === 'inbox' ? ' active' : ''}" data-head-tab="inbox">Inbox${tabBadge(counts.inbox)}</button>
        <button class="tab-btn${activeHeadTab === 'admin' ? ' active' : ''}" data-head-tab="admin">To Admin${tabBadge(counts.admin)}</button>
        <button class="tab-btn${activeHeadTab === 'heads' ? ' active' : ''}" data-head-tab="heads">To other heads${tabBadge(counts.heads)}</button>
      </nav>
      <div id="headStatusPanel"></div>
    `;

    renderHeadStatusPanel(head, deptLabelText, todaysActivity, pendingApprovals, openMessages, toHeadsItems, inboxItems);

    bodyEl.querySelectorAll('[data-head-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeHeadTab = btn.dataset.headTab;
        renderHeadStatus();
      });
    });
  }

  /* "To Admin" is the one tab that needs real actions, not just a read-out:
     an approval gets Approve/Reject (setApprovalStatus), a message gets the
     same Respond box used everywhere else in the app (renderRespondableInbox)
     — so Admin can act on either right where they noticed it, instead of
     having to go back to the Operations Overview inbox for it. */

  function renderHeadStatusPanel(head, deptLabelText, todaysActivity, pendingApprovals, openMessages, toHeadsItems, inboxItems) {
    const panelEl = document.getElementById('headStatusPanel');

    if (activeHeadTab === 'inbox') {
      // Read-only: this is Admin looking in on the head's own inbox, not
      // Admin's to reply to on their behalf — replying is that head's job,
      // from their own Dashboard.
      panelEl.innerHTML = inboxItems.length === 0
        ? '<p class="placeholder-note">Nothing from Admin or other departments right now.</p>'
        : `<ul class="activity-feed">${inboxItems.map((it) => `
            <li>
              <div class="activity-meta"><span>${formatDate(it.date)} · ${escapeHtml(it.fromLabel)}</span>${it.acknowledged ? '<span class="badge badge-approved">Acknowledged</span>' : '<span class="badge badge-progress">Pending</span>'}</div>
              <div class="small">${escapeHtml(it.text)}</div>
              ${renderResponseBlock(it)}
            </li>
          `).join('')}</ul>`;
      return;
    }

    if (activeHeadTab === 'today') {
      if (todaysActivity.length === 0) {
        // No logged activity doesn't necessarily mean silence — the head
        // may have set their own daily status (a valid reason for a quiet
        // day), the same thing their own Dashboard lets them set. Every
        // department gets this, not just Engineering, since it isn't tied
        // to document/task tracking at all.
        const status = getTodayStatus(head);
        panelEl.innerHTML = status
          ? `<p class="placeholder-note">No ${escapeHtml(deptLabelText)} activity logged today — ${escapeHtml(head.name)} noted: ${escapeHtml(status.activity)}.</p>`
          : `<p class="placeholder-note">No ${escapeHtml(deptLabelText)} activity logged today.</p>`;
      } else {
        panelEl.innerHTML = `<ul class="activity-feed">${todaysActivity.map((a) => `
            <li>
              <div class="activity-meta"><span class="activity-doc">${escapeHtml(a.docType)}</span><span>today</span></div>
              <div>${escapeHtml(a.note)}</div>
            </li>
          `).join('')}</ul>`;
      }
      return;
    }

    if (activeHeadTab === 'admin') {
      panelEl.innerHTML = `
        <p class="muted small" style="margin:0 0 8px; font-weight:600;">Approvals</p>
        <ul class="activity-feed" id="headAdminApprovals"></ul>
        <p class="muted small" style="margin:16px 0 8px; font-weight:600;">Messages</p>
        <ul class="activity-feed" id="headAdminMessages"></ul>
      `;
      renderHeadAdminApprovals(pendingApprovals);
      renderRespondableInbox('headAdminMessages', openMessages, 'Nothing outstanding with Admin.', (m) => `
        <div class="activity-meta"><span>${formatDate(m.date)}</span></div>
        <div>${escapeHtml(m.message)}</div>
      `, () => {
        saveDB(db);
        renderHeadStatus();
        showToast('Response sent.');
      });
      return;
    }

    panelEl.innerHTML = toHeadsItems.length === 0
      ? '<p class="placeholder-note">No requests to other department heads.</p>'
      : `<ul class="activity-feed">${toHeadsItems.map((it) => `
          <li>
            <div class="activity-meta"><span>${formatDate(it.date)} · ${escapeHtml(it.toLabel)}</span>${it.acknowledged ? '<span class="badge badge-approved">Acknowledged</span>' : '<span class="badge badge-progress">Pending</span>'}</div>
            <div class="small">${escapeHtml(it.text)}</div>
            ${renderResponseBlock(it)}
          </li>
        `).join('')}</ul>`;
  }

  function renderHeadAdminApprovals(items) {
    const el = document.getElementById('headAdminApprovals');
    if (items.length === 0) {
      el.innerHTML = '<li class="placeholder-note">Nothing pending approval.</li>';
      return;
    }
    el.innerHTML = items.map((a) => `
      <li>
        <div class="activity-meta"><span>${formatDate(a.date)} · @ ${escapeHtml(a.routedTo)}</span></div>
        <div style="font-weight:700;">${escapeHtml(a.title)}</div>
        <div class="muted small">${escapeHtml(a.category)}${a.project ? ' · ' + escapeHtml(a.project) : ''}</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" data-head-approve="${a.id}">Approve</button>
          <button type="button" class="btn btn-ghost btn-sm" data-head-reject="${a.id}">Reject</button>
        </div>
      </li>
    `).join('');

    el.querySelectorAll('[data-head-approve]').forEach((btn) => {
      btn.addEventListener('click', () => setApprovalStatus(btn.dataset.headApprove, 'approved'));
    });
    el.querySelectorAll('[data-head-reject]').forEach((btn) => {
      btn.addEventListener('click', () => setApprovalStatus(btn.dataset.headReject, 'rejected'));
    });
  }

  function setApprovalStatus(id, status) {
    const approval = resolveApproval(db, id, status);
    if (!approval) return;
    saveDB(db);
    renderHeadStatus();
    showToast(status === 'approved' ? 'Approval granted — routed to Accounts for processing.' : 'Approval rejected.');
  }

  /* ---- project management: create, edit, delete ----
     Deliberately minimal — a new project starts with empty department
     shells (see makeProject in data.js) and no head assigned, the same
     honest gap as any project whose historical activity predates a real
     login. Assigning a head to a project isn't built in this pass. */

  let projectModalMode = 'new';

  function openNewProjectModal() {
    projectModalMode = 'new';
    document.getElementById('projectModalTitle').textContent = 'New project';
    document.getElementById('projectNameInput').value = '';
    document.getElementById('projectClientInput').value = '';
    document.getElementById('projectCodeInput').value = '';
    document.getElementById('projectStatusInput').value = 'pending';
    document.getElementById('projectLogoInput').value = '#1d4ed8';
    document.getElementById('projectModalError').hidden = true;
    openModal('projectModal');
  }

  function openEditProjectModal() {
    const project = currentProject();
    if (!project) return;
    projectModalMode = 'edit';
    document.getElementById('projectModalTitle').textContent = 'Edit project';
    document.getElementById('projectNameInput').value = project.name;
    document.getElementById('projectClientInput').value = project.client;
    document.getElementById('projectCodeInput').value = project.code;
    document.getElementById('projectStatusInput').value = project.status;
    document.getElementById('projectLogoInput').value = project.logo || '#1d4ed8';
    document.getElementById('projectModalError').hidden = true;
    openModal('projectModal');
  }

  document.getElementById('newProjectBtn').addEventListener('click', openNewProjectModal);
  document.getElementById('editProjectBtn').addEventListener('click', openEditProjectModal);

  document.getElementById('saveProjectBtn').addEventListener('click', () => {
    const name = document.getElementById('projectNameInput').value.trim();
    const client = document.getElementById('projectClientInput').value.trim();
    const code = document.getElementById('projectCodeInput').value.trim();
    const status = document.getElementById('projectStatusInput').value;
    const logo = document.getElementById('projectLogoInput').value;
    const errEl = document.getElementById('projectModalError');

    if (!name || !client || !code) {
      errEl.textContent = 'Name, client and project code are all required.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;

    if (projectModalMode === 'new') {
      const project = makeProject(name, client, code, status, logo);
      db.projects.push(project);
      projects.push(project);
      activeProjectId = project.id;
      saveDB(db);
      closeModal('projectModal');
      renderProjectSelect();
      renderHeader();
      renderStats();
      renderCompletionCard();
      renderDeptTabs();
      renderDeptContent();
      renderHeadStatus();
      showToast('Project created.');
    } else {
      const project = currentProject();
      project.name = name;
      project.client = client;
      project.code = code;
      project.status = status;
      project.logo = logo;
      saveDB(db);
      closeModal('projectModal');
      renderProjectSelect();
      renderHeader();
      renderStats();
      renderCompletionCard();
      showToast('Project updated.');
    }
  });

  document.getElementById('deleteProjectBtn').addEventListener('click', () => {
    const project = currentProject();
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This removes all its documents, activity and reports — this cannot be undone.`)) return;

    db.projects = db.projects.filter((p) => p.id !== project.id);
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx !== -1) projects.splice(idx, 1);
    saveDB(db);

    activeProjectId = projects.length ? projects[0].id : null;
    renderProjectSelect();

    if (!activeProjectId) {
      document.getElementById('projectContextLine').textContent = 'No projects to show.';
      document.getElementById('statusBadge').textContent = '';
      document.getElementById('statRow').innerHTML = '';
      document.getElementById('completionCard').innerHTML = '';
      document.getElementById('deptTabs').innerHTML = '';
      document.getElementById('deptContent').innerHTML = '';
      document.getElementById('headStatusBody').innerHTML = '';
    } else {
      renderHeader();
      renderStats();
      renderCompletionCard();
      renderDeptTabs();
      renderDeptContent();
      renderHeadStatus();
    }
    showToast('Project deleted.');
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'projects',
    hideKeys: ['engineering', 'tenders', 'store'],
    hrefs: { dashboard: 'admin-dashboard.html', 'team-status': 'admin-team-status.html' },
  });

  renderProjectSelect();

  if (!activeProjectId) {
    document.getElementById('projectContextLine').textContent = 'No projects to show.';
  } else {
    renderHeader();
    renderStats();
    renderCompletionCard();
    renderDeptTabs();
    renderDeptContent();
    renderHeadStatus();
  }
})();
