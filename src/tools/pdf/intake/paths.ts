import type { PileEntry } from "../shared/entry.ts";
import type { Origin } from "../shared/files.ts";

export type Path =
	| { readonly kind: "none" }
	| { readonly kind: "fast"; readonly entry: PileEntry }
	| { readonly kind: "single-pdf"; readonly entry: PileEntry }
	| { readonly kind: "assembly" };

/** One non-PDF file is converted right away; one PDF asks first; anything else assembles. */
export function choosePath(accepted: ReadonlyArray<PileEntry>, origin: Origin): Path {
	const [first, ...rest] = accepted;

	if (first === undefined) return { kind: "none" };

	if (rest.length > 0 || origin === "paste") return { kind: "assembly" };

	return first.kind === "pdf"
		? { kind: "single-pdf", entry: first }
		: { kind: "fast", entry: first };
}
