# Security check (M10) · 2026-11-08

GenAI.learn is a static site on GitHub Pages: no backend, no accounts, no API keys. Everything a learner does stays in
their browser's `localStorage` and moves only through Export/Import. The attack surface is small: what the page renders,
the code it runs, what it imports and the CI that builds it.

## Summary

| Area | Result |
|---|---|
| Secrets in repo, build and history | None found |
| XSS (lesson markdown, user text, imported JSON) | No untrusted input reaches raw HTML |
| Code runner (drills) | Isolated Web Worker, 3 s limit, network APIs removed; **no eval** (fixed) |
| Prompt Lab grader | Pure string checks; runs no user code |
| Dependencies | `npm audit`: 0 vulnerabilities (Vite 8.3.6, **fixed**); 1 install script (fsevents) |
| GitHub Actions | Pinned to commit SHAs, read-only token, no persisted credentials (**fixed**); Dependabot on (**added**) |
| Content Security Policy | `<meta>` CSP in the built page (**added**); 0 violations across the app |

## Findings and fixes

1. **Drill runner used `new Function` inside its worker.** A worker created from a `blob:` URL inherits the page's CSP,
   so a strict policy would have needed `'unsafe-eval'` for the whole app. Fixed: `workerSource()` in
   `src/lib/drillRunner.ts` writes the learner's compiled code and the drill's tests into the worker script itself.
   `tests/drills.test.ts` runs that exact script in node and asserts it contains no `new Function` / `eval(`.
2. **Vite 8.3.0–8.3.2 (high, dev server only).** These are advisories against the dev server and `launch-editor`, and
   none of it ships to the site. Fixed with `npm audit fix` (8.3.6).
3. **No CSP.** Added a build-only `<meta http-equiv="Content-Security-Policy">` via a small plugin in `vite.config.ts`.
   It is build-only because the dev server's inline scripts would be blocked:

   `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self';
   connect-src 'self'; worker-src blob:; object-src 'none'; base-uri 'self'; form-action 'none'`

   Checked in the production preview across the following, with no `securitypolicyviolation` events:
   - Today, a lesson, the cheat sheet tab, Prompt Lab, Shorts, Plan, Achievements, Glossary, Paths and Settings
   - a drill run
4. **Actions on floating tags.** All five actions are now pinned to full commit SHAs, with the version in a comment.
   - Checkout uses `persist-credentials: false`.
   - Workflow permissions are already minimal: `contents: read`, plus `pages`/`id-token: write` for deploy only.
   - `.github/dependabot.yml` sends weekly updates for npm (minor and patch grouped) and for Actions, which keeps the
     pins current.
5. **`.gitignore` did not cover `.env` files.** Added `.env` and `.env.*`. None exist; this is a guard.

## Checked, no change needed

- **Secrets.** Scanned the working tree, `dist/` and the full `git log -p` for GitHub, Anthropic, OpenAI, AWS, Google
  and Slack tokens and for private keys. The only hit was a font file name in CSS (`…sk-latin-wght…`), a false positive.
  No key files are tracked.
- **Rendering.**
  - Lesson markdown uses `react-markdown` without `rehype-raw`, so raw HTML is escaped and `javascript:` URLs are
    stripped by its default URL transform.
  - The two `dangerouslySetInnerHTML` uses (code highlighting in `ui.tsx` and the Prompt Lab model answer) render our
    own content through Prism or a function that escapes `& < >` first.
  - User text (drafts, notes, certificate name, imported values) is only ever rendered as React text.
- **Import** (`src/lib/backup.ts`):
  - It rejects files over 5 MB, unknown fields and wrong types.
  - It caps the number of keys and their length, and drops `__proto__` / `constructor` / `prototype` keys.
  - New C4 keys (`rolePath`, `certName`, `drills`) are validated too.
- **Network.** The app's only request is the same-origin `project-results.json`, and there are no third-party origins.
  Fonts are self-hosted through `@fontsource`. Links in lessons are ordinary navigations.
- **Drill worker.** It runs from a throwaway `blob:` URL with no DOM. `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `importScripts`, `indexedDB` and `caches` are removed before learner code runs, and the worker is
  terminated after 3 s. In a browser, an infinite loop was stopped with "Timed out after 3 s".
- **Supply chain.**
  - There are 15 runtime dependencies, all widely used (React, react-router, react-markdown/remark-gfm, Prism, motion,
    cmdk, lucide, canvas-confetti, sucrase, react-simple-code-editor, @fontsource).
  - The lockfile has only one install script, from `fsevents`, the macOS file watcher, which is optional.
  - CI uses `npm ci`.

## Accepted risks

- **`style-src 'unsafe-inline'`.** React `style` attributes, motion and the boot splash need it. Inline styles can't
  run script, so the impact is limited to CSS-based tricks on a site with no secrets to steal.
- **No `frame-ancestors` (clickjacking).** Browsers ignore it in `<meta>`, and GitHub Pages can't set headers. The
  impact is low: there are no logged-in actions, and data never leaves the device.
- **`localStorage` is readable by any script on the origin.** Holds study progress only (and an optional certificate
  name). On `<user>.github.io`, every project site shares the origin, so another of your own Pages sites could read it.
  Moving to a custom domain would isolate it.
- **The certificate is self-issued.** It is clearly labelled as such, and can't be verified by design.
- **Drill code runs on the learner's own device.** That is the point of the drills. The worker has no DOM, network or
  storage, and is time-limited.
- **Dependabot PRs still need review.** A compromised upstream release would arrive as a normal update PR.

## For you to do (not done by me)

- **Revoke the old GitHub tokens** that were embedded in this repo's remote URLs. Then set the remote to the plain
  `https://github.com/<user>/<repo>.git` or SSH form, and check with `git remote -v` yourself. I did not read or change
  the remotes.
- In the repo settings, turn on **Dependabot alerts**, **secret scanning** and **push protection**. Require the CI
  check on `main`, and keep Pages' **Source = GitHub Actions**.
