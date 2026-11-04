# Deploying the hardened backend to Render

The deployed service is currently:

```
https://scient-feedback-tool.onrender.com
```

It is still running the old code. Follow these steps to replace it with the
hardened version from this repository.

## 1. Set the required environment variables

Open the Render dashboard → **scient-feedback-tool** → **Environment**.

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGO_URI` | yes | Keep the existing MongoDB Atlas connection string. |
| `JWT_SECRET` | yes | At least 16 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The app will refuse to start without it. |
| `STUDENT_COMMON_PASSWORD` | yes | Initial password for imported/created students (for example `Scient@123`). |
| `CORS_ORIGINS` | recommended | Comma-separated browser origins of the deployed frontends, e.g. `https://scient-feedback-tool-admin.onrender.com,https://scient-feedback-tool-student.onrender.com`. No trailing slashes. |
| `NODE_VERSION` | recommended | `20.20.2` (Node 20 is what the project is tested with). |

`backend/.env` is local-only and is not used by Render. Keep it out of git.

## 2. Set the service commands

In Render → **Settings**:

- **Root Directory:** `backend`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`

The root `render.yaml` in this repository describes the same configuration if
you prefer to use a Render Blueprint.

## 3. Deploy the latest commit

```bash
git add -A
git commit -m "Harden backend and add deployment checks"
git push origin main
```

If **Auto-Deploy** is enabled, Render starts building automatically. Otherwise
click **Manual Deploy → Deploy latest commit**.

Watch the build logs. The service must show:

```
🚀 Server running on port ...
✅ MongoDB connected successfully
```

If it exits immediately, check the log for:

```
❌ JWT_SECRET must be set to at least 16 characters. Refusing to start.
```

## 4. Point the deployed frontends at the new backend

For each frontend Render service (admin, student, principal), open
**Environment** and set:

```env
VITE_API_URL=https://scient-feedback-tool.onrender.com
```

Vite bakes this value in at build time, so trigger a rebuild/redeploy of each
frontend after changing it. Then add those frontend origins to the backend's
`CORS_ORIGINS` variable, comma-separated, for example:

```env
CORS_ORIGINS=https://scient-feedback-tool-admin.onrender.com,https://scient-feedback-tool-student.onrender.com,https://scient-feedback-tool-principal.onrender.com
```

Local development on `localhost` / `127.0.0.1` and all
`scient-feedback*.onrender.com` project frontends are always allowed and do not
need to be listed. Use `CORS_ORIGINS` only for custom domains.

## 5. Verify the deployment

From this repository:

```bash
cd backend
npm run verify:deployed
```

Or against a different URL:

```bash
API_BASE_URL=https://your-service.onrender.com npm run verify:deployed
```

Expected result:

```
Results: 13 passed, 0 failed
```

The check confirms:

- `/health` responds and Helmet headers are present.
- `x-powered-by` is gone.
- Anonymous admin/reporting endpoints return `401`.
- `/student-by-hallticket/:hallticket` is `404`.
- CORS allows localhost and the deployed `scient-feedback*.onrender.com` frontends, but blocks unknown origins.
- Malformed JSON is rejected without leaking internals.

## 6. Re-run the authenticated smoke test (staging only)

`npm run test:api` creates and deletes temporary students/faculty/subjects. Use
it only against a staging database, not your live production data.

```bash
cd backend
API_BASE_URL=https://your-staging-service.onrender.com \
  ADMIN_USERNAME=admin \
  ADMIN_PASSWORD='your-admin-password' \
  npm run test:api
```
