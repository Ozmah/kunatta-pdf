import type { PileEntry } from "./pile.ts";

/** How files arrived: dropping and picking can take the fast path, pasting always assembles. */
export type Origin = "drop" | "pick" | "paste";

export type Path =
	| { readonly kind: "none" }
	| { readonly kind: "fast"; readonly entry: PileEntry }
	| { readonly kind: "single-pdf"; readonly entry: PileEntry }
	| { readonly kind: "assembly" };

/** Panel 04 · Caminos: one non-PDF file is converted right away; one PDF asks first; anything else assembles. */
export function choosePath(accepted: ReadonlyArray<PileEntry>, origin: Origin): Path {
	const [first, ...rest] = accepted;

	if (first === undefined) return { kind: "none" };

	if (rest.length > 0 || origin === "paste") return { kind: "assembly" };

	return first.kind === "pdf"
		? { kind: "single-pdf", entry: first }
		: { kind: "fast", entry: first };
}
