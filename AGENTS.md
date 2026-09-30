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
