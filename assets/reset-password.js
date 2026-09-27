(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  const db = getDB();
  const found = validateResetToken(db, token);

  const invalidState = document.getElementById('invalidState');
  const form = document.getElementById('resetForm');
  const doneState = document.getElementById('doneState');
  const backLink = document.getElementById('backLink');
  const forEmail = document.getElementById('forEmail');

  if (!found) {
    invalidState.hidden = false;
    document.getElementById('invalidMessage').textContent = 'This reset link is invalid or has expired. Request a new one below.';
    return;
  }

  forEmail.textContent = `for ${found.user.email}`;
  form.hidden = false;
  backLink.hidden = true;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const errorEl = document.getElementById('resetError');
    errorEl.hidden = true;

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      errorEl.textContent = "New password and confirmation don't match.";
      errorEl.hidden = false;
      return;
    }

    const result = resetPasswordWithToken(db, token, newPassword);
    if (!result.ok) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    form.hidden = true;
    doneState.hidden = false;
  });
})();
