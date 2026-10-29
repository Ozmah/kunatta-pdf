/** Longest name kept before ".pdf", counted in characters (code points), not bytes. */
export const maxNameLength = 120;

const fallbackName = "kunatta";

// Characters Windows, macOS or Linux refuse in file names.
const forbidden: ReadonlySet<string> = new Set(["/", "\\", ":", "*", "?", '"', "<", ">", "|"]);

function isAllowed(character: string): boolean {
	const code = character.codePointAt(0) ?? 0;

	// Control characters (C0 and DEL) never belong in a file name.
	return code >= 0x20 && code !== 0x7f && !forbidden.has(character);
}

/** Cleans a name the user typed or that came with a file, without its extension. */
export function sanitizeName(name: string): string {
	const cleaned = Array.from(name)
		.filter(isAllowed)
		.join("")
		.replace(/^[.\s]+|[.\s]+$/gu, "");

	return Array.from(cleaned).slice(0, maxNameLength).join("").trim();
}

/** The name of the resulting PDF: the source name without its extension, always ending in .pdf. */
export function pdfName(sourceName: string): string {
	const dot = sourceName.lastIndexOf(".");
	const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
	const clean = sanitizeName(base);

	return `${clean.length > 0 ? clean : fallbackName}.pdf`;
}
