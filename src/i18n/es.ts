// Source dictionary: every other locale is checked against these keys.
export const es = {
	"meta.title": "Kunatta · Todo a PDF",
	"meta.description":
		"Suelta o pega fotos, documentos y PDFs y obtén un solo PDF. Todo ocurre en tu navegador.",
	"footer.notice": "Tus archivos nunca salen de tu navegador.",
	"footer.author": "hecho por Ozmah",
} as const;

export type MessageKey = keyof typeof es;

export type Messages = { readonly [Key in MessageKey]: string };
