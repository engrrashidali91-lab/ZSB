# Data Model

Everything lives in one JS object (`db`), built by `seedData()` in
`assets/data.js` and persisted to `localStorage` (key `STORAGE_KEY`,
bumped on every schema/seed change to force a clean reseed) as JSON.
`getDB()` reads it, seeding fresh data if it's missing or corrupt;
`saveDB(db)` writes it back after every change; `resetDB()` clears it,
forcing a reseed on the next `getDB()`.

## Shape

```
db = {
  users: [ { username, password, email, name, role, department?, projectIds[] } ],
  projects: [ { id, name, client, code, status, departments: {...}, siteReports[] } ],
  approvals: [...],
  adminInstructions: [...],
  headRequests: [...],
  headMessages: [...],
  passwordResetTokens: [...],
  payments: [...],
}
```

### Users

- `role` is one of `engineering_head` | `tenders_head` | `store_head` |
  `general_head` | `admin` | `accountant`.
- `department` (head roles only) is `engineering` | `tenders` | `store` |
  `general` — matches the keys under a project's `departments`. `admin` and
  `accountant` have no `department` and no `projectIds` of consequence —
  neither owns a workspace; Accounts only ever sees `approvals` and its own
  `payments`.
- `projectIds` lists which projects this user can see
  (`getProjectsForUser`).
- Demo logins are `user1`/`user2`/`user3`/`user4` (Engineering/Tenders/
  Store/Accounts, one fixed account per role — no `general_head` login
  exists since General has no workspace built) and `admin` — password
  `root` for all five. Login looks users up by `username` alone (role is
  fixed per account, so there's nothing to disambiguate) — see `login.js`.
  Deliberately not a single shared account that switches `department`: a
  head's `dailyStatus` lives on the user record, not scoped per department,
  so a shared account would carry a stale status over across departments.

### Projects → departments

Each project has `departments: { engineering, tenders, storeSite, general }`:

- `engineering.documents[]` — see **Engineering documents** below.
  `engineering.activity[]` is an auto-generated, dated log
  (`makeActivity`) — nothing here is ever hand-typed by a user.
- `tenders.documents[]` — simple `{ id, type, title, files[] }`
  (`makeTenderDoc`). No progress or tasks — Tenders has no editing UI yet.
- `storeSite.materials[]` / `storeSite.ledger[]` — stock levels and IN/OUT
  entries (`makeMaterial` / `makeLedgerEntry`). No editing UI yet.
- `general` — just `{ placeholder: true }`. No data model exists for this
  department yet.
- `accounts` — a project's own IN/OUT accounts, kept by the Accountant, not
  a department head. See **Project accounts** below; unlike the four
  `departments` keys, it's a sibling of `departments` on the project
  itself, and is created lazily rather than seeded, via
  `ensureProjectAccounts(project)`.

### Project accounts (Accountant)

Gathered directly from how the accountant actually works, not a generic
ledger — `project.accounts`, built by `ensureProjectAccounts(project)` the
first time anything reads or writes it (so every existing seeded project
gets it without having to hand-edit five project literals):

```
project.accounts = {
  dateOfAward, cost, workOrder,       // editable project header fields; cost starts null
  deductionTypes: [ { key, label } ], // Bills' deduction columns — starts Security/Income
                                       // Tax/DPR/Kapra, extendable per project
  in: { activities: [ { id, name, kind: 'bills' | 'simple', entries[] } ] },
  out: { categories: [ { key, label, subsections: [ { key, label, entries[] } ] } ] },
}
```

- **IN** is a list of activities. The first, `Bills`, is special
  (`kind: 'bills'`): each entry is `{ serialNo, date, grossAmount,
  deductions: { [deductionType.key]: amount } }` — a running bill
  register. `computeBillNet(entry)` nets Gross Amount minus every
  deduction on that line (missing keys count as 0), and
  `computeActivityTotal(activity)` sums those nets for the whole register.
  Every other activity — `Security` and `Mobilization` are seeded by
  default, and the accountant can add any number more (`makeInActivity`) —
  is `kind: 'simple'`: entries are just `{ date, description, amount }`,
  and its total is a plain sum. Security is a deliberately independent
  ledger, not auto-derived from the Security deduction column on Bills —
  the accountant enters what's actually happened to retention money
  (e.g. a release) rather than the app inferring it. `computeInTotal(accounts)`
  sums every activity's total for the project's overall IN figure.
- **OUT** is fixed to five trades — Civil, Plumbing, Electrical,
  Mechanical, Other (`OUT_CATEGORY_TEMPLATE`) — matching the accountant's
  actual cost breakdown, not something the accountant extends. Civil alone
  splits into two subsections (`smallContractor` — the "PT Contractor"/
  small-contractor payments — and `officeExpense`); the other four each
  have one flat `general` subsection. Every subsection's entries are
  `{ date, payee, amount, note }`. `computeSubsectionTotal` /
  `computeCategoryTotal` / `computeOutTotal(accounts)` roll these up the
  same way IN does.
- No connection, on purpose, to the Demand → Admin → Accounts approvals
  flow below — a processed Material Request/Expense/Purchase Order and
  this project ledger are two separate things the accountant keeps; see
  [Roadmap](ROADMAP.md) for the gap this leaves.

### Engineering documents are checklist-driven

A document (`makeDoc(type, title, doneCount, user, date, files)`) carries a
`tasks[]` checklist rather than a hand-set progress number:

- Standard types (`PC-1`, `Revised PC-1`, `TC-1`, `IPC`, `MB Scan`,
  `Voucher`, `Drawing`) each have a predefined checklist in
  `DOC_TASK_TEMPLATES`. A custom ("Other") type starts with an empty
  checklist.
- The **last** task in a template is the *final* task (`isFinal: true`) —
  completing it is gated: it can only be ticked once every other task on
  the document is done (enforced in `engineering.js`, not `data.js`).
- `doc.progress` / `doc.status` are **stored**, not computed on read, but
  kept in sync by `recomputeDocFromTasks(doc)` after every task
  add/toggle/delete — so every existing consumer
  (`computeEngineeringProgress`, Admin's drill-down, `getStaleDocuments`)
  keeps working unchanged.
- Adding a task to an already-100%-complete document correctly reopens it
  (progress recalculates down) — this is deliberate, not a bug.

### Communication: Instructions / Requests / Messages

Three parallel inboxes, all the same shape and all closed out the same way:

| Inbox | From → To | Seeded via |
|---|---|---|
| `adminInstructions[]` | Admin → a department | `makeInstruction(date, message, toDepartment, project)` |
| `headRequests[]` | One head → another department | `makeHeadRequest(date, fromName, fromDepartment, message, toDepartment, project)` |
| `headMessages[]` | A head → Admin | `makeHeadMessage(date, fromName, fromDepartment, message, project)` |

Every item has `acknowledged`, `responseText`, `responseFile`
(`{ name, kind }` or `null`), and `respondedDate`. "Acknowledged" always
means "replied with text and/or a file", never a blind dismiss — see
`renderRespondableInbox()` / `renderResponseBlock()` in `data.js`, shared by
`dashboard.js` and `admin-dashboard.js`.

### Password management (mock, Supabase-shaped)

`passwordResetTokens[]` stands in for what a real backend would track
server-side. Three functions in `data.js` isolate the logic so a real
backend swap only touches what's *inside* them, not the pages that call
them:

- `changePassword(db, user, currentPassword, newPassword)` → future
  `supabase.auth.updateUser({ password })`
- `requestPasswordReset(db, email)` → future
  `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- `resetPasswordWithToken(db, token, newPassword)` → future
  `supabase.auth.updateUser({ password })`, once the recovery session from
  the emailed link is active

Email, not username, is the lookup key throughout, matching Supabase Auth's
own model. There is no real email delivery: `forgot-password.html` shows
the same generic message whether or not the address matched an account, and
surfaces the "emailed" link directly in the UI, clearly marked as a
demo-only affordance.

## Shared helpers worth knowing about

- `renderSidebar(opts)` — the one nav renderer every page uses. The
  sidebar is deliberately short (Dashboard, the three built departments,
  and Projects for Admin); its `Departments` group label comes from every
  relevant `SIDEBAR_ITEMS` entry's own `group`, not just the first item in
  it, so a hidden first item doesn't strand the label.
- `getCombinedFeed(project)` / `getAllProjectsActivity(projects)` — merge a
  project's document activity and site reports into one dated feed. Only
  ever populated by a department head's own actions — Admin's own actions
  (sending an instruction, acknowledging a message, viewing a project) are
  never logged into it.
- `getStaleDocuments(project, thresholdDays)` — documents under 100%
  untouched for N+ days; drives the "Needs attention" badge and Dashboard
  alerts.
- `computeEngineeringProgress(project)` — a project's *overall* progress:
  every task, on every Engineering document, pooled together and expressed
  as one tasks-weighted percentage (not an average of each document's own
  %, which would let a small, easy document mask a large one that's barely
  started).
- `getTasksCompletedToday(project)` — the same idea for *today* specifically:
  how many tasks were completed today, across every document. Admin's
  Operations Overview shows both side by side, since "68% overall" and
  "nothing happened today" are two different, useful facts.
- `getHeadForProject(db, project, department)` — the real login user (if
  any) actually assigned to a project's department, used to look up their
  `getTodayStatus()` — so if a head has logged a valid reason for a quiet
  day (out on a site inspection, say), Admin sees that reason instead of
  just silence. Some seeded projects have historical activity from someone
  who was never given a login (an honest gap, not a bug), so this can
  legitimately return nothing.
- `getTodayStatus(user)` / `setTodayStatus(user, activity)` /
  `clearTodayStatus(user)` — a head's own daily status is generic, not
  Engineering-specific: any of the four department heads can set one, even
  though only Engineering has real document/task tracking. `dashboard.js`'s
  Alerts card, Admin's per-project Department Head panel ("Today's
  activity" tab), and Admin's Team Status page all read it, so a
  Tenders/Store/General head has the same way of telling Admin "here's why
  today's quiet" that Engineering does.
- `getHeadTodayActivity(db, head)` — one head's activity-log entries dated
  today, pooled across *every* project they're on (unlike the per-project
  panel, which only sees the one project currently selected). Powers Admin's
  Team Status page and each head's own detail page — one view per head
  regardless of how many projects they have. Goes through
  `USER_DEPT_TO_PROJECT_DEPT_KEY` for the same `store` → `storeSite`
  mismatch `getHeadForProject` has to handle.

### Admin asking a head for a reason

`admin-head-detail.html` (reached by clicking a card on Team Status) shows
one head's day in full — the same three states as their card, plus their
assigned projects and the same "To Admin" / "To other heads" actions as the
per-project panel, just pooled across every project instead of one.

When a head has logged nothing and given no reason, Admin can ask for one
right there: "Ask for a reason" sends a normal `adminInstructions` entry
(`makeInstruction`, tagged with an extra `kind: 'ask-reason'` field so this
page can find its own asks) — no new data model, just the existing
instruction-and-respond flow every other inbox in the app already uses. The
head sees and answers it exactly like any other instruction from their own
Dashboard; once they reply, Admin's page shows that reply inline via the
same `renderResponseBlock()` used everywhere else, instead of a generic
"acknowledged". Only one outstanding ask per head per day is allowed — the
button is replaced by "Asked — awaiting reply" until they respond.
- `makeProject(name, client, code, status, logo)` — what Admin's "+ New
  project" button creates: empty department shells, no head assigned yet.
  `getHeadForProject` returning nothing for it is the same honest gap as
  any project whose activity predates a real login.
- Approvals carry a `status` (`'pending' | 'approved' | 'rejected'`,
  `APPROVAL_STATUS_META` for the label/badge colour) — Admin resolves one,
  via the shared `resolveApproval(db, id, status)`, from any of the three
  places its Approve/Reject buttons appear (Operations Overview, a
  project's Department Head panel, a head's own detail page); whoever sent
  it sees the outcome on their own Dashboard's "Sent by you" list.

### Demand → Admin → Accounts

Every approval category (`Material Request`, `Expense`, `Purchase Order`)
is money leaving the company, so an Admin approval isn't the end of the
line — it's a hand-off to the Accountant to actually pay it out or raise
the voucher. This reuses the existing approvals inbox rather than adding a
parallel "demands" concept: a Store & Inventory head raising a Material
Request against stock on hand, an Engineering head logging an Expense, and
a Tenders head raising a Purchase Order all land here the same way, via
each head's own Dashboard "Send" form (`makeApproval`).

- `resolveApproval(db, id, status)` is the one function every Admin
  Approve/Reject button calls. Approving sets `accountsStatus:
  'awaiting_processing'`; rejecting leaves it `null` — a rejected approval
  has nothing left for Accounts to do.
- `accountant-dashboard.html` lists every approval sitting at
  `accountsStatus: 'awaiting_processing'` under Pending Processing. Marking
  one processed calls `processApprovalPayment(db, id, payment)`, which sets
  `accountsStatus: 'processed'` and records `amountPaid`, `paymentMethod`,
  `voucherRef`, `accountsNote`, `processedBy`, `processedDate` directly on
  the approval — no separate "payment" record for these, since the
  approval already carries everything (category, title, project,
  requester) a payment needs. `ACCOUNTS_STATUS_META` gives the label/badge
  colour, shown back to the original requester on their own Dashboard
  alongside the Admin status.
- **Ad-hoc payments** — day-to-day spend that never went through a head's
  approval flow (a utility bill, wages, a direct vendor payment) is logged
  straight into `db.payments[]` by the Accountant (`makePayment`), shown in
  its own Payment Ledger. These are separate from processed approvals,
  which live on the approval record itself rather than being duplicated
  into `payments[]`.

## Test data generation (`admin-dashboard.js`)

Two buttons under "Test Data" on the Operations Overview switch the whole
dataset between the two scenarios Admin actually needs to demo, instead of
clicking through documents and daily-status forms by hand to set one up.
Both start with `rollBackTodayToYesterday()` (any task/activity/ledger/site
report dated today moves back to yesterday) and `clearAllDailyStatus()`, so
every run starts from a clean, genuinely-quiet slate before adding its own
fresh today-dated entries — re-running either button is safe and doesn't
double up:

- **Simulate: everyone made progress today** — for every in-progress
  project, completes the next not-done task (respecting the final-task
  gate) on both its next Engineering *and* Tenders document
  (`completeNextTask`), and records a stock movement against its first
  material (`recordStoreMovementToday` — Store & Inventory has no task
  checklist, so its "work" is an OUT ledger entry plus the matching
  activity entry instead). Result: Admin's Project Progress shows the green
  "today" segment and "+N tasks completed today" pill (Engineering-only —
  see `computeProgressBreakdown`), and Team Status shows all three tracked
  heads (Engineering/Tenders/Store) as having logged work today.
- **Simulate: Engineering quiet, rest of the team active** — the same, but
  skips Engineering entirely: only Tenders' task and the store movement are
  recorded. Result: Engineering's head sees the "you haven't made any
  progress today" alert on their own Dashboard (no `dailyStatus` on file
  either, so it's the warning-to-give-a-reason state, not the "reason
  noted" one) — see `renderTodayStatusCard` in `dashboard.js` — while Team
  Status shows Engineering flagged "no update, no reason" and Tenders/Store
  as done.

Both call `saveDB(db)` and reload the page, since so much of what's on
screen depends on this same data.
