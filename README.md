# EPR Mucubira Compassion

EPR Mucubira Compassion is a React and Express application backed by MongoDB.
The current implementation includes cookie-based authentication, Director-managed
staff accounts, savings-group administration, and role-specific dashboard views.

## Local setup

Requirements: Node.js 20 or later and a running MongoDB instance.

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI` to the MongoDB database to use and replace all example
   credentials. Generate a unique secret of at least 32 bytes for `JWT_SECRET`
   (for example, `openssl rand -base64 48`). Keep `server/.env` private.
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

The current repository does not provide an email verification or password
reset service. Before production use, publish organization-approved terms and a
privacy notice and link them from the registration consent.

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

## Implementation status

Finance transactions and budgets, department activity modules, dynamic
department administration, monthly reports and approvals, analytics and file
exports, notifications, audit-log screens, and organization settings are not
implemented yet. Their navigation entries remain unavailable or show module
availability messaging; no mock business data is presented as live data.
