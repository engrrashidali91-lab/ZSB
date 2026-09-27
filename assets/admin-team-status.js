(function () {
  const session = requireRole('admin');
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);

  const ICONS = {
    warning: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  };

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- one card per department head: what they've done today, wherever
     it happened, or why not — the same three states dashboard.js's own
     Alerts card shows a head about themselves, now visible to Admin for
     every head at once, regardless of how many projects they're on or
     which one Admin happens to be looking at. ---- */

  function buildHeadStatus(head) {
    const todayActivity = getHeadTodayActivity(db, head);
    if (todayActivity.length > 0) return { state: 'done', todayActivity };

    const status = getTodayStatus(head);
    if (status) return { state: 'reason', status };

    return { state: 'none' };
  }

  // Whoever needs a look leads the list — no update and no reason first,
  // a reason on file next, a genuinely productive day last since it needs
  // the least attention.
  const STATE_PRIORITY = { none: 0, reason: 1, done: 2 };

  function renderStats(heads, statuses) {
    const counts = { done: 0, reason: 0, none: 0 };
    statuses.forEach((s) => { counts[s.state]++; });

    document.getElementById('statRow').innerHTML = `
      <div class="stat-tile"><div class="num">${heads.length}</div><div class="label">Department heads</div></div>
      <div class="stat-tile"><div class="num">${counts.done}</div><div class="label">Logged work today</div><div class="bar" style="background:var(--green);"></div></div>
      <div class="stat-tile"><div class="num">${counts.reason}</div><div class="label">Reason given</div><div class="bar" style="background:var(--blue);"></div></div>
      <div class="stat-tile"><div class="num">${counts.none}</div><div class="label">No update</div><div class="bar" style="background:var(--red);"></div></div>
    `;
  }

  function renderHeadCard(head, status) {
    const deptLabel = DEPARTMENT_LABELS[head.department] || head.department;
    const pendingApprovals = (db.approvals || []).filter((a) => a.requestedBy === head.name && (a.status || 'pending') === 'pending').length;
    const openMessages = (db.headMessages || []).filter((m) => m.fromName === head.name && !m.acknowledged).length;

    let bodyHtml;
    if (status.state === 'done') {
      bodyHtml = `
        <div class="alert-card success" style="margin:0;">
          ${ICONS.check}
          <div class="body">
            <div class="title">Logged ${status.todayActivity.length} update${status.todayActivity.length === 1 ? '' : 's'} today</div>
            <ul class="activity-feed" style="max-height:160px; margin-top:8px;">
              ${status.todayActivity.map((a) => `
                <li>
                  <div class="activity-meta"><span class="activity-project">${escapeHtml(a.projectName)}</span></div>
                  <div class="small">${a.kind === 'document' ? `<span class="activity-doc">${escapeHtml(a.docType)}</span> — ` : '<span class="kind-tag kind-report">Site report</span> — '}${escapeHtml(a.note)}</div>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    } else if (status.state === 'reason') {
      bodyHtml = `
        <div class="alert-card info" style="margin:0;">
          ${ICONS.info}
          <div class="body">
            <div class="title">On ${escapeHtml(status.status.activity)}</div>
            <p class="muted small" style="margin:0;">No activity logged today, but a reason's on file.</p>
          </div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="alert-card" style="margin:0;">
          ${ICONS.warning}
          <div class="body">
            <div class="title">No activity logged, and no reason given</div>
            <p class="muted small" style="margin:0;">Nothing on file for today yet.</p>
          </div>
        </div>
      `;
    }

    const detailUrl = `admin-head-detail.html?user=${encodeURIComponent(head.username)}`;

    return `
      <div class="card clickable" data-head="${escapeHtml(head.username)}">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          <div class="user-avatar">${escapeHtml(initials(head.name))}</div>
          <div>
            <strong style="display:block; font-size:14px;">${escapeHtml(head.name)}</strong>
            <span class="muted small">${escapeHtml(deptLabel)} — Department Head</span>
          </div>
        </div>
        ${bodyHtml}
        <div style="display:flex; gap:16px; margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
          <a href="${detailUrl}&tab=admin" class="btn-link" style="font-size:12.5px;">${pendingApprovals} pending approval${pendingApprovals === 1 ? '' : 's'}</a>
          <a href="${detailUrl}&tab=admin" class="btn-link" style="font-size:12.5px;">${openMessages} open message${openMessages === 1 ? '' : 's'}</a>
        </div>
      </div>
    `;
  }

  const heads = db.users.filter((u) => HEAD_ROLES.includes(u.role));
  const statuses = heads.map((h) => buildHeadStatus(h));
  const order = heads.map((h, i) => i).sort((a, b) => STATE_PRIORITY[statuses[a].state] - STATE_PRIORITY[statuses[b].state]);

  renderStats(heads, statuses);
  document.getElementById('headCards').innerHTML = order.map((i) => renderHeadCard(heads[i], statuses[i])).join('');

  // Clicking anywhere on a card opens that head's own view — except the
  // two footer links, which already go straight to the right tab there.
  document.getElementById('headCards').querySelectorAll('[data-head]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      window.location.href = `admin-head-detail.html?user=${encodeURIComponent(card.dataset.head)}`;
    });
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'team-status',
    hideKeys: ['engineering', 'tenders', 'store'],
    hrefs: { dashboard: 'admin-dashboard.html', projects: 'admin-reports.html' },
  });
})();
