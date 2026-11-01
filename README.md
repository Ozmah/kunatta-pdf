# Kunatta PDF

From the Old Norse word _kunnátta_ ("knowledge"). It's a simple tool for when you just need it done.

Drop, pick or paste photos, documents and PDFs and get one PDF back. The browser reads, converts and assembles the files on your device, and nothing is uploaded.

It runs at [pdf.kunatta.tools](https://pdf.kunatta.tools) in Spanish and English.

## Features

### Input

| Kind   | Formats                                                    |
| ------ | ---------------------------------------------------------- |
| Images | JPEG, PNG, WebP                                            |
| Office | DOCX, XLSX, PPTX, and DOC, XLS, PPT from Office 97 to 2003 |
| PDF    | PDF, including password-protected ones                     |
| Text   | Plain text                                                 |

Kunatta reads the bytes of each file to tell what it is, so a file with the wrong extension is still recognized. A tab accepts up to 100 files, 50 MiB per file and 200 MiB in total.

### How it works

One file that isn't a PDF is converted and downloaded right away.

A single PDF opens a dialog that shows what the settings will change, and asks before making the new one.

Several files, or anything pasted, go into a list. You can reorder the rows by dragging them or with the keyboard (Space to take and drop, ↑ ↓ to move, Esc to cancel), pin them in place, unlock protected PDFs with their password, or remove them. Then the whole list becomes one PDF.

### Settings

You can choose the page size (Letter, A4 or original), the quality (light, normal or max), the PDF name and a password for the result. The device remembers the size, the quality and whether to protect the PDF. It never stores the name or any password.

## Privacy

Production builds send anonymous usage stats to PostHog: page views, how many files were added and of what kind, whether the PDF was made or failed and with which settings, Web Vitals, browser, device type and the referring domain. Counts, sizes and times go out as ranges, and every event is rebuilt from an allowlist in `src/lib/analytics/` before it leaves. File names, file contents, the PDF name and passwords are never sent, nothing is stored on the device, and Do Not Track or Global Privacy Control turns it off. The `/privacy/` page lists the same in both languages. Preview builds ship no analytics at all.

## Stack

- Static [Astro](https://astro.build) site with no UI framework. Each part of the tool is a custom element that owns its markup.
- A module Web Worker does the PDF work with [`@libpdf/core`](https://www.npmjs.com/package/@libpdf/core). [`reamkit`](https://www.npmjs.com/package/reamkit) renders Office documents with bundled metric-compatible fonts (Arimo, Tinos, Cousine, Carlito and Caladea).
- Expected failures are returned as [`better-result`](https://www.npmjs.com/package/better-result) values, and [`valibot`](https://valibot.dev) validates every message between the page and the worker.
- Bun, oxlint, oxfmt, `bun test` and Playwright for tooling.

## Development

You need [Bun](https://bun.sh) 1.4.4 and Node.js 24.

```sh
bun install
bun run dev           # dev server
bun run check         # format, lint, typecheck, build and unit tests
bun run e2e           # end-to-end tests: Chromium, Firefox and a phone
bun run visual        # screenshot comparison inside the Playwright Docker image
```

The pre-commit hook runs `bun run check`. The project rules are in [AGENTS.md](AGENTS.md).

## Deployment

The `Dockerfile` builds the site with Bun and serves it with Caddy as an unprivileged user; the final image has no Node, Bun or source. Railway builds it from `railway.toml` and checks `/health`.

`APP_ENV` decides two things. At build time, only `production` with a `PUBLIC_POSTHOG_KEY` ships analytics. At run time, it picks the Caddy rules in `deploy/caddy/`: preview answers with `noindex`, `no-store` and a robots.txt that disallows everything. Anything but `production` is a preview.

`deploy/Caddyfile` sets the Content-Security-Policy, which only lets scripts and connections reach the site itself and PostHog. It also serves the not-found page in the language of the path and precompressed files.

```sh
docker build --build-arg APP_ENV=preview -t kunatta:preview .
sh deploy/smoke.sh kunatta:preview preview         # runs the image and checks it
sh deploy/verify.sh https://pdf.kunatta.tools production   # checks a live deployment
```

## License

[MIT](LICENSE) © Gabriel Alegría (Ozmah).

Inter, Paper Mono and the Office substitute fonts in `public/fonts/office/` are under the SIL Open Font License 1.1. The test fixtures in `tests/fixtures/office/` come from Apache POI under the Apache License 2.0.
