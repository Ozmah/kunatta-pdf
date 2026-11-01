import { describe, expect, test } from "bun:test";

import { ConversionFailed, WorkerCrashed } from "./contract/errors.ts";
import type { PileEntry } from "./shared/entry.ts";
import { defaultSettings } from "./shared/settings.ts";
import {
	countRange,
	durationRange,
	filesAdded,
	pageRange,
	pdfEvents,
	pdfFailed,
	pdfMade,
	sizeRange,
} from "./telemetry.ts";
import * as v from "valibot";

const mebibyte = 1024 * 1024;

function entry(name: string, kind: PileEntry["kind"], size: number): PileEntry {
	return { id: name, name, kind, size, source: new Blob() };
}

describe("filesAdded", () => {
	test("reports counts, kinds and the total size in ranges, never the names", () => {
		const properties = filesAdded(
			[entry("tesis-final.docx", "docx", 3 * mebibyte), entry("foto.jpeg", "jpeg", 2 * mebibyte)],
			1,
			"drop",
			"assembly",
		);

		expect(properties).toEqual({
			origin: "drop",
			path: "assembly",
			files: "2-5",
			rejected: "1",
			kinds: ["docx", "jpeg"],
			total_size: "1-10MB",
		});
		expect(JSON.stringify(properties)).not.toContain("tesis");
	});

	test("names the single PDF path the way analytics spells it", () => {
		expect(filesAdded([entry("a.pdf", "pdf", 10)], 0, "pick", "single-pdf").path).toBe(
			"single_pdf",
		);
	});
});

describe("pdfMade", () => {
	test("keeps the settings that shape the PDF and drops the name", () => {
		const properties = pdfMade(
			"fast",
			1,
			{ pdf: new Blob([new Uint8Array(2048)]), pages: 12, degraded: false },
			{ ...defaultSettings, name: "Contrato Juan Pérez", password: "on" },
			6500,
		);

		expect(properties).toEqual({
			path: "fast",
			files: "1",
			pages: "11-50",
			size: "<1MB",
			seconds: "5-20s",
			page_size: "letter",
			quality: "normal",
			protected: true,
			degraded: false,
		});
		expect(JSON.stringify(properties)).not.toContain("Juan");
	});
});

describe("pdfFailed", () => {
	test("reports the error's kind, not its message, which may hold a file name", () => {
		const error = new ConversionFailed({
			fileName: "secreto.docx",
			reason: "bad zip",
			message: "secreto.docx is broken",
		});

		expect(pdfFailed("fast", error, "docx")).toEqual({
			path: "fast",
			reason: "ConversionFailed",
			kind: "docx",
		});
	});

	test("leaves the kind out for a list", () => {
		expect(pdfFailed("assembly", new WorkerCrashed({ fileName: "x", message: "gone" }))).toEqual({
			path: "assembly",
			reason: "WorkerCrashed",
		});
	});
});

describe("ranges", () => {
	test.each([
		[0, "0"],
		[1, "1"],
		[5, "2-5"],
		[20, "6-20"],
		[100, "21+"],
	] as const)("%i files is %s", (count, range) => {
		expect(countRange(count)).toBe(range);
	});

	test("sizes, pages and times fall in their ranges", () => {
		expect([sizeRange(0), sizeRange(5 * mebibyte), sizeRange(60 * mebibyte)]).toEqual([
			"<1MB",
			"1-10MB",
			"50MB+",
		]);
		expect([pageRange(1), pageRange(11), pageRange(500)]).toEqual(["1", "11-50", "51+"]);
		expect([durationRange(300), durationRange(4999), durationRange(60_000)]).toEqual([
			"<1s",
			"1-5s",
			"20s+",
		]);
	});
});

describe("pdfEvents", () => {
	test("accepts what the builders produce, so no event is dropped on its way out", () => {
		const added = filesAdded([entry("a.png", "png", 10)], 0, "paste", "assembly");

		expect(v.is(pdfEvents.files_added, added)).toBe(true);
	});
});
