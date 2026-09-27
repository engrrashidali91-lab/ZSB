(function () {
  const session = requireAnyRole(HEAD_ROLES);
  if (!session) return;

  const db = getDB();
  const user = db.users.find((u) => u.username === session.username && u.role === session.role);
  const myProjects = getProjectsForUser(db, user);
  const isOwnDepartment = user.department === 'tenders';
  const deptLabel = DEPARTMENT_LABELS[user.department] || user.department;

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('project');
  let currentProjectId = (requestedId && myProjects.some((p) => p.id === requestedId))
    ? requestedId
    : (myProjects.length ? myProjects[0].id : null);

  let activeDocId = null; // for the Tasks modal
  let activeTypeFilter = 'All';

  const FILE_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICON_WARNING = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  const ICON_INFO = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
  const ICON_LOCK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const ICON_REFRESH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';
  const ICON_PLUS = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('roleTag').textContent = `${deptLabel} — Department Head`;
  document.getElementById('sidebarNote').innerHTML = getSidebarNoteHtml(user);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('deptBanner').innerHTML = isOwnDepartment ? '' :
    `<div class="banner info">${ICON_LOCK} You're viewing Tenders read-only — this isn't your department.</div>`;

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
      window.location.href = `tenders.html?project=${el.value}`;
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
      bannerEl.innerHTML = `<div class="banner warning">${ICON_LOCK} This project is closed. Activities are read-only.</div>`;
    } else if (project.status === 'pending') {
      bannerEl.innerHTML = `<div class="banner info">${ICON_INFO} This project hasn't kicked off yet. You can still prepare initial tender activities ahead of mobilisation.</div>`;
    } else if (project.status === 'delayed') {
      bannerEl.innerHTML = `<div class="banner warning">${ICON_WARNING} This project is flagged as delayed. Keep tender activities current so management can see where things stand.</div>`;
    } else {
      bannerEl.innerHTML = '';
    }

    updateNewDocButtonState();
  }

  function updateNewDocButtonState() {
    const btn = document.getElementById('newDocBtn');
    btn.disabled = isReadOnly();
    btn.title = !isOwnDepartment ? 'Tenders isn\'t your department.' : (isReadOnly() ? 'This project is closed.' : '');
  }

  /* ---- Documents: filter + table ---- */

  function renderTypeFilters() {
    const project = currentProject();
    const types = ['All', ...new Set(project.departments.tenders.documents.map((d) => d.type))];
    const el = document.getElementById('typeFilterRow');
    el.innerHTML = '';
    types.forEach((t) => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (t === activeTypeFilter ? ' active' : '');
      btn.textContent = t;
      btn.addEventListener('click', () => {
        activeTypeFilter = t;
        renderTypeFilters();
        renderDocGrid();
      });
      el.appendChild(btn);
    });
  }

  function fileButtonsHtml(doc, readOnly) {
    const files = doc.files || [];
    const chips = files.map((f) => `
      <span class="file-chip">
        <button class="file-btn ${FILE_KIND_CLASS[f.kind] || FILE_KIND_CLASS.File}" data-file-view="${f.id}" data-doc="${doc.id}" title="${escapeHtml(f.name)}">${FILE_ICON} ${escapeHtml(f.kind)}</button>
        ${readOnly ? '' : `<button class="file-icon-btn" data-file-replace="${f.id}" data-doc="${doc.id}" title="Replace this file">${ICON_REFRESH}</button>`}
      </span>
    `).join('');
    const addBtn = readOnly ? '' : `<button class="file-icon-btn" data-file-add="${doc.id}" title="Add another file">${ICON_PLUS}</button>`;
    const emptyNote = files.length === 0 ? '<p class="no-files-note">No files attached yet.</p>' : '';
    return `${emptyNote}<div class="file-row">${chips}${addBtn}</div>`;
  }

  function renderDocGrid() {
    const project = currentProject();
    const el = document.getElementById('docTableBody');
    el.innerHTML = '';
    const readOnly = isReadOnly();

    const docs = project.departments.tenders.documents.filter((d) => activeTypeFilter === 'All' || d.type === activeTypeFilter);

    if (docs.length === 0) {
      el.innerHTML = '<tr><td colspan="7"><div class="empty-state">No activities yet. Use "+ New activity" to add the first one.</div></td></tr>';
      return;
    }

    docs.forEach((doc) => {
      const fillClass = doc.progress >= 100 ? 'progress-fill complete' : 'progress-fill';
      const stale = doc.progress < 100 && daysSince(doc.lastUpdatedDate) >= 3 && project.status === 'in_progress';
      const tasks = doc.tasks || [];
      const doneCount = tasks.filter((t) => t.done).length;
      const taskCaption = tasks.length
        ? `${doc.progress}% <span class="muted">· ${doneCount}/${tasks.length} tasks</span>`
        : `${doc.progress}%`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="type-tag ${typeClass(doc.type)}">${escapeHtml(doc.type)}</span></td>
        <td class="doc-type">${escapeHtml(doc.title)}</td>
        <td class="progress-cell">
          <div class="progress-track"><div class="${fillClass}" style="width:${doc.progress}%"></div></div>
          <div class="progress-pct">${taskCaption}</div>
        </td>
        <td>${badgeHtml(doc.status)}${stale ? ' <span class="badge badge-stale">Needs attention</span>' : ''}</td>
        <td>${fileButtonsHtml(doc, readOnly)}</td>
        <td class="small muted">${escapeHtml(doc.lastUpdatedBy)}<br>${formatDate(doc.lastUpdatedDate)}</td>
        <td><button class="btn btn-secondary btn-sm" data-tasks="${doc.id}">Tasks</button></td>
      `;
      el.appendChild(tr);
    });

    el.querySelectorAll('[data-file-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = findDoc(btn.dataset.doc);
        const file = doc.files.find((f) => f.id === btn.dataset.fileView);
        showToast(`Opening "${file.name}"… (demo only, no real file)`);
      });
    });
    el.querySelectorAll('[data-file-replace]').forEach((btn) => {
      btn.addEventListener('click', () => triggerFileReplace(btn.dataset.doc, btn.dataset.fileReplace));
    });
    el.querySelectorAll('[data-file-add]').forEach((btn) => {
      btn.addEventListener('click', () => triggerFileAdd(btn.dataset.fileAdd));
    });
    el.querySelectorAll('[data-tasks]').forEach((btn) => {
      btn.addEventListener('click', () => openTasksModal(btn.dataset.tasks));
    });
  }

  /* ---- per-file replace / add (independent of the Tasks modal) ---- */

  function triggerFileReplace(docId, fileId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', () => {
      if (!input.files.length) return;
      const doc = findDoc(docId);
      const idx = doc.files.findIndex((f) => f.id === fileId);
      if (idx === -1) return;
      const file = input.files[0];
      const date = todayStr();
      const oldName = doc.files[idx].name;
      doc.files[idx] = makeFile(file.name, user.name, date, detectFileKind(file.name));
      doc.lastUpdatedBy = user.name;
      doc.lastUpdatedDate = date;
      const note = `Replaced file "${oldName}" with "${file.name}".`;
      doc.history.push({ date, note, progress: doc.progress });
      currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, note, user.name));
      saveDB(db);
      renderDocGrid();
      showToast(`Replaced "${oldName}" with "${file.name}".`);
    });
    input.click();
  }

  function triggerFileAdd(docId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => {
      if (!input.files.length) return;
      const doc = findDoc(docId);
      const date = todayStr();
      Array.from(input.files).forEach((file) => {
        doc.files.push(makeFile(file.name, user.name, date, detectFileKind(file.name)));
      });
      doc.lastUpdatedBy = user.name;
      doc.lastUpdatedDate = date;
      const note = `Added ${input.files.length} file(s).`;
      doc.history.push({ date, note, progress: doc.progress });
      currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, note, user.name));
      saveDB(db);
      renderDocGrid();
      showToast(`Added ${input.files.length} file(s) to "${doc.title}".`);
    });
    input.click();
  }

  function badgeHtml(status) {
    const cls = status === 'Approved' ? 'badge-approved' : status === 'In Progress' ? 'badge-progress' : 'badge-draft';
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function findDoc(docId) {
    return currentProject().departments.tenders.documents.find((d) => d.id === docId);
  }

  /* ---- render everything ---- */

  function renderAll() {
    renderHeader();
    renderTypeFilters();
    renderDocGrid();
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

  /* ---- Tasks modal: a document's checklist drives its progress ----
     Everyone can open this and see the checklist (transparency); only the
     owning head, on a project that isn't closed, can add/toggle/remove
     tasks — the same read-only boundary as everything else on this page. */

  function openTasksModal(docId) {
    activeDocId = docId;
    renderTasksModal();
    openModal('tasksModal');
  }

  function renderTasksModal() {
    const doc = findDoc(activeDocId);
    const readOnly = isReadOnly();
    const tasks = doc.tasks || [];
    const doneCount = tasks.filter((t) => t.done).length;

    document.getElementById('tasksDocLabel').textContent = `${doc.type} — ${doc.title}`;
    document.getElementById('tasksDocMeta').textContent = `Last updated ${escapeHtml(doc.lastUpdatedBy)} · ${formatDate(doc.lastUpdatedDate)}`;
    document.getElementById('tasksProgressFill').style.width = `${doc.progress}%`;
    document.getElementById('tasksProgressLabel').textContent = tasks.length
      ? `${doneCount} of ${tasks.length} tasks complete — ${doc.progress}%${doc.progress >= 100 ? ' · Approved' : ''}`
      : 'No tasks yet.';

    const listEl = document.getElementById('taskList');
    listEl.innerHTML = tasks.map((t) => `
      <li class="task-row${t.done ? ' done' : ''}">
        <label class="task-check">
          <input type="checkbox" data-task-toggle="${t.id}" ${t.done ? 'checked' : ''} ${readOnly ? 'disabled' : ''} />
          <span class="task-title">${escapeHtml(t.title)}</span>
        </label>
        <span class="task-meta">
          ${t.isFinal ? '<span class="badge badge-final">Final</span>' : ''}
          ${t.done ? `<span class="muted small">${escapeHtml(t.completedBy)} · ${formatDate(t.completedDate)}</span>` : ''}
          ${readOnly ? '' : `<button type="button" class="file-icon-btn" data-task-delete="${t.id}" title="Remove task">${ICON_TRASH}</button>`}
        </span>
      </li>
    `).join('') || '<li class="placeholder-note">No tasks yet — add the first one below.</li>';

    listEl.querySelectorAll('[data-task-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => toggleTask(cb.dataset.taskToggle, cb.checked));
    });
    listEl.querySelectorAll('[data-task-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteTask(btn.dataset.taskDelete));
    });

    document.getElementById('addTaskForm').hidden = readOnly;
    document.getElementById('tasksReadOnlyNote').hidden = !readOnly;
  }

  function toggleTask(taskId, checked) {
    const doc = findDoc(activeDocId);
    const task = (doc.tasks || []).find((t) => t.id === taskId);
    if (!task) return;

    if (checked && task.isFinal) {
      const allOthersDone = doc.tasks.filter((t) => t.id !== taskId).every((t) => t.done);
      if (!allOthersDone) {
        showToast('Complete the other tasks before marking the final task done.');
        renderTasksModal();
        return;
      }
    }

    const date = todayStr();
    task.done = checked;
    task.completedBy = checked ? user.name : null;
    task.completedDate = checked ? date : null;

    recomputeDocFromTasks(doc);
    doc.lastUpdatedBy = user.name;
    doc.lastUpdatedDate = date;

    const note = checked ? `Completed task: "${task.title}".` : `Marked task "${task.title}" as not done.`;
    doc.history.push({ date, note, progress: doc.progress });
    currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, note, user.name));

    if (checked && task.isFinal) {
      const completeNote = `${doc.type} marked complete — all tasks done.`;
      currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, completeNote, user.name));
    }

    saveDB(db);
    renderTasksModal();
    renderDocGrid();
    showToast(checked ? 'Task completed.' : 'Task reopened.');
  }

  function deleteTask(taskId) {
    const doc = findDoc(activeDocId);
    const task = (doc.tasks || []).find((t) => t.id === taskId);
    if (!task) return;
    if (task.done && !confirm(`Remove the completed task "${task.title}"?`)) return;

    doc.tasks = doc.tasks.filter((t) => t.id !== taskId);
    recomputeDocFromTasks(doc);
    const date = todayStr();
    doc.lastUpdatedBy = user.name;
    doc.lastUpdatedDate = date;

    const note = `Removed task: "${task.title}".`;
    doc.history.push({ date, note, progress: doc.progress });
    currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, note, user.name));

    saveDB(db);
    renderTasksModal();
    renderDocGrid();
    showToast('Task removed.');
  }

  document.getElementById('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isReadOnly()) return;

    const titleEl = document.getElementById('newTaskTitle');
    const title = titleEl.value.trim();
    if (!title) return;

    const doc = findDoc(activeDocId);
    const makeFinal = document.getElementById('newTaskFinal').checked;
    const date = todayStr();
    const wasComplete = doc.progress >= 100;

    if (!doc.tasks) doc.tasks = [];
    if (makeFinal) doc.tasks.forEach((t) => { t.isFinal = false; });
    doc.tasks.push(makeTask(title, false, makeFinal, user.name, date));

    recomputeDocFromTasks(doc);
    doc.lastUpdatedBy = user.name;
    doc.lastUpdatedDate = date;

    const note = `Added task: "${title}".`;
    doc.history.push({ date, note, progress: doc.progress });
    currentProject().departments.tenders.activity.push(makeActivity(date, doc.type, note, user.name));

    saveDB(db);
    titleEl.value = '';
    document.getElementById('newTaskFinal').checked = false;
    renderTasksModal();
    renderDocGrid();
    showToast(wasComplete ? 'Task added — back in progress since not everything is done yet.' : 'Task added.');
  });

  const newDocTypeSelect = document.getElementById('newDocType');
  const newDocTypeOtherWrap = document.getElementById('newDocTypeOtherWrap');
  const newDocTypeOther = document.getElementById('newDocTypeOther');

  function syncNewDocTypeOtherVisibility() {
    newDocTypeOtherWrap.hidden = newDocTypeSelect.value !== '__other';
    updateNewDocChecklistNote();
  }

  function updateNewDocChecklistNote() {
    const type = newDocTypeSelect.value;
    const template = DOC_TASK_TEMPLATES[type];
    document.getElementById('newDocChecklistNote').textContent = template
      ? `Comes with a standard ${template.length}-step checklist — you'll manage it from this activity's "Tasks" button.`
      : 'No standard checklist for a custom type — add your own tasks after creating it, from its "Tasks" button.';
  }

  newDocTypeSelect.addEventListener('change', syncNewDocTypeOtherVisibility);

  document.getElementById('newDocBtn').addEventListener('click', () => {
    if (isReadOnly()) return;
    const standardTypes = getStandardDocTypes('tenders');
    const options = standardTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')
      + '<option value="__other">Other…</option>';
    newDocTypeSelect.innerHTML = options;
    document.getElementById('newDocTypeNote').textContent =
      'You can create more than one activity of the same type — e.g. separate BOQs per lot — or pick "Other" for a custom kind.';
    newDocTypeOther.value = '';
    syncNewDocTypeOtherVisibility();
    document.getElementById('newDocTitle').value = '';
    document.getElementById('newDocFiles').value = '';
    openModal('newDocModal');
  });

  document.getElementById('confirmNewDoc').addEventListener('click', () => {
    const title = document.getElementById('newDocTitle').value.trim();
    let type = newDocTypeSelect.value;
    if (type === '__other') {
      type = newDocTypeOther.value.trim();
    }

    if (!type || !title) {
      showToast('Please choose an activity type and enter a title.');
      return;
    }

    const date = todayStr();
    const files = Array.from(document.getElementById('newDocFiles').files)
      .map((file) => makeFile(file.name, user.name, date, detectFileKind(file.name)));

    const doc = makeDoc(type, title, 0, user.name, date, files);
    const note = `Created new activity — ${type}: ${title}.`;
    doc.history[0].note = note;

    currentProject().departments.tenders.documents.push(doc);
    currentProject().departments.tenders.activity.push(makeActivity(date, type, note, user.name));

    saveDB(db);
    closeModal('newDocModal');
    renderTypeFilters();
    renderDocGrid();
    updateNewDocButtonState();
    showToast('Activity created. Manage its checklist any time via "Tasks".');
  });

  renderSidebar({
    containerId: 'navList',
    activeKey: 'tenders',
    hideKeys: ['projects', 'team-status'],
    hrefs: { dashboard: 'dashboard.html', engineering: 'engineering.html', store: 'store.html' },
  });

  renderProjectSelect();

  if (!currentProjectId) {
    document.getElementById('projectContextLine').textContent = 'No projects assigned yet.';
    document.getElementById('newDocBtn').disabled = true;
  } else {
    renderAll();
  }
})();
