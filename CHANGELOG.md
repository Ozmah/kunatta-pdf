# Changelog

## Unreleased

- Dropping or picking one file that is not a PDF converts it right away and downloads the PDF, named after the file; the page shows converting, done (with download again) or why it failed (with try again), and lists files that were not accepted.
- A notice explains when an old Word, Excel or PowerPoint file or a text file may look different in the PDF.
- Converted files are joined in list order into one PDF: Letter and A4 fit every page on a sheet that follows its orientation, Original keeps pages as they are, and an optional password encrypts the result with AES-256.
- Photos, screenshots and scans (JPEG, PNG, WebP) become PDF pages turned upright by their orientation and reduced by the chosen quality; every image is re-encoded, so its metadata, including GPS location, never reaches the PDF.
- Plain text files are laid out on Letter or A4 pages with 2 cm margins, and protected PDFs open with their password and come out without it.
- Conversions run in a background worker so the page stays responsive; if the worker crashes only that file is reported and the next one starts on a fresh worker, and cancelling stops the running and queued files.
- Word, Excel and PowerPoint files (DOC, DOCX, XLS, XLSX, PPT, PPTX) are accepted in the drop zone and the file picker, recognized by their content even when renamed; GIF, AVIF and OpenDocument files are rejected.
- Word, Excel and PowerPoint files, including the 97–2003 formats, convert to PDF inside the browser; missing fonts are replaced by metric-compatible open fonts served from the site itself.
- A floating gear opens the PDF settings (page size and quality) with a press-and-spin animation; keyboard toggles and Escape are instant, reduced motion keeps only color and opacity changes.
- Files can be dropped, pasted or picked into the drop zone; each one is identified by its content (not its name) and empty, oversized or unsupported files are rejected with a reason.
- The site is available in Spanish (/es/) and English (/en/), with localized titles, descriptions and footer, plus hreflang links for search engines.
- Pages share one dark layout with the Kunatta logo and self-hosted Inter and Paper Mono fonts; no request leaves the site's origin.
