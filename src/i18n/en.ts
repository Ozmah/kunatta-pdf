import type { Messages } from "./es.ts";

export const en = {
	"meta.title": "Kunatta · Anything to PDF",
	"meta.description":
		"Drop or paste photos, documents and PDFs and get a single PDF back. Everything happens in your browser.",
	"flow.label": "Any file becomes a PDF",
	"drop.title": "Drop it here",
	"drop.paste": "or paste with",
	"settings.open": "Settings",
	"settings.group": "PDF settings",
	"settings.size": "Size",
	"settings.size.letter": "Letter",
	"settings.size.a4": "A4",
	"settings.size.original": "Original",
	"settings.quality": "Quality",
	"settings.quality.light": "Light",
	"settings.quality.normal": "Normal",
	"settings.quality.max": "Max",
	"footer.notice": "Your files never leave your browser.",
	"footer.author": "made by Ozmah",
} as const satisfies Messages;
