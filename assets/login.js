(function () {
  const ROLE_REDIRECT = {
    engineering_head: 'dashboard.html',
    tenders_head: 'dashboard.html',
    store_head: 'dashboard.html',
    general_head: 'dashboard.html',
    admin: 'admin-dashboard.html',
    accountant: 'accountant-dashboard.html',
  };

  // Demo build only — hard-coded so a tester can just pick a role and sign
  // in, with no credentials to remember. Matches the seeded users in data.js.
  const DEMO_CREDENTIALS = {
    engineering_head: { username: 'user1', password: 'root' },
    tenders_head: { username: 'user2', password: 'root' },
    store_head: { username: 'user3', password: 'root' },
    admin: { username: 'admin', password: 'root' },
    accountant: { username: 'user4', password: 'root' },
  };

  // If already signed in, skip straight to the right dashboard.
  const existing = getSession();
  if (existing && ROLE_REDIRECT[existing.role]) {
    window.location.href = ROLE_REDIRECT[existing.role];
    return;
  }

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const roleEl = document.getElementById('role');

  function fillDemoCredentials() {
    const creds = DEMO_CREDENTIALS[roleEl.value];
    if (!creds) return;
    usernameEl.value = creds.username;
    passwordEl.value = creds.password;
  }

  roleEl.addEventListener('change', fillDemoCredentials);
  fillDemoCredentials();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    const db = getDB();
    const user = db.users.find((u) => u.username === username);

    if (!user || user.password !== password) {
      errorEl.textContent = 'Incorrect username or password.';
      errorEl.hidden = false;
      return;
    }

    setSession({ username: user.username, name: user.name, role: user.role });
    window.location.href = ROLE_REDIRECT[user.role];
  });
})();
