# MoyaStudia — External Test Deployment Security Gate

Status: **NOT YET APPROVED FOR PUBLIC ACCESS**. This is a private, single-instance test deployment plan. No external deployment is performed by this change.

## Planned topology

- Frontend: Vercel, `apps/web`, fixed `*.vercel.app` URL; no custom domain required for first test.
- API: separate HTTPS Python/FastAPI hosting provider, **one worker and one instance** (in-memory rate limiting is not shared).
- Database: separate managed PostgreSQL with TLS (`sslmode=require` or stronger), backed up before migrations.
- Google Cloud OAuth: **two exact HTTPS redirect URIs** pointing to the API, ending in `/auth/google/callback` and `/auth/youtube/callback`.
- No real YouTube write testing until authentication, cookies, ownership and Write Mode OFF checks pass.

## Server-side production environment (API host only)

Set `APP_ENV=production`, `FRONTEND_ORIGIN=https://<fixed-vercel-domain>`, `DATABASE_URL` (managed PostgreSQL + TLS), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_IDENTITY_REDIRECT_URI`, `GOOGLE_YOUTUBE_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` (valid Fernet key). Store actual values in the hosting secret manager, never Git or frontend env.

For the first test, set `DEPLOYMENT_ACCESS_MODE=private_test` and `ALLOWED_LOGIN_EMAILS` to a comma-separated list of your **verified Google email addresses**. Unlisted identities are rejected before creating a user/session. `DEPLOYMENT_ACCESS_MODE=public` must only be chosen during a deliberate future public launch.

Set `SESSION_COOKIE_SAMESITE=none` when Vercel frontend and API are on different sites; session cookies remain `HttpOnly; Secure` in production. OAuth state cookies remain `SameSite=Lax` for the Google top-level callback. For same-site hosting, `lax` is preferable. **Cross-site cookies can be blocked by browser privacy controls**, so Safari/iOS and Chrome login must be tested before the deployment is approved. A same-site custom domain or same-origin architecture may be required for reliable support.

Run `python -m app.preflight` from `apps/api` with production environment variables before starting the API. The API startup also refuses invalid production HTTPS origins, wrong OAuth callback paths, missing/invalid encryption key, remote DB without explicit PostgreSQL TLS, or an empty private-test allowlist. This is a configuration check, **not** a substitute for actual provider/network verification.

## Frontend deployment environment (Vercel)

- Vercel Root Directory: `apps/web`.
- Vercel Build Command: `npm run build:deployment`.
- Set `NEXT_PUBLIC_API_URL=https://<api-host>` to the exact public HTTPS API origin (no path). The deployment build rejects missing, localhost or HTTP API URLs.
- This public variable is embedded at **build time**. Redeploy when it changes.
- Enable Vercel Authentication / Deployment Protection for the external test. Verify protection using an incognito browser.
- Use a stable frontend domain for OAuth and CORS; ephemeral preview URLs require corresponding configuration and should not silently inherit production secrets.

## Operational and security checks before enabling external access

1. Confirm all repository secrets are absent from the current tree **and Git history** (use a proper secret scanner). If a secret is found, rotate it; deleting the file is insufficient.
2. Configure separate test credentials/database where feasible; record a backup and restore path.
3. Confirm Google OAuth consent/test-user settings, exact redirect URIs and required APIs/scopes. In Google OAuth Testing status, refresh tokens for non-basic scopes may expire after 7 days; plan reconnect testing. Never paste client secrets into chat or commits.
4. Confirm API host uses HTTPS, single worker/instance, health monitoring, request-size limits and restricted dashboard access. **Do not horizontally scale** while the limiter is process-local.
5. Run `alembic upgrade head` on the test database only after backup; do not point test deployment at the local/production database by accident.
6. Check `/health` returns only `{"ok": true}` when database is reachable; verify it does not expose configuration.
7. Verify anonymous API requests return 401 on protected routes, non-allowlisted Google accounts cannot sign in, and cross-origin mutation requests fail with 403.
8. Complete OAuth in Chrome and Safari/mobile; confirm session survives redirect, reload and API fetch. If third-party cookies fail, **stop** and redesign the origin topology before release.
9. With Write Mode OFF, verify every mutation is blocked server-side. Test local staging/Cancel without sending anything to YouTube. Enable real YouTube writes only in a separate explicit test.
10. Run backend pytest + pip-audit, frontend tests + i18n + lint + deployment build, and browser smoke at desktop/tablet/mobile widths.
11. Verify GitHub `main` branch ruleset and required CI checks in repository settings (connector access may not expose branch protection).
12. Check logs for token/code leaks and verify incident response: revoke Google OAuth, rotate secrets, disable hosting, restore DB backup.

## Release decision

**GO** only after every operational check above is evidenced with actual deployed URLs, provider settings, browser results, and green CI. Until then this gate is **PENDING**. The deployment must not be advertised as public.

## Known deferred hardening

- Shared Redis/edge rate limiting before multiple API workers/instances or broad public access.
- Browser E2E automation / visual regression suite; existing CI is unit/API/build coverage only.
- Nonce/hash CSP to remove `'unsafe-inline'` when compatible with Next.js.
- Stronger database certificate verification (`sslmode=verify-full`) if supported by the chosen managed provider.
