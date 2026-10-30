# Changelog

## Unreleased

- Fixed: a file turned away next to a single file that converts stays named in the notice, alongside any note about the conversion, instead of vanishing when the PDF downloads.
- An ES · EN switch at the top right opens the page in the other language; with files in the list or a conversion running, it first warns that the page reloads and that work is lost.
- Ajustes has a PDF name field for single files; it shares its value with the name next to Make my PDF, and a .pdf typed by hand is not doubled.
- Fixed: hovering a pinned row's pin button no longer turns its icon light on the lime background.
- Rows can be reordered by dragging the grip (the type tile on phones): the row follows the pointer, pinned rows stay put, the list scrolls near the screen edges, and Esc or dropping outside the list puts it back.
- Rows can be reordered with the keyboard: Space on the grip takes the row, ↑ ↓ move it, Space drops it and Esc cancels; each step is announced to screen readers.
- Fixed: on phones the page no longer scrolls sideways.
- Several files, or anything pasted, open an ordered list: each row shows its state (checking, has a problem, needs password with the field in the row), can be pinned, moved with ↑ ↓ or removed, and more files can be added by dropping or picking.
- Make my PDF waits for the checks, lists the files that failed with Back to the list or Make PDF without them, shows progress with Cancel, and downloads the PDF under the name typed next to the button (the first file's name by default); the list stays.
- Add more files in the single-PDF dialog moves that PDF into a list as the first file.
- Files in an assembly start in natural name order (foto 2 before foto 10), pinned files keep their place when others move and shift up only when a file above leaves, and every file is converted in the background as soon as it enters the list.
- A single PDF opens a dialog with its pages and the chosen options before the PDF is made; Back or Escape returns without doing anything.
- Protected PDFs and Office files ask for their password in a dialog, say when it is wrong, and come out without it.
- The new Password setting asks for a password for the result, typed twice, right before generating; the PDF is encrypted with AES-256 and the password is never stored.
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
