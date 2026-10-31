/** The file kinds the tool knows. Both threads read these lists; intake/ decides which one a file is. */

export const imageKinds = ["jpeg", "png", "webp"] as const;

export type ImageKind = (typeof imageKinds)[number];

/** OOXML (docx, xlsx, pptx) and the 97–2003 binary formats (doc, xls, ppt). */
export const officeFormats = ["docx", "xlsx", "pptx", "doc", "xls", "ppt"] as const;

export type OfficeFormat = (typeof officeFormats)[number];

/** File kinds the PDF tool can turn into pages. */
export const inputKinds = [...imageKinds, "pdf", "text", ...officeFormats] as const;

export type InputKind = (typeof inputKinds)[number];

export function isImageKind(kind: InputKind): kind is ImageKind {
	return imageKinds.some((known) => known === kind);
}
