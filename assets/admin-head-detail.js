(function () {
  const session = requireRole('admin');
  if (!session) return;

  const db = getDB();
  const adminUser = db.users.find((u) => u.username === session.username && u.role === session.role);

  const ICONS = {
    warning: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  };

  document.getElementById('userName').textContent = adminUser.name;
  document.getElementById('userAvatar').textContent = initials(adminUser.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderSidebar({
    containerId: 'navList',
    activeKey: 'team-status',
    hideKeys: ['engineering', 'tenders', 'store'],
    hrefs: { dashboard: 'admin-dashboard.html', projects: 'admin-reports.html', 'team-status': 'admin-team-status.html' },
  });

  const params = new URLSearchParams(window.location.search);
  const head = db.users.find((u) => u.username === params.get('user') && HEAD_ROLES.includes(u.role));

  if (!head) {
    document.getElementById('headName').textContent = 'Not found';
    document.getElementById('headSubtitle').textContent = 'No matching department head — go back to Team Status and pick one from there.';
    document.getElementById('headAvatar').textContent = '?';
    document.getElementById('statusCard').innerHTML = '';
    return;
  }

  const deptLabel = DEPARTMENT_LABELS[head.department] || head.department;
  document.getElementById('headAvatar').textContent = initials(head.name);
  document.getElementById('headName').textContent = head.name;
  document.getElementById('headSubtitle').textContent = `${deptLabel} — Department Head`;

  const validTabs = ['inbox', 'admin', 'heads'];
  let activeTab = validTabs.includes(params.get('tab')) ? params.get('tab') : 'admin';

  /* ---- the headline: exactly one of three states, made unmistakable ----
     Did real work today (Engineering only, so far) → what, and where.
     Didn't, but said why via their own Dashboard → that reason, verbatim.
     Didn't, and said nothing → the one state Admin can actually act on:
     ask them for a reason, right here, using the same
     instruction-and-respond flow as everywhere else in the app. */

  function renderStatusCard() {
    const el = document.getElementById('statusCard');
    const todayActivity = getHeadTodayActivity(db, head);

    if (todayActivity.length > 0) {
      el.innerHTML = `
        <div class="alert-card success" style="margin:0;">
          ${ICONS.check}
          <div class="body">
            <div class="title">Logged ${todayActivity.length} update${todayActivity.length === 1 ? '' : 's'} today</div>
            <ul class="activity-feed" style="margin-top:8px;">
              ${todayActivity.map((a) => `
                <li>
                  <div class="activity-meta"><span class="activity-project">${escapeHtml(a.projectName)}</span><span>today</span></div>
                  <div>${a.kind === 'document' ? `<span class="activity-doc">${escapeHtml(a.docType)}</span> — ` : '<span class="kind-tag kind-report">Site report</span> — '}${escapeHtml(a.note)}</div>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
      return;
    }

    const status = getTodayStatus(head);
    if (status) {
      el.innerHTML = `
        <div class="alert-card info" style="margin:0;">
          ${ICONS.info}
          <div class="body">
            <div class="title">Busy with: ${escapeHtml(status.activity)}</div>
            <p class="muted small" style="margin:0;">No activity logged today — ${escapeHtml(head.name)} noted this themselves from their own Dashboard, so nothing further is needed here.</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="alert-card" style="margin:0;">
        ${ICONS.warning}
        <div class="body" style="width:100%;">
          <div class="title">No activity logged, and no reason given</div>
          <p class="muted small" style="margin:0 0 10px;">Nothing on file for today yet.</p>
          <div id="askReasonArea"></div>
        </div>
      </div>
    `;
    renderAskReasonArea();
  }

  function todaysAskInstruction() {
    return (db.adminInstructions || []).find((i) => i.toDepartment === head.department && i.date === todayStr() && i.kind === 'ask-reason');
  }

  function renderAskReasonArea() {
    const el = document.getElementById('askReasonArea');
    const asked = todaysAskInstruction();

    if (asked && asked.acknowledged) {
      el.innerHTML = `<p class="muted small" style="margin:0 0 4px; font-weight:600;">You asked — here's the reply:</p>${renderResponseBlock(asked)}`;
      return;
    }
    if (asked) {
      el.innerHTML = `<span class="badge badge-progress">Asked — awaiting reply</span>`;
      return;
    }

    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="askReasonBtn">Ask for a reason</button>
      <div id="askReasonForm" hidden style="margin-top:10px;">
        <textarea id="askReasonText" rows="2" style="width:100%;">Could you let us know what you were working on today, or if you were away/busy with something else?</textarea>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" id="sendAskReasonBtn">Send</button>
          <button type="button" class="btn btn-ghost btn-sm" id="cancelAskReasonBtn">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById('askReasonBtn').addEventListener('click', () => {
      document.getElementById('askReasonBtn').hidden = true;
      document.getElementById('askReasonForm').hidden = false;
    });
    document.getElementById('cancelAskReasonBtn').addEventListener('click', () => {
      document.getElementById('askReasonForm').hidden = true;
      document.getElementById('askReasonBtn').hidden = false;
    });
    document.getElementById('sendAskReasonBtn').addEventListener('click', () => {
      const text = document.getElementById('askReasonText').value.trim();
      if (!text) { showToast('Add a message before sending.'); return; }

      if (!db.adminInstructions) db.adminInstructions = [];
      const instruction = makeInstruction(todayStr(), text, head.department, null);
      instruction.kind = 'ask-reason';
      db.adminInstructions.push(instruction);
      saveDB(db);
      showToast(`Sent to ${head.name}.`);
      renderStatusCard();
    });
  }

  /* ---- assigned projects: just enough context to place the person, not
     a repeat of the Project Report drill-down ---- */

  function renderProjects() {
    const projects = getProjectsForUser(db, head);
    const el = document.getElementById('projectsList');
    if (projects.length === 0) {
      el.innerHTML = '<p class="placeholder-note">No projects assigned.</p>';
      return;
    }
    // Just two columns, and the row itself is the link (rather than a
    // third "Open →" column) — a 3-column table here needs more width than
    // a phone screen has to show Status without scrolling, and the project
    // name is already the thing worth tapping.
    el.innerHTML = `
      <div class="table-scroll">
        <table class="doc-table compact">
          <thead><tr><th>Project</th><th>Status</th></tr></thead>
          <tbody>
            ${projects.map((p) => {
              const meta = PROJECT_STATUS[p.status];
              return `
                <tr class="clickable-row" data-project="${p.id}">
                  <td class="doc-type"><div class="project-name-row">${projectLogoHtml(p)}<span>${escapeHtml(p.name)}</span></div></td>
                  <td><span class="badge ${meta.badgeClass}">${meta.label}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    el.querySelectorAll('[data-project]').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.href = `admin-reports.html?project=${row.dataset.project}`;
      });
    });
  }

  /* ---- To Admin / To other heads — the same two tabs as the per-project
     Department Head panel, just pooled across every project this head has,
     since this page is about the person, not any one project. ---- */

  function renderDetailTabs() {
    document.querySelectorAll('#detailTabs .tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
    renderDetailPanel();
  }

  function renderDetailPanel() {
    const panelEl = document.getElementById('detailPanel');

    if (activeTab === 'inbox') {
      // The receiving side of this head's own Dashboard Inbox — instructions
      // Admin sent them, plus requests other heads sent them, pooled across
      // every project (this page is about the person, not one project).
      // Read-only: replying is that head's job from their own Dashboard,
      // not Admin's to do on their behalf.
      const inboxItems = (db.adminInstructions || [])
        .filter((i) => i.toDepartment === head.department)
        .map((i) => ({ fromLabel: 'Admin', text: i.message, date: i.date, project: i.project, acknowledged: i.acknowledged, responseText: i.responseText, responseFile: i.responseFile, respondedDate: i.respondedDate }))
        .concat((db.headRequests || [])
          .filter((r) => r.toDepartment === head.department)
          .map((r) => ({ fromLabel: `${r.fromName} (${r.fromDepartment})`, text: r.message, date: r.date, project: r.project, acknowledged: r.acknowledged, responseText: r.responseText, responseFile: r.responseFile, respondedDate: r.respondedDate })))
        .sort((a, b) => (a.date < b.date ? 1 : -1));

      panelEl.innerHTML = inboxItems.length === 0
        ? '<p class="placeholder-note">Nothing from Admin or other departments right now.</p>'
        : `<ul class="activity-feed">${inboxItems.map((it) => `
            <li>
              <div class="activity-meta"><span>${formatDate(it.date)} · ${escapeHtml(it.fromLabel)}${it.project ? ' · ' + escapeHtml(it.project) : ''}</span>${it.acknowledged ? '<span class="badge badge-approved">Acknowledged</span>' : '<span class="badge badge-progress">Pending</span>'}</div>
              <div class="small">${escapeHtml(it.text)}</div>
              ${renderResponseBlock(it)}
            </li>
          `).join('')}</ul>`;
      return;
    }

    if (activeTab === 'admin') {
      const pendingApprovals = (db.approvals || []).filter((a) => a.requestedBy === head.name && (a.status || 'pending') === 'pending');
      const openMessages = (db.headMessages || []).filter((m) => m.fromName === head.name && !m.acknowledged);

      panelEl.innerHTML = `
        <p class="muted small" style="margin:0 0 8px; font-weight:600;">Approvals</p>
        <ul class="activity-feed" id="detailApprovals"></ul>
        <p class="muted small" style="margin:16px 0 8px; font-weight:600;">Messages</p>
        <ul class="activity-feed" id="detailMessages"></ul>
      `;
      renderApprovalsList(pendingApprovals);
      renderRespondableInbox('detailMessages', openMessages, 'Nothing outstanding with Admin.', (m) => `
        <div class="activity-meta"><span>${formatDate(m.date)}${m.project ? ' · ' + escapeHtml(m.project) : ''}</span></div>
        <div>${escapeHtml(m.message)}</div>
      `, () => {
        saveDB(db);
        renderDetailPanel();
        showToast('Response sent.');
      });
      return;
    }

    const toHeadsItems = (db.headRequests || [])
      .filter((r) => r.fromName === head.name)
      .map((r) => ({
        toLabel: `To ${DEPARTMENT_LABELS[r.toDepartment] || r.toDepartment}`,
        text: r.message,
        date: r.date,
        project: r.project,
        acknowledged: r.acknowledged,
        responseText: r.responseText,
        responseFile: r.responseFile,
        respondedDate: r.respondedDate,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    panelEl.innerHTML = toHeadsItems.length === 0
      ? '<p class="placeholder-note">No requests to other department heads.</p>'
      : `<ul class="activity-feed">${toHeadsItems.map((it) => `
          <li>
            <div class="activity-meta"><span>${formatDate(it.date)} · ${escapeHtml(it.toLabel)}${it.project ? ' · ' + escapeHtml(it.project) : ''}</span>${it.acknowledged ? '<span class="badge badge-approved">Acknowledged</span>' : '<span class="badge badge-progress">Pending</span>'}</div>
            <div class="small">${escapeHtml(it.text)}</div>
            ${renderResponseBlock(it)}
          </li>
        `).join('')}</ul>`;
  }

  function renderApprovalsList(items) {
    const el = document.getElementById('detailApprovals');
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
          <button type="button" class="btn btn-primary btn-sm" data-approve="${a.id}">Approve</button>
          <button type="button" class="btn btn-ghost btn-sm" data-reject="${a.id}">Reject</button>
        </div>
      </li>
    `).join('');

    el.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => setApprovalStatus(btn.dataset.approve, 'approved'));
    });
    el.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => setApprovalStatus(btn.dataset.reject, 'rejected'));
    });
  }

  function setApprovalStatus(id, status) {
    const approval = resolveApproval(db, id, status);
    if (!approval) return;
    saveDB(db);
    renderDetailPanel();
    showToast(status === 'approved' ? 'Approval granted — routed to Accounts for processing.' : 'Approval rejected.');
  }

  document.querySelectorAll('#detailTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderDetailTabs();
    });
  });

  renderStatusCard();
  renderProjects();
  renderDetailTabs();
})();
