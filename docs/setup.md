# Phase 1 setup and contribution guide

## Current phase

Phase 2 includes an installable React/Vite dashboard shell under `frontend/`. It uses local simulated scenario data only; it does not call a backend or live weather service.

## What you need now

- Git for version control.
- A code editor such as VS Code.

For Phase 2, install Node.js 20 or newer. Python, PostgreSQL, and backend/ML dependencies will be introduced only in their corresponding phases.

## Run the dashboard

```powershell
Set-Location frontend
npm install
npm run dev
```

Use `npm run build` for a production build and `npm run lint` for static checks.

## First-time Git setup

```powershell
git status
git add .
git commit -m "chore: initialize FlashGuard project foundation"
```

Before committing, confirm that the five reference files are present and unchanged.

## Environment variables

When a later phase requires configuration:

```powershell
Copy-Item .env.example .env
```

Keep `.env` local. It is ignored by Git. Never add API keys, database passwords, or tokens to source files or frontend code.

## Team conventions

- Branch from `main` using a focused name, for example `feat/dashboard-shell`.
- Keep a pull request limited to one feature or fix.
- Update relevant documentation when an API, data contract, or model decision changes.
- Do not commit generated datasets, trained model files, secrets, or `node_modules`.
- Do not modify the supplied PDF/JPEG reference materials.

## Phase 1 verification

```powershell
git status
Get-ChildItem -Recurse -Force
```

At this phase, `git status` should show the new scaffold files and retain the existing reference material.
