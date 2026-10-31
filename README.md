# Kunatta PDF

From the Old Norse word _kunnátta_ ("knowledge"). It's a simple tool for when you just need it done.

Drop, pick or paste photos, documents and PDFs, and get a single PDF back. Everything runs in the browser: files are read, converted and assembled on the device and never uploaded.

Live at [pdf.kunatta.tools](https://pdf.kunatta.tools), in Spanish and English.

## Features

**Input**

| Kind   | Formats                                    |
| ------ | ------------------------------------------ |
| Images | JPEG, PNG, WebP                            |
| Office | DOCX, XLSX, PPTX and 97–2003 DOC, XLS, PPT |
| PDF    | PDF, including password-protected ones     |
| Text   | Plain text                                 |

Files are recognized by their content, not their extension. Limits per tab: 100 files, 50 MiB each and 200 MiB in total.

**Paths**

- **One file**: converted and downloaded right away.
- **One PDF**: shows what the settings will change and asks before making it.
- **Several files, or a paste**: an ordered list. Rows can be reordered by dragging or with the keyboard (Space, ↑ ↓, Esc), pinned in place, unlocked with their password, or removed, and are turned into one PDF.

**Settings**

Page size (Letter, A4 or the original), quality (light, normal, max), the PDF name and an optional password for the result. Size, quality and whether to protect the PDF are remembered on the device; the name and passwords never are.

## Stack

- [Astro](https://astro.build) static site, no UI framework: each part of the tool is a custom element that owns its markup.
- PDF work runs in a module Web Worker with [`@libpdf/core`](https://www.npmjs.com/package/@libpdf/core); Office documents are rendered with [`reamkit`](https://www.npmjs.com/package/reamkit) using bundled metric-compatible fonts (Arimo, Tinos, Cousine, Carlito, Caladea).
- Expected failures are [`better-result`](https://www.npmjs.com/package/better-result) values; worker messages are validated with [`valibot`](https://valibot.dev).
- Tooling: Bun, oxlint, oxfmt, `bun test` and Playwright.

## Development

Requires [Bun](https://bun.sh) 1.4.4 and Node.js 24.

```sh
bun install
bun run dev           # dev server
bun run check         # format, lint, typecheck, build and unit tests
bun run e2e           # end-to-end tests: Chromium, Firefox and a phone
bun run visual        # screenshot comparison inside the Playwright Docker image
```

The pre-commit hook runs `bun run check`. See [AGENTS.md](AGENTS.md) for the project rules.

## License

[MIT](LICENSE) © Gabriel Alejandro Alegría Robles (Ozmah).

Fonts are under the SIL Open Font License 1.1: Inter, Paper Mono and the Office substitutes in `public/fonts/office/`. Test fixtures in `tests/fixtures/office/` come from Apache POI under the Apache License 2.0.
