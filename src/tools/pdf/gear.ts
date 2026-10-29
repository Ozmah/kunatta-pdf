import { readSettings, type Settings } from "./settings.ts";

/** Keyboard activation reports no pointer clicks; those toggles skip the animation. */
export function isKeyboardActivation(detail: number): boolean {
	return detail === 0;
}

export interface SettingsControl {
	read(): Settings;
}

export function connectSettings(root: Document): SettingsControl {
	const container = root.querySelector<HTMLElement>("[data-settings]");
	const gear = root.querySelector<HTMLButtonElement>("[data-gear]");
	const panel = root.querySelector<HTMLFormElement>("[data-settings-panel]");

	if (container === null || gear === null || panel === null) {
		throw new Error("Settings markup is missing");
	}

	const isOpen = (): boolean => container.hasAttribute("data-open");

	const setOpen = (open: boolean, instant: boolean): void => {
		container.toggleAttribute("data-instant", instant);
		container.toggleAttribute("data-open", open);
		gear.setAttribute("aria-expanded", String(open));

		// Two frames: the instant state must paint before transitions come back.
		if (instant) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => container.removeAttribute("data-instant"));
			});
		}
	};

	gear.addEventListener("click", (event) => {
		setOpen(!isOpen(), isKeyboardActivation(event.detail));
	});

	root.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || !isOpen()) return;

		setOpen(false, true);
		gear.focus();
	});

	root.addEventListener("pointerdown", (event) => {
		if (!isOpen() || !(event.target instanceof Node)) return;

		if (panel.contains(event.target) || gear.contains(event.target)) return;

		setOpen(false, false);
	});

	return {
		read: () => {
			const values = new FormData(panel);

			const text = (name: string): string | null => {
				const value = values.get(name);

				return value instanceof File ? null : value;
			};

			return readSettings(text("size"), text("quality"), text("password"));
		},
	};
}
