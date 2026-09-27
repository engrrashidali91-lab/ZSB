# ZSB — Site Reporting Portal

A frontend-only prototype for a construction company's project/document reporting
system — role-based logins for department heads, an admin and an accountant,
per-department document tracking (Engineering and Tenders have full editing;
Store & Inventory is a read-only preview), cross-department communication, an
admin oversight view, a demand-to-payment flow (a department raises a
Material Request/Expense/Purchase Order, Admin approves it, Accounts
processes the payment), and per-project IN/OUT accounts kept by Accounts
(money received via a bill register, money spent by trade). There is no
backend: everything runs as static HTML/CSS/JS with a mock database
persisted to the browser's `localStorage`.

## Running it

No build step, no server required — open `index.html` directly in a browser
(double-click it, or `file:///path/to/index.html`). That's the public
marketing site; its header and footer both link to `login.html` for staff/
admin sign-in.

The login fields are pre-filled with a demo account for convenience; changing
the Role dropdown auto-fills the matching credentials. Each department head is
a separate, fixed account (not a single account that switches department) so
that each department's own activity/daily-status state stays independent —
useful for testing, e.g., "this head hasn't touched anything today" for one
department while another shows real activity:

| Role | Username | Password |
|---|---|---|
| Engineering — Department Head | `user1` | `root` |
| Tenders — Department Head | `user2` | `root` |
| Store & Inventory — Department Head | `user3` | `root` |
| Admin | `admin` | `root` |
| Accountant | `user4` | `root` |

## Pages

| Page | Who | What it does |
|---|---|---|
| `index.html` | Everyone | Public one-page marketing site (the entry point — open this one) — Home/hero, Our Projects, Mission & Vision, About Us, Our Team, Gallery, Contact Us, all dummy content; links to `login.html` |
| `login.html` | Everyone | Sign in; "Forgot password?" link |
| `forgot-password.html` / `reset-password.html` | Everyone | Mock password-reset flow — see [Data model](docs/DATA-MODEL.md) |
| `dashboard.html` | Any department head | Alerts (incl. a daily-status reason for a quiet day), My Projects, and a tabbed Team & Activity card — Activity, Instructions from Admin, Department Requests, and Send (a message/request/approval to Admin or another department head) |
| `engineering.html` | Any department head (edit: Engineering head only) | Document/task-checklist management, Site Reports |
| `tenders.html` / `store.html` | Any department head (read-only for everyone) | Tenders documents / Store materials & stock ledger |
| `profile.html` | Everyone | Account details, change password |
| `admin-dashboard.html` | Admin | Operations Overview — stats, project progress, an Inbox (Approvals with Approve/Reject, Messages, Instructions), team activity, System Data (export/import/reset as JSON), Test Data (simulate everyone active today, or Engineering quiet while the rest of the team isn't) |
| `admin-reports.html` | Admin | Project Report — create/edit/delete projects; drill into any one project's Engineering/Tenders/Store/General tabs; a Department Head panel (today's activity, approvals/messages to action, requests to other heads) |
| `admin-team-status.html` | Admin | Team Status — every department head in one place: what they've done today across *all* their projects, a valid reason on file if they haven't, or a flagged "no update, no reason" if neither. Click a card for that head's own page |
| `admin-head-detail.html` | Admin | One department head's own view — the same three states in full, their assigned projects, approvals/messages to action, requests to other heads, and (when nothing's logged and no reason's given) a button to ask them for one |
| `accountant-dashboard.html` | Accountant | Accounts Overview — stats, Material Requests/Expenses/Purchase Orders Admin has approved and are awaiting payment (Process Payment), Processed History, a form to record an ad-hoc payment/expense, and the resulting Payment Ledger |
| `accountant-project.html` | Accountant | One project's own accounts — Date of Award / Cost / Work Order, an IN tab (Bills register with per-line deductions, Security, Mobilization, and any other activity the accountant adds) and an OUT tab (Civil/Plumbing/Electrical/Mechanical/Other expense by trade), with running Total In / Total Out / Balance |

## Key ideas

- **Mock database** — `assets/data.js`'s `seedData()` builds the whole dataset
  (users, projects, documents, activity, messages) in memory; `getDB()` /
  `saveDB()` persist it to `localStorage` as JSON under a versioned key
  (currently `src_mock_db_v24` — bump this whenever the data shape changes,
  to force a clean reseed for anyone with stale data).
- **Demand → Admin → Accounts** — any department head (e.g. Store &
  Inventory, raising a material demand against stock on hand) can send a
  Material Request, Expense or Purchase Order to Admin for approval from
  their Dashboard's Send tab. Once Admin approves it, it's automatically
  queued for the Accountant to actually process — record the payment made
  or voucher raised — on `accountant-dashboard.html`; a rejection ends
  there. See `resolveApproval` / `processApprovalPayment` in
  [Data model](docs/DATA-MODEL.md).
- **Permissions** — only the department head who owns a department can edit
  it; everyone else, including other heads and Admin, sees the same data
  read-only. This is enforced per-page (`isOwnDepartment` / `isReadOnly()`),
  not by hiding pages.
- **Engineering documents are checklist-driven** — a document's progress
  isn't set by hand, it's the share of its predefined task checklist that's
  done, and the last task in each checklist is the "final" task, which can
  only be completed once every other task is. Details in
  [Data model](docs/DATA-MODEL.md).
- **Respond, not acknowledge** — Instructions from Admin, Department
  Requests, and Head-to-Admin messages are all closed out by replying with
  text and/or an attached document, never a blind dismiss; the reply is
  visible to whoever sent the original item.
- **No backend, but designed for one** — password management in
  `assets/data.js` is deliberately structured to map onto Supabase Auth
  later. See [Roadmap](docs/ROADMAP.md).

## Known gaps

- **General department** has no workspace page or data model yet — every
  reference to it is an honest "not built yet" placeholder, never fabricated
  data.
- **Tenders** and **Store & Inventory** have no editing UI yet — every head,
  including their own, sees them read-only.
- Full list in [Roadmap](docs/ROADMAP.md).

## Data confidentiality

All project names, clients and people in the seed data (*Construction of New
OPD Block – Swabi*, *Meridian Construction Ltd*, *Ali Raza*, and so on) are
fictional, chosen specifically to avoid resembling any real client or
project.

## Further reading

- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — the shape of the mock
  database and the helper functions that operate on it.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — known gaps and the intended path to
  a real backend.
