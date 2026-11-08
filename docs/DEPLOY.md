# Deploy (M11)

GenAI.learn is a static build published to GitHub Pages by `.github/workflows/deploy.yml`. The site will be at
`https://<user>.github.io/<repo>/`, for example `https://<user>.github.io/ai-learn/`.

## How it works

- **Trigger:** every push to `main`, or a manual run from Actions → Deploy to GitHub Pages → Run workflow.
- **Gates:** `npm ci` → `npm run validate` → `npm test` → `npm run build` (the build includes `tsc -b`). If any step
  fails, nothing is published. The separate CI workflow also runs lint and the bundle-size check on every push and PR.
- **Sub-path safe:**
  - `base: './'` makes every asset URL relative.
  - Routes are hash routes (`#/topic/…`), so deep links and refreshes never reach the server and need no `404.html`.
  - `project-results.json` is fetched through `import.meta.env.BASE_URL`.
- **Security:** the built `index.html` carries the Content-Security-Policy `<meta>` (see `docs/SECURITY-CHECK.md`).
  Actions are pinned to SHAs.
- **Data:** nothing is stored on the server. Each learner's progress lives in their own browser (`localStorage`) and
  moves only through Export / Import.

## One-time setup (repo owner)

1. **Clean the remote first.**
   - Revoke the old tokens that were embedded in the remote URL.
   - Set the remote to `https://github.com/<user>/<repo>.git`, or the SSH form.
   - Check it with `git remote -v`.
2. **Point Pages at Actions:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Turn on GitHub's protections:**
   - Settings → Advanced Security (under "Security and quality"; free for public repos): **Dependabot alerts**, **secret scanning**, **push protection**.
   - Settings → Branches: protect `main` and require the **CI** check.
4. Commit the work on `feature/prompt-lab`, open a PR into `main`, let CI pass, then merge. The merge triggers the
   deploy.

## Release checklist

Run it on the live URL in a **fresh browser profile** (or a private window) after each deploy that changes behaviour.

| # | Check | Expect |
|---|---|---|
| 1 | Open `https://<user>.github.io/<repo>/` | Today loads; the boot splash fades; no console errors |
| 2 | Open a deep link directly, e.g. `…/#/topic/rag-fundamentals?tab=learn`, and refresh | The topic opens and survives the refresh |
| 3 | Answer a section's quick check, press **Save** on the topic | Saved shows it |
| 4 | Settings → Study lock **Off**, then take the topic's exam and submit | A score and a "where you lost marks" review |
| 5 | Prompt Lab tab: edit the prompt | The score updates as you type |
| 6 | Shorts → open one, step through, answer the quiz | The end card; the Short is marked watched |
| 7 | Plan → **Start this plan** | The training-run chart appears |
| 8 | A drill (`#/drills/bm25`) → **Run tests** | "0 of 12 tests pass" with reasons (the worker runs under the CSP) |
| 9 | Settings → **Export backup** | A `.json` file downloads |
| 10 | In **another browser**: Settings → Import backup… → that file → **Merge** | Exam score, Saved, Plan, Short and lab draft appear |
| 11 | DevTools console on a few pages | No CSP violations, no errors |

### Pre-release run (2026-11-08, local)

- **Setup:** the production build served under `/ai-learn/` (a static server, as GitHub Pages does), in two clean
  Chrome profiles.
- **Results:** checks 1–11 passed.
  - The deep link loaded directly.
  - The exam was recorded.
  - Saving, the Prompt Lab draft, Start this plan, the Short and its quiz all worked.
  - The drill ran under the CSP.
  - Export gave about 5 KB of JSON; Import → Merge in the second profile restored all of it.
  - 0 CSP violations and 0 page errors.
- **Not covered:** the live github.io URL, which doesn't exist until you deploy. Re-run the table there.

## Rollback

The last good version is one click away, with no git surgery needed:

1. Actions → **Deploy to GitHub Pages**.
2. Open the last **successful run from before** the bad deploy.
3. **Re-run all jobs**. A re-run builds that run's original commit and publishes it.
4. Then fix forward on `main` (or `git revert` the bad commit). The next push deploys again.

The `pages` concurrency group lets one deploy finish before the next starts, so a rollback and a push never interleave.

## Known limits at launch

- **Topic loading.** Startup JS is about 325 KB gzip: the app plus a generated topic index
  (`src/content/topicIndex.gen.ts`, rebuilt by `predev` and `prebuild`; validate and the tests fail if it is stale).
  Each topic's body (20–53 KB gzip) loads when it is opened, so a first visit to a topic shows a short skeleton.
- **`localStorage` shared across project sites.** On `<user>.github.io`, all project sites share one origin. A custom
  domain would isolate it (see `docs/SECURITY-CHECK.md`).
