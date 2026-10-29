import { fileCount, fileSize, fitNote, pageCount, withCount } from "../../i18n/format.ts";
import type { Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import type { AssemblyPrompts } from "./assembly-run.ts";
import type { Items } from "./assembly.ts";
import { failureReason, type Prompts } from "./fast.ts";
import { kindLabel } from "./fast-view.ts";
import type { Settings } from "./settings.ts";

function required<Element extends HTMLElement>(root: ParentNode, selector: string): Element {
	const element = root.querySelector<Element>(selector);

	if (element === null) throw new Error(`Dialog markup is missing ${selector}`);

	return element;
}

function inputs(dialog: HTMLDialogElement): ReadonlyArray<HTMLInputElement> {
	return Array.from(dialog.querySelectorAll("input"));
}

/**
 * Opens a modal dialog and resolves with the button the user chose ("" for Escape).
 * `accept` may refuse a confirmation (returning an error message) and keep the dialog open.
 * Password fields are emptied on close, so no password stays in the page.
 */
function ask(
	dialog: HTMLDialogElement,
	accept: () => string | undefined = () => undefined,
): Promise<{ choice: string; values: ReadonlyMap<string, string> }> {
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
		dialog.showModal();
	});
}

/**
 * Back buttons close without submitting. As submit buttons they would come first in the form,
 * and pressing Enter in a field would pick them instead of the primary action.
 */
function connectBack(dialog: HTMLDialogElement): void {
	for (const button of dialog.querySelectorAll<HTMLButtonElement>("[data-back]")) {
		button.addEventListener("click", () => dialog.close("back"));
	}
}

function connectReveal(dialog: HTMLDialogElement, locale: Locale): void {
	for (const button of dialog.querySelectorAll<HTMLButtonElement>("[data-reveal]")) {
		const input = button.parentElement?.querySelector("input");

		button.addEventListener("click", () => {
			if (input === null || input === undefined) return;

			const shown = input.type === "password";

			input.type = shown ? "text" : "password";
			button.setAttribute("aria-pressed", String(shown));
			button.setAttribute(
				"aria-label",
				translate(locale, shown ? "password.hide" : "password.show"),
			);
		});
	}
}

/** The dialogs of panel 04, bound to the page. Every user string goes through textContent. */
export function connectDialogs(
	root: Document,
	locale: Locale,
	settings: () => Settings,
): Prompts & AssemblyPrompts {
	const single = required<HTMLDialogElement>(root, '[data-dialog="single"]');
	const summary = required<HTMLDialogElement>(root, '[data-dialog="summary"]');
	const failTemplate = required<HTMLTemplateElement>(root, "[data-fail-template]");
	const incoming = required<HTMLDialogElement>(root, '[data-dialog="incoming"]');
	const result = required<HTMLDialogElement>(root, '[data-dialog="result"]');
	const t = (key: Parameters<typeof translate>[1]): string => translate(locale, key);

	for (const dialog of [single, summary, incoming, result]) connectBack(dialog);

	const failRow = (problems: Items[number]): Node => {
		const row = failTemplate.content.cloneNode(true);

		if (!(row instanceof DocumentFragment)) throw new Error("Fail template is not a fragment");

		const { entry, state } = problems;
		const reason = state.kind === "failed" ? t(failureReason(state.error)) : t("reason.password");

		required(row, ".tile").textContent = kindLabel(entry.kind);
		required(row, "b").textContent = entry.name;
		required(row, ".meta").textContent = reason;

		return row;
	};

	connectReveal(result, locale);

	return {
		async incomingPassword(entry, retry) {
			required(incoming, "[data-title]").textContent = t(
				entry.kind === "pdf" ? "incoming.title.pdf" : "incoming.title.file",
			);
			required(incoming, "[data-kind]").textContent = kindLabel(entry.kind);
			required(incoming, "[data-name]").textContent = entry.name;
			required(incoming, "[data-error]").textContent = retry ? t("incoming.wrong") : "";
			required(incoming, "form").toggleAttribute("data-invalid", retry);

			const answer = await ask(incoming, () => {
				const typed = inputs(incoming)[0]?.value ?? "";

				return typed.length === 0 ? t("result.empty") : undefined;
			});

			return answer.choice === "confirm" ? answer.values.get("password") : undefined;
		},

		async resultPassword(name, pages) {
			required(result, "[data-name]").textContent = name;
			required(result, "[data-meta]").textContent =
				pages === undefined ? fileCount(locale, 1) : pageCount(locale, pages);
			required(result, "[data-error]").textContent = "";

			const answer = await ask(result, () => {
				const [password, repeat] = inputs(result).map((input) => input.value);

				if (password === undefined || password.length === 0) return t("result.empty");

				return password === repeat ? undefined : t("result.mismatch");
			});

			return answer.choice === "confirm" ? answer.values.get("password") : undefined;
		},

		async confirmSinglePdf(entry, name, pages) {
			const current = settings();

			required(single, "[data-name]").textContent = entry.name;
			required(single, "[data-meta]").textContent =
				`${pageCount(locale, pages)} · ${fileSize(locale, entry.size)}`;
			required(single, "[data-size]").textContent = t(`settings.size.${current.size}`);
			required(single, "[data-fit]").textContent =
				current.size === "original" ? "" : fitNote(locale, pages);
			required(single, "[data-quality]").textContent = t(`settings.quality.${current.quality}`);
			required(single, "[data-password]").textContent = t(`settings.password.${current.password}`);
			required(single, "[data-result]").textContent = name;

			const { choice } = await ask(single);

			if (choice === "confirm") return "make";

			return choice === "more" ? "more" : "back";
		},

		async summary(problems, total) {
			required(summary, "[data-title]").textContent = withCount(
				t("summary.title"),
				problems.length,
			).replace("{total}", String(total));
			required(summary, "[data-fails]").replaceChildren(...problems.map(failRow));
			required(summary, "[data-body]").textContent = withCount(
				t("summary.body"),
				total - problems.length,
			);

			return (await ask(summary)).choice === "confirm" ? "without" : "back";
		},
	};
}
