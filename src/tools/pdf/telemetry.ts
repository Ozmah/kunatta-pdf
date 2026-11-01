import * as v from "valibot";

import { track } from "../../lib/analytics/track.ts";
import { inputKinds, type InputKind } from "./contract/kinds.ts";
import {
	CompositionFailed,
	ConversionCancelled,
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
	type ComposeJobError,
	type JobError,
} from "./contract/errors.ts";
import { pageSizes, qualities } from "./contract/options.ts";
import type { Path } from "./intake/paths.ts";
import type { PileEntry } from "./shared/entry.ts";
import type { Origin } from "./shared/files.ts";
import type { MadePdf } from "./shared/outcome.ts";
import type { Settings } from "./shared/settings.ts";

/**
 * The PDF tool's analytics events and how they are built from what the tool did. Counts, sizes,
 * pages and times go out as ranges; names, contents, the PDF name and passwords never do.
 */

const counts = ["0", "1", "2-5", "6-20", "21+"] as const;
const sizes = ["<1MB", "1-10MB", "10-50MB", "50MB+"] as const;
const pageCounts = ["1", "2-10", "11-50", "51+"] as const;
const durations = ["<1s", "1-5s", "5-20s", "20s+"] as const;
const madePaths = ["fast", "single_pdf", "assembly"] as const;

const reasons = [
	"ConversionFailed",
	"PasswordRequired",
	"EngineUnavailable",
	"CompositionFailed",
	"WorkerCrashed",
	"ConversionCancelled",
] as const;

export type MadePath = (typeof madePaths)[number];

export const pdfEvents = {
	files_added: v.object({
		origin: v.picklist(["drop", "pick", "paste"]),
		path: v.picklist([...madePaths, "list", "none"]),
		files: v.picklist(counts),
		rejected: v.picklist(counts),
		kinds: v.pipe(v.array(v.picklist(inputKinds)), v.maxLength(inputKinds.length)),
		total_size: v.picklist(sizes),
	}),
	pdf_made: v.object({
		path: v.picklist(madePaths),
		files: v.picklist(counts),
		pages: v.picklist(pageCounts),
		size: v.picklist(sizes),
		seconds: v.picklist(durations),
		page_size: v.picklist(pageSizes),
		quality: v.picklist(qualities),
		protected: v.boolean(),
		degraded: v.boolean(),
	}),
	pdf_failed: v.object({
		path: v.picklist(madePaths),
		reason: v.picklist(reasons),
		kind: v.optional(v.picklist(inputKinds)),
	}),
} as const;

type PdfEvent = keyof typeof pdfEvents;

export type PdfEventProperties<Name extends PdfEvent> = v.InferOutput<(typeof pdfEvents)[Name]>;

/** Sends one of the tool's events. A no-op unless analytics started (production, no privacy signal). */
export function report<Name extends PdfEvent>(
	event: Name,
	properties: PdfEventProperties<Name>,
): void {
	track(event, properties);
}

const mebibyte = 1024 * 1024;

export function countRange(count: number): (typeof counts)[number] {
	if (count <= 0) return "0";

	if (count === 1) return "1";

	if (count <= 5) return "2-5";

	return count <= 20 ? "6-20" : "21+";
}

export function sizeRange(bytes: number): (typeof sizes)[number] {
	if (bytes < mebibyte) return "<1MB";

	if (bytes < 10 * mebibyte) return "1-10MB";

	return bytes < 50 * mebibyte ? "10-50MB" : "50MB+";
}

export function pageRange(count: number): (typeof pageCounts)[number] {
	if (count <= 1) return "1";

	if (count <= 10) return "2-10";

	return count <= 50 ? "11-50" : "51+";
}

export function durationRange(milliseconds: number): (typeof durations)[number] {
	if (milliseconds < 1000) return "<1s";

	if (milliseconds < 5000) return "1-5s";

	return milliseconds < 20_000 ? "5-20s" : "20s+";
}

/** The error's kind; its message may hold a file name, so it never leaves. */
function reasonOf(error: JobError | ComposeJobError): (typeof reasons)[number] {
	if (ConversionFailed.is(error)) return "ConversionFailed";

	if (PasswordRequired.is(error)) return "PasswordRequired";

	if (EngineUnavailable.is(error)) return "EngineUnavailable";

	if (CompositionFailed.is(error)) return "CompositionFailed";

	return ConversionCancelled.is(error) ? "ConversionCancelled" : "WorkerCrashed";
}

export function filesAdded(
	accepted: ReadonlyArray<PileEntry>,
	rejected: number,
	origin: Origin,
	path: Path["kind"] | "list",
): PdfEventProperties<"files_added"> {
	const kinds = [...new Set(accepted.map((entry) => entry.kind))].toSorted();

	return {
		origin,
		path: path === "single-pdf" ? "single_pdf" : path,
		files: countRange(accepted.length),
		rejected: countRange(rejected),
		kinds,
		total_size: sizeRange(accepted.reduce((total, entry) => total + entry.size, 0)),
	};
}

export function pdfMade(
	path: MadePath,
	files: number,
	made: Pick<MadePdf, "pdf" | "pages" | "degraded">,
	settings: Settings,
	milliseconds: number,
): PdfEventProperties<"pdf_made"> {
	return {
		path,
		files: countRange(files),
		pages: pageRange(made.pages),
		size: sizeRange(made.pdf.size),
		seconds: durationRange(milliseconds),
		page_size: settings.size,
		quality: settings.quality,
		protected: settings.password === "on",
		degraded: made.degraded,
	};
}

export function pdfFailed(
	path: MadePath,
	error: JobError | ComposeJobError,
	kind?: InputKind,
): PdfEventProperties<"pdf_failed"> {
	const reason = reasonOf(error);

	return kind === undefined ? { path, reason } : { path, reason, kind };
}
