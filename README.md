# SocialSync

SocialSync is a multi-platform social publishing system built with:

- **FastAPI** for the backend API
- **PostgreSQL** for persistence
- **Redis + Celery** for background publishing and scheduling
- **Next.js** for the frontend
- **Docker Compose** for local orchestration

It supports connected social accounts, post scheduling, immediate publishing, analytics and metrics retrieval, OAuth account linking, and a WebView-friendly auth bridge for native app integration.

## Architecture

### Backend

- **FastAPI** application under `app/`
- **Alembic** migrations under `alembic/`
- **PostgreSQL** as the main database
- **Redis** for queue and transient state
- **Celery worker** for async publishing
- **Celery beat** for scheduled publishing

### Frontend

- **Next.js 15 App Router** under `frontend/`
- Responsive dashboard, posts, analytics, and settings views
- Demo login for local testing
- WebView auth handoff flow for native app embedding

## Core features

- Multi-platform account connection
  - Facebook
  - Instagram
  - LinkedIn
  - X / Twitter
  - YouTube
- Create posts for one or more platforms
- Publish now or schedule later
- Per-platform scheduling in the composer
- Media upload and reuse
- Live metrics retrieval where provider APIs support it
- User-friendly error messages with optional technical detail expansion
- WebView auth code exchange for `.NET`, Android, or other native host apps

## Repository layout

```text
SocialSync/
├── app/                         # FastAPI backend
├── alembic/                     # Database migrations
├── frontend/                    # Next.js frontend
├── tests/                       # API test suite
├── docker-compose.yml           # Local services
├── docker-entrypoint.sh         # Backend startup + migrations
├── wait-for-db.sh               # Worker/beat startup helper
├── generate_jwt.py              # Local JWT helper for testing
├── .env.example                 # Backend env template
└── DEPLOYMENT_VERCEL_NGROK.md   # Hosted frontend + local backend guide
```

## Prerequisites

You will need:

- Docker Desktop
- Node.js 18+
- Python 3.9.6 if running helper scripts outside Docker
- Git

## Local quick start

### 1. Clone

```powershell
git clone https://github.com/Koush98/SocialSync.git
cd SocialSync
git checkout master
```

### 2. Configure backend environment

Copy the backend env template:

```powershell
Copy-Item .env.example .env
```

Then update `.env` with your real values for:

- `ENCRYPTION_KEY`
- OAuth app credentials
- Cloudinary credentials
- JWT settings

For local Docker development, these values are typically:

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/socialsync
REDIS_URL=redis://redis:6379/0
BACKEND_PUBLIC_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
AUTH_REQUIRED=true
ALLOW_DEV_TENANT_HEADER=false
```

### 3. Start backend services

```powershell
docker compose up -d --build
```

This starts:

- `backend`
- `worker`
- `beat`
- `db`
- `redis`

### 4. Confirm migrations ran

```powershell
docker compose logs --tail=100 backend
```

You should see:

- `Waiting for Postgres...`
- `Running Alembic migrations...`
- `Migrations complete`

### 5. Configure frontend environment

Copy the frontend env template:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

Update `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_TENANT_ID=tenant_123
NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=snapkey_jwt
NEXT_PUBLIC_DEBUG_BEARER_TOKEN=<raw_jwt_if_using_demo_login>
```

Important:

- `NEXT_PUBLIC_DEBUG_BEARER_TOKEN` must be the **raw JWT only**
- do **not** prefix it with `Bearer `

### 6. Start frontend

```powershell
cd frontend
npm install
npm run dev
```

### 7. Open the app

- Frontend: http://localhost:3000
- Backend docs: http://localhost:8000/docs

## Local auth and testing notes

### Demo login

The frontend includes a temporary local demo login screen. It reads:

- `NEXT_PUBLIC_DEBUG_BEARER_TOKEN`

and stores the JWT under:

- `snapkey_jwt`

### Generate a local JWT

```powershell
python generate_jwt.py
```

Paste the generated token into `frontend/.env.local`.

### OAuth testing

For local testing:

- OAuth **start** routes require auth
- OAuth **callback** routes are public

This keeps normal API auth strict while allowing provider callbacks to complete correctly.

## WebView auth bridge

The native app authentication model is still bearer-token based, but the browser handoff is now safer than before.

Current flow:

1. `.NET` or Android authenticates the user natively and holds the app bearer token
2. Native host calls `POST /api/v1/auth/webview/create-code` with `Authorization: Bearer <jwt>`
3. Backend converts that authenticated context into a short-lived one-time code
4. Native host opens `/webview-auth?code=...` inside WebView
5. Frontend exchanges the code with `POST /api/v1/auth/webview/exchange`
6. Backend sets the session cookie
7. Frontend redirects into the app as an authenticated user

Important:

- the real JWT is **not** exposed directly in the WebView URL
- the one-time code is just a temporary handoff token
- direct bearer-token API auth still works for backend-to-backend or native API calls

## Posting behavior

### Publish now

- Creates the post
- Queues immediate processing
- Worker attempts provider delivery right away

### Scheduled publishing

- Each enabled platform can have its **own schedule time**
- Leaving the platform schedule blank means **publish immediately**
- Scheduled posts are persisted and later picked up by Celery and beat

## Metrics and analytics

The app can fetch live metrics for posted items where provider APIs allow it.

Examples include:

- likes
- comments
- views
- shares
- impressions

Availability depends on platform permissions and provider limitations.

## Database and migrations

### What is expected on startup

On backend container startup:

1. Postgres readiness is checked
2. Alembic migrations run automatically
3. Backend starts only after migrations complete

### Required migration files

These should exist and are used by the stack:

- `alembic.ini`
- `alembic/`
- `alembic/versions/`

### Verify tables

```powershell
docker compose exec db psql -U postgres -d socialsync -c "\dt"
```

### Reset local app data

```powershell
docker exec -it socialsync_db psql -U postgres -d socialsync -c "TRUNCATE TABLE post_media, scheduled_posts, media_assets, social_accounts RESTART IDENTITY CASCADE;"
docker exec -it socialsync_redis redis-cli FLUSHALL
```

## Deployment

For the practical hosted-frontend test setup, use:

- [DEPLOYMENT_VERCEL_NGROK.md](/D:/SocialSyncV1/DEPLOYMENT_VERCEL_NGROK.md)

Important limitation:

- frontend auto redeploys on GitHub push through Vercel
- backend does **not** auto redeploy through ngrok because it still runs on your own machine

## Troubleshooting

### Frontend works locally but hosted frontend cannot reach backend

Check:

- `NEXT_PUBLIC_API_BASE_URL`
- `BACKEND_PUBLIC_URL`
- `FRONTEND_URL`
- `ADDITIONAL_CORS_ORIGINS`

### Social connect returns auth errors

Check:

- stored frontend JWT is valid
- token is raw JWT, not `Bearer <token>`
- OAuth callback URLs match the current backend public URL

### WebView auth succeeds but session does not stick

Make sure:

- frontend and backend hosts are configured correctly
- cookie settings match your environment
- cross-site testing uses:
  - `SESSION_COOKIE_SECURE=true`
  - `SESSION_COOKIE_SAMESITE=none`

### Scheduled posts fire at the wrong time

The frontend converts local datetime selection to UTC before sending to the backend.

If old posts were created before that fix, edit and resave them.

## Project docs

Use these two documents as the main handoff set:

- [README.md](/D:/SocialSyncV1/README.md)
- [DEPLOYMENT_VERCEL_NGROK.md](/D:/SocialSyncV1/DEPLOYMENT_VERCEL_NGROK.md)

## Current status

The current repo supports:

- strict bearer auth for APIs
- public OAuth callbacks
- WebView auth handoff
- automatic Alembic migration execution in Docker startup
- mobile-responsive frontend shell
- per-platform scheduling in the composer
- simplified user-facing errors with expandable logs

## License

Internal project / SocialSync workspace.
