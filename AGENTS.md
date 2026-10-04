# MoyaStudia — Agent Instructions

## 1. Project role

MoyaStudia is a SaaS project for managing YouTube content and connected YouTube channels.

The repository contains separate frontend and backend applications.

Current development priority is controlled, incremental development of the existing project. Do not introduce large architectural changes unless the task explicitly requires them.

---

## 2. General working rules

Before changing anything:

1. Inspect the relevant existing code.
2. Identify related files, dependencies, routes, data flow, and configuration.
3. Understand the existing implementation before proposing changes.
4. Create a concise implementation plan.
5. Make only the changes required by the current task.

Do not modify unrelated code.

Do not perform opportunistic refactoring.

Do not rewrite working code merely because another implementation appears preferable.

Preserve existing functionality unless the task explicitly requires changing it.

---

## 3. Scope control

Every task has a defined scope.

If you discover:

- security issues,
- architecture problems,
- technical debt,
- missing tests,
- unrelated bugs,
- possible improvements,

do not automatically fix them.

Report them separately under:

"Discovered but out of scope".

Only fix them if the user explicitly includes them in the current task.

---

## 4. Git rules

The agent MUST NOT perform any of the following unless the user explicitly instructs it to do so:

- git commit
- git push
- git reset
- git clean
- git checkout when it changes working-tree state
- git restore
- git rebase
- git merge
- force push
- deletion of branches
- modification of Git configuration

The user controls commits and repository history.

The agent may use read-only Git commands such as:

- git status
- git diff
- git log
- git branch
- git remote -v
- git show
- git ls-files

Before finishing a coding task, report the Git-relevant files that were changed.

Never assume that a change should be committed.

---

## 5. Files and secrets

Do not read or expose the contents of:

- .env
- .env.local
- .env.production
- credential files
- private keys
- API tokens
- OAuth secrets
- passwords
- database credentials

Use .env.example or configuration documentation when possible.

Never place secrets into source code.

Never create or modify secrets unless explicitly instructed.

Do not commit secrets.

---

## 6. Dependencies

Do not install, remove, upgrade, or downgrade npm, Python, or other dependencies unless the current task explicitly requires it.

If a new dependency appears necessary:

1. Explain why it is needed.
2. Identify what it changes.
3. Ask for approval before adding it.

Do not perform dependency upgrades as part of unrelated tasks.

---

## 7. Architecture

Respect the existing separation between:

- frontend: apps/web
- backend: apps/api

Do not move files between frontend and backend or introduce a new application layer without explicit approval.

Prefer the smallest change that correctly solves the requested problem.

Do not introduce a new framework, database, authentication system, state-management library, or architectural pattern without explicit approval.

---

## 8. Frontend

Current frontend is based on Next.js and React.

Before changing frontend behavior:

- inspect existing components and data flow;
- preserve existing UI behavior unless the task changes it;
- reuse existing components and utilities where appropriate;
- avoid duplicating existing functionality;
- keep frontend changes limited to the requested scope.

---

## 9. Backend

Current backend is based on FastAPI.

Before changing backend behavior:

- inspect existing routes;
- inspect models and database access;
- inspect YouTube integration;
- understand existing error handling;
- preserve existing API behavior unless the task explicitly changes it.

Do not redesign authentication, OAuth, database architecture, or API contracts as an incidental part of another task.

---

## 10. YouTube integration

Treat YouTube API behavior and OAuth as security-sensitive.

Do not change OAuth scopes, token handling, callback behavior, or authorization logic unless explicitly required by the task.

Do not expose OAuth credentials or tokens.

Do not make write operations against YouTube unless explicitly required and approved.

---

## 11. Validation

After making changes:

1. Inspect the final diff.
2. Check for accidental unrelated modifications.
3. Run appropriate existing validation commands when available.
4. Prefer targeted checks first.
5. Do not invent tests or commands that do not match the project.
6. Report which checks were actually executed and their results.

If a check cannot be run, state that explicitly.

Never claim that something was tested if it was not tested.

---

## 12. Completion report

At the end of every implementation task provide:

### Changed
List every changed or created file.

### What changed
Briefly describe the implementation.

### Validation
List commands/checks actually executed and their results.

### Out of scope
List important issues discovered but intentionally not changed.

### Remaining risks
Mention anything that still requires attention.

Do not create a Git commit.

---

## 13. Communication

If the task is ambiguous and different interpretations would materially change the implementation, ask before making the change.

If the requested implementation conflicts with the existing architecture, explain the conflict before proceeding.

Do not silently make architectural decisions on behalf of the user.

When there are several technically valid approaches, briefly describe the alternatives and identify the consequences rather than silently choosing a major architectural direction.

---

## 14. Core principle

Make the smallest correct change required by the current task.

Do not expand the task.

Do not make unrelated improvements.

Do not modify Git history.

The user makes final decisions about architecture, scope, and commits.

## Local development

Frontend:
- directory: `apps/web`
- command: `npm run dev`
- port: `3000`
- readiness: `GET http://localhost:3000/` must return HTTP 200 with a non-empty page and successful responses from referenced `/_next/` JavaScript files.

Backend:
- directory: `apps/api`
- command: `\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- port: `8000`
- readiness: `GET http://127.0.0.1:8000/health`
- the backend is healthy only when the response is HTTP 200 and both `ok` and `db` are `true`.

Before browser or UI tasks, follow this recovery sequence:

1. Run `dev-status.ps1` and inspect each service's readiness, launcher PID, runtime/listener PID, ownership, and port state.
2. If services are ready and their listeners belong to the registered MoyaStudia process trees, reuse them and go to Playwright.
3. If a service is stopped, has no live recorded process, and its port is free, run `dev-start.ps1`.
4. If a service is unhealthy but its live process/listener belongs to its verified registered process tree, run `dev-stop.ps1`, verify the port is free with `dev-status.ps1`, then run `dev-start.ps1` and wait for readiness. This routine project-owned recovery is autonomous; do not ask the user.
5. If the required port is occupied by an unrelated or unverified process, stop and report its PID, command line, and port. Do not terminate it.
6. Open Playwright only after required services pass readiness.

If `dev-status.ps1` reports `ownership=unverified` because CIM returned Access denied, this is not evidence that the listener is unrelated. Retry the read-only PID, command-line, and ancestry ownership inspection through the environment's standard elevated/approval command execution mechanism. After approval, rerun `dev-status.ps1` with the same approved execution mechanism. Continue autonomous recovery only when ownership is proven `managed`; if proven `unrelated`, report its PID, port, and command line without stopping it. If elevated inspection is unavailable or approval is declined, report ownership as unverified and leave all processes untouched. Never ask the user to run manual PowerShell inspection commands when Codex can request standard command approval itself.

Safe recovery of project-owned dev processes is autonomous. Unknown-process termination requires user intervention.

Rules:
- `dev-start.ps1` leaves healthy services running and starts only missing services whose ports are free. It never kills an occupied port's process.
- `dev-stop.ps1` may stop only a launcher whose PID, command line, executable, and process start time match the project registration; it may stop only descendants proven through that launcher's process tree.
- Never use a global `taskkill` for `node.exe` or `python.exe`, or `Stop-Process` on unknown PIDs.
- Never kill all processes on ports 3000/8000 without proving ownership; never remove metadata to bypass ownership checks.
- If runtime ownership cannot be proven (including Access denied, PID reuse, or a detached orphan), report ownership as `unverified` with the reason and stop before termination. Report `unrelated` only when process inspection succeeded and the process was proven outside the registered MoyaStudia tree.
- Do not run `npm ci` automatically.
- Do not modify `.env` files or print secrets.
- Use Playwright only after the relevant services pass readiness checks.

## Browser QA

Use Playwright MCP for browser/UI QA.

- Base URL: `http://localhost:3000`.
- Use the existing persistent Playwright profile.
- Do not perform Google login yourself.
- Do not enter logins, passwords, 2FA codes, cookies, or tokens.
- A saved user session may be used for QA.
- Do not change real user data without an explicit task.
- Check desktop and responsive layouts when the task concerns UI.
- After UI changes, perform browser QA if the application is available.
- After automatic browser QA through Playwright MCP, close the page, browser, or context created for the check before the final report, unless the user explicitly asked to leave the browser open for manual interaction. Keep using the existing persistent Playwright profile across QA sessions.
- After QA, keep the dev servers running for later tasks. Do not run `dev-stop.ps1` only because QA finished.

### Next.js development runtime recovery

Frontend readiness must confirm an HTTP 200 page with a non-empty body and successful HTTP responses from referenced `/_next/` JavaScript files. Playwright remains the final check of the rendered UI and browser console/network.

Do not delete `.next` on every start. If Next.js runtime evidence points to stale or damaged generated output (for example, page-referenced client chunks return 404), first stop the verified frontend process tree with `dev-stop.ps1` and inspect the failure. Only then, if clearing Next.js generated output is needed, remove `apps/web/.next` alone, document why, and restart. Never remove unrelated files or data.

## Git safety

- Do not commit or push without the user's explicit instruction.
- Before finishing a task, report changed files and validation results.
- Do not add local browser profiles, cookies, sessions, or QA screenshots to Git.
