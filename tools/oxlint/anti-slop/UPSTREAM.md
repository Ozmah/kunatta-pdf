# anti-slop (vendored)

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9` (2026-10-13), copied from the Sýn repository on 2026-10-24.
- Entry point: `index.ts` (generic rules).
- Dependencies: `oxlint` and `@oxlint/plugins` pinned to the same exact version (1.89.0). They are upgraded together.

## Local deviations
- The Effect rules (`effect/`) are not included: Kunatta does not use Effect.
- `vendor/eslint-stylistic/` came with anti-slop: `require-readable-spacing` reuses ESLint Stylistic's `padding-line-between-statements`, adapted to Oxlint. No ESLint or Stylistic package is installed. Its `UPSTREAM.md` refers to the source repository: `pnpm check`, `pnpm sync:skill-assets` and the RuleTester suites (`require-readable-spacing*.test.ts`) belong there and are not part of this copy.

## Updating
Follow `skills/install-anti-slop/references/update.md` in the source repository. Do not replace this folder blindly; local changes are preserved.
