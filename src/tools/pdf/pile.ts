import { TaggedError } from "better-result";

import { classify, limits, type RejectedFile } from "./ingest.ts";
import { sniffLength, type InputKind } from "./sniff.ts";

export interface PileEntry {
	readonly id: string;
	readonly name: string;
	readonly kind: InputKind;
	readonly size: number;
	readonly source: Blob;
}

export type Pile = ReadonlyArray<PileEntry>;

export class PileFull extends TaggedError("PileFull")<{
	fileName: string;
	reason: "files" | "bytes";
	message: string;
}> {}

export type Rejection = RejectedFile | PileFull;

export interface Admission {
	readonly pile: Pile;
	readonly rejected: ReadonlyArray<Rejection>;
}

export type IdSource = () => string;

const randomId: IdSource = () => crypto.randomUUID();

export function pileBytes(pile: Pile): number {
	return pile.reduce((total, entry) => total + entry.size, 0);
}

function capacityProblem(pile: Pile, size: number): "files" | "bytes" | undefined {
	if (pile.length >= limits.files) return "files";

	if (pileBytes(pile) + size > limits.totalBytes) return "bytes";

	return undefined;
}

/** Classifies each file by its content and appends the ones that fit, in order. */
export async function admit(
	pile: Pile,
	files: ReadonlyArray<File>,
	nextId: IdSource = randomId,
): Promise<Admission> {
	const entries = [...pile];
	const rejected: Array<Rejection> = [];

	for (const file of files) {
		const head = new Uint8Array(await file.slice(0, sniffLength).arrayBuffer());
		const verdict = classify({ name: file.name, mimeType: file.type, size: file.size, head });

		if (verdict.isErr()) {
			rejected.push(verdict.error);

			continue;
		}

		const problem = capacityProblem(entries, file.size);

		if (problem !== undefined) {
			rejected.push(
				new PileFull({
					fileName: file.name,
					reason: problem,
					message: `${file.name} does not fit: the pile reached its ${problem} limit`,
				}),
			);

			continue;
		}

		entries.push({
			id: nextId(),
			name: file.name,
			kind: verdict.value,
			size: file.size,
			source: file,
		});
	}

	return { pile: entries, rejected };
}

export function removeEntry(pile: Pile, id: string): Pile {
	return pile.filter((entry) => entry.id !== id);
}

/** Moves an entry to `target`, clamped to the pile's bounds. Unknown ids leave the pile as is. */
export function moveEntry(pile: Pile, id: string, target: number): Pile {
	const from = pile.findIndex((entry) => entry.id === id);

	if (from === -1) return pile;

	const entries = [...pile];
	const [moved] = entries.splice(from, 1);

	if (moved === undefined) return pile;

	entries.splice(Math.max(0, Math.min(target, entries.length)), 0, moved);

	return entries;
}
