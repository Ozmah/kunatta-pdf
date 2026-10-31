import { required } from "./dom.ts";

/** The fields of a dialog, in order. */
export function inputs(dialog: HTMLDialogElement): ReadonlyArray<HTMLInputElement> {
	return Array.from(dialog.querySelectorAll("input"));
}

/**
 * Where the dialog is a bottom sheet, tapping the veil closes it like Back; elsewhere only Back and
 * Escape do. The stylesheet owns the breakpoint and says which one applies through --closed-by.
 */
function closedBy(dialog: HTMLDialogElement): "any" | "closerequest" {
	return getComputedStyle(dialog).getPropertyValue("--closed-by").trim() === "any"
		? "any"
		: "closerequest";
}

/** The button the user chose ("" for Escape, Back or the veil) and the fields as they were. */
export interface Answer {
	readonly choice: string;
	readonly values: ReadonlyMap<string, string>;
}

/**
 * Opens a modal dialog and resolves with the button the user chose ("" for Escape or the veil).
 * `accept` may refuse a confirmation (returning an error message) and keep the dialog open.
 * Password fields are emptied on close, so no password stays in the page.
 */
export function ask(
	dialog: HTMLDialogElement,
	accept: () => string | undefined = () => undefined,
): Promise<Answer> {
	const form = required<HTMLFormElement>(dialog, "form");
	const error = dialog.querySelector<HTMLElement>("[data-error]");

	return new Promise((resolve) => {
		const onSubmit = (event: SubmitEvent): void => {
			const button = event.submitter;

			if (!(button instanceof HTMLButtonElement) || button.value !== "confirm") return;

			const problem = accept();

			form.toggleAttribute("data-invalid", problem !== undefined);

			if (error !== null) error.textContent = problem ?? "";

			if (problem === undefined) return;

			event.preventDefault();
			inputs(dialog)[0]?.focus();
		};

		const onClose = (): void => {
			const values = new Map(inputs(dialog).map((input) => [input.name, input.value]));

			for (const input of inputs(dialog)) input.value = "";

			form.removeAttribute("data-invalid");
			form.removeEventListener("submit", onSubmit);
			resolve({ choice: dialog.returnValue, values });
		};

		form.addEventListener("submit", onSubmit);
		dialog.addEventListener("close", onClose, { once: true });
		dialog.returnValue = "";
		dialog.closedBy = closedBy(dialog);
		dialog.showModal();
	});
}

/**
 * Back buttons close without submitting. As submit buttons they would come first in the form,
 * and pressing Enter in a field would pick them instead of the primary action.
 */
export function connectBack(dialog: HTMLDialogElement): void {
	for (const button of dialog.querySelectorAll<HTMLButtonElement>("[data-back]")) {
		button.addEventListener("click", () => dialog.close("back"));
	}
}
