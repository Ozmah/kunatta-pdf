// Source dictionary: every other locale is checked against these keys.
export const es = {
	"meta.title": "Kunatta · Todo a PDF",
	"meta.description":
		"Suelta o pega fotos, documentos y PDFs y obtén un solo PDF. Todo ocurre en tu navegador.",
	"flow.label": "Cualquier archivo se convierte en PDF",
	"drop.title": "Suéltalo aquí",
	"drop.paste": "o pega con",
	"settings.open": "Ajustes",
	"settings.group": "Ajustes del PDF",
	"settings.size": "Tamaño",
	"settings.size.letter": "Carta",
	"settings.size.a4": "A4",
	"settings.size.original": "Original",
	"settings.quality": "Calidad",
	"settings.quality.light": "Ligero",
	"settings.quality.normal": "Normal",
	"settings.quality.max": "Máxima",
	"fast.converting": "Convirtiendo",
	"fast.done": "Listo, ya se descargó",
	"fast.again": "Descargar otra vez",
	"fast.another": "Convertir otro",
	"fast.failed": "No pudimos convertirlo",
	"fast.retry": "Intentar otra vez",
	"fast.pick": "Elegir otro archivo",
	"count.pages.one": "{count} página",
	"count.pages.other": "{count} páginas",
	"rejected.one": "no se puede convertir a PDF.",
	"rejected.many": "No entraron {count} archivos:",
	"degraded.doc":
		"es un Word antiguo y puede verse distinto. Guárdalo como .docx para que salga igual.",
	"degraded.xls":
		"es un Excel antiguo y puede verse distinto. Guárdalo como .xlsx para que salga igual.",
	"degraded.ppt":
		"es un PowerPoint antiguo y puede verse distinto. Guárdalo como .pptx para que salga igual.",
	"degraded.text": "tiene caracteres que no se pueden dibujar; salen como ?.",
	"degraded.other": "puede verse distinto al original.",
	"reason.damaged": "El archivo está dañado o no se pudo leer",
	"reason.password": "El archivo tiene contraseña",
	"reason.engine": "No se pudo cargar el convertidor; revisa tu conexión",
	"reason.crashed": "La conversión se detuvo de forma inesperada",
	"reason.composition": "No se pudo armar el PDF",
	"footer.notice": "Tus archivos nunca salen de tu navegador.",
	"footer.author": "hecho por Ozmah",
} as const;

export type MessageKey = keyof typeof es;

export type Messages = { readonly [Key in MessageKey]: string };
