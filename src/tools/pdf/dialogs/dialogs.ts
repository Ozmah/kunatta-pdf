import { Panic } from "better-result";

import { fileCount, fileSize, fitNote, interpolate, pageCount } from "../../../i18n/format.ts";
import type { Locale } from "../../../i18n/locales.ts";
import { translate, translator } from "../../../i18n/translate.ts";
import { ask, connectBack, inputs } from "../../../lib/dialog.ts";
import { required } from "../../../lib/dom.ts";
import { failureReason, kindLabel } from "../shared/labels.ts";
import type { AssemblyPrompts, Problem, Prompts } from "../shared/prompts.ts";
import type { Settings } from "../shared/settings.ts";

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

/** The PDF tool's dialogs, bound to the page. Every user string goes through textContent. */
export function connectDialogs(
	host: HTMLElement,
	locale: Locale,
	settings: () => Settings,
): Prompts & AssemblyPrompts {
	const single = required<HTMLDialogElement>(host, '[data-dialog="single"]');
	const summary = required<HTMLDialogElement>(host, '[data-dialog="summary"]');
	const failTemplate = required<HTMLTemplateElement>(host, "[data-fail-template]");
	const incoming = required<HTMLDialogElement>(host, '[data-dialog="incoming"]');
	const result = required<HTMLDialogElement>(host, '[data-dialog="result"]');
	const t = translator(locale);

	for (const dialog of [single, summary, incoming, result]) connectBack(dialog);

	const failRow = (problem: Problem): Node => {
		const row = failTemplate.content.cloneNode(true);

		if (!(row instanceof DocumentFragment)) {
			throw new Panic({ message: "The failure template did not clone into a fragment" });
		}

		const reason = problem.error === undefined ? "reason.password" : failureReason(problem.error);

		required(row, ".tile").textContent = kindLabel(problem.kind);
		required(row, "b").textContent = problem.name;
		required(row, ".meta").textContent = t(reason);

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
			required(summary, "[data-title]").textContent = interpolate(t("summary.title"), {
				count: problems.length,
				total,
			});
			required(summary, "[data-fails]").replaceChildren(...problems.map(failRow));
			required(summary, "[data-body]").textContent = interpolate(t("summary.body"), {
				count: total - problems.length,
			});

			return (await ask(summary)).choice === "confirm" ? "without" : "back";
		},
	};
}
