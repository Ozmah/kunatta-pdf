import type { Messages } from "./es.ts";

export const en = {
	"meta.title": "Kunatta · Anything to PDF",
	"meta.description":
		"Drop or paste photos, documents and PDFs and get a single PDF back. Everything happens in your browser.",
	"flow.label": "Any file becomes a PDF",
	"drop.title": "Drop it here",
	"drop.paste": "or paste with",
	"footer.notice": "Your files never leave your browser.",
	"footer.author": "made by Ozmah",
} as const satisfies Messages;
