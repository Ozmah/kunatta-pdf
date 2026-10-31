import type { InputKind } from "../contract/kinds.ts";

/** A file the user brought, once its kind is known. Every flow works with these. */
export interface PileEntry {
	readonly id: string;
	readonly name: string;
	readonly kind: InputKind;
	readonly size: number;
	readonly source: Blob;
}
