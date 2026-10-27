# EPR Mucubira Compassion

EPR Mucubira Compassion is a React and Express application backed by MongoDB.
The current implementation includes cookie-based authentication, Director-managed
staff accounts, savings-group administration, and role-specific dashboard views.

## Local setup

Requirements: Node.js 20 or later and MongoDB 4.4 or later. The API's accounting write
workflows require a transaction-capable replica set; a standalone MongoDB
server can run the rest of the application but cannot safely write ledger data.

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI` to the MongoDB database to use and replace all example
   credentials. Generate a unique secret of at least 32 bytes for `JWT_SECRET`
   (for example, `openssl rand -base64 48`). Keep `server/.env` private.
   For local accounting development, run MongoDB as a single-node replica set,
   initialize it once with `rs.initiate()` in `mongosh`, and use a URI such as
   `mongodb://127.0.0.1:27017/epr-mucubira-compassion?replicaSet=rs0`.
3. Install the backend dependencies, create the Director account, and start the
   API:

   ```sh
   cd server
   npm ci
   npm run seed:director
   npm run dev
   ```

4. In another terminal, install and start the frontend:

   ```sh
   cd client
   npm ci
   npm run dev
   ```

   Open `http://localhost:5173`. Vite forwards `/api` requests to
   `http://localhost:5000`; set `PORT` and update `client/vite.config.js` if the
   local API port is changed.

Check that the API and database are ready by opening
`http://localhost:5000/api/health`. A working local setup reports
`"status":"ok"` and `"database":"connected"`. If login or signup says the
service is unavailable, start MongoDB, verify `server/.env` has a reachable
`MONGODB_URI` and a `JWT_SECRET` of at least 32 bytes, then start the API with
`cd server && npm run dev`. Do not put credentials or secrets in frontend code.

The Director seed command creates an account only when its email does not
already exist. It does not reset or overwrite existing users.

## Account registration and access

Open `http://localhost:5173/signup` to create a Parent account. Registration
validates the submitted details, stores only a bcrypt password hash, creates a
session, and signs the user in as an active `parent`. Parents go to a separate,
restricted dashboard. Signup never accepts staff roles or dashboard access
from the form. On login, the selected account type is checked against the role
assigned to the account; it cannot grant a role.

The app does not have one shared password for every role. Use the email and
password for the specific account. These fixed demo credentials are only for
the local-only development seed command; never use them outside a local
development database:

| Account type | Development email | Password |
| --- | --- | --- |
| Director | `director@eprmucubira.local` | `Local-Director-Demo-2026!` |
| Accountant | `accountant@eprmucubira.local` | `Local-Accountant-Demo-2026!` |
| Health Manager | `health@eprmucubira.local` | `Local-Health-Demo-2026!` |
| Communication Manager | `communication@eprmucubira.local` | `Local-Communication-Demo-2026!` |
| Savings Group Manager | `savings@eprmucubira.local` | `Local-Savings-Demo-2026!` |
| Parent | `parent@eprmucubira.local` | `Local-Parent-Demo-2026!` |
| Community Member | `member@eprmucubira.local` | `Local-Member-Demo-2026!` |

To create the local staff demo accounts, first configure `MONGODB_URI` in
`server/.env` to use a local MongoDB database, then run:

```sh
cd server
npm run seed:development-users
```

The seed command creates or resets only the seven named `@eprmucubira.local`
demo accounts to the credentials above, then prints the login details. This
also fixes local demo accounts created with earlier randomly generated
passwords. No other accounts are changed. The application stores only bcrypt
password hashes. Do not use these demo credentials with a shared or production
database. The seed script refuses to run against a non-local database or in
production.

Director-created staff credentials are issued by the Director. Passwords are
limited to 128 characters and bcrypt's 72-byte input limit. Signup accepts a
user-chosen password with no fixed minimum length.

A Director can later assign a staff role from **Staff and Users**. Parents and members
cannot access staff dashboards, organization summaries, staff records, or
savings-group administration. Sign-in attempts are limited to 10 per IP per
15 minutes, and registration requests to 5 per IP per hour. The login
"Remember me" option extends the session from 8 hours to 30 days.
The default limiter uses an in-memory store; multi-instance deployments should
configure a shared rate-limit store.

### Password reset email setup

Password recovery is available from the login page. To deliver reset links,
configure the API's SMTP settings in `server/.env`:

```env
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=EPR Mucubira Compassion <no-reply@example.org>
CLIENT_ORIGIN=https://your-application.example.org
```

Use port 465 with `SMTP_SECURE=true` for implicit TLS, or port 587 with
`SMTP_SECURE=false` for STARTTLS. SMTP credentials must stay on the server.
Without complete mail settings, password-reset requests remain unavailable.
Reset tokens are cryptographically random, stored only as SHA-256 hashes, expire
after 30 minutes, and can be used once. Responses do not disclose whether an
email address has an account. New passwords must be at least 12 characters and
no more than 72 UTF-8 bytes.

## Financial accounting

The Accountant workspace is available at `/accounting` to Accountant and
Director accounts. Financial years use the organization's confirmed calendar
year (January 1 through December 31); create the initial year (for example,
2026) and later years separately from the Financial Years panel. Overlapping
years are rejected, and creating a later year does not modify earlier records.

For the accountant's daily workflow, use `/accountant-dashboard` to see the
overview, `/accountant/income` to record money received, `/accountant/expense`
to record money spent, and `/accountant/transactions` to search or export
transaction history. These simple forms use the existing chart of accounts
and ledger rules behind the scenes; accountants do not need to enter journal
lines. Each form creates and immediately posts one balanced income or expense
entry, so dashboard totals, history, and reports update from the same ledger
record. Manual journal entries retain the Director review workflow. Every
daily transaction is recorded with its creating accountant and an audit event.
The detailed accounting administration remains available to Directors in the
accounting administration screens and is not removed. Accountants use
`/accounting` only for financial-year setup and reports; journal entry and
chart-of-accounts configuration screens are hidden from their daily workflow.

The ledger uses accrual double-entry journal entries. Every journal must
balance in integer minor units; income, expenses, cash, and bank balances are
derived only from posted entries. Accountants prepare and submit entries.
Each entry stores its financial-year ID and generated month ID (for example,
`2026-04`) as well as its transaction date. Directors review and post entries,
and cannot post their own. They may return a submitted entry with a reason for
correction. Creators may delete only their own draft entries; submitted and
posted entries are retained. A closed year cannot accept entries; closing
requires all draft and submitted entries to be resolved. Reopening requires a
Director and a recorded reason. Opening cash and bank balances must be entered
as a balanced opening-balance journal; the application does not infer them.

For first-time setup, a Director initializes the starter chart of accounts at
`/accounting/accounts`. An Accountant creates the 2026 year using `2026-01-01`
and `2026-12-31` from the Financial Years section.
Review the starter accounts against the organization's approved accounting
policy before entering live data. Record verified opening balances as a
balanced `opening_balance` entry. To record a month, prepare income, expense,
transfer, or adjustment journals dated within the open year, submit each
entry, and have a different Director post it. Select the year and month in
Reports to see the posted monthly totals and year-to-date figures. An annual
report uses the full calendar year and compares with the previous calendar
year only when that year has been set up.

Configure `ACCOUNTING_BASE_CURRENCY` in `server/.env` before using the ledger.
It defaults to `RWF` and must be an uppercase three-letter currency code.
Journal entries must use this configured currency. Changing it after accounts
or entries exist is not a conversion and requires an approved migration.
Amounts are stored as safe integer minor units; the API reports the configured
currency's `minorUnitDigits` (zero for whole RWF francs). The currency selector
in personal settings is display-only; it does not convert accounting values.

MongoDB transactions protect ledger writes and their audit records, so the
MongoDB deployment must support transactions (a replica set or sharded cluster;
standalone MongoDB is not sufficient for financial writes). For a local
single-machine database, the process must start with replica-set name `rs0`.
If MongoDB is managed by systemd, add this to `/etc/mongod.conf`:

```yaml
replication:
  replSetName: rs0
```

Then restart MongoDB with the appropriate service command, for example
`sudo systemctl restart mongod`. If MongoDB was started directly as a process,
stop it cleanly and restart the same command with `--replSet rs0`, preserving
its existing `--dbpath` and other options. Do not delete the database or use a
new data directory. Initialize the replica set once in `mongosh` with
`rs.initiate()`, then set the existing database URI in `server/.env` to include
`?replicaSet=rs0` (append `&replicaSet=rs0` if it already has query options),
and restart the API. The Accounting screen displays the detected MongoDB mode
and disables financial writes until transaction support is available. This
configuration change preserves the database files but restarts MongoDB and
temporarily interrupts the API's database connection.

### Financial API

All endpoints require a signed-in Accountant or Director unless noted.
Authorization is checked by the API, not only by the client.

| Method and path | Purpose |
| --- | --- |
| `GET /api/finance/years` | List financial years |
| `POST /api/finance/years` | Create a non-overlapping calendar year |
| `POST /api/finance/years/:id/close` | Close a year (Director only) |
| `POST /api/finance/years/:id/reopen` | Reopen a year with a reason (Director only) |
| `GET /api/finance/accounts` | List chart-of-account entries |
| `POST /api/finance/accounts/standard-chart` | Idempotently create the starter chart; creates no transactions |
| `POST /api/finance/accounts` | Add a chart-of-account entry |
| `GET /api/finance/journal-entries` | Search paginated entries by year, status, source, date range, or reference/description |
| `POST /api/finance/journal-entries` | Create a balanced draft journal entry |
| `PATCH /api/finance/journal-entries/:id` | Edit the creator's own draft within its original open financial year |
| `POST /api/finance/journal-entries/:id/submit` | Submit the creator's draft for review |
| `POST /api/finance/journal-entries/:id/return` | Return a submitted entry with a reason (Director only) |
| `POST /api/finance/journal-entries/:id/approve` | Post a submitted entry (Director only, separate duties enforced) |
| `POST /api/finance/journal-entries/:id/reverse` | Create a linked, balanced reversal draft without changing the posted original |
| `DELETE /api/finance/journal-entries/:id` | Delete the creator's own draft only; posted history is never deleted |
| `GET /api/finance/reports?yearId=…&month=1..12` | Calculate a monthly accrual-ledger summary |
| `GET /api/finance/reports?yearId=…` | Calculate an annual summary and prior-calendar-year comparison, if available |
| `GET /api/finance/audit-log` | View paginated finance audit events (Director only) |
| `GET /api/finance/management/assets` | List the asset register and calculate straight-line book values |
| `POST /api/finance/management/assets` | Register an asset (Accountant only) |
| `PATCH /api/finance/management/assets/:id` | Update an asset and preserve status history (Accountant only) |
| `DELETE /api/finance/management/assets/:id` | Delete an asset and record the action in the audit log (Accountant only) |
| `POST /api/finance/management/assets/:id/maintenance` | Append a non-deletable maintenance record (Accountant only) |
| `GET /api/finance/management/projects` | List projects with approved budgets and posted journal expenditure |
| `POST /api/finance/management/projects` | Create a project and budget (Accountant only) |
| `PATCH /api/finance/management/projects/:id` | Update project and budget details (Accountant only) |
| `DELETE /api/finance/management/projects/:id` | Delete a project with no posted expenses linked to it (Accountant only) |
| `GET /api/finance/management/performance?year=…&month=…` | List monthly employee performance records |
| `PUT /api/finance/management/performance/:employeeId/:year/:month` | Create or update an employee's monthly performance record (Accountant only) |
| `DELETE /api/finance/management/performance/:id` | Delete a monthly performance record and audit the action (Accountant only) |

Reports distinguish the selected month from year-to-date totals and include
cash/bank opening, movement, and closing balances. Annual reports contain
monthly income/expense trends. Transfers between asset accounts do not count
as income or expense. These are ledger summaries, not a complete statutory
balance sheet, cash-flow statement, or donor-ready financial report.

The Accountant workspace includes an asset register with an optional image,
source, acquisition and expected end-of-use dates, depreciation estimates,
asset status and maintenance history; project budgets with an activity,
timeframe, start/end dates and completion status; monthly employee performance
with title and sales figures; and view, edit, delete and CSV actions. Asset
photos and supporting documents currently accept HTTP(S) links; private file
uploads are not implemented. Asset depreciation is an informational book-value
calculation and does not create accounting journal entries. Project actuals
are matched by the project code entered in a journal's project-reference field;
the reference is not yet a foreign-key selection. Projects with posted expenses
cannot be deleted so their budget-to-ledger links remain intact.

Separate invoice, bill, customer/supplier, receivables and payment-history
workflows, bank-statement reconciliation, report approval, secure document
uploads, and statutory financial statements remain unimplemented. Use the
ledger under an organization-approved accounting policy. The application does
not add sample financial transactions.

Before production use, publish organization-approved terms and a privacy notice
and link them from the registration consent.

## Verification

Run backend API smoke tests:

```sh
cd server
npm test
```

Run frontend lint and production build:

```sh
cd client
npm run lint
npm run build
```

## Database backup and restore

Use MongoDB Database Tools and restrict backup files to an appropriately
protected location. Replace the example URI with the configured database URI:

```sh
mongodump --uri="mongodb://127.0.0.1:27017/epr-mucubira-compassion" --out="./backups"
mongorestore --uri="mongodb://127.0.0.1:27017/epr-mucubira-compassion" "./backups/epr-mucubira-compassion"
```

Verify the backup and restore process against a non-production database before
relying on it for recovery.

## Other implementation status

The Director workspace now includes a responsive application shell, a live
department overview based on staff roles, and dedicated routes for budgets,
monthly reports, analytics, notifications, and audit logs. The available
backend data sources for non-financial operations remain staff accounts,
savings-group directory records, and the role-scoped organization summary.
Health-service activity, general notifications, dynamic department
administration, and file exports are not implemented by the API. Those screens
identify missing data sources instead of showing sample records as live data.
