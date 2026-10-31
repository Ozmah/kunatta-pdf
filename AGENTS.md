# Kunatta · agent guide

## Rules

- Everything in the repository is in English: code, comments, tests, error messages, docs and commit messages. User-facing copy lives in `src/i18n/`.
- Everything runs in the browser. No server code, no third-party requests, no analytics, no CDNs.
- One chunk = one responsibility, 300 to 400 lines at most, with tests. This can vary depending on the file.
- Commit messages: one line, conventional format (`feat(pdf): …`, `chore: …`), no body.
- Every `feat` or `fix` adds its line under `## Unreleased` in `CHANGELOG.md` in the same commit. Lines describe behavior, not files.
- `bun run check` must pass before every commit: Glados (format, lint, typecheck, build) + Shodan (tests). The husky pre-commit hook runs both on the staged snapshot; CI runs them on pull requests to `develop` and `master`.
- `bun run e2e` builds the site and runs the Playwright suite in `e2e/` (Chromium, Firefox and a phone). It is too slow for the pre-commit hook; run it before pushing, CI runs it on pull requests. Every user-facing path gets an end-to-end test, with real samples and its edge cases.
- `bun run visual` compares the screenshots in `e2e/__screenshots__` inside the Playwright Docker image, so pixels match on every machine. Refactors keep them identical; an intended visual change runs `bun run visual:update` and commits the new screenshots with the change.
- Commits are made by the user. Agents propose the conventional message and never commit.
- Lint is oxlint + anti-slop (vendored in `tools/oxlint/anti-slop`). Rules are never disabled or downgraded to make lint pass; if a rule conflicts with a real need, raise it first.
- Exact versions for every dependency. Check npm before adding one.
- Expected failures are `better-result` values: `TaggedError` subclasses returned as `Result`, never thrown. Bugs and broken invariants stay as exceptions (`Panic`).
- Worker messages carry serialized Results (`{ status, value | error }`) and are validated on arrival.
- User data is never rendered with `innerHTML`. File names go through `textContent`.
- The main thread never imports `@libpdf/core`; PDF work happens in the worker.
