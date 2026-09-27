(function () {
  // If already signed in, this page isn't relevant — send them onward.
  const existing = getSession();
  if (existing) {
    window.location.href = existing.role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
    return;
  }

  const form = document.getElementById('forgotForm');
  const errorEl = document.getElementById('forgotError');
  const sentState = document.getElementById('sentState');
  const demoLinkBox = document.getElementById('demoLinkBox');
  const demoLink = document.getElementById('demoLink');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    const email = document.getElementById('email').value.trim();
    if (!email) return;

    const db = getDB();
    const result = requestPasswordReset(db, email);

    // Same message either way — never reveal whether the email matched an account.
    form.hidden = true;
    sentState.hidden = false;

    if (result.ok) {
      demoLinkBox.hidden = false;
      demoLink.href = `reset-password.html?token=${encodeURIComponent(result.token)}`;
    }
  });
})();
