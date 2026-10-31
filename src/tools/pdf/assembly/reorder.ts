import { interpolate } from "../../../i18n/format.ts";
import type { Locale } from "../../../i18n/locales.ts";
import type { MessageKey } from "../../../i18n/es.ts";
import { translator } from "../../../i18n/translate.ts";
import { canMove, freePosition, moveTo, type Items } from "./model.ts";
import { dragThreshold, edgeSpeed, slide, targetPosition } from "./reorder-motion.ts";

export interface ReorderHost {
	readonly stack: HTMLElement;
	readonly slot: HTMLElement;
	/** The order the model holds; the preview is derived from it. */
	committed(): Items;
	row(id: string): HTMLElement | undefined;
	/** Re-renders the rows; the view asks `adjust` which order to show. */
	redraw(): void;
	commit(id: string, position: number): void;
	announce(text: string): void;
	enabled(): boolean;
}

export interface Reorder {
	/** The order to show: the committed one, or the preview while a row is held. */
	adjust(items: Items): Items;
	/** Drops a held row back where it was, e.g. when a generation starts. */
	stop(): void;
}

interface Held {
	readonly id: string;
	position: number;
}

interface PointerHold extends Held {
	readonly kind: "pointer";
	readonly pointerId: number;
	readonly startX: number;
	readonly startPageY: number;
	readonly startTop: number;
	lifted: boolean;
	clientY: number;
	dy: number;
}

interface KeyboardHold extends Held {
	readonly kind: "keyboard";
}

type Hold = PointerHold | KeyboardHold;

function reducedMotion(): boolean {
	return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pointer (1:1 tracking, 200 ms settle) and keyboard (Space, ↑ ↓, Esc) reordering of the assembly list. */
export function connectReorder(host: ReorderHost, locale: Locale): Reorder {
	const { stack, slot } = host;
	const t = translator(locale);
	let hold: Hold | undefined;
	let frame = 0;

	const rows = (): Array<HTMLElement> =>
		host.committed().flatMap((item) => host.row(item.entry.id) ?? []);

	const adjust = (items: Items): Items => {
		if (hold === undefined) return items;

		const id = hold.id;
		const item = items.find((candidate) => candidate.entry.id === id);

		// The held row vanished or got pinned under us (it cannot from the UI, but the model rules).
		if (item === undefined || item.pinned) {
			hold = undefined;
			slot.hidden = true;

			return items;
		}

		return moveTo(items, id, hold.position);
	};

	const label = (id: string, key: MessageKey): string => {
		const items = adjust(host.committed());
		const index = items.findIndex((item) => item.entry.id === id);
		const name = items[index]?.entry.name ?? "";

		return interpolate(t(key), { name, position: index + 1, total: items.length });
	};

	const placeSlot = (row: HTMLElement): void => {
		slot.hidden = false;
		slot.style.top = `${row.offsetTop}px`;
		slot.style.height = `${row.offsetHeight}px`;
	};

	/** Slides rows into place after a redraw; the row under the pointer keeps following it. */
	const flip = (change: () => void, held?: { row: HTMLElement; visual: number }): void => {
		const dragged = hold?.kind === "pointer" ? host.row(hold.id) : undefined;

		slide(stack, rows(), change, { held, skip: dragged, animate: !reducedMotion() });
	};

	const track = (): void => {
		if (hold?.kind !== "pointer" || !hold.lifted) return;

		const row = host.row(hold.id);

		if (row === undefined) return;

		const pageY = hold.clientY + scrollY;
		const center = hold.startTop + pageY - hold.startPageY + row.offsetHeight / 2;

		const others = host
			.committed()
			.filter((item) => item.entry.id !== hold?.id)
			.flatMap((item) => {
				const other = host.row(item.entry.id);

				return other === undefined
					? []
					: [{ mid: other.offsetTop + other.offsetHeight / 2, pinned: item.pinned }];
			});

		const position = targetPosition(others, center);

		if (position !== hold.position) {
			hold.position = position;
			flip(() => host.redraw());
			placeSlot(row);
			host.announce(label(hold.id, "announce.position"));
		}

		hold.dy = hold.startTop + pageY - hold.startPageY - row.offsetTop;
		row.style.translate = `0 ${hold.dy}px`;
	};

	const loop = (): void => {
		frame = 0;

		if (hold?.kind !== "pointer" || !hold.lifted) return;

		const speed = edgeSpeed(hold.clientY, innerHeight);

		if (speed !== 0) scrollBy(0, speed);

		track();
		frame = requestAnimationFrame(loop);
	};

	/** Ends a hold: commits when `keep`, otherwise returns the row to where it started. */
	const finish = (keep: boolean): void => {
		const current = hold;

		if (current === undefined) return;

		const row = host.row(current.id);

		cancelAnimationFrame(frame);
		frame = 0;
		slot.hidden = true;
		hold = undefined;

		if (row === undefined) return;

		row.classList.remove("kbd");
		row.querySelector<HTMLElement>(".mtag")?.toggleAttribute("hidden", true);

		const pointer = current.kind === "pointer" && current.lifted;
		const visual = row.offsetTop + (current.kind === "pointer" ? current.dy : 0);

		const apply = (): void => {
			if (keep) host.commit(current.id, current.position);
			else host.redraw();
		};

		if (!pointer) {
			apply();
			host.announce(label(current.id, keep ? "announce.dropped" : "announce.cancelled"));

			return;
		}

		// Settle: the row slides from under the pointer into its slot (200 ms ease-out, .shifting).
		row.classList.remove("lift");
		flip(apply, { row, visual });

		if (reducedMotion()) row.style.translate = "";

		host.announce(label(current.id, keep ? "announce.dropped" : "announce.cancelled"));
	};

	const begin = (id: string): Held | undefined => {
		const item = host.committed().find((candidate) => candidate.entry.id === id);
		const position = freePosition(host.committed(), id);

		if (hold !== undefined || !host.enabled() || item === undefined || position === undefined)
			return undefined;

		return { id, position };
	};

	stack.addEventListener("pointerdown", (event) => {
		const handle =
			event.target instanceof Element ? event.target.closest<HTMLElement>("[data-handle]") : null;

		const id = handle?.closest("li")?.dataset["id"];

		if (handle === null || id === undefined || event.button !== 0 || !event.isPrimary) return;

		const held = begin(id);
		const row = host.row(id);

		if (held === undefined || row === undefined) return;

		event.preventDefault();
		// Capture on the stack: redraws re-insert rows, and a detached handle would lose the capture.
		stack.setPointerCapture(event.pointerId);
		hold = {
			...held,
			kind: "pointer",
			pointerId: event.pointerId,
			startX: event.clientX,
			startPageY: event.clientY + scrollY,
			startTop: row.offsetTop,
			lifted: false,
			clientY: event.clientY,
			dy: 0,
		};
	});

	stack.addEventListener("pointermove", (event) => {
		if (hold?.kind !== "pointer" || event.pointerId !== hold.pointerId) return;

		hold.clientY = event.clientY;

		if (!hold.lifted) {
			const moved = Math.hypot(
				event.clientX - hold.startX,
				event.clientY + scrollY - hold.startPageY,
			);

			const row = host.row(hold.id);

			if (moved < dragThreshold || row === undefined) return;

			hold.lifted = true;
			row.classList.remove("shifting");
			row.classList.add("lift");
			placeSlot(row);
			host.announce(label(hold.id, "announce.position"));
			frame = requestAnimationFrame(loop);
		}

		track();
	});

	stack.addEventListener("pointerup", (event) => {
		if (hold?.kind !== "pointer" || event.pointerId !== hold.pointerId) return;

		const bounds = stack.getBoundingClientRect();

		const inside =
			event.clientX >= bounds.left &&
			event.clientX <= bounds.right &&
			event.clientY >= bounds.top &&
			event.clientY <= bounds.bottom;

		if (!hold.lifted) {
			hold = undefined;

			return;
		}

		finish(inside);
	});

	for (const type of ["pointercancel", "lostpointercapture"] as const) {
		stack.addEventListener(type, (event) => {
			if (hold?.kind === "pointer" && event.pointerId === hold.pointerId) finish(false);
		});
	}

	// A slide ends or is cut short (a row moved again, or left the list); either way it is over.
	for (const type of ["transitionend", "transitioncancel"] as const) {
		stack.addEventListener(type, (event) => {
			if (event.target instanceof HTMLElement && event.propertyName === "translate") {
				event.target.classList.remove("shifting");
			}
		});
	}

	stack.addEventListener("keydown", (event) => {
		const grip =
			event.target instanceof Element ? event.target.closest<HTMLElement>("[data-grip]") : null;

		const id = grip?.closest("li")?.dataset["id"];

		if (id === undefined) return;

		if (event.key === " ") {
			event.preventDefault();

			if (hold?.kind === "keyboard" && hold.id === id) {
				finish(true);

				return;
			}

			const held = begin(id);
			const row = host.row(id);

			if (held === undefined || row === undefined) return;

			hold = { ...held, kind: "keyboard" };
			row.classList.add("kbd");
			moving(row);
			host.announce(label(id, "announce.grabbed"));

			return;
		}

		if (hold?.kind !== "keyboard" || hold.id !== id) return;

		if (event.key === "Escape") {
			event.preventDefault();
			finish(false);

			return;
		}

		const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;

		if (delta === 0) return;

		event.preventDefault();

		if (!canMove(adjust(host.committed()), id, delta)) return;

		hold.position += delta;
		host.redraw();

		const row = host.row(id);

		if (row !== undefined) {
			moving(row);
			row.scrollIntoView({ block: "nearest" });
		}

		host.announce(label(id, "announce.position"));
	});

	// Leaving the handle while holding a row by keyboard puts it back: nothing moves without Space.
	stack.addEventListener("focusout", () => {
		requestAnimationFrame(() => {
			if (hold?.kind !== "keyboard") return;

			const grip = host.row(hold.id)?.querySelector("[data-grip]");

			if (document.activeElement !== grip) finish(false);
		});
	});

	const release = (): void => {
		if (hold?.kind === "pointer" && stack.hasPointerCapture(hold.pointerId)) {
			stack.releasePointerCapture(hold.pointerId);
		}
	};

	stack.ownerDocument.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && hold?.kind === "pointer" && hold.lifted) {
			release();
			finish(false);
		}
	});

	function moving(row: HTMLElement): void {
		const tag = row.querySelector<HTMLElement>(".mtag");

		if (hold === undefined || tag === null) return;

		tag.hidden = false;
		tag.textContent = label(hold.id, "row.moving");
	}

	return {
		adjust,

		stop() {
			release();
			finish(false);
		},
	};
}
