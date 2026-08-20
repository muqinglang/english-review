# Connect Vercel → GitHub auto-deploy (runbook)

Goal: make every merge to `main` on GitHub automatically deploy to Vercel
production, replacing the current manual `vercel --prod` CLI flow.

This is written so an agent (Codex) can execute it. Steps marked **[browser]**
need a one-time human OAuth click; everything else is CLI/API and scriptable.

---

## 0. Facts about this project (do not guess these)

| Thing | Value |
|---|---|
| Git repo | `https://github.com/muqinglang/english-review` |
| Vercel account/owner | `langli0728-4775` (team `team_Unr4UO1XnoFbFRXfJ7s6fTYQ`) |
| Vercel project name | `english-review` |
| Vercel projectId | `prj_obA9ICmI7CsRGY3mqkvIeERdNQwO` |
| Production domain | `english-review-three.vercel.app` |
| Framework | Next.js 16 (App Router) |
| **App location** | **`web/` subdirectory** (Next app is at `web/`, pages at `web/src/app`) |
| Current Root Directory setting | `null` ← **THIS IS THE BUG to fix** |
| Production branch | `main` |

**The critical gotcha:** the Vercel project's *Root Directory* is currently
empty, so a build runs from the repo root and fails with
`Couldn't find any 'pages' or 'app' directory`. Manual CLI deploys only work
because they are run from inside `web/`. For **GitHub auto-deploy to work, Root
Directory MUST be set to `web`.** If you connect Git without this, every push
will fail to build.

---

## 1. Prerequisites

- Vercel CLI logged in as the owning account:
  ```bash
  npx vercel whoami        # must print: langli0728-4775
  # if not: npx vercel login
  ```
- A Vercel access token for API calls (create at
  https://vercel.com/account/tokens):
  ```bash
  export VERCEL_TOKEN=xxxxxxxx
  export VERCEL_TEAM=team_Unr4UO1XnoFbFRXfJ7s6fTYQ
  export VERCEL_PROJECT=prj_obA9ICmI7CsRGY3mqkvIeERdNQwO
  ```

---

## 2. Set Root Directory to `web` (do this FIRST, before connecting Git)

### Option A — Vercel REST API (scriptable, preferred)
```bash
curl -X PATCH \
  "https://api.vercel.com/v9/projects/$VERCEL_PROJECT?teamId=$VERCEL_TEAM" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory":"web"}'
```
Verify:
```bash
curl -s "https://api.vercel.com/v9/projects/$VERCEL_PROJECT?teamId=$VERCEL_TEAM" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | grep -o '"rootDirectory":"[^"]*"'
# expect: "rootDirectory":"web"
```

### Option B — Dashboard **[browser]**
Vercel → project `english-review` → **Settings → General → Root Directory** →
enter `web` → Save.

> Note: `next build` auto-detects `src/app`, so Root Directory = `web` is
> sufficient. Do NOT set `web/src`. Leave Build/Install/Output commands empty
> (framework defaults are correct). Node version is already `24.x`.

---

## 3. Connect the GitHub repository

### Option A — Vercel CLI (scriptable)
```bash
# run from the linked dir (repo root or web/, both are linked to this project)
npx vercel git connect https://github.com/muqinglang/english-review
```
This connects the repo to the project. It requires the Vercel account to have a
GitHub Login Connection with access to `muqinglang/english-review`. If it errors
with a permissions/authorization message, do Option B once, then this works.

### Option B — Dashboard **[browser, one-time OAuth]**
Vercel → project → **Settings → Git → Connected Git Repository** → click
**GitHub** → authorize the Vercel GitHub App for the `muqinglang` account →
select `english-review`.

After connecting, confirm the **Production Branch** is `main`
(Settings → Git → Production Branch).

---

## 4. Environment variables (already set — just confirm)

Production already runs, so the project env vars are present in Vercel and are
shared by Git deploys — nothing to migrate. Confirm the key ones exist:
```bash
npx vercel env ls production
# expect at least: INTEGRATION_SECRET_KEY (or WORKER_TOKEN_PEPPER),
# NEXT_PUBLIC_SUPABASE_URL, SUPABASE service/anon keys, etc.
```
DeepSeek needs NO new env var (keys are entered per-user in Settings and stored
encrypted with the existing `INTEGRATION_SECRET_KEY`).

---

## 5. Trigger and verify the first auto-deploy

```bash
# make a trivial no-op commit on main to trigger a build (or just merge any PR)
git checkout main && git pull
git commit --allow-empty -m "chore: verify Vercel GitHub auto-deploy"
git push origin main
```
Then verify:
```bash
# a new deployment should appear, sourced from the git commit
npx vercel ls english-review | head

# production should stay 200 and the DeepSeek route should exist (401 = present)
curl -s -o /dev/null -w "%{http_code}\n" https://english-review-three.vercel.app/api/health           # 200
curl -s -o /dev/null -w "%{http_code}\n" https://english-review-three.vercel.app/api/integrations/deepseek # 401
```
In the Vercel dashboard, the new production deployment's **Source** should now
show a GitHub commit + branch (not a CLI upload), and
**Settings → Git** should show the connected repo. The
"Connect Git Repository" item in the Production Checklist should be checked.

---

## 6. Rollback / safety

- Every deploy is immutable; use **Instant Rollback** in the dashboard to revert.
- If a Git build fails with `Couldn't find any 'pages' or 'app' directory`,
  Root Directory (step 2) did not stick — re-apply it.
- The manual escape hatch still works anytime: `cd web && npx vercel --prod`.

---

## Definition of done
- [ ] `rootDirectory` == `web` (verified via API in step 2)
- [ ] GitHub repo connected, Production Branch == `main`
- [ ] A push to `main` produced a Git-sourced production deployment that reached `READY`
- [ ] `https://english-review-three.vercel.app/api/health` returns 200
