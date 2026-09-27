(function () {
  const session = requireRole('admin');
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const projects = getProjectsForUser(db, user);

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2400);
  }


  /* ---- stat tiles ---- */

  function renderStats() {
    const counts = { in_progress: 0, pending: 0, delayed: 0, closed: 0 };
    projects.forEach((p) => { counts[p.status]++; });

    const tiles = [
      { label: 'Total Projects', value: projects.length, bar: 'var(--blue)' },
      { label: 'Active', value: counts.in_progress, trend: '↗ on schedule', cls: 'up', bar: 'var(--blue)' },
      { label: 'Delayed', value: counts.delayed, trend: '↘ needs review', cls: 'down', bar: 'var(--red)' },
      { label: 'Completed', value: counts.closed, trend: '↗ handed over', cls: 'up', bar: 'var(--green)' },
    ];

    document.getElementById('statRow').innerHTML = tiles.map((t) => `
      <div class="stat-tile">
        <div class="num">${t.value}</div>
        <div class="label">${t.label}</div>
        ${t.trend ? `<div class="trend ${t.cls}">${t.trend}</div>` : ''}
        <div class="bar" style="background:${t.bar}"></div>
      </div>
    `).join('');
  }

  /* ---- project progress list ----
     Overall progress is tasks-weighted across every Engineering document
     (see computeEngineeringProgress); "Today" is a separate, distinct
     signal — whether anything actually happened today, not just where the
     project stands overall — and if nothing did, it surfaces the
     responsible head's own stated reason (a valid one, like being out on
     inspection) instead of leaving a silent gap. Rows are clickable through
     to that project's full department-by-department detail. */

  function todayIndicatorHtml(project) {
    const doneToday = getTasksCompletedToday(project);
    if (doneToday > 0) {
      return `<span class="today-pill today-done">+${doneToday} task${doneToday === 1 ? '' : 's'} completed today</span>`;
    }
    const head = getHeadForProject(db, project, 'engineering');
    const status = head ? getTodayStatus(head) : null;
    if (status) {
      return `<span class="today-pill today-info">No update today — ${escapeHtml(head.name)} noted: ${escapeHtml(status.activity)}</span>`;
    }
    return `<span class="today-pill today-muted">No update today</span>`;
  }

  function renderProgressList() {
    const el = document.getElementById('progressList');

    if (projects.length === 0) {
      el.innerHTML = '<div class="empty-state">No projects to show.</div>';
      return;
    }

    el.innerHTML = projects.map((p) => {
      const breakdown = computeProgressBreakdown(p);
      const meta = PROJECT_STATUS[p.status];
      return `
        <div class="ops-row" data-project="${p.id}">
          <div class="ops-row-head">
            <div class="project-name-row">
              ${projectLogoHtml(p)}
              <div>
                <p class="eyebrow" style="margin:0;">${escapeHtml(p.code)}</p>
                <strong>${escapeHtml(p.name)}</strong>
              </div>
            </div>
            <span class="badge ${meta.badgeClass}">${meta.label}</span>
          </div>
          <div class="ops-bar">
            <div class="ops-bar-label"><span>Overall progress</span><span>${breakdown.overall}%</span></div>
            <div class="progress-track segmented">
              <div class="progress-fill" style="width:${breakdown.beforeToday}%; background:var(--blue);"></div>
              ${breakdown.today > 0 ? `<div class="progress-fill" style="width:${breakdown.today}%; background:var(--green-solid);"></div>` : ''}
            </div>
          </div>
          <div class="ops-row-today">${todayIndicatorHtml(p)}</div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-project]').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.href = `admin-reports.html?project=${row.dataset.project}`;
      });
    });
  }

  /* ---- pending approvals ---- */

  function renderApprovals() {
    const pending = (db.approvals || []).filter((a) => (a.status || 'pending') === 'pending');
    const countEl = document.getElementById('approvalsCount');
    countEl.textContent = pending.length;
    countEl.hidden = pending.length === 0;
    const el = document.getElementById('approvalsList');
    if (pending.length === 0) {
      el.innerHTML = '<li class="placeholder-note">Nothing pending approval.</li>';
      return;
    }
    el.innerHTML = pending.map((a) => `
      <li>
        <div class="activity-meta"><span class="eyebrow" style="margin:0;">${escapeHtml(a.id)}</span><span>@ ${escapeHtml(a.routedTo)}</span></div>
        <div style="font-weight:700;">${escapeHtml(a.title)}</div>
        <div class="muted small">${escapeHtml(a.category)} · ${escapeHtml(a.project)}${a.requestedBy ? ` · ${escapeHtml(a.requestedBy)} (${escapeHtml(a.department)})` : ''}</div>
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
    renderApprovals();
    showToast(status === 'approved' ? 'Approval granted — routed to Accounts for processing.' : 'Approval rejected.');
  }

  /* ---- Approvals / Messages / Instructions tabs (one card, one view) ---- */

  document.querySelectorAll('#inboxTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#inboxTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = true; });
      btn.classList.add('active');
      document.querySelector(`[data-panel="${btn.dataset.tab}"]`).hidden = false;
    });
  });

  /* ---- team activity: every head's recent actions, filterable by department ---- */

  const DEPT_TAG_CLASS = {
    'Engineering': 'dept-engineering',
    'Tenders': 'dept-tenders',
    'Store & Inventory': 'dept-store',
    'General': 'dept-general',
  };

  let activeTeamActivityDept = 'all';

  function renderTeamActivity() {
    const el = document.getElementById('teamActivityList');
    let entries = getAllProjectsActivity(projects);
    if (activeTeamActivityDept !== 'all') {
      entries = entries.filter((a) => a.department === activeTeamActivityDept);
    }

    if (entries.length === 0) {
      el.innerHTML = activeTeamActivityDept === 'all'
        ? '<li class="placeholder-note">No activity logged yet.</li>'
        : `<li class="placeholder-note">No ${escapeHtml(activeTeamActivityDept)} activity logged yet.</li>`;
      return;
    }

    el.innerHTML = entries.slice(0, 12).map((a) => {
      const label = a.kind === 'document'
        ? `<span class="activity-doc">${escapeHtml(a.docType)}</span> — `
        : '<span class="kind-tag kind-report">Site report</span> — ';
      const deptTag = `<span class="dept-tag ${DEPT_TAG_CLASS[a.department] || 'dept-general'}">${escapeHtml(a.department)}</span>`;
      return `
        <li>
          <div class="activity-meta"><span class="activity-project">${deptTag} ${escapeHtml(a.projectName)} · ${escapeHtml(a.user)}</span><span>${relativeDay(a.date)}</span></div>
          <div>${label}${escapeHtml(a.note)}</div>
        </li>
      `;
    }).join('');
  }

  document.querySelectorAll('#teamActivityTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#teamActivityTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTeamActivityDept = btn.dataset.dept;
      renderTeamActivity();
    });
  });

  /* ---- messages from department heads — reply with text and/or a document ---- */

  function renderHeadMessages() {
    const items = db.headMessages || [];
    const openCount = items.filter((m) => !m.acknowledged).length;
    const countEl = document.getElementById('messagesCount');
    countEl.textContent = openCount;
    countEl.hidden = openCount === 0;

    renderRespondableInbox('headMessagesList', items, 'No open messages from department heads.', (m) => `
      <div class="activity-meta"><span>${formatDate(m.date)} · ${escapeHtml(m.fromName)} (${escapeHtml(m.fromDepartment)})</span></div>
      <div>${escapeHtml(m.message)}${m.project ? ` <span class="muted small">— ${escapeHtml(m.project)}</span>` : ''}</div>
    `, () => {
      saveDB(db);
      renderHeadMessages();
      showToast('Response sent.');
    });
  }

  /* ---- send an instruction to a department head ---- */

  function renderInstructionProjectOptions() {
    const el = document.getElementById('instructionProject');
    el.innerHTML = '<option value="">General — not project-specific</option>'
      + projects.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  }

  function renderSentInstructions() {
    const items = (db.adminInstructions || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const el = document.getElementById('sentInstructionsList');

    if (items.length === 0) {
      el.innerHTML = '<li class="placeholder-note">Nothing sent yet.</li>';
      return;
    }

    el.innerHTML = items.map((i) => {
      const statusTag = i.acknowledged
        ? '<span class="badge badge-approved">Acknowledged</span>'
        : '<span class="badge badge-progress">Pending</span>';
      return `
        <li>
          <div class="activity-meta"><span>${formatDate(i.date)} · ${escapeHtml(DEPARTMENT_LABELS[i.toDepartment] || i.toDepartment)}${i.project ? ' · ' + escapeHtml(i.project) : ''}</span>${statusTag}</div>
          <div>${escapeHtml(i.message)}</div>
          ${renderResponseBlock(i)}
        </li>
      `;
    }).join('');
  }

  document.getElementById('instructionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const noteEl = document.getElementById('instructionNote');
    const message = noteEl.value.trim();
    if (!message) return;

    const toDepartment = document.getElementById('instructionDept').value;
    const project = document.getElementById('instructionProject').value || null;

    if (!db.adminInstructions) db.adminInstructions = [];
    db.adminInstructions.push(makeInstruction(todayStr(), message, toDepartment, project));
    saveDB(db);
    noteEl.value = '';
    renderSentInstructions();
    showToast(`Sent to ${DEPARTMENT_LABELS[toDepartment] || toDepartment}.`);
  });

  /* ---- system data: export / import / reset as JSON ---- */

  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zsb-db-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported current data as JSON.');
  });

  document.getElementById('importDataInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.users) || !Array.isArray(parsed.projects)) {
          showToast("That file doesn't look like a valid export — missing users/projects.");
          return;
        }
        saveDB(parsed);
        showToast('Data imported. Reloading…');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        showToast('Could not read that file as JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('Reset all data back to the original sample data? This cannot be undone.')) return;
    resetDB();
    showToast('Reset. Reloading…');
    setTimeout(() => window.location.reload(), 600);
  });

  /* ---- Test Data: quick scenario switches ----
     Exactly two scenarios — the two states Admin actually needs to demo:
     every department made progress today, or Engineering specifically
     didn't while everyone else did. Both reload the page afterwards, since
     so much of what's on screen — this dashboard, Team Status, every
     head's own Dashboard, the Project Report — depends on this same data. */

  function clearAllDailyStatus() {
    db.users.forEach((u) => { delete u.dailyStatus; });
  }

  /* Rolls anything dated today back to yesterday — any completed task, any
     activity/ledger entry (across every department with real tracking, not
     just Engineering), any site report — so "today" reads as genuinely
     quiet everywhere (progress bars, activity feeds, Team Status,
     Dashboards) before a scenario adds its own fresh today-dated entries on
     top. deptKey is a user-facing department name (e.g. 'store'),
     translated to its project.departments key (e.g. 'storeSite') — they
     only differ for Store & Inventory, but a project's storeSite dept has
     materials/ledger activity and no task-checklist documents at all, so
     the `.documents` step is simply a no-op for it rather than something to
     special-case. */
  function rollBackTodayToYesterday() {
    const today = todayStr();
    const yesterday = daysAgo(1);
    db.projects.forEach((p) => {
      DEPARTMENTS_WITH_ACTIVITY_TRACKING.forEach((deptKey) => {
        const projectDeptKey = USER_DEPT_TO_PROJECT_DEPT_KEY[deptKey] || deptKey;
        const dept = p.departments[projectDeptKey];
        if (!dept) return;
        (dept.documents || []).forEach((doc) => {
          (doc.tasks || []).forEach((t) => {
            if (t.done && t.completedDate === today) t.completedDate = yesterday;
          });
        });
        (dept.activity || []).forEach((a) => { if (a.date === today) a.date = yesterday; });
        (dept.ledger || []).forEach((l) => { if (l.date === today) l.date = yesterday; });
      });
      (p.siteReports || []).forEach((r) => { if (r.date === today) r.date = yesterday; });
    });
  }

  /* Completes the next incomplete task on the first document (of the given
     department, on the given project) that has one, gated the same way the
     real Tasks modal is (a final task can't complete until every other task
     on its document is already done). Returns true if it completed
     something. Only ever called for departments in
     DEPARTMENTS_WITH_TASK_PROGRESS (Engineering, Tenders) — Store &
     Inventory has no task checklist to "complete a task" on; see
     recordStoreMovementToday for its equivalent. */
  function completeNextTask(project, deptKey, today) {
    const dept = project.departments[deptKey];
    const head = getHeadForProject(db, project, deptKey);
    for (const doc of (dept.documents || [])) {
      const tasks = doc.tasks || [];
      const next = tasks.find((t) => !t.done);
      if (!next) continue;
      if (next.isFinal && !tasks.filter((t) => t.id !== next.id).every((t) => t.done)) continue;

      const actor = head ? head.name : doc.lastUpdatedBy;
      next.done = true;
      next.completedBy = actor;
      next.completedDate = today;
      recomputeDocFromTasks(doc);
      doc.lastUpdatedBy = actor;
      doc.lastUpdatedDate = today;
      const note = `Completed task: "${next.title}".`;
      doc.history.push({ date: today, note, progress: doc.progress });
      if (!dept.activity) dept.activity = [];
      dept.activity.push(makeActivity(today, doc.type, note, actor));
      return true;
    }
    return false;
  }

  /* Store & Inventory's equivalent of completeNextTask — it has no task
     checklist, so "today's work" there is a stock movement instead: an OUT
     ledger entry against the project's first material, plus the matching
     activity entry that Team Status/getHeadTodayActivity actually reads.
     Returns false only if the project has no materials to move at all. */
  function recordStoreMovementToday(project, today) {
    const dept = project.departments.storeSite;
    const material = (dept.materials || [])[0];
    if (!material) return false;

    const head = getHeadForProject(db, project, 'store');
    const actor = head ? head.name : 'Store & Inventory';
    const qty = Math.max(1, Math.round(material.remaining * 0.05));
    material.out += qty;
    recomputeMaterial(material);

    const voucherId = `GP-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!dept.ledger) dept.ledger = [];
    dept.ledger.push(makeLedgerEntry(today, 'OUT', material.name, qty, 'Issued to site.', voucherId));
    if (!dept.activity) dept.activity = [];
    dept.activity.push(makeActivity(today, material.name, `Issued ${qty} ${material.unit} to site.`, actor));
    return true;
  }

  document.getElementById('simulateTeamActiveBtn').addEventListener('click', () => {
    rollBackTodayToYesterday();
    clearAllDailyStatus();
    const today = todayStr();
    const activeProjects = db.projects.filter((p) => p.status === 'in_progress');
    activeProjects.forEach((p) => {
      DEPARTMENTS_WITH_TASK_PROGRESS.forEach((deptKey) => completeNextTask(p, deptKey, today));
      recordStoreMovementToday(p, today);
    });
    saveDB(db);
    showToast('Simulated a day where every department made progress. Reloading…');
    setTimeout(() => window.location.reload(), 600);
  });

  document.getElementById('simulateEngineeringQuietBtn').addEventListener('click', () => {
    rollBackTodayToYesterday();
    clearAllDailyStatus();
    const today = todayStr();
    const activeProjects = db.projects.filter((p) => p.status === 'in_progress');
    activeProjects.forEach((p) => {
      completeNextTask(p, 'tenders', today);
      recordStoreMovementToday(p, today);
    });
    saveDB(db);
    showToast('Simulated a day where Engineering has no update yet — everyone else does. Reloading…');
    setTimeout(() => window.location.reload(), 600);
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'dashboard',
    hideKeys: ['engineering', 'tenders', 'store'],
    hrefs: { projects: 'admin-reports.html', 'team-status': 'admin-team-status.html' },
  });
  renderStats();
  renderProgressList();
  renderApprovals();
  renderTeamActivity();
  renderHeadMessages();
  renderInstructionProjectOptions();
  renderSentInstructions();
})();
