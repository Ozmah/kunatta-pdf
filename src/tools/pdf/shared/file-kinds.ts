import { inputKinds, type InputKind } from "../contract/kinds.ts";

interface FileKind {
	/** What the file's card says: JPG, not jpeg. */
	readonly label: string;
	/** What the file picker offers for it; content is still verified by signature after picking. */
	readonly picker: ReadonlyArray<string>;
}

/** How each kind shows up on the page. A kind added to contract/kinds.ts must be described here. */
export const fileKinds: Readonly<Record<InputKind, FileKind>> = {
	jpeg: { label: "JPG", picker: ["image/jpeg"] },
	png: { label: "PNG", picker: ["image/png"] },
	webp: { label: "WEBP", picker: ["image/webp"] },
	pdf: { label: "PDF", picker: ["application/pdf"] },
	text: { label: "TXT", picker: ["text/plain", ".txt"] },
	docx: { label: "DOCX", picker: [".docx"] },
	xlsx: { label: "XLSX", picker: [".xlsx"] },
	pptx: { label: "PPTX", picker: [".pptx"] },
	doc: { label: "DOC", picker: [".doc"] },
	xls: { label: "XLS", picker: [".xls"] },
	ppt: { label: "PPT", picker: [".ppt"] },
};

/** The `accept` attribute of the file input. */
export const pickerAccept = inputKinds.flatMap((kind) => fileKinds[kind].picker).join(",");
