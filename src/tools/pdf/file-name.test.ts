import { describe, expect, test } from "bun:test";

import { maxNameLength, pdfName, sanitizeName } from "./file-name.ts";

describe("pdfName", () => {
	test("replaces the extension with .pdf", () => {
		expect(pdfName("tarea-historia.docx")).toBe("tarea-historia.pdf");
		expect(pdfName("IMG_4021.JPG")).toBe("IMG_4021.pdf");
		expect(pdfName("apuntes")).toBe("apuntes.pdf");
	});

	test("removes characters file systems refuse and falls back when nothing is left", () => {
		expect(pdfName('tarea: "final" 1/2?.docx')).toBe("tarea final 12.pdf");
		expect(pdfName("???.txt")).toBe("kunatta.pdf");
		expect(pdfName(".notas")).toBe("notas.pdf");
	});
});

describe("sanitizeName", () => {
	test("trims spaces and dots at the ends and control characters anywhere", () => {
		expect(sanitizeName("  ..reporte\u0007 final.. ")).toBe("reporte final");
	});

	test("keeps at most 120 characters, counting accents and emoji as one", () => {
		const long = "á".repeat(130);

		expect(Array.from(sanitizeName(long))).toHaveLength(maxNameLength);
		expect(sanitizeName("🎉".repeat(121))).toBe("🎉".repeat(120));
	});
});
