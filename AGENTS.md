# Kunatta · agent guide

## Source of truth

Documentation lives in doop, canvas `Kunatta` (id `-T11eyriIt`).

- Guideline `kunatta-architecture`: architecture, stack, build plan and decisions.
- Guideline `kunatta-tokens`: visual system, mirrors `src/styles/tokens.css` (palette, type, riso rules, motion).
- Page `ES` holds the source frames (designs on the first row, numbered docs `01 · Arquitectura`, `02 · Logo`, `03 · Engrane` on the second); page `EN` holds the English copies.
- Documentation panels follow `~/dev/doop-docs.md`. When code changes a documented fact, update the panel and its guideline in the same session.
  Read them before writing code. If the code and the documentation disagree, ask before choosing.

## Rules

- Everything in the repository is in English: code, comments, tests, error messages, docs and commit messages. User-facing copy lives in `src/i18n/`.
- Everything runs in the browser. No server code, no third-party requests, no analytics, no CDNs.
- One chunk = one responsibility, 300 to 400 lines at most, with tests.
- Commit messages: one line, conventional format (`feat(pdf): …`, `chore: …`), no body.
- Every `feat` or `fix` adds its line under `## Unreleased` in `CHANGELOG.md` in the same commit. Lines describe behavior, not files.
- `bun run check` must pass before every commit: Glados (format, lint, typecheck, build) + Shodan (tests). The husky pre-commit hook runs both on the staged snapshot; CI runs them on pull requests to `develop` and `master`.
- Commits are made by Ozmah. Agents propose the conventional message and never commit.
- Lint is oxlint + anti-slop (vendored in `tools/oxlint/anti-slop`). Rules are never disabled or downgraded to make lint pass; if a rule conflicts with a real need, raise it first.
- Exact versions for every dependency. Check npm before adding one.
- Expected failures are `better-result` values: `TaggedError` subclasses returned as `Result`, never thrown. Bugs and broken invariants stay as exceptions (`Panic`).
- Worker messages carry serialized Results (`{ status, value | error }`) and are validated on arrival.
- User data is never rendered with `innerHTML`. File names go through `textContent`.
- The main thread never imports `@libpdf/core`; PDF work happens in the worker.
