# Roadmap / Known Gaps

This is a frontend prototype. The items below are deliberate, flagged gaps —
not bugs.

## Not built yet

- **General department** has no workspace page and no data model
  (`departments.general` is just `{ placeholder: true }`). It shows an
  honest "not built yet" message everywhere it's referenced (Dashboard
  alerts/activity, Admin's drill-down) rather than fabricated data.
- **Tenders** and **Store & Inventory** have no editing UI. Every head —
  including Tenders'/Store's own head — sees these read-only; the banner
  text tells the actual owning head "full editing isn't built yet" and
  everyone else "this isn't your department".
- Sidebar items marked **Soon** (Budget & Finance, Procurement,
  Workforce/HR, Contractors, Equipment, Reports, Approvals for heads, Admin
  & Roles) are placeholders — clicking one shows a toast, nothing more.

## Designed for, not yet connected to, a real backend

- **Password management** (`changePassword` / `requestPasswordReset` /
  `resetPasswordWithToken` in `assets/data.js`) is deliberately isolated so
  swapping in Supabase Auth later means rewriting what's *inside* those
  three functions, not the pages that call them. Email is already the
  lookup key throughout, matching Supabase's own model.
- **The "database"** is a single JSON-serialisable object, `localStorage`-
  backed for now. Admin's Operations Overview already has an Export /
  Import / Reset (JSON) panel, so the current state can be pulled out as a
  real `.json` file at any point — a natural seed for a future real
  database.
- **No real email delivery** — `forgot-password.html` surfaces its
  "emailed" reset link directly in the UI, clearly marked as a demo-only
  affordance, standing in for what a real backend would send.

## Suggested next steps, roughly in order of value

1. Build Tenders' and Store & Inventory's own editing UI — their read-only
   views and data model already exist; this is "just" the CRUD layer
   Engineering already has.
2. Build a General department workspace, once its actual content types are
   decided.
3. Wire a real backend (Supabase is the assumed target — see above) behind
   `getDB()` / `saveDB()`, replacing `localStorage` while keeping the same
   data shape.
4. Real email delivery for password reset.

## Accounts — first slice, deliberately basic

`accountant-dashboard.html` covers the core Demand → Admin → Accounts loop
(process an Admin-approved Material Request/Expense/Purchase Order, log an
ad-hoc payment) but stops well short of real accounting software. Not
built, in roughly the order it'd matter:

- No budgets or cost centres per project — Accounts sees individual
  payments, not a project's running spend against a plan.
- No structured amount on a Material Request/Expense/Purchase Order itself
  — the requester's title is free text (e.g. "Steel 40 tons — Block C"),
  so Accounts only has an actual figure once it enters `amountPaid` while
  processing. A real version would ask the requester for an estimated
  amount up front.
- No approval step for Accounts' own ad-hoc payments — anything logged in
  Record a Payment is final immediately, unlike the head → Admin → Accounts
  chain everything else goes through.
- No financial reports (cash flow, spend by category/project over time) —
  only the raw ledger and processed-history tables.

`accountant-project.html` (a project's own IN/OUT accounts) has the same
"first slice" caveat:

- **Disconnected from the approvals flow above** — a processed Material
  Request/Expense/Purchase Order doesn't land in the relevant project's OUT
  category (or IN, for something billed to the client) automatically; the
  accountant would currently enter it twice. Worth wiring once it's clear
  which OUT subsection each approval category should map to.
- No file attachments on a bill or an expense entry (a scanned voucher, a
  contractor invoice) — every entry is numbers and text only, unlike
  Engineering/Tenders documents which do carry files.
- No locking once a project closes — accounts stay editable regardless of
  `project.status`, unlike Store & Inventory's read-only-when-closed rule.
- Deduction columns and IN activities can be added but not removed or
  renamed once created (avoids silently invalidating historical bill
  entries that reference them) — not currently surfaced as a limitation
  anywhere in the UI.
- No per-project Cost vs. Total In comparison shown, even though `cost` is
  captured — the two aren't compared to flag over/under-billing.
