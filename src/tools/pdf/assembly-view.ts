import { fileSize, pageCount } from "../../i18n/format.ts";
import type { Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import { canMove, type Item, type Items } from "./assembly.ts";
import { failureReason } from "./fast.ts";
import { kindLabel } from "./fast-view.ts";
import { pdfName, sanitizeName } from "./file-name.ts";

export interface AssemblyHandlers {
	pin(id: string): void;
	move(id: string, delta: -1 | 1): void;
	remove(id: string): void;
	unlock(id: string, password: string): void;
	make(): void;
	cancel(): void;
	again(): void;
}

export interface AssemblyView {
	show(visible: boolean): void;
	render(items: Items): void;
	/** The name typed next to the button, or the first file's; always ending in ".pdf". */
	name(): string;
	/** Generating: the button shows it is busy, progress follows the checks, Cancel appears. */
	working(active: boolean): void;
	done(name: string, pages: number, bytes: number): void;
}

type Messages = Parameters<typeof translate>[1];

function required<Element extends HTMLElement>(root: ParentNode, selector: string): Element {
	const element = root.querySelector<Element>(selector);

	if (element === null) throw new Error(`Assembly markup is missing ${selector}`);

	return element;
}

/** Panel 04 · Nombre: by default the first file's name, shown as the field's placeholder. */
function defaultName(items: Items): string {
	const first = items[0];

	return first === undefined ? "kunatta" : pdfName(first.entry.name).slice(0, -".pdf".length);
}

function twoDigits(position: number): string {
	return String(position).padStart(2, "0");
}

const statusKey: Readonly<Record<Item["state"]["kind"], Messages | undefined>> = {
	checking: "row.checking",
	ready: undefined,
	failed: "row.failed",
	locked: "row.locked",
};

/** Rows are cloned from a <template> and filled with textContent only: file names are user data. */
export function connectAssemblyView(
	root: Document,
	locale: Locale,
	handlers: AssemblyHandlers,
): AssemblyView {
	const section = required(root, "[data-assembly]");
	const list = required(section, "[data-list]");
	const template = required<HTMLTemplateElement>(root, "[data-row-template]");
	const nameInput = required<HTMLInputElement>(section, "[data-name]");
	const make = required<HTMLButtonElement>(section, "[data-make]");
	const cancel = required<HTMLButtonElement>(section, "[data-cancel]");
	const progress = required(section, "[data-progress]");
	const doneBanner = required(section, "[data-assembly-done]");
	const rows = new Map<string, HTMLLIElement>();
	const t = (key: Messages): string => translate(locale, key);
	let generating = false;
	let latest: Items = [];

	const createRow = (id: string): HTMLLIElement => {
		const fragment = template.content.cloneNode(true);
		const row = fragment instanceof DocumentFragment ? fragment.querySelector("li") : null;

		if (row === null) throw new Error("Row template is missing its <li>");

		row.dataset["id"] = id;
		row.querySelector("form")?.addEventListener("submit", (event) => {
			event.preventDefault();

			const input = row.querySelector<HTMLInputElement>('input[name="password"]');
			const password = input?.value ?? "";

			if (input !== null) input.value = "";

			if (password.length > 0) handlers.unlock(id, password);
		});

		return row;
	};

	const fillRow = (row: HTMLLIElement, item: Item, index: number, items: Items): void => {
		const { entry, state, pinned } = item;
		const id = entry.id;
		const status = statusKey[state.kind];
		const tag = required(row, ".st");
		const meta = required(row, ".meta");
		const pinmark = required(row, ".pinmark");
		const unlock = required(row, ".unlock");

		row.dataset["state"] = state.kind;
		row.toggleAttribute("data-pinned", pinned);
		required(row, ".ix").textContent = twoDigits(index + 1);
		required(row, ".tile").textContent = kindLabel(entry.kind);
		required(row, "[data-row-name]").textContent = entry.name;
		pinmark.hidden = !pinned;
		pinmark.textContent = t("row.pinned").replace("{position}", twoDigits(index + 1));
		tag.hidden = status === undefined;
		tag.textContent = status === undefined ? "" : t(status);
		unlock.hidden = state.kind !== "locked";

		const details = [kindLabel(entry.kind)];

		if (state.kind === "ready" && entry.kind === "pdf")
			details.push(pageCount(locale, state.file.pages));

		details.push(fileSize(locale, entry.size));

		if (state.kind === "failed") meta.textContent = t(failureReason(state.error));
		else if (state.kind === "locked" && state.wrong) meta.textContent = t("incoming.wrong");
		else meta.textContent = details.join(" · ");

		const buttons = {
			pin: required<HTMLButtonElement>(row, '[data-action="pin"]'),
			up: required<HTMLButtonElement>(row, '[data-action="up"]'),
			down: required<HTMLButtonElement>(row, '[data-action="down"]'),
			remove: required<HTMLButtonElement>(row, '[data-action="remove"]'),
		};

		buttons.pin.setAttribute("aria-pressed", String(pinned));
		buttons.up.disabled = generating || !canMove(items, id, -1);
		buttons.down.disabled = generating || !canMove(items, id, 1);
		buttons.pin.disabled = generating;
		buttons.remove.disabled = generating;
	};

	const render = (items: Items): void => {
		latest = items;

		const focused = root.activeElement;
		const ids = new Set(items.map((item) => item.entry.id));

		for (const id of rows.keys()) {
			if (!ids.has(id)) rows.delete(id);
		}

		nameInput.placeholder = defaultName(items);

		const ordered = items.map((item, index) => {
			const row = rows.get(item.entry.id) ?? createRow(item.entry.id);

			rows.set(item.entry.id, row);
			fillRow(row, item, index, items);

			return row;
		});

		list.replaceChildren(...ordered);
		required(section, "[data-count]").textContent = String(items.length);

		// Reordering detaches rows; keep the keyboard where it was.
		if (focused instanceof HTMLElement && focused.isConnected && root.activeElement !== focused) {
			focused.focus();
		}

		if (generating) updateProgress(items);
	};

	const updateProgress = (items: Items): void => {
		const ready = items.filter((item) => item.state.kind === "ready").length;
		const current = items.find((item) => item.state.kind === "checking");
		const percent = items.length === 0 ? 0 : Math.round((ready / items.length) * 100);

		required(progress, "[data-progress-fill]").style.setProperty("--done", `${percent}%`);
		required(progress, "[data-progress-bar]").setAttribute("aria-valuenow", String(percent));
		required(progress, "[data-progress-percent]").textContent = `${percent} %`;
		required(progress, "[data-progress-label]").textContent =
			current === undefined
				? t("assembly.composing")
				: t("assembly.progress")
						.replace("{done}", String(ready))
						.replace("{total}", String(items.length))
						.replace("{name}", current.entry.name);
	};

	list.addEventListener("click", (event) => {
		const button = event.target instanceof Element ? event.target.closest("[data-action]") : null;
		const id = button?.closest("li")?.dataset["id"];

		if (!(button instanceof HTMLButtonElement) || id === undefined || button.disabled) return;

		const action = button.dataset["action"];

		if (action === "pin") handlers.pin(id);
		else if (action === "up") handlers.move(id, -1);
		else if (action === "down") handlers.move(id, 1);
		else if (action === "remove") handlers.remove(id);
	});

	make.addEventListener("click", () => {
		if (make.getAttribute("aria-disabled") !== "true") handlers.make();
	});
	cancel.addEventListener("click", () => handlers.cancel());
	required(section, "[data-assembly-again]").addEventListener("click", () => handlers.again());

	return {
		show(visible) {
			section.hidden = !visible;

			if (visible) required<HTMLHeadingElement>(section, "h2").focus();
		},

		render,

		name() {
			const typed = sanitizeName(nameInput.value);

			return `${typed.length > 0 ? typed : defaultName(latest)}.pdf`;
		},

		working(active) {
			generating = active;
			make.setAttribute("aria-disabled", String(active));
			make.textContent = t(active ? "assembly.making" : "assembly.make");
			cancel.hidden = !active;
			progress.hidden = !active;

			if (active) doneBanner.hidden = true;

			render(latest);
		},

		done(name, pages, bytes) {
			required(doneBanner, "[data-done-text]").textContent =
				`${name} ${t("assembly.downloaded")} · ${pageCount(locale, pages)} · ${fileSize(locale, bytes)}`;
			doneBanner.hidden = false;
		},
	};
}
