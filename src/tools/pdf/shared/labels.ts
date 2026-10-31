import type { MessageKey } from "../../../i18n/es.ts";
import { interpolate } from "../../../i18n/format.ts";
import type { Locale } from "../../../i18n/locales.ts";
import { translate } from "../../../i18n/translate.ts";
import {
	CompositionFailed,
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
	type ComposeJobError,
	type JobError,
} from "../contract/errors.ts";
import type { InputKind } from "../contract/kinds.ts";
import { fileKinds } from "./file-kinds.ts";

/** The label on the file's card: JPG instead of jpeg, TXT for plain text. */
export function kindLabel(kind: InputKind): string {
	return fileKinds[kind].label;
}

/** The notice shown after a degraded conversion, chosen by what usually goes wrong for that kind. */
export function degradedNotice(kind: InputKind): MessageKey {
	switch (kind) {
		case "doc":
		case "xls":
		case "ppt":
			return `degraded.${kind}`;
		case "text":
			return "degraded.text";
		default:
			return "degraded.other";
	}
}

/** What the failed card says about why. */
export function failureReason(error: JobError | ComposeJobError): MessageKey {
	if (PasswordRequired.is(error)) return "reason.password";

	if (EngineUnavailable.is(error)) return "reason.engine";

	if (CompositionFailed.is(error)) return "reason.composition";

	if (ConversionFailed.is(error)) return "reason.damaged";

	// WorkerCrashed, or a cancellation the fast path never asks for.
	return "reason.crashed";
}

/** The rejected-files notice: one file reads "x no se puede…", several read "No entraron N archivos: a, b". */
export function rejectionMessage(locale: Locale, count: number): string {
	return count === 1
		? translate(locale, "rejected.one")
		: interpolate(translate(locale, "rejected.many"), { count });
}
