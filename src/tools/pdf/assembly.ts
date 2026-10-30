import { Panic } from "better-result";

import type { JobError } from "./errors.ts";
import type { PileEntry } from "./pile.ts";
import type { FilePdf } from "./protocol.ts";
import type { ConvertSettings } from "./settings.ts";
import { isImageKind, type InputKind } from "./sniff.ts";

/** Where each file in the list stands. */
export type ItemState =
	| { readonly kind: "checking" }
	| { readonly kind: "ready"; readonly file: FilePdf; readonly usedSettings: ConvertSettings }
	| { readonly kind: "failed"; readonly error: JobError }
	| { readonly kind: "locked"; readonly wrong: boolean };

export interface Item {
	readonly entry: PileEntry;
	/** A pinned item keeps its position when others move; it shifts up only when one above leaves. */
	readonly pinned: boolean;
	readonly state: ItemState;
}

export type Items = ReadonlyArray<Item>;

/** Natural order by name, so "foto 2" comes before "foto 10". */
export function naturalOrder(
	entries: ReadonlyArray<PileEntry>,
	locale: string,
): ReadonlyArray<PileEntry> {
	const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });

	return entries.toSorted((left, right) => collator.compare(left.name, right.name));
}

/** New files go after the current ones, in natural order among themselves; pins are untouched. */
export function addEntries(items: Items, entries: ReadonlyArray<PileEntry>, locale: string): Items {
	const added = naturalOrder(entries, locale).map((entry): Item => ({
		entry,
		pinned: false,
		state: { kind: "checking" },
	}));

	return [...items, ...added];
}

/** Removing shifts everything below up by one, pinned items included, so no gap is left. */
export function removeItem(items: Items, id: string): Items {
	return items.filter((item) => item.entry.id !== id);
}

export function togglePin(items: Items, id: string): Items {
	return items.map((item) => (item.entry.id === id ? { ...item, pinned: !item.pinned } : item));
}

export function updateState(items: Items, id: string, state: ItemState): Items {
	return items.map((item) => (item.entry.id === id ? { ...item, state } : item));
}

/**
 * Places the unpinned items in `order` into the slots unpinned items occupy, leaving every
 * pinned item where it is.
 */
function refill(items: Items, order: Items): Items {
	let next = 0;

	return items.map((item) => {
		if (item.pinned) return item;

		const placed = order[next];

		next += 1;

		if (placed === undefined) throw new Panic({ message: "Refill ran out of unpinned items" });

		return placed;
	});
}

/**
 * Moves an unpinned item to `position` among the unpinned items (0 is the first free slot).
 * Pinned items never move, and the moved item skips over them.
 */
export function moveTo(items: Items, id: string, position: number): Items {
	const free = items.filter((item) => !item.pinned);
	const from = free.findIndex((item) => item.entry.id === id);

	if (from === -1) return items;

	const order = [...free];
	const [moved] = order.splice(from, 1);

	if (moved === undefined) return items;

	order.splice(Math.max(0, Math.min(position, order.length)), 0, moved);

	return refill(items, order);
}

/** Where an item sits among the unpinned ones, or undefined when it is pinned or unknown. */
export function freePosition(items: Items, id: string): number | undefined {
	const position = items.filter((item) => !item.pinned).findIndex((item) => item.entry.id === id);

	return position === -1 ? undefined : position;
}

/** The ↑ ↓ buttons: one step among unpinned items. */
export function moveBy(items: Items, id: string, delta: -1 | 1): Items {
	const position = freePosition(items, id);

	return position === undefined ? items : moveTo(items, id, position + delta);
}

/** Whether ↑ or ↓ can do anything for this item. */
export function canMove(items: Items, id: string, delta: -1 | 1): boolean {
	const position = freePosition(items, id);
	const free = items.filter((item) => !item.pinned).length;

	return position !== undefined && position + delta >= 0 && position + delta < free;
}

/** Images depend on quality and plain text on the page size; PDFs and Office depend on neither. */
export function isStale(kind: InputKind, used: ConvertSettings, current: ConvertSettings): boolean {
	if (isImageKind(kind)) return used.quality !== current.quality;

	if (kind === "text") return used.size !== current.size;

	return false;
}
