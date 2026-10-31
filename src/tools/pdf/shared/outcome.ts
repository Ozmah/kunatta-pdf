/** The PDF a flow hands back for download. */
export interface MadePdf {
	readonly name: string;
	readonly pdf: Blob;
	readonly pages: number;
	readonly degraded: boolean;
}

/** The user backed out of a dialog; nothing failed. */
export const backedOut = "backed-out";
