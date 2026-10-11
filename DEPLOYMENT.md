# MoyaStudia test deployment

This document describes the first external test deployment. It is intentionally private and keeps local development independent.

## Topology

Browser -> Vercel Next.js -> `/api/*` rewrite -> persistent FastAPI host -> isolated Neon PostgreSQL.

The browser never calls the FastAPI hostname directly in production. Authentication and OAuth cookies therefore remain first-party on the Vercel hostname.

## Vercel (apps/web)

Set the Vercel project root to `apps/web`.

Build command:

```
npm run build:deployment
```

Production environment:

```
NEXT_PUBLIC_API_URL=/api
API_UPSTREAM_URL=https://YOUR-FASTAPI-HOST
```

Do not put Google credentials, database URLs, Fernet keys, AI keys, or other secrets in any `NEXT_PUBLIC_*` variable.

## FastAPI host (apps/api)

The first test deployment requires a host that keeps one Python process running continuously. Serverless request-only execution is not suitable for the current in-process realtime statistics collector.

Install:

```
python -m pip install -r requirements.txt
```

Before starting a new application version, run migrations once:

```
python -m alembic upgrade head
```

Run one worker for the first test deployment:

```
python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

Production environment:

```
APP_ENV=production
FRONTEND_ORIGIN=https://YOUR-VERCEL-SITE
DATABASE_URL=postgresql://...TEST_DATABASE...?sslmode=require
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_IDENTITY_REDIRECT_URI=https://YOUR-VERCEL-SITE/api/auth/google/callback
GOOGLE_YOUTUBE_REDIRECT_URI=https://YOUR-VERCEL-SITE/api/auth/youtube/callback
TOKEN_ENCRYPTION_KEY=...
SESSION_COOKIE_SAMESITE=lax
DEPLOYMENT_ACCESS_MODE=private_test
ALLOWED_LOGIN_EMAILS=YOUR_GOOGLE_EMAIL
PROVIDER_TIMEOUT_SECONDS=15
PROVIDER_READ_RETRIES=2
REALTIME_COLLECTOR_ENABLED=true
```

Run the production configuration check before exposing the service:

```
python -m app.preflight
```

The API startup performs the same security validation and fails closed on an unsafe production configuration.

## Database isolation

Use a separate Neon test database/branch for the external deployment. Do not point the first internet deployment at the database used by local development.

Apply Alembic migrations to the test database before starting the API. A fresh test database means Google/YouTube connections must be connected again; do not copy encrypted OAuth tokens unless the same Fernet key and an intentional migration plan are used.

## Google OAuth

In the Google Cloud OAuth client, add exactly these production redirect URIs for the deployed Vercel hostname:

```
https://YOUR-VERCEL-SITE/api/auth/google/callback
https://YOUR-VERCEL-SITE/api/auth/youtube/callback
```

Keep the existing localhost redirect URIs for local development.

For the private test, keep `DEPLOYMENT_ACCESS_MODE=private_test`. Only verified Google emails listed in `ALLOWED_LOGIN_EMAILS` may create a production session.

## Realtime statistics

The current collector is an in-process background thread. For this private test it is supported only with one persistent API process and `REALTIME_COLLECTOR_ENABLED=true`.

Do not enable the collector on multiple API replicas. Before horizontal scaling or public launch, move collection to a dedicated scheduled worker/leader mechanism and move process-local rate limiting to shared infrastructure.

## Release checklist

1. Create the isolated Neon test database.
2. Configure FastAPI secrets and production variables.
3. Run `python -m app.preflight`.
4. Run `python -m alembic upgrade head` against the test database.
5. Start exactly one persistent API worker and verify its `/health` endpoint.
6. Configure Vercel with `NEXT_PUBLIC_API_URL=/api` and `API_UPSTREAM_URL`.
7. Add the Vercel callback URLs to Google Cloud.
8. Deploy Vercel.
9. Verify anonymous access, allowed/disallowed Google login, YouTube reconnect, Write Mode OFF by default, one safe write, Statistics collection with the browser closed, and mobile Safari/Chrome.
10. Keep local development pointed at its existing local environment.
