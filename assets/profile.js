(function () {
  const session = requireAnyRole([...HEAD_ROLES, 'admin', 'accountant']);
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const isAdmin = user.role === 'admin';
  const isAccountant = user.role === 'accountant';
  const deptLabel = (isAdmin || isAccountant) ? null : (DEPARTMENT_LABELS[user.department] || user.department);
  const roleLabel = isAdmin ? 'Admin' : isAccountant ? 'Accountant' : `${deptLabel} — Department Head`;

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('roleTag').textContent = roleLabel;
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('profName').textContent = user.name;
  document.getElementById('profUsername').textContent = user.username;
  document.getElementById('profEmail').textContent = user.email || '—';
  document.getElementById('profRole').textContent = roleLabel;

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('passwordError');
    errorEl.hidden = true;

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      errorEl.textContent = "New password and confirmation don't match.";
      errorEl.hidden = false;
      return;
    }

    const result = changePassword(db, user, currentPassword, newPassword);
    if (!result.ok) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    e.target.reset();
    showToast('Password updated.');
  });

  if (isAdmin) {
    renderSidebar({
      containerId: 'navList',
      activeKey: 'profile',
      hideKeys: ['engineering', 'tenders', 'store'],
      hrefs: { dashboard: 'admin-dashboard.html', projects: 'admin-reports.html', 'team-status': 'admin-team-status.html' },
    });
    document.getElementById('sidebarNote').innerHTML = '<strong>Demo build</strong> Sample data. Engineering, Tenders and Store &amp; Inventory show real records — General has no workspace built yet.';
  } else if (isAccountant) {
    renderSidebar({
      containerId: 'navList',
      activeKey: 'profile',
      hideKeys: ['engineering', 'tenders', 'store', 'team-status'],
      hrefs: { dashboard: 'accountant-dashboard.html', projects: 'accountant-project.html' },
    });
    document.getElementById('sidebarNote').innerHTML = '<strong>Demo build</strong> Sample data. Accounts sees approvals Admin has signed off on, plus its own payment ledger.';
  } else {
    renderSidebar({
      containerId: 'navList',
      activeKey: 'profile',
      hideKeys: ['projects', 'team-status'],
      hrefs: { dashboard: 'dashboard.html', engineering: 'engineering.html', tenders: 'tenders.html', store: 'store.html' },
    });
    document.getElementById('sidebarNote').innerHTML = getSidebarNoteHtml(user);
  }
})();
