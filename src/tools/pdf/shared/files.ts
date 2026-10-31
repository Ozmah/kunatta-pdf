/** How files arrived: dropping and picking can take the fast path, pasting always assembles. */
export type Origin = "drop" | "pick" | "paste";

/** Receives files in the order they arrived, with how they arrived. */
export type ReceiveFiles = (files: ReadonlyArray<File>, origin: Origin) => void;

/** True when a drag carries files (as opposed to text or links). */
export function carriesFiles(types: ReadonlyArray<string>): boolean {
	return types.includes("Files");
}

/**
 * Makes `zone` take dropped files: it is marked [data-dragging] while files hover over it.
 * The empty drop zone and the list's "add files" strip behave the same way.
 */
export function acceptDrops(
	zone: HTMLElement,
	deliver: (files: ReadonlyArray<File>) => void,
): void {
	let depth = 0;

	const setDragging = (dragging: boolean): void => {
		zone.toggleAttribute("data-dragging", dragging);
	};

	zone.addEventListener("dragenter", (event) => {
		if (!carriesFiles(event.dataTransfer?.types ?? [])) return;

		depth += 1;
		setDragging(true);
	});

	zone.addEventListener("dragleave", () => {
		depth = Math.max(0, depth - 1);

		if (depth === 0) setDragging(false);
	});

	zone.addEventListener("drop", (event) => {
		depth = 0;
		setDragging(false);

		const files = Array.from(event.dataTransfer?.files ?? []);

		if (files.length > 0) deliver(files);
	});
}
