/** A row other than the dragged one, measured in list coordinates. */
export interface Slot {
	readonly mid: number;
	readonly pinned: boolean;
}

/** Where the dragged row lands among the unpinned rows: one past every unpinned row above its center. */
export function targetPosition(others: ReadonlyArray<Slot>, center: number): number {
	return others.filter((slot) => !slot.pinned && slot.mid < center).length;
}

const edgeZone = 64;
const edgeMaxSpeed = 16;

/** Pixels per frame to scroll while a drag rests near the top (negative) or bottom (positive) edge. */
export function edgeSpeed(y: number, viewport: number): number {
	if (y < edgeZone) return -Math.round(edgeMaxSpeed * (1 - Math.max(0, y) / edgeZone));

	if (y > viewport - edgeZone) {
		return Math.round(edgeMaxSpeed * (1 - Math.max(0, viewport - y) / edgeZone));
	}

	return 0;
}

/** A press only becomes a drag past this distance, so a tap on a handle never moves anything. */
export const dragThreshold = 4;

export interface SlideOptions {
	/** The held row, drawn somewhere other than its layout box. */
	readonly held?: { readonly row: HTMLElement; readonly visual: number } | undefined;
	/** A row that must not be animated, such as the one under the pointer. */
	readonly skip?: HTMLElement | undefined;
	readonly animate: boolean;
}

/**
 * FLIP: measures where each row is drawn, runs `change`, then starts every moved row from its old
 * spot and lets `.shifting` (200 ms ease-out on `translate`) bring it home. Rows caught mid-slide
 * start from where they are drawn, so a slide can be interrupted.
 */
export function slide(
	stack: HTMLElement,
	rows: ReadonlyArray<HTMLElement>,
	change: () => void,
	options: SlideOptions,
): void {
	const origin = stack.getBoundingClientRect().top;
	const before = new Map(rows.map((row) => [row, row.getBoundingClientRect().top - origin]));

	if (options.held !== undefined) before.set(options.held.row, options.held.visual);

	change();

	if (!options.animate) return;

	for (const [row, top] of before) {
		const delta = top - row.offsetTop;

		if (Math.abs(delta) < 1 || row === options.skip) continue;

		row.classList.remove("shifting");
		row.style.translate = `0 ${delta}px`;
		// Commit the start position before the transition class lands.
		void row.offsetTop;
		row.classList.add("shifting");
		row.style.translate = "";
	}
}
