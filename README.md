# Feedback Management System

Monorepo with one Express/MongoDB backend and three React (Vite) frontends:

| App | Folder | Local URL |
| --- | --- | --- |
| Backend API | `backend` | http://localhost:4000 |
| Admin panel | `admin-panel` | http://localhost:5173 |
| Student panel | `student-panel` | http://localhost:5174 |
| Principal panel | `principal-panel` | http://localhost:5175 |

## Requirements

- Node.js 20+
- MongoDB running locally on `127.0.0.1:27017` (Homebrew: `brew services start mongodb-community`)

## First-time setup

```bash
# Backend
cd backend
cp .env.example .env      # already created for this checkout
npm install
npm run seed              # optional demo data

# Frontends (run once per panel)
cd ../admin-panel && npm install
cd ../student-panel && npm install
cd ../principal-panel && npm install
```

Each frontend reads `VITE_API_URL` from its own `.env` file:

```env
VITE_API_URL=http://localhost:4000
```

## Run everything

From the repository root:

```bash
./start-local.sh
```

Or start each service separately in its own terminal:

```bash
cd backend && npm run dev                 # http://localhost:4000
cd admin-panel && npm run dev             # http://localhost:5173
cd student-panel && npm run dev           # http://localhost:5174
cd principal-panel && npm run dev         # http://localhost:5175
```

## Demo credentials (after `npm run seed`)

- **Admin:** `admin` / `admin123`
- **Principal panel:** sign in with the same administrator account
- **Student:** `DEMO0003` / `Scient@123` (all seeded hall tickets use this password)
- **Demo class:** `3-1`, branch `CSE-A`, academic year `2025-2026`

## Security notes

- The backend refuses to start unless `JWT_SECRET` is set to at least 16 characters.
- All admin/reporting endpoints require `Authorization: Bearer <token>` with an admin JWT;
  student endpoints require a student JWT. Change the demo admin password before deploying.
- Student passwords are stored as bcrypt hashes. New students created by upload or by the admin
  panel receive `STUDENT_COMMON_PASSWORD` as their initial password.
- Login endpoints are rate limited, request bodies are capped at 1 MB, and CSV uploads at 5 MB.
- Set `CORS_ORIGINS` to a comma-separated list of any additional frontend origins you deploy.
  Unknown browser origins are rejected.

## Verify the API

With the backend running:

```bash
cd backend
npm run test:api
```

The smoke test covers authentication, student management CRUD, feedback submission for both
rounds, reports, faculty/subject/timetable CRUD, and CORS.

## Deploying

The backend is deployed on Render at `https://scient-feedback-tool.onrender.com`.
See [`DEPLOY.md`](DEPLOY.md) for the required environment variables, the exact
Render settings, redeploy steps, and the post-deploy security check:

```bash
cd backend
npm run verify:deployed
```

## Environment variables

### Backend (`backend/.env`)

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/feedbackSystem
JWT_SECRET=at-least-16-characters-long
STUDENT_COMMON_PASSWORD=Scient@123
CORS_ORIGINS=            # optional comma-separated extra origins
```
