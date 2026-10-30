import { describe, expect, test } from "bun:test";

import { maxNameLength, pdfName, resultName, sanitizeName, typedName } from "./file-name.ts";

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

describe("typedName", () => {
	test("drops a .pdf the user typed next to the .pdf suffix, in any case", () => {
		expect(typedName("reporte.pdf")).toBe("reporte");
		expect(typedName("Reporte.PDF ")).toBe("Reporte");
		expect(typedName("reporte.pdf.")).toBe("reporte");
	});

	test("keeps other dots, and a lone .pdf means no name at all", () => {
		expect(typedName("v1.2 notas")).toBe("v1.2 notas");
		expect(typedName(".pdf")).toBe("");
		expect(typedName("   ")).toBe("");
	});
});

describe("resultName", () => {
	test("prefers the typed name and falls back to the source file's", () => {
		expect(resultName("entrega", "foto.jpg")).toBe("entrega.pdf");
		expect(resultName("", "foto.jpg")).toBe("foto.pdf");
		expect(resultName("???", "foto.jpg")).toBe("foto.pdf");
	});
});
