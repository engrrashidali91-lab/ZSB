/*
 * Mock data layer for the ZSB prototype.
 * No backend — everything lives in localStorage on the visitor's own browser.
 * This is illustrative data only: no real client names, credentials or documents.
 *
 * Dates are seeded relative to "today" (daysAgo helper) rather than fixed
 * strings, so the alerts/"yesterday" widgets stay meaningful no matter when
 * this prototype is opened.
 */

const STORAGE_KEY = 'src_mock_db_v26';
const SESSION_KEY = 'src_session_v3';

let _uidCounter = 1;
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${(_uidCounter++).toString(36)}`;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayStr() + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function relativeDay(dateStr) {
  const diff = daysSince(dateStr);
  if (diff === null) return 'no activity yet';
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

function statusFromProgress(progress) {
  if (progress >= 100) return 'Approved';
  if (progress > 0) return 'In Progress';
  return 'Draft';
}

const PROJECT_STATUS = {
  in_progress: { label: 'Active', badgeClass: 'badge-approved' },
  pending: { label: 'Pending', badgeClass: 'badge-progress' },
  delayed: { label: 'Delayed', badgeClass: 'badge-stale' },
  closed: { label: 'Completed', badgeClass: 'badge-draft' },
};


/* ---- shared left-hand app navigation ----
   Same nav shell everywhere so the product feels like one system. The
   navigation is department-first: each department (Engineering, Tenders,
   Store & Inventory, General) is its own page, plus Dashboard (an
   overview/project list) — "Projects" as a generic browser only exists on
   the Admin side. Only wired items actually go anywhere; the rest are
   clearly marked as not built yet in this prototype. */

/* The sidebar is deliberately short: Dashboard, the three departments that
   actually have a workspace built, and (for Admin only, via hideKeys on the
   department-head pages) Projects. Nothing unwired is listed any more — if
   it's here, it goes somewhere real. */
const SIDEBAR_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'tenders', label: 'Tenders', group: 'Departments' },
  { key: 'engineering', label: 'Engineering', group: 'Departments' },
  { key: 'store', label: 'Store & Inventory', group: 'Departments' },
  { key: 'projects', label: 'Projects' },
  { key: 'team-status', label: 'Team Status' },
];

/**
 * Renders the shared left-hand nav into #<opts.containerId>.
 * opts: {
 *   containerId,   required — id of the <nav> to fill
 *   activeKey,     which SIDEBAR_ITEMS key is "this page"
 *   hrefs,         optional { key: url } — real destinations for other items
 *   hideKeys,      optional [key, ...] — items to omit entirely (e.g. 'projects'
 *                  on every department-head page, which has no admin-style
 *                  cross-project browser; or the three departments on
 *                  admin pages, which only drill in via Projects)
 * }
 */
function renderSidebar(opts) {
  const el = document.getElementById(opts.containerId);
  el.innerHTML = '';
  const hide = new Set(opts.hideKeys || []);
  const hrefs = opts.hrefs || {};

  // Filter first, then detect group boundaries on what's actually visible —
  // so a hidden first-item-of-group doesn't leave its label stranded or
  // attached to the wrong item.
  const visible = SIDEBAR_ITEMS.filter((item) => !hide.has(item.key));
  let lastGroup;

  visible.forEach((item) => {
    if (item.group && item.group !== lastGroup) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'nav-group-label';
      groupLabel.textContent = item.group;
      el.appendChild(groupLabel);
      lastGroup = item.group;
    }

    const isActive = item.key === opts.activeKey;
    const href = !isActive ? (hrefs[item.key] || null) : null;

    const node = document.createElement(href ? 'a' : 'span');
    node.textContent = item.label;
    node.className = 'nav-item' + (isActive ? ' active' : '');
    if (href) node.href = href;
    el.appendChild(node);
  });
}

/** Up to two initials from a full name, for the topbar avatar circle. */
function initials(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/* Plain word-initials (as used for a person's name) break down for project
   names that all share the same opening words — every "Construction of …
   – Swabi" project would otherwise show the same "CO" mark. Skipping small
   structural words picks the two words that actually distinguish one
   project from another instead. */
const PROJECT_LOGO_STOPWORDS = new Set(['construction', 'of', 'the', 'and', 'for', 'a', 'an']);

function projectLogoInitials(name) {
  // Split on whitespace/slash/dash, then drop anything with no letters in
  // it at all (e.g. "&") — otherwise it survives as its own "word" and two
  // differently-named projects can both pick it as their second initial.
  const words = (name || '').split(/[\s/–—-]+/).filter((w) => /[a-z]/i.test(w));
  const significant = words.filter((w) => !PROJECT_LOGO_STOPWORDS.has(w.toLowerCase()));
  const source = significant.length ? significant : words;
  return source.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** A project's own small badge — its `logo` field is just a brand colour
    (no real image upload in this prototype); the mark itself is always
    drawn from the project's own name, so every project gets a distinct,
    consistent identity next to its name wherever it's listed. */
function projectLogoHtml(project) {
  const color = project.logo || '#64748b';
  return `<span class="project-logo" style="background:${color}">${escapeHtml(projectLogoInitials(project.name))}</span>`;
}

/* The fixed set of standard activity types per department, offered in
   "+ New activity". A project can have any number of activities of the
   same type — e.g. separate MB Scans for Block C and Block D, or a second
   PC-1 revision started before the first is finished — so the dropdown
   always offers the full standard list, never narrowed by what's already
   been created; "Other…" is still there for anything outside this list.
   Engineering and Tenders are currently the only two departments with real
   activity editing built. */
const STANDARD_DOC_TYPES = {
  engineering: ['PC-1', 'Revised PC-1', 'TC-1', 'IPC', 'MB Scan', 'Voucher', 'Drawing'],
  tenders: ['NIT', 'BOQ', 'Criteria', 'Work Order'],
};

function getStandardDocTypes(deptKey) {
  return STANDARD_DOC_TYPES[deptKey] || [];
}

/* ---- a department document is really an activity, tracked through tasks ----
   A document's progress is no longer set by hand: it's the share of its
   tasks that are done. Each standard type comes with a predefined checklist
   (a realistic run of steps for that kind of paperwork); a custom ("Other")
   type starts with none, and the head builds its checklist from scratch.
   The last task in a standard template is the *final* task — completing it
   is what actually finishes the document, and it can only be ticked once
   every other task on it is done (see the gate in engineering.js/tenders.js),
   so reaching 100%/Approved always means the whole checklist is genuinely
   through, not just that task on its own. */
const DOC_TASK_TEMPLATES = {
  'PC-1': ['Draft programme prepared', 'Reviewed by planning engineer', 'Client comments incorporated', 'Final programme issued'],
  'Revised PC-1': ['Revision triggers identified', 'Programme revised', 'Reviewed by planning engineer', 'Reissued to client'],
  'TC-1': ['Technical submission prepared', 'Reviewed internally', 'Submitted for clearance', 'Clearance received'],
  'IPC': ['Measurement compiled', 'IPC drafted', 'Reviewed by QS', 'Certified and submitted'],
  'MB Scan': ['Measurement book completed on site', 'Pages scanned', 'Uploaded and verified'],
  'Voucher': ['Voucher raised', 'Quantities verified', 'Site engineer sign-off'],
  'Drawing': ['Drawing prepared', 'Internal review', 'Client/consultant review', 'Issued for construction'],
  'NIT': ['NIT drafted', 'Approved for publication', 'Published / advertised', 'Bids received'],
  'BOQ': ['Quantities compiled', 'Rates applied', 'Reviewed internally', 'Finalized and issued'],
  'Criteria': ['Evaluation criteria drafted', 'Weightages assigned', 'Reviewed by tender committee', 'Approved for use'],
  'Work Order': ['Draft work order prepared', 'Reviewed by procurement', 'Approved by management', 'Issued to contractor'],
};

function makeTask(title, done, isFinal, user, date) {
  return {
    id: uid('task'),
    title,
    done: !!done,
    isFinal: !!isFinal,
    completedBy: done ? user : null,
    completedDate: done ? date : null,
  };
}

/** Builds a document's checklist from its type's template, if it has one —
    doneCount marks the first N template steps as already done (for seeding
    a document at a given state); a custom type has no template and starts
    with an empty task list instead. */
function tasksForDocType(type, doneCount, user, date) {
  const titles = DOC_TASK_TEMPLATES[type];
  if (!titles) return [];
  return titles.map((title, i) => makeTask(title, i < doneCount, i === titles.length - 1, user, date));
}

function computeTaskProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

/** Call after any task is added/removed/toggled to keep the document's
    stored progress/status (read everywhere else in the app) in sync with
    its actual checklist state. */
function recomputeDocFromTasks(doc) {
  doc.progress = computeTaskProgress(doc.tasks);
  doc.status = statusFromProgress(doc.progress);
}

/* Colour-coding for document type tags. Falls back to grey for custom types. */
const DOC_TYPE_CLASS = {
  'PC-1': 'type-amber',
  'Revised PC-1': 'type-amber',
  'TC-1': 'type-blue',
  'IPC': 'type-purple',
  'MB Scan': 'type-orange',
  'Voucher': 'type-pink',
  'Drawing': 'type-teal',
  'NIT': 'type-blue',
  'BOQ': 'type-purple',
  'Criteria': 'type-pink',
  'Work Order': 'type-orange',
};

function typeClass(type) {
  return DOC_TYPE_CLASS[type] || 'type-gray';
}

/* File attachments: each document holds a flat list of files (any mix of
   kinds, any number). Only the filename + metadata is kept — no file
   contents are read or stored. */

const FILE_KIND_CLASS = {
  PDF: 'file-pdf',
  Excel: 'file-excel',
  Drawing: 'file-drawing',
  Word: 'file-word',
  Image: 'file-image',
  File: 'file-generic',
};

function detectFileKind(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Excel';
  if (['dwg', 'dxf'].includes(ext)) return 'Drawing';
  if (['doc', 'docx'].includes(ext)) return 'Word';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'Image';
  return 'File';
}

function makeFile(name, user, date, kind) {
  return { id: uid('file'), name, kind: kind || detectFileKind(name), uploadedBy: user, uploadedDate: date };
}

/** A document's files are a flat list — it may have zero, one, or several,
    of any mix of kinds (e.g. a PDF and an Excel version of the same IPC). */
function filesFrom(...fileList) {
  return fileList;
}

/** doneCount = how many of the type's template tasks are already done as of
    this document's creation (0 for a fresh document). Ignored for a custom
    type, which has no template and so starts with an empty task list. */
function makeDoc(type, title, doneCount, user, date, files = []) {
  const tasks = tasksForDocType(type, doneCount, user, date);
  const progress = computeTaskProgress(tasks);
  return {
    id: uid('doc'),
    type,
    title,
    progress,
    status: statusFromProgress(progress),
    lastUpdatedBy: user,
    lastUpdatedDate: date,
    files,
    tasks,
    history: [
      { date, note: tasks.length ? `Created with a ${tasks.length}-step checklist.` : 'Initial upload.', progress },
    ],
  };
}

function makeActivity(date, docType, note, user) {
  return { id: uid('act'), date, docType, note, user };
}

function makeReport(date, note, user) {
  return { id: uid('rep'), date, note, user };
}

/* ---- messages into a department head's Dashboard ----
   Two distinct inboxes: instructions handed down from Admin, and requests
   from the head of another department. Both are tagged to a department
   (toDepartment) and, usually, a project — and are closed out by replying
   with a short text answer and/or an attached document, which is what
   "acknowledged" actually means here: not a blind dismissal, but a reply
   the original sender can see. responseFile, if present, is just
   { name, kind } — same lightweight mock-file shape used everywhere else
   in this prototype, no real upload. */

function makeInstruction(date, message, toDepartment, project) {
  return {
    id: uid('instr'), date, message, toDepartment, project: project || null,
    acknowledged: false, responseText: null, responseFile: null, respondedDate: null,
  };
}

function makeHeadRequest(date, fromName, fromDepartment, message, toDepartment, project) {
  return {
    id: uid('req'), date, fromName, fromDepartment, message, toDepartment, project: project || null,
    acknowledged: false, responseText: null, responseFile: null, respondedDate: null,
  };
}

/** A department's documents + site reports merged into one dated feed,
    newest first. deptKey defaults to 'engineering' (its original scope) and
    is a user-facing department name (e.g. 'store'), translated to its
    project.departments key (e.g. 'storeSite') via
    USER_DEPT_TO_PROJECT_DEPT_KEY — they only actually differ for Store &
    Inventory, but every caller passes user.department, so this has to
    translate rather than assume the two line up. Site reports are an
    Engineering-only concept so they're only folded in for that department. */
function getCombinedFeed(project, deptKey = 'engineering') {
  const projectDeptKey = USER_DEPT_TO_PROJECT_DEPT_KEY[deptKey] || deptKey;
  const docActivity = ((project.departments[projectDeptKey] && project.departments[projectDeptKey].activity) || []).map((a) => ({ ...a, kind: 'document' }));
  const reports = deptKey === 'engineering' ? (project.siteReports || []).map((r) => ({ ...r, kind: 'report', docType: null })) : [];
  return docActivity.concat(reports).sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getLatestActivityDate(project, deptKey = 'engineering') {
  const feed = getCombinedFeed(project, deptKey);
  return feed.length ? feed[0].date : null;
}

function hasLoggedToday(project, deptKey = 'engineering') {
  return getLatestActivityDate(project, deptKey) === todayStr();
}

/* ---- a head's "today's status" ----
   Not every day involves logging project work — a head might spend it on
   inspection, layout/survey, a site visit, etc. This lets them say so, so
   a quiet day reads as "explained" rather than as a missed update. It's
   scoped to today's date only: a status set on an earlier day doesn't
   carry over and silently excuse today. */

const DAILY_STATUS_OPTIONS = ['Site Inspection', 'Layout / Survey', 'Client Meeting', 'Site Visit', 'Training', 'On Leave'];

function getTodayStatus(user) {
  return (user.dailyStatus && user.dailyStatus.date === todayStr()) ? user.dailyStatus : null;
}

function setTodayStatus(user, activity) {
  user.dailyStatus = { date: todayStr(), activity };
}

function clearTodayStatus(user) {
  delete user.dailyStatus;
}

/* ---- a head raising an issue with Admin (the reverse of adminInstructions) ---- */

function makeHeadMessage(date, fromName, fromDepartment, message, project) {
  return {
    id: uid('msg'), date, fromName, fromDepartment, message, project: project || null,
    acknowledged: false, responseText: null, responseFile: null, respondedDate: null,
  };
}

/* ---- a head requesting sign-off from Admin (feeds Admin's Pending Approvals) ----
   requestedBy/department are left null for the illustrative seeded entries
   (standing in for Procurement/Finance systems that don't exist yet) but
   always set for anything actually sent through a head's own "Request
   Approval" form, so Admin can see who to follow up with. */
const APPROVAL_ID_PREFIX = { 'Material Request': 'MR', 'Expense': 'EXP', 'Purchase Order': 'PO' };

/** An approval's lifecycle: every approval starts 'pending' and Admin moves
    it to 'approved' or 'rejected' — from either the main Approvals inbox
    (admin-dashboard.js) or a project's own Department Head panel
    (admin.js). Whoever sent it sees the outcome via this same status on
    their own "Sent by you" list. */
const APPROVAL_STATUS_META = {
  pending: { label: 'Pending', badgeClass: 'badge-progress' },
  approved: { label: 'Approved', badgeClass: 'badge-approved' },
  rejected: { label: 'Rejected', badgeClass: 'badge-stale' },
};

function makeApproval(category, title, project, routedTo, requestedBy, department, date) {
  return {
    id: uid(APPROVAL_ID_PREFIX[category] || 'AP'),
    category, title, project, routedTo,
    requestedBy: requestedBy || null,
    department: department || null,
    date: date || null,
    status: 'pending',
    // Set once Admin approves — see resolveApproval(). Every approval
    // category here (Material Request, Expense, Purchase Order) is money
    // leaving the company, so an Admin approval is a hand-off to Accounts
    // for actual payment/voucher processing, not the end of the line.
    accountsStatus: null,
  };
}

/* ---- Admin → Accountant hand-off ----
   Admin's job is sign-off; actually paying out (or raising the purchase
   voucher) is the Accountant's. Every approval category here is inherently
   financial, so any approval Admin grants is queued for Accounts the same
   way; a rejected one is simply done, with nothing for Accounts to do. */
const ACCOUNTS_STATUS_META = {
  awaiting_processing: { label: 'Awaiting Processing', badgeClass: 'badge-progress' },
  processed: { label: 'Processed', badgeClass: 'badge-approved' },
};

/** The one place Admin's approve/reject buttons call, everywhere they
    appear (Operations Overview, a project's Department Head panel, a
    head's own detail page) — keeps the Accounts hand-off in sync no matter
    which of those three inboxes was used. */
function resolveApproval(db, id, status) {
  const approval = (db.approvals || []).find((a) => a.id === id);
  if (!approval) return null;
  approval.status = status;
  approval.decidedDate = todayStr();
  approval.accountsStatus = status === 'approved' ? 'awaiting_processing' : null;
  return approval;
}

/** The Accountant's side of the same hand-off: records how a queued
    approval was actually paid/actioned. Only ever called on an approval
    already sitting at accountsStatus 'awaiting_processing'. */
function processApprovalPayment(db, id, payment) {
  const approval = (db.approvals || []).find((a) => a.id === id);
  if (!approval) return null;
  approval.accountsStatus = 'processed';
  approval.amountPaid = payment.amountPaid;
  approval.paymentMethod = payment.paymentMethod;
  approval.voucherRef = payment.voucherRef || null;
  approval.accountsNote = payment.note || null;
  approval.processedBy = payment.processedBy;
  approval.processedDate = todayStr();
  return approval;
}

/* ---- Accountant: ad-hoc payments/expenses, not tied to any demand ----
   Basic day-to-day bookkeeping (a vendor payment, a utility bill, wages)
   that never went through a department head's "Request Approval" flow —
   the Accountant logs these directly. Same lightweight, illustrative shape
   as everything else in this mock data layer. */
const PAYMENT_CATEGORIES = ['Material Purchase', 'Contractor Payment', 'Salary & Wages', 'Utilities', 'Fuel & Transport', 'Other'];

function makePayment(date, category, payee, amount, method, project, note, recordedBy) {
  return {
    id: uid('PMT'), date, category, payee, amount, method,
    project: project || null, note: note || null, recordedBy,
  };
}

/* ---- Accountant: per-project income/expense accounts ----
   Gathered directly from a discussion with the accountant, so this
   deliberately mirrors how they actually work rather than a generic
   ledger: each project has its own IN (money received) and OUT (money
   spent, by trade) accounts.

   IN is a list of "activities" — Bills always comes first and has its own
   structured shape (a running bill register with deductions per line);
   any other activity (Security, Mobilization, or one the accountant adds)
   is just a plain dated list of amounts that nets to a total. Both kinds
   expose the same computeActivityTotal() so the IN total doesn't need to
   care which kind it's summing.

   OUT is fixed to five trades (Civil, Plumbing, Electrical, Mechanical,
   Other) since that's the accountant's actual cost breakdown — Civil alone
   splits into a small-contractor sub-list and an office-expense sub-list;
   the other four are each one flat expense list. */

const DEFAULT_DEDUCTION_TYPES = [
  { key: 'security', label: 'Security' },
  { key: 'incomeTax', label: 'Income Tax' },
  { key: 'dpr', label: 'DPR' },
  { key: 'kapra', label: 'Kapra' },
];

const OUT_CATEGORY_TEMPLATE = [
  { key: 'civil', label: 'Civil', subsections: [
    { key: 'smallContractor', label: 'PT Contractor (Small Contractor)' },
    { key: 'officeExpense', label: 'Office Expense' },
  ] },
  { key: 'plumbing', label: 'Plumbing', subsections: [{ key: 'general', label: 'Expenses' }] },
  { key: 'electrical', label: 'Electrical', subsections: [{ key: 'general', label: 'Expenses' }] },
  { key: 'mechanical', label: 'Mechanical', subsections: [{ key: 'general', label: 'Expenses' }] },
  { key: 'other', label: 'Other', subsections: [{ key: 'general', label: 'Expenses' }] },
];

function makeInActivity(name, kind) {
  return { id: uid('act'), name, kind: kind || 'simple', entries: [] };
}

/** Lazily builds a project's accounts the first time anything touches
    them — every seeded project gets the same starting shape (Bills,
    Security, Mobilization; the five OUT trades, all empty) without having
    to hand-edit every project literal in seedData(). Safe to call on every
    read; a no-op once accounts already exist. */
function ensureProjectAccounts(project) {
  if (!project.accounts) {
    project.accounts = {
      dateOfAward: null,
      cost: null,
      workOrder: '',
      deductionTypes: DEFAULT_DEDUCTION_TYPES.map((d) => ({ ...d })),
      in: {
        activities: [
          makeInActivity('Bills', 'bills'),
          makeInActivity('Security', 'simple'),
          makeInActivity('Mobilization', 'simple'),
        ],
      },
      out: {
        categories: OUT_CATEGORY_TEMPLATE.map((c) => ({
          key: c.key,
          label: c.label,
          subsections: c.subsections.map((s) => ({ key: s.key, label: s.label, entries: [] })),
        })),
      },
    };
  }
  return project.accounts;
}

/** A single Bills-register line: Gross Amount minus every deduction on it
    nets out to what the client actually paid. Deductions are keyed by the
    project's own deductionTypes (an accountant can add more than the
    default four — Security/Income Tax/DPR/Kapra — mid-project), so a
    deduction with no value on this particular line just contributes 0. */
function computeBillNet(entry) {
  const deducted = Object.values(entry.deductions || {}).reduce((sum, v) => sum + Number(v || 0), 0);
  return Number(entry.grossAmount || 0) - deducted;
}

/** One IN activity's own total — Bills nets each line first; every other
    activity (Security, Mobilization, anything custom) is just a plain sum
    of its entries' amounts. */
function computeActivityTotal(activity) {
  if (activity.kind === 'bills') {
    return activity.entries.reduce((sum, e) => sum + computeBillNet(e), 0);
  }
  return activity.entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function computeInTotal(accounts) {
  return accounts.in.activities.reduce((sum, a) => sum + computeActivityTotal(a), 0);
}

function computeSubsectionTotal(subsection) {
  return subsection.entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function computeCategoryTotal(category) {
  return category.subsections.reduce((sum, s) => sum + computeSubsectionTotal(s), 0);
}

function computeOutTotal(accounts) {
  return accounts.out.categories.reduce((sum, c) => sum + computeCategoryTotal(c), 0);
}

/* ---- shared "respond, don't just dismiss" inbox rendering ----
   Instructions from Admin, Department Requests, and Admin's Messages from
   Department Heads are all the same shape: an open item that gets closed
   out by replying with text and/or an attached document, not a blind
   Acknowledge. previewItem(item) renders the read-only date/from/message
   part; onResponded(item) is called right after an item is mutated (so the
   caller can saveDB, re-render whatever else depends on it, and toast) —
   it does not save on its own, since it has no reference to the page's db. */

function renderRespondableInbox(listId, items, emptyText, previewItem, onResponded) {
  const el = document.getElementById(listId);
  el.innerHTML = '';
  const open = items.filter((i) => !i.acknowledged).sort((a, b) => (a.date < b.date ? 1 : -1));

  if (open.length === 0) {
    el.innerHTML = `<li class="placeholder-note">${emptyText}</li>`;
    return;
  }

  open.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      ${previewItem(item)}
      <div style="margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" data-respond="${item.id}">Respond</button></div>
      <div class="reply-box" id="reply-${item.id}" hidden>
        <textarea rows="2" placeholder="Write your reply…" id="replyText-${item.id}"></textarea>
        <input type="file" id="replyFile-${item.id}" />
        <p class="error" id="replyError-${item.id}" hidden></p>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" data-submit="${item.id}">Send response</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cancel="${item.id}">Cancel</button>
        </div>
      </div>
    `;
    el.appendChild(li);
  });

  el.querySelectorAll('[data-respond]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = `reply-${btn.dataset.respond}`;
      el.querySelectorAll('.reply-box').forEach((box) => {
        if (box.id !== targetId) box.hidden = true;
      });
      document.getElementById(targetId).hidden = !document.getElementById(targetId).hidden;
    });
  });

  el.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(`reply-${btn.dataset.cancel}`).hidden = true;
    });
  });

  el.querySelectorAll('[data-submit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.submit;
      const item = items.find((i) => i.id === id);
      const text = document.getElementById(`replyText-${id}`).value.trim();
      const fileInput = document.getElementById(`replyFile-${id}`);
      const file = fileInput.files[0] ? { name: fileInput.files[0].name, kind: detectFileKind(fileInput.files[0].name) } : null;

      if (!text && !file) {
        const err = document.getElementById(`replyError-${id}`);
        err.textContent = 'Add a reply or attach a document before sending.';
        err.hidden = false;
        return;
      }

      item.acknowledged = true;
      item.responseText = text || null;
      item.responseFile = file;
      item.respondedDate = todayStr();

      if (typeof onResponded === 'function') onResponded(item);
    });
  });
}

/** The response block shown under a sent item once it's been replied to —
    the flip side of renderRespondableInbox, for whoever sent the original
    instruction/request/message. */
function renderResponseBlock(item) {
  if (!item.acknowledged || (!item.responseText && !item.responseFile)) return '';
  const fileIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const fileHtml = item.responseFile
    ? `<button type="button" class="file-btn ${FILE_KIND_CLASS[item.responseFile.kind] || FILE_KIND_CLASS.File}" title="${escapeHtml(item.responseFile.name)}">${fileIcon} ${escapeHtml(item.responseFile.name)}</button>`
    : '';
  return `
    <div class="response-block">
      <p class="muted small" style="margin:0 0 4px;">Response${item.respondedDate ? ' · ' + formatDate(item.respondedDate) : ''}</p>
      ${item.responseText ? `<div>${escapeHtml(item.responseText)}</div>` : ''}
      ${fileHtml}
    </div>
  `;
}

/** Every department's own activity log, across every project, tagged with
    both the project name and which department it came from — this is what
    lets Admin see a mix of Engineering, Tenders, etc. activity in one feed
    (Engineering and Tenders currently, since they're the only departments
    with real activity logging so far — this deliberately doesn't
    special-case that, so Store activity starts appearing here the moment
    it gets its own editing UI, with no further change needed). Kept
    separate from getCombinedFeed (per-department, used for Alerts/
    staleness), since generalising that into one merged feed would quietly
    change what "logged something today" means for a head's own
    daily-progress check. */
const ACTIVITY_SOURCES = [
  { key: 'engineering', label: 'Engineering' },
  { key: 'tenders', label: 'Tenders' },
  { key: 'storeSite', label: 'Store & Inventory' },
  { key: 'general', label: 'General' },
];

function getAllProjectsActivity(projects) {
  const entries = [];
  projects.forEach((p) => {
    ACTIVITY_SOURCES.forEach(({ key, label }) => {
      const activity = p.departments[key] && p.departments[key].activity;
      if (!activity) return;
      activity.forEach((a) => entries.push({ ...a, kind: 'document', department: label, projectName: p.name }));
    });
    (p.siteReports || []).forEach((r) => entries.push({ ...r, kind: 'report', docType: null, department: 'Engineering', projectName: p.name }));
  });
  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Documents that are incomplete and haven't been touched in a while. */
function getStaleDocuments(project, thresholdDays = 3) {
  const docs = project.departments.engineering.documents || [];
  return docs.filter((d) => d.progress < 100 && daysSince(d.lastUpdatedDate) >= thresholdDays);
}

/* ---- Store & Inventory ---- */

function makeMaterial(name, unit, inQty, outQty) {
  const remaining = inQty - outQty;
  return { id: uid('mat'), name, unit, in: inQty, out: outQty, remaining, low: inQty > 0 && remaining < inQty * 0.1 };
}

/** Recomputes a material's remaining/low flag after its in/out totals
    change — call after any ledger movement against it. */
function recomputeMaterial(material) {
  material.remaining = material.in - material.out;
  material.low = material.in > 0 && material.remaining < material.in * 0.1;
}

/** file is optional — a movement can (like an Engineering/Tenders activity)
    have a voucher/delivery-challan file attached, not just a reference
    number typed in by hand. */
function makeLedgerEntry(date, type, material, qty, description, voucherId, file) {
  return { id: uid('ledger'), date, type, material, qty, description, voucherId, file: file || null };
}

/* The five seeded projects, all phases of one campus in Swabi. Named once
   here so every reference to a project by its display name — approvals,
   instructions, head requests/messages — stays in sync with the project
   record itself. */
const PROJECT_NAMES = {
  p1: 'Construction of New OPD Block – Swabi',
  p2: 'Construction of Cafeteria & Dining Facility – Swabi',
  p3: 'Construction of Academic/Administrative Block – Swabi',
  p4: 'Construction of Staff Accommodation Building – Swabi',
  p5: 'Construction of Community & Recreational Facility – Swabi',
};

/** A freshly created project — minimal, empty department shells so it
    behaves consistently with the rest of the app (no Engineering documents
    yet, no Tenders/Store records, General still just a placeholder) until
    someone starts logging real work against it. No head is assigned to it
    yet either — like any project with a gap here, that's an honest "No
    head assigned" rather than a bug (see getHeadForProject). */
function makeProject(name, client, code, status, logo) {
  return {
    id: uid('proj'),
    name,
    client,
    code,
    status: status || 'pending',
    logo: logo || '#64748b',
    departments: {
      engineering: { documents: [], activity: [] },
      tenders: { documents: [], activity: [] },
      storeSite: { materials: [], ledger: [], activity: [] },
      general: { placeholder: true },
    },
    siteReports: [],
  };
}

function seedData() {
  return {
    users: [
      {
        username: 'admin',
        password: 'root',
        email: 'admin@zsb.example',
        name: 'Site Admin',
        role: 'admin',
        projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
      /* One fixed account per department head — deliberately separate
         logins, not one shared account that switches department. A shared
         switchable account sounds simpler, but `dailyStatus` (a head's
         "here's what I was doing instead" note) lives on the user record,
         not scoped per department — so switching departments carried a
         stale status over from whichever department you'd last acted as,
         silently breaking the "this head hasn't touched anything today"
         test flow (it'd show an already-explained day instead of the
         actual empty state for the department you just switched to).
         Separate accounts give each department its own, genuinely
         independent daily status and activity, so that flow tests
         correctly. General has no dedicated workspace built (no sidebar
         entry, no page) so it has no login here either — the role still
         exists in HEAD_ROLES/DEPARTMENT_LABELS for when it does. */
      {
        username: 'user1',
        password: 'root',
        email: 'ali.raza@zsb.example',
        name: 'Ali Raza',
        role: 'engineering_head',
        department: 'engineering',
        projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
      {
        username: 'user2',
        password: 'root',
        email: 'sana.tariq@zsb.example',
        name: 'Sana Tariq',
        role: 'tenders_head',
        department: 'tenders',
        projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
      {
        username: 'user3',
        password: 'root',
        email: 'kamran.sheikh@zsb.example',
        name: 'Kamran Sheikh',
        role: 'store_head',
        department: 'store',
        projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
      /* Accounts sits alongside Admin, not under it — it doesn't own a
         department, but it does need every project (it keeps that
         project's own IN/OUT accounts — see ensureProjectAccounts), plus
         approvals Admin has signed off on (see resolveApproval) and its
         own general payment ledger. No department/dailyStatus, same
         honest gap as General — nothing in this prototype needs them for
         this role. Username follows the same user1/2/3 numbering as the
         three department heads (Accounts being, in effect, the fourth). */
      {
        username: 'user4',
        password: 'root',
        email: 'hamza.iqbal@zsb.example',
        name: 'Hamza Iqbal',
        role: 'accountant',
        projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
    ],
    projects: [
      {
        id: 'p1',
        name: PROJECT_NAMES.p1,
        client: 'Meridian Construction Ltd',
        code: 'ENG-2026-101',
        status: 'in_progress',
        logo: '#1d4ed8',
        departments: {
          engineering: {
            documents: [
              makeDoc('PC-1', 'Pre-Construction Programme', 4, 'Ali Raza', daysAgo(26),
                filesFrom(makeFile('PC-1-Programme-Approved.pdf', 'Ali Raza', daysAgo(26)), makeFile('PC-1-Programme.xlsx', 'Ali Raza', daysAgo(26)))),
              makeDoc('Revised PC-1', 'Revised Pre-Construction Programme', 3, 'Ali Raza', daysAgo(5),
                filesFrom(makeFile('Revised-PC1-v2.pdf', 'Ali Raza', daysAgo(5)), makeFile('Revised-PC1-v2.xlsx', 'Ali Raza', daysAgo(5)))),
              makeDoc('TC-1', 'Technical Clearance 1', 2, 'Ali Raza', daysAgo(0),
                filesFrom(makeFile('TC1-Submission.pdf', 'Ali Raza', daysAgo(0)))),
              makeDoc('IPC', 'Interim Payment Certificate — August', 4, 'Ali Raza', daysAgo(8),
                filesFrom(makeFile('IPC-August.pdf', 'Ali Raza', daysAgo(8)), makeFile('IPC-August-BOQ.xlsx', 'Ali Raza', daysAgo(8)))),
              makeDoc('MB Scan', 'Measurement Book Scan — Block C', 1, 'Ali Raza', daysAgo(2),
                filesFrom(makeFile('MB-Scan-BlockC-p40-52.pdf', 'Ali Raza', daysAgo(2)))),
              makeDoc('Voucher', 'Material Voucher — Steel Reinforcement', 1, 'Ali Raza', daysAgo(1),
                filesFrom(makeFile('Voucher-Steel-Reinf.pdf', 'Ali Raza', daysAgo(1)))),
              makeDoc('Drawing', 'Structural Drawings — Block C, Rev 3', 3, 'Ali Raza', daysAgo(4),
                filesFrom(makeFile('BlockC-Structural-Rev3.dwg', 'Ali Raza', daysAgo(4)), makeFile('BlockC-Structural-Rev3.pdf', 'Ali Raza', daysAgo(4)))),
            ],
            activity: [
              makeActivity(daysAgo(1), 'Voucher', 'Logged steel reinforcement voucher, awaiting site engineer sign-off.', 'Ali Raza'),
              makeActivity(daysAgo(2), 'MB Scan', 'Scanned and uploaded Block C measurement book pages 40–52.', 'Ali Raza'),
              makeActivity(daysAgo(0), 'TC-1', 'Submitted TC-1 for structural clearance review.', 'Ali Raza'),
              makeActivity(daysAgo(4), 'Drawing', 'Uploaded revised structural drawings for Block C (Rev 3).', 'Ali Raza'),
              makeActivity(daysAgo(5), 'Revised PC-1', 'Revised programme to reflect two-week rebar delivery delay.', 'Ali Raza'),
            ],
          },
          tenders: {
            documents: [
              makeDoc('NIT', 'NIT — Notice Inviting Tender', 4, 'Sana Tariq', daysAgo(160),
                filesFrom(makeFile('NIT-OPDBlock.pdf', 'Sana Tariq', daysAgo(160)))),
              makeDoc('Criteria', 'Evaluation Criteria', 4, 'Sana Tariq', daysAgo(155),
                filesFrom(makeFile('EvalCriteria-OPDBlock.pdf', 'Sana Tariq', daysAgo(155)))),
              makeDoc('BOQ', 'BOQ — Bill of Quantities', 4, 'Sana Tariq', daysAgo(150),
                filesFrom(makeFile('BOQ-OPDBlock.pdf', 'Sana Tariq', daysAgo(150)), makeFile('BOQ-OPDBlock.xlsx', 'Sana Tariq', daysAgo(150)))),
              makeDoc('Work Order', 'Work Order', 4, 'Sana Tariq', daysAgo(140),
                filesFrom(makeFile('WorkOrder-OPDBlock.pdf', 'Sana Tariq', daysAgo(140)))),
            ],
            activity: [
              makeActivity(daysAgo(140), 'Work Order', 'Work order issued to contractor after final approval.', 'Sana Tariq'),
              makeActivity(daysAgo(150), 'BOQ', 'Finalized and issued BOQ to bidders.', 'Sana Tariq'),
              makeActivity(daysAgo(155), 'Criteria', 'Evaluation criteria approved by tender committee.', 'Sana Tariq'),
              makeActivity(daysAgo(160), 'NIT', 'Published NIT and opened for bids.', 'Sana Tariq'),
            ],
          },
          storeSite: {
            materials: [
              makeMaterial('Cement (OPC)', 'bags', 4800, 4500),
              makeMaterial('Steel (Deformed Bar)', 'tons', 280, 200),
              makeMaterial('Tiles', 'boxes', 1100, 600),
              makeMaterial('Bricks (A-Class)', 'no.', 460000, 385000),
              makeMaterial('Coarse Aggregate', 'cft', 21000, 17500),
              makeMaterial('Fine Aggregate (Sand)', 'cft', 14000, 12200),
            ],
            ledger: [
              makeLedgerEntry(daysAgo(1), 'IN', 'Cement (OPC)', 500, 'Delivery — Al-Fateh Traders', 'INV-1042'),
              makeLedgerEntry(daysAgo(2), 'OUT', 'Steel (Deformed Bar)', 15, 'Issued to Block C slab', 'GP-2210'),
              makeLedgerEntry(daysAgo(3), 'OUT', 'Bricks (A-Class)', 18000, 'Issued to boundary wall', 'GP-2206'),
              makeLedgerEntry(daysAgo(5), 'IN', 'Coarse Aggregate', 3000, 'Delivery — Highland Stone Co.', 'INV-1038'),
            ],
            activity: [
              makeActivity(daysAgo(1), 'Cement (OPC)', 'Recorded delivery of 500 bags — Al-Fateh Traders.', 'Kamran Sheikh'),
              makeActivity(daysAgo(2), 'Steel (Deformed Bar)', 'Issued 15 tons to Block C slab.', 'Kamran Sheikh'),
              makeActivity(daysAgo(3), 'Bricks (A-Class)', 'Issued 18,000 units to boundary wall.', 'Kamran Sheikh'),
              makeActivity(daysAgo(5), 'Coarse Aggregate', 'Recorded delivery of 3,000 cft — Highland Stone Co.', 'Kamran Sheikh'),
            ],
          },
          general: { placeholder: true },
        },
        siteReports: [
          makeReport(daysAgo(1), 'Concrete pour completed for column line C; rebar inspection done for the next pour. No safety incidents. 24 workers on site.', 'Ali Raza'),
          makeReport(daysAgo(3), 'Formwork stripped on Block C, level 4. Minor delay waiting on crane availability.', 'Ali Raza'),
        ],
      },
      {
        id: 'p2',
        name: PROJECT_NAMES.p2,
        client: 'Combe Infrastructure Group',
        code: 'ENG-2026-088',
        status: 'in_progress',
        logo: '#7e22ce',
        departments: {
          engineering: {
            documents: [
              makeDoc('PC-1', 'Pre-Construction Programme', 4, 'Ali Raza', daysAgo(30),
                filesFrom(makeFile('PC-1-Programme.pdf', 'Ali Raza', daysAgo(30)))),
              makeDoc('TC-1', 'Technical Clearance 1', 4, 'Ali Raza', daysAgo(15),
                filesFrom(makeFile('TC1-Approved.pdf', 'Ali Raza', daysAgo(15)), makeFile('TC1-Approved.xlsx', 'Ali Raza', daysAgo(15)))),
              makeDoc('IPC', 'Interim Payment Certificate — August', 3, 'Ali Raza', daysAgo(6),
                filesFrom(makeFile('IPC-August-Draft.pdf', 'Ali Raza', daysAgo(6)))),
              makeDoc('MB Scan', 'Measurement Book Scan — Kitchen Block', 1, 'Ali Raza', daysAgo(4), []),
            ],
            activity: [
              makeActivity(daysAgo(4), 'MB Scan', 'Started scanning the kitchen block measurement book, roughly a fifth done.', 'Ali Raza'),
              makeActivity(daysAgo(6), 'IPC', 'Prepared August IPC pending quantity surveyor review.', 'Ali Raza'),
            ],
          },
          tenders: {
            documents: [
              makeDoc('NIT', 'NIT — Notice Inviting Tender', 4, 'Sana Tariq', daysAgo(200),
                filesFrom(makeFile('NIT-CafeteriaDining.pdf', 'Sana Tariq', daysAgo(200)))),
              makeDoc('Criteria', 'Evaluation Criteria', 4, 'Sana Tariq', daysAgo(195),
                filesFrom(makeFile('EvalCriteria-CafeteriaDining.pdf', 'Sana Tariq', daysAgo(195)))),
              makeDoc('BOQ', 'BOQ — Bill of Quantities', 4, 'Sana Tariq', daysAgo(190),
                filesFrom(makeFile('BOQ-CafeteriaDining.pdf', 'Sana Tariq', daysAgo(190)))),
              makeDoc('Work Order', 'Work Order', 3, 'Sana Tariq', daysAgo(180),
                filesFrom(makeFile('WorkOrder-CafeteriaDining-Draft.pdf', 'Sana Tariq', daysAgo(180)))),
            ],
            activity: [
              makeActivity(daysAgo(180), 'Work Order', 'Work order approved by management; awaiting issuance to contractor.', 'Sana Tariq'),
              makeActivity(daysAgo(190), 'BOQ', 'Finalized and issued BOQ to bidders.', 'Sana Tariq'),
              makeActivity(daysAgo(195), 'Criteria', 'Evaluation criteria approved by tender committee.', 'Sana Tariq'),
              makeActivity(daysAgo(200), 'NIT', 'Published NIT and opened for bids.', 'Sana Tariq'),
            ],
          },
          storeSite: {
            materials: [
              makeMaterial('Cement (OPC)', 'bags', 3000, 2600),
              makeMaterial('Steel (Deformed Bar)', 'tons', 500, 460),
              makeMaterial('Coarse Aggregate', 'cft', 9000, 7000),
            ],
            ledger: [
              makeLedgerEntry(daysAgo(4), 'OUT', 'Steel (Deformed Bar)', 20, 'Issued to dining hall roof formwork', 'GP-3390'),
              makeLedgerEntry(daysAgo(6), 'IN', 'Cement (OPC)', 400, 'Delivery — Al-Fateh Traders', 'INV-1020'),
            ],
            activity: [
              makeActivity(daysAgo(4), 'Steel (Deformed Bar)', 'Issued 20 tons to dining hall roof formwork.', 'Kamran Sheikh'),
              makeActivity(daysAgo(6), 'Cement (OPC)', 'Recorded delivery of 400 bags — Al-Fateh Traders.', 'Kamran Sheikh'),
            ],
          },
          general: { placeholder: true },
        },
        siteReports: [
          makeReport(daysAgo(4), 'Dining hall roof formwork inspected and signed off. Steel delivery for the kitchen block confirmed for next week.', 'Ali Raza'),
        ],
      },
      {
        id: 'p3',
        name: PROJECT_NAMES.p3,
        client: 'Anchor Point Developments',
        code: 'ENG-2026-114',
        status: 'delayed',
        logo: '#0f766e',
        departments: {
          engineering: {
            documents: [
              makeDoc('PC-1', 'Pre-Construction Programme', 2, 'Bilal Ahmed', daysAgo(9), filesFrom(makeFile('PC-1-Draft.pdf', 'Bilal Ahmed', daysAgo(9)))),
              makeDoc('Voucher', 'Material Voucher — Precast Panels', 0, 'Bilal Ahmed', daysAgo(3), []),
            ],
            activity: [
              makeActivity(daysAgo(3), 'Voucher', 'Raised voucher for precast panel delivery, quantities being verified.', 'Bilal Ahmed'),
            ],
          },
          tenders: {
            documents: [
              makeDoc('NIT', 'NIT — Notice Inviting Tender', 4, 'Sana Tariq', daysAgo(60),
                filesFrom(makeFile('NIT-AcademicBlock.pdf', 'Sana Tariq', daysAgo(60)))),
              makeDoc('BOQ', 'BOQ — Bill of Quantities', 1, 'Sana Tariq', daysAgo(50),
                filesFrom(makeFile('BOQ-AcademicBlock-Draft.pdf', 'Sana Tariq', daysAgo(50)))),
              makeDoc('Criteria', 'Evaluation Criteria', 2, 'Sana Tariq', daysAgo(45), []),
            ],
            activity: [
              makeActivity(daysAgo(45), 'Criteria', 'Drafted evaluation criteria; weightages still under review.', 'Sana Tariq'),
              makeActivity(daysAgo(50), 'BOQ', 'Started compiling quantities for the tender BOQ.', 'Sana Tariq'),
              makeActivity(daysAgo(60), 'NIT', 'Published NIT and opened for bids.', 'Sana Tariq'),
            ],
          },
          storeSite: {
            materials: [
              makeMaterial('Cement (OPC)', 'bags', 800, 740),
              makeMaterial('Steel (Deformed Bar)', 'tons', 100, 40),
            ],
            ledger: [
              makeLedgerEntry(daysAgo(3), 'OUT', 'Cement (OPC)', 50, 'Issued to trial pit backfill', 'GP-4010'),
            ],
            activity: [
              makeActivity(daysAgo(3), 'Cement (OPC)', 'Issued 50 bags to trial pit backfill.', 'Kamran Sheikh'),
            ],
          },
          general: { placeholder: true },
        },
        siteReports: [],
      },
      {
        id: 'p4',
        name: PROJECT_NAMES.p4,
        client: 'Colway Housing Partnership',
        code: 'ENG-2026-121',
        status: 'pending',
        logo: '#be185d',
        departments: {
          engineering: {
            documents: [
              makeDoc('PC-1', 'Pre-Construction Programme', 0, 'Ali Raza', daysAgo(10), []),
            ],
            activity: [
              makeActivity(daysAgo(10), 'PC-1', 'Project awarded — awaiting site mobilisation before Engineering work begins.', 'Ali Raza'),
            ],
          },
          tenders: {
            documents: [
              makeDoc('NIT', 'NIT — Notice Inviting Tender', 1, 'Sana Tariq', daysAgo(10),
                filesFrom(makeFile('NIT-StaffAccommodation-Draft.pdf', 'Sana Tariq', daysAgo(10)))),
            ],
            activity: [
              makeActivity(daysAgo(10), 'NIT', 'Drafted NIT ahead of project mobilisation.', 'Sana Tariq'),
            ],
          },
          storeSite: {
            materials: [],
            ledger: [],
            activity: [],
          },
          general: { placeholder: true },
        },
        siteReports: [],
      },
      {
        id: 'p5',
        name: PROJECT_NAMES.p5,
        client: 'Bramfield Retail Developments',
        code: 'ENG-2025-076',
        status: 'closed',
        logo: '#c2410c',
        departments: {
          engineering: {
            documents: [
              makeDoc('PC-1', 'Pre-Construction Programme', 4, 'Ali Raza', daysAgo(140), filesFrom(makeFile('PC-1-Final.pdf', 'Ali Raza', daysAgo(140)))),
              makeDoc('Revised PC-1', 'Revised Pre-Construction Programme', 4, 'Ali Raza', daysAgo(130), filesFrom(makeFile('Revised-PC1-Final.pdf', 'Ali Raza', daysAgo(130)))),
              makeDoc('TC-1', 'Technical Clearance 1', 4, 'Ali Raza', daysAgo(120), filesFrom(makeFile('TC1-Final.pdf', 'Ali Raza', daysAgo(120)))),
              makeDoc('IPC', 'Final Interim Payment Certificate', 4, 'Ali Raza', daysAgo(95), filesFrom(makeFile('IPC-Final.pdf', 'Ali Raza', daysAgo(95)), makeFile('IPC-Final.xlsx', 'Ali Raza', daysAgo(95)))),
              makeDoc('MB Scan', 'Measurement Book Scan — Final', 3, 'Ali Raza', daysAgo(95), filesFrom(makeFile('MB-Scan-Final.pdf', 'Ali Raza', daysAgo(95)))),
              makeDoc('Voucher', 'Material Voucher — Final Reconciliation', 3, 'Ali Raza', daysAgo(90), filesFrom(makeFile('Voucher-Final.pdf', 'Ali Raza', daysAgo(90)), makeFile('Voucher-Final.xlsx', 'Ali Raza', daysAgo(90)))),
            ],
            activity: [
              makeActivity(daysAgo(90), 'Voucher', 'Final material reconciliation signed off; project handed over.', 'Ali Raza'),
              makeActivity(daysAgo(95), 'IPC', 'Final IPC approved by client quantity surveyor.', 'Ali Raza'),
            ],
          },
          tenders: {
            documents: [
              makeDoc('NIT', 'NIT — Notice Inviting Tender', 4, 'Sana Tariq', daysAgo(300),
                filesFrom(makeFile('NIT-CommunityFacility.pdf', 'Sana Tariq', daysAgo(300)))),
              makeDoc('Criteria', 'Evaluation Criteria', 4, 'Sana Tariq', daysAgo(295),
                filesFrom(makeFile('EvalCriteria-CommunityFacility.pdf', 'Sana Tariq', daysAgo(295)))),
              makeDoc('BOQ', 'BOQ — Bill of Quantities', 4, 'Sana Tariq', daysAgo(290),
                filesFrom(makeFile('BOQ-CommunityFacility.pdf', 'Sana Tariq', daysAgo(290)))),
              makeDoc('Work Order', 'Work Order', 4, 'Sana Tariq', daysAgo(280),
                filesFrom(makeFile('WorkOrder-CommunityFacility.pdf', 'Sana Tariq', daysAgo(280)))),
            ],
            activity: [
              makeActivity(daysAgo(280), 'Work Order', 'Work order issued; tender closed out.', 'Sana Tariq'),
              makeActivity(daysAgo(290), 'BOQ', 'Finalized and issued BOQ to bidders.', 'Sana Tariq'),
              makeActivity(daysAgo(295), 'Criteria', 'Evaluation criteria approved by tender committee.', 'Sana Tariq'),
              makeActivity(daysAgo(300), 'NIT', 'Published NIT and opened for bids.', 'Sana Tariq'),
            ],
          },
          storeSite: {
            materials: [
              makeMaterial('Cement (OPC)', 'bags', 2000, 1980),
              makeMaterial('Steel (Deformed Bar)', 'tons', 150, 148),
            ],
            ledger: [
              makeLedgerEntry(daysAgo(90), 'OUT', 'Cement (OPC)', 20, 'Final reconciliation', 'GP-0099'),
            ],
            activity: [
              makeActivity(daysAgo(90), 'Cement (OPC)', 'Final reconciliation — issued 20 bags.', 'Kamran Sheikh'),
            ],
          },
          general: { placeholder: true },
        },
        siteReports: [
          makeReport(daysAgo(90), 'Final handover walk-round completed with client. No snags outstanding.', 'Ali Raza'),
        ],
      },
    ],
    /* Illustrative seed entries — standing in for Procurement/Finance
       systems that don't exist yet. Real ones, sent from any head's own
       "Request Approval" form, land here the same way (see makeApproval). */
    approvals: [
      { id: uid('MR'), category: 'Material Request', title: 'Steel 40 tons — Block C', project: PROJECT_NAMES.p1, routedTo: 'Finance', status: 'pending' },
      { id: uid('EXP'), category: 'Expense', title: 'Fuel & transport — PKR 84,000', project: PROJECT_NAMES.p2, routedTo: 'Project Manager', status: 'pending' },
      { id: uid('PO'), category: 'Purchase Order', title: 'Precast panels — Coastal Precast Ltd', project: PROJECT_NAMES.p3, routedTo: 'Management', status: 'pending' },
    ],

    /* Instructions handed down from Admin, and requests from other
       department heads — both land on the receiving head's Dashboard. */
    adminInstructions: [
      makeInstruction(daysAgo(2), 'Please expedite TC-1 clearance for the OPD Block project — the client wants sign-off before month end.', 'engineering', PROJECT_NAMES.p1),
      makeInstruction(daysAgo(5), 'Going forward, upload MB Scans within 48 hours of measurement on all active projects.', 'engineering', null),
    ],
    headRequests: [
      makeHeadRequest(daysAgo(1), 'Sana Tariq', 'Tenders', 'Need the revised BOQ figures cross-checked against your PC-1 programme before we finalise the tender addendum.', 'engineering', PROJECT_NAMES.p1),
      makeHeadRequest(daysAgo(3), 'Kamran Sheikh', 'Store & Inventory', 'Steel stock for the Cafeteria & Dining Facility project is running low — can you confirm updated rebar quantities from the revised drawings?', 'engineering', PROJECT_NAMES.p2),
    ],

    /* Issues/messages a department head has raised with Admin. */
    headMessages: [
      makeHeadMessage(daysAgo(2), 'Ali Raza', 'Engineering', 'Client keeps changing the scope for the Block C staircase — need clarity on who has authority to approve drawing revisions before we lose more time.', PROJECT_NAMES.p1),
    ],

    /* Outstanding "forgot password" links. Stands in for what a real
       Supabase project keeps server-side against the account's email. */
    passwordResetTokens: [],

    /* Ad-hoc payments the Accountant has logged directly (see makePayment)
       — day-to-day bookkeeping that never went through a department head's
       "Request Approval" flow. Approvals Accounts has processed (see
       processApprovalPayment) show up in the same ledger view but live on
       the approval record itself, not duplicated in here. */
    payments: [
      makePayment(daysAgo(6), 'Utilities', 'K-Electric', 46500, 'Bank Transfer', null, 'Head office electricity bill — August.', 'Hamza Iqbal'),
      makePayment(daysAgo(3), 'Salary & Wages', 'Site staff — OPD Block', 380000, 'Bank Transfer', PROJECT_NAMES.p1, 'Monthly wages, site labour.', 'Hamza Iqbal'),
    ],
  };
}

function getDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const fresh = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function resetDB() {
  localStorage.removeItem(STORAGE_KEY);
}

function getProjectsForUser(db, user) {
  return db.projects.filter((p) => user.projectIds.includes(p.id));
}

/** Every task across every Engineering document ("activity") on this
    project, pooled together — the shared basis for both the overall
    percentage and the "how much of that was today" breakdown below. A
    document with no checklist yet (a custom type nobody's built tasks for)
    counts as one all-or-nothing task, so it still contributes rather than
    being silently skipped. */
function getEngineeringTaskTotals(project) {
  const docs = project.departments.engineering.documents || [];
  let totalTasks = 0;
  let doneTasks = 0;
  let doneToday = 0;
  docs.forEach((d) => {
    const tasks = d.tasks || [];
    if (tasks.length) {
      totalTasks += tasks.length;
      tasks.forEach((t) => {
        if (t.done) {
          doneTasks++;
          if (t.completedDate === todayStr()) doneToday++;
        }
      });
    } else {
      totalTasks += 1;
      if (d.progress >= 100) doneTasks += 1;
    }
  });
  return { totalTasks, doneTasks, doneToday };
}

/** Overall progress across every Engineering document on this project —
    the share of ALL their tasks, pooled together, that are done.
    Deliberately a tasks-weighted rollup rather than an average of each
    document's own percentage: a 3-task document and a 4-task document each
    counting as "one document" would let a small, easy activity mask a
    large one that's barely started. */
function computeEngineeringProgress(project) {
  const { totalTasks, doneTasks } = getEngineeringTaskTotals(project);
  if (totalTasks === 0) return null;
  return Math.round((doneTasks / totalTasks) * 100);
}

/** How many tasks were completed *today* specifically — the "today"
    counterpart to computeEngineeringProgress's all-time overall share, so
    Admin can see at a glance whether anything actually happened today, not
    just where the project stands overall. */
function getTasksCompletedToday(project) {
  return getEngineeringTaskTotals(project).doneToday;
}

/** Splits overall progress into "done before today" and "done today"
    shares (both as a % of all tasks), so a progress bar can show today's
    contribution as a distinct, visible segment instead of one blended
    number — the bar becomes evidence of today's work, not just a snapshot. */
function computeProgressBreakdown(project) {
  const { totalTasks, doneTasks, doneToday } = getEngineeringTaskTotals(project);
  if (totalTasks === 0) return { overall: 0, beforeToday: 0, today: 0 };
  const overall = Math.round((doneTasks / totalTasks) * 100);
  const today = Math.round((doneToday / totalTasks) * 100);
  return { overall, today, beforeToday: Math.max(0, overall - today) };
}

/** Same rollup as getEngineeringTaskTotals, generalized to any department
    with real task-tracked activities — used only by the project-completion
    summary below, which needs every tracked department's progress, not
    just Engineering's. Deliberately a separate function rather than
    reworking getEngineeringTaskTotals/computeEngineeringProgress in place:
    those two are the established, documented basis for the Operations
    Overview's per-project "today" indicator and Admin's Engineering-only
    stat tile, and changing their signature would ripple into both. */
function getDeptTaskTotals(project, deptKey) {
  const docs = (project.departments[deptKey] && project.departments[deptKey].documents) || [];
  let totalTasks = 0;
  let doneTasks = 0;
  docs.forEach((d) => {
    const tasks = d.tasks || [];
    if (tasks.length) {
      totalTasks += tasks.length;
      doneTasks += tasks.filter((t) => t.done).length;
    } else {
      totalTasks += 1;
      if (d.progress >= 100) doneTasks += 1;
    }
  });
  return { totalTasks, doneTasks };
}

function computeDeptProgress(project, deptKey) {
  const { totalTasks, doneTasks } = getDeptTaskTotals(project, deptKey);
  if (totalTasks === 0) return null;
  return Math.round((doneTasks / totalTasks) * 100);
}

/** True once every department with task-checklist-driven progress
    (Engineering, Tenders — see DEPARTMENTS_WITH_TASK_PROGRESS) has at least
    one activity AND all of them are 100% complete — the trigger for
    offering Admin a one-click "mark this project Completed". Store &
    Inventory is deliberately excluded here even though it has real activity
    tracking: stock movement doesn't have a "100% done" state the way a
    checklist does — a project's inventory keeps flowing in/out until the
    project itself physically wraps up, so it can't gate "completion" the
    same way. A department with no activities yet doesn't count as done
    either (that's "not started", not "complete"), so a brand new project
    never shows as falsely ready to close. */
function isProjectFullyComplete(project) {
  return DEPARTMENTS_WITH_TASK_PROGRESS.every((deptKey) => {
    const { totalTasks } = getDeptTaskTotals(project, deptKey);
    return totalTasks > 0 && computeDeptProgress(project, deptKey) === 100;
  });
}

/** The department head actually assigned to this project, if any — lets
    Admin see *why* there's been no update today (the head may have logged
    a valid reason via their own daily status) instead of just silence.
    Some seeded projects have historical activity from someone who isn't a
    real login (e.g. a past contributor) and so have no matching head here
    — that's an honest gap, not a bug. */
function getHeadForProject(db, project, department) {
  return db.users.find((u) => u.department === department && u.projectIds.includes(project.id)) || null;
}

/* project.departments keys don't quite match user.department values — only
   Store & Inventory differs (storeSite vs store) — so anything that needs
   to go from "this head's department" to "their slice of a project" goes
   through this, rather than assuming the two line up. */
const USER_DEPT_TO_PROJECT_DEPT_KEY = { engineering: 'engineering', tenders: 'tenders', store: 'storeSite', general: 'general' };

/** Every one of this head's own activity-log entries dated today, pooled
    across every project they're assigned to — the "whole day, wherever it
    happened" version of a single project's "Today's activity" tab. Used by
    Admin's Team Status view, where a head is one card regardless of how
    many projects they're on. Only Engineering has real activity logging so
    far, so this comes back empty for every other department — an honest
    gap, the same one every other per-department view in this app has. */
function getHeadTodayActivity(db, head) {
  const deptKey = USER_DEPT_TO_PROJECT_DEPT_KEY[head.department];
  const projects = getProjectsForUser(db, head);
  const entries = [];

  projects.forEach((p) => {
    const dept = deptKey && p.departments[deptKey];
    ((dept && dept.activity) || []).forEach((a) => {
      if (a.user === head.name && a.date === todayStr()) {
        entries.push({ ...a, kind: 'document', projectName: p.name });
      }
    });
    if (deptKey === 'engineering') {
      (p.siteReports || []).forEach((r) => {
        if (r.user === head.name && r.date === todayStr()) {
          entries.push({ ...r, kind: 'report', docType: null, projectName: p.name });
        }
      });
    }
  });

  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---- session helpers ---- */

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function requireRole(role) {
  const session = getSession();
  if (!session || session.role !== role) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

function requireAnyRole(roles) {
  const session = getSession();
  if (!session || !roles.includes(session.role)) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

/* All four department-head roles — shared by any page a head of any
   department can visit (Dashboard, and each department's own workspace,
   which every head can at least view). */
const HEAD_ROLES = ['engineering_head', 'tenders_head', 'store_head', 'general_head'];

const DEPARTMENT_LABELS = { engineering: 'Engineering', tenders: 'Tenders', store: 'Store & Inventory', general: 'General' };

/** Which page (if any) is a department's own workspace. */
const DEPARTMENT_PAGE = { engineering: 'engineering.html', tenders: 'tenders.html', store: 'store.html', general: null };

/** Departments with real editing and activity logging built so far — used
    to gate anything (Dashboard alerts/activity feed, the sidebar note) that
    should only claim real tracking for these. General has no login and no
    workspace page at all, so it never appears here. */
const DEPARTMENTS_WITH_ACTIVITY_TRACKING = ['engineering', 'tenders', 'store'];

/** The subset of the above whose activities are task-checklist-driven and
    so have a meaningful "% complete" (see computeDeptProgress) — used by
    the project-completion check and the Test Data "simulate a day"
    buttons' task-completion logic. Store & Inventory is real activity
    tracking (materials/ledger, not a checklist) but deliberately excluded
    here: stock movement has no "100% done" state to reach. */
const DEPARTMENTS_WITH_TASK_PROGRESS = ['engineering', 'tenders'];

/** Sidebar "demo build" note, tailored to what's actually true for this
    user's department — it'd be dishonest to claim real editing for a
    department that doesn't have it yet (currently just General, which has
    no login of its own so this branch is more future-proofing than
    something a real user hits today). */
function getSidebarNoteHtml(user) {
  const label = DEPARTMENT_LABELS[user.department] || user.department;
  if (DEPARTMENTS_WITH_ACTIVITY_TRACKING.includes(user.department)) {
    return `<strong>Demo build</strong> ${label} is your department, so you can edit it. Other departments are shown read-only.`;
  }
  const editableLabels = DEPARTMENTS_WITH_ACTIVITY_TRACKING.map((d) => DEPARTMENT_LABELS[d]).join(', ');
  return `<strong>Demo build</strong> ${label} is your department, but full editing for it isn't built yet in this prototype — ${editableLabels} are the departments with real editing so far. Other sections are read-only previews.`;
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

/* ---- Password management (mock; designed to move to Supabase Auth) ----
   Everything here mutates the local `db` directly and there's no real
   email delivery — the "reset link" is just surfaced in the UI instead of
   sent anywhere. Email (not username) is the lookup key throughout, since
   that's what Supabase Auth keys on. When this becomes a real backend, the
   call sites map roughly onto:
     changePassword()        -> supabase.auth.updateUser({ password })
     requestPasswordReset()  -> supabase.auth.resetPasswordForEmail(email, { redirectTo })
     resetPasswordWithToken()-> supabase.auth.updateUser({ password }), called once the
                                recovery session from the emailed link is active
   resetPasswordWithToken() keeps its (token, newPassword) signature either
   way — only what happens inside changes. */

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes, similar to a typical Supabase recovery link

function findUserByEmail(db, email) {
  const normalised = (email || '').trim().toLowerCase();
  return db.users.find((u) => (u.email || '').toLowerCase() === normalised) || null;
}

function changePassword(db, user, currentPassword, newPassword) {
  if (user.password !== currentPassword) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: 'New password must be different from your current password.' };
  }
  user.password = newPassword;
  saveDB(db);
  return { ok: true };
}

/** Requests a reset link for an email. Always looks and behaves the same
    whether or not the email exists (matches Supabase's own behaviour) —
    callers should show the same "check your email" message either way and
    only use the returned token for this prototype's on-screen demo link. */
function requestPasswordReset(db, email) {
  const user = findUserByEmail(db, email);
  if (!user) return { ok: false };

  if (!db.passwordResetTokens) db.passwordResetTokens = [];
  const record = { token: uid('reset'), email: user.email, createdAt: Date.now(), used: false };
  db.passwordResetTokens.push(record);
  saveDB(db);
  return { ok: true, token: record.token };
}

/** Returns the { record, user } for a still-valid, unused token, or null. */
function validateResetToken(db, token) {
  const record = (db.passwordResetTokens || []).find((t) => t.token === token && !t.used);
  if (!record) return null;
  if (Date.now() - record.createdAt > RESET_TOKEN_TTL_MS) return null;
  const user = findUserByEmail(db, record.email);
  return user ? { record, user } : null;
}

function resetPasswordWithToken(db, token, newPassword) {
  const found = validateResetToken(db, token);
  if (!found) return { ok: false, error: 'This reset link is invalid or has expired. Request a new one.' };
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  found.user.password = newPassword;
  found.record.used = true;
  saveDB(db);
  return { ok: true };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
