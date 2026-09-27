(function () {
  const session = requireAnyRole(HEAD_ROLES);
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const myProjects = getProjectsForUser(db, user);
  const deptLabel = DEPARTMENT_LABELS[user.department] || user.department;

  const ICONS = {
    warning: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  };

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('roleTag').textContent = `${deptLabel} — Department Head`;
  document.getElementById('sidebarNote').innerHTML = getSidebarNoteHtml(user);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  /* ---- alerts: no activity anywhere today, or a document stale > 7 days ----
     Only Engineering has real document/task tracking so far, so only
     Engineering can honestly say "no progress was logged today" — but a
     head's own daily status (a valid reason for a quiet day) isn't tied to
     that at all, and every department gets it: it's the one way Admin sees
     what's happening for a department with no activity log yet. ---- */

  function renderTodayStatusCard(container, copy) {
    const todayStatus = getTodayStatus(user);
    if (todayStatus) {
      const card = document.createElement('div');
      card.className = 'alert-card info';
      card.innerHTML = `
        ${ICONS.info}
        <div class="body">
          <div class="title">${copy.hasStatusTitle(escapeHtml(todayStatus.activity))}</div>
          <p class="muted small" style="margin:0;">${copy.hasStatusSubtitle}</p>
        </div>
        <button class="btn btn-secondary btn-sm" id="clearStatusBtn">Clear</button>
      `;
      container.appendChild(card);
      document.getElementById('clearStatusBtn').addEventListener('click', () => {
        clearTodayStatus(user);
        saveDB(db);
        renderAlerts();
      });
      return;
    }

    const card = document.createElement('div');
    card.className = 'alert-card';
    card.innerHTML = `
      ${ICONS.warning}
      <div class="body" style="width:100%;">
        <div class="title">${copy.noStatusTitle}</div>
        <p class="muted small" style="margin:0 0 8px;">${copy.noStatusSubtitle}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select id="statusSelect" style="margin:0; width:auto; min-width:190px;">
            <option value="" disabled selected>Were you busy with something else?</option>
            ${DAILY_STATUS_OPTIONS.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" id="saveStatusBtn">Save</button>
        </div>
      </div>
    `;
    container.appendChild(card);
    document.getElementById('saveStatusBtn').addEventListener('click', () => {
      const val = document.getElementById('statusSelect').value;
      if (!val) {
        showToast('Choose what you were busy with first.');
        return;
      }
      setTodayStatus(user, val);
      saveDB(db);
      renderAlerts();
      showToast('Noted for today.');
    });
  }

  function renderAlerts() {
    const el = document.getElementById('alertList');
    el.innerHTML = '';

    if (!DEPARTMENTS_WITH_ACTIVITY_TRACKING.includes(user.department)) {
      renderTodayStatusCard(el, {
        noStatusTitle: `Let Admin know what you're working on today`,
        noStatusSubtitle: `${escapeHtml(deptLabel)} doesn't have activity tracking built yet, so this is the one way Admin sees what's happening on a quiet day — out on something else, on leave, and so on.`,
        hasStatusTitle: (activity) => `Noted for today: ${activity}`,
        hasStatusSubtitle: `Visible to Admin from this project's Department Head panel.`,
      });
      return;
    }

    const active = myProjects.filter((p) => p.status === 'in_progress');

    if (active.length === 0) {
      el.innerHTML = '<div class="alert-card success">' + ICONS.check + '<div class="body"><div class="title">Nothing active right now</div><p class="muted small" style="margin:0;">You have no in-progress projects that need a daily update.</p></div></div>';
      return;
    }

    const anyActivityToday = active.some((p) => hasLoggedToday(p, user.department));

    if (anyActivityToday) {
      el.innerHTML = '<div class="alert-card success">' + ICONS.check + '<div class="body"><div class="title">All caught up</div><p class="muted small" style="margin:0;">Today\'s work is logged.</p></div></div>';
      return;
    }

    renderTodayStatusCard(el, {
      noStatusTitle: `You haven't made any progress on your open projects today`,
      noStatusSubtitle: `That's fine if you were busy elsewhere — say what, so it doesn't read as a missed day.`,
      hasStatusTitle: (activity) => `Due to ${activity}, you haven't logged any work on your open projects today.`,
      hasStatusSubtitle: `That's fine — you're not expected to touch every project daily.`,
    });
  }

  /* ---- inbox: instructions from Admin + requests from other department
     heads, merged into one list — from this head's point of view both are
     the same shape of thing ("something landed that needs a reply"), so
     splitting them into separate tabs just meant checking two places for
     one job. Tagging `_source` directly on the real db.adminInstructions /
     db.headRequests objects (not copies) matters: renderRespondableInbox
     finds-and-mutates an item by identity when a reply is sent, so the ack/
     response has to land on the actual object in its actual source array
     for saveDB(db) to persist it. Composing an outgoing request/message now
     lives in the "Send" tab instead — both sending flows are really the
     same action ("tell someone something") differing only in recipient. */

  function renderInbox() {
    const instructionItems = (db.adminInstructions || []).filter((i) => i.toDepartment === user.department);
    instructionItems.forEach((i) => { i._source = 'admin'; });

    const requestItems = (db.headRequests || []).filter((i) => i.toDepartment === user.department);
    requestItems.forEach((i) => { i._source = 'head'; });

    const items = instructionItems.concat(requestItems);
    const openCount = items.filter((i) => !i.acknowledged).length;
    const countEl = document.getElementById('inboxCount');
    countEl.textContent = openCount;
    countEl.hidden = openCount === 0;

    renderRespondableInbox('inboxList', items, 'Nothing from Admin or other departments right now.', (item) => (
      item._source === 'admin' ? `
        <div class="activity-meta"><span>${formatDate(item.date)} · Admin${item.project ? ' · ' + escapeHtml(item.project) : ''}</span></div>
        <div>${escapeHtml(item.message)}</div>
      ` : `
        <div class="activity-meta"><span>${formatDate(item.date)} · ${escapeHtml(item.fromName)} (${escapeHtml(item.fromDepartment)})</span></div>
        <div>${escapeHtml(item.message)}${item.project ? ` <span class="muted small">— ${escapeHtml(item.project)}</span>` : ''}</div>
      `
    ), () => {
      saveDB(db);
      renderInbox();
      showToast('Response sent.');
    });
  }

  /* ---- my projects table ---- */

  function renderProjectsTable() {
    const el = document.getElementById('projectsTableBody');
    el.innerHTML = '';

    if (myProjects.length === 0) {
      el.innerHTML = '<tr><td colspan="4"><div class="empty-state">No projects assigned yet.</div></td></tr>';
      return;
    }

    myProjects.forEach((p) => {
      const meta = PROJECT_STATUS[p.status];
      const lastDate = DEPARTMENTS_WITH_ACTIVITY_TRACKING.includes(user.department) ? getLatestActivityDate(p, user.department) : null;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="doc-type"><div class="project-name-row">${projectLogoHtml(p)}<span>${escapeHtml(p.name)}</span></div></td>
        <td><span class="badge ${meta.badgeClass}">${meta.label}</span></td>
        <td class="small muted">${lastDate ? relativeDay(lastDate) : '—'}</td>
        <td><button class="btn btn-secondary btn-sm" data-project="${p.id}">Open</button></td>
      `;
      el.appendChild(tr);
    });

    const destPage = DEPARTMENT_PAGE[user.department];
    el.querySelectorAll('[data-project]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (destPage) {
          window.location.href = `${destPage}?project=${btn.dataset.project}`;
        } else {
          showToast(`${deptLabel} isn't wired up yet in this prototype.`);
        }
      });
    });
  }

  /* ---- recent activity across projects (Engineering only, for now) ---- */

  function renderRecentActivity() {
    const el = document.getElementById('recentFeed');
    el.innerHTML = '';

    if (!DEPARTMENTS_WITH_ACTIVITY_TRACKING.includes(user.department)) {
      el.innerHTML = `<li class="placeholder-note">Activity tracking isn't built yet for ${escapeHtml(deptLabel)}.</li>`;
      return;
    }

    const entries = getAllProjectsActivity(myProjects);

    if (entries.length === 0) {
      el.innerHTML = '<li class="placeholder-note">No activity logged yet.</li>';
      return;
    }

    entries.slice(0, 10).forEach((a) => {
      const li = document.createElement('li');
      const label = a.kind === 'document'
        ? `<span class="activity-doc">${escapeHtml(a.docType)}</span> — `
        : '<span class="kind-tag kind-report">Site report</span> — ';
      li.innerHTML = `
        <div class="activity-meta"><span class="activity-project">${escapeHtml(a.projectName)}</span><span>${relativeDay(a.date)}</span></div>
        <div>${label}${escapeHtml(a.note)}</div>
      `;
      el.appendChild(li);
    });
  }

  /* ---- send: one form for everything you'd send out, not three ----
     A free-text message to Admin, a formal approval request to Admin, and
     a request to another department's head are all the same underlying
     action — "tell someone something" — differing only in recipient and,
     for Admin, whether it needs formal sign-off. One recipient picker,
     one (Admin-only) category picker, and one "Sent by you" list covering
     all three kinds together, newest first. */

  function renderSendToOptions() {
    const el = document.getElementById('sendTo');
    const deptOptions = Object.keys(DEPARTMENT_LABELS)
      .filter((key) => key !== user.department)
      .map((key) => `<option value="${key}">${escapeHtml(DEPARTMENT_LABELS[key])}</option>`)
      .join('');
    el.innerHTML = `<option value="admin">Admin</option>${deptOptions}`;
  }

  function renderSendProjectOptions(includeGeneral) {
    const el = document.getElementById('sendProject');
    const projectOptions = myProjects.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
    el.innerHTML = includeGeneral ? `<option value="">General — not project-specific</option>${projectOptions}` : projectOptions;
  }

  function updateSendFormVisibility() {
    const isAdmin = document.getElementById('sendTo').value === 'admin';
    document.getElementById('sendCategoryWrap').hidden = !isAdmin;
    if (!isAdmin) document.getElementById('sendCategory').value = 'Message';

    const isMessage = document.getElementById('sendCategory').value === 'Message';
    document.getElementById('messageFields').hidden = !isMessage;
    document.getElementById('approvalFields').hidden = isMessage;
    renderSendProjectOptions(isMessage);
  }

  document.getElementById('sendTo').addEventListener('change', updateSendFormVisibility);
  document.getElementById('sendCategory').addEventListener('change', updateSendFormVisibility);

  function renderSentByYou() {
    const el = document.getElementById('sentByYouList');
    const myMessages = (db.headMessages || [])
      .filter((m) => m.fromName === user.name && m.fromDepartment === deptLabel)
      .map((m) => ({ ...m, kind: 'message', toLabel: 'Admin' }));
    const myApprovals = (db.approvals || [])
      .filter((a) => a.requestedBy === user.name && a.department === deptLabel)
      .map((a) => ({ ...a, kind: 'approval', toLabel: `Admin — ${a.routedTo}` }));
    const myRequests = (db.headRequests || [])
      .filter((r) => r.fromName === user.name && r.fromDepartment === deptLabel)
      .map((r) => ({ ...r, kind: 'request', toLabel: DEPARTMENT_LABELS[r.toDepartment] || r.toDepartment }));
    const mine = myMessages.concat(myApprovals, myRequests).sort((a, b) => (a.date < b.date ? 1 : -1));

    if (mine.length === 0) {
      el.innerHTML = '<li class="placeholder-note">You haven\'t sent anything yet.</li>';
      return;
    }

    el.innerHTML = mine.map((item) => {
      if (item.kind === 'approval') {
        const meta = APPROVAL_STATUS_META[item.status || 'pending'];
        const acctMeta = item.accountsStatus ? ACCOUNTS_STATUS_META[item.accountsStatus] : null;
        return `
          <li>
            <div class="activity-meta"><span>${formatDate(item.date)} · ${escapeHtml(item.toLabel)}</span><span class="badge ${meta.badgeClass}">${meta.label}</span>${acctMeta ? ` <span class="badge ${acctMeta.badgeClass}">Accounts: ${acctMeta.label}</span>` : ''}</div>
            <div style="font-weight:700;">${escapeHtml(item.title)}</div>
            <div class="muted small">${escapeHtml(item.category)}${item.project ? ' · ' + escapeHtml(item.project) : ''}</div>
          </li>
        `;
      }
      const statusTag = item.acknowledged
        ? '<span class="badge badge-approved">Acknowledged</span>'
        : '<span class="badge badge-progress">Pending</span>';
      return `
        <li>
          <div class="activity-meta"><span>${formatDate(item.date)} · ${escapeHtml(item.toLabel)}${item.project ? ' · ' + escapeHtml(item.project) : ''}</span>${statusTag}</div>
          <div>${escapeHtml(item.message)}</div>
          ${renderResponseBlock(item)}
        </li>
      `;
    }).join('');
  }

  document.getElementById('sendForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const sendTo = document.getElementById('sendTo').value;
    const isAdmin = sendTo === 'admin';
    const category = isAdmin ? document.getElementById('sendCategory').value : 'Message';

    if (category === 'Message') {
      const noteEl = document.getElementById('sendMessage');
      const message = noteEl.value.trim();
      if (!message) { showToast('Add a message before sending.'); return; }
      const project = document.getElementById('sendProject').value || null;

      if (isAdmin) {
        if (!db.headMessages) db.headMessages = [];
        db.headMessages.push(makeHeadMessage(todayStr(), user.name, deptLabel, message, project));
        showToast('Sent to Admin.');
      } else {
        if (!db.headRequests) db.headRequests = [];
        db.headRequests.push(makeHeadRequest(todayStr(), user.name, deptLabel, message, sendTo, project));
        showToast(`Sent to ${DEPARTMENT_LABELS[sendTo] || sendTo}.`);
      }
      noteEl.value = '';
    } else {
      const titleEl = document.getElementById('sendTitle');
      const title = titleEl.value.trim();
      if (!title) { showToast('Add a title before sending.'); return; }

      const project = document.getElementById('sendProject').value || null;
      const routedTo = document.getElementById('sendRoutedTo').value;

      if (!db.approvals) db.approvals = [];
      db.approvals.push(makeApproval(category, title, project, routedTo, user.name, deptLabel, todayStr()));
      titleEl.value = '';
      showToast(`Sent to ${routedTo} for approval.`);
    }

    saveDB(db);
    renderSentByYou();
  });

  /* ---- Team & Activity tabs ---- */

  document.querySelectorAll('#teamTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#teamTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('[data-team-panel]').forEach((p) => { p.hidden = true; });
      btn.classList.add('active');
      document.querySelector(`[data-team-panel="${btn.dataset.teamTab}"]`).hidden = false;
    });
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'dashboard',
    hideKeys: ['projects', 'team-status'],
    hrefs: { engineering: 'engineering.html', tenders: 'tenders.html', store: 'store.html' },
  });

  renderAlerts();
  renderInbox();
  renderSendToOptions();
  updateSendFormVisibility();
  renderSentByYou();
  renderProjectsTable();
  renderRecentActivity();
})();
