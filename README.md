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
- **Student:** `DEMO0003` / `Scient@123` (all seeded hall tickets use this password)
- **Demo class:** `3-1`, branch `CSE-A`, academic year `2025-2026`

## Verify the API

With the backend running:

```bash
cd backend
npm run test:api
```

The smoke test covers authentication, student management CRUD, feedback submission for both
rounds, reports, faculty/subject/timetable CRUD, and CORS.

## Environment variables

### Backend (`backend/.env`)

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/feedbackSystem
JWT_SECRET=change-me
STUDENT_COMMON_PASSWORD=Scient@123
```
