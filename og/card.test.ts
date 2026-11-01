import { describe, expect, test } from "bun:test";

import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";
import { card, escapeHtml } from "./card.ts";

const fonts = { inter: new Uint8Array([1, 2, 3]), mono: new Uint8Array([4, 5, 6]) };

describe("card", () => {
	test.each([
		["es", es],
		["en", en],
	] as const)("the %s card carries its own copy and the site address", (locale, messages) => {
		const html = card(locale, fonts, "pdf.kunatta.tools");

		expect(html).toContain(`<html lang="${locale}">`);
		expect(html).toContain(messages["og.title"].replace("{pdf}", "<em>PDF</em>"));
		expect(html).toContain(messages["og.title.rest"]);
		expect(html).toContain(messages["og.note"]);
		expect(html).toContain(messages["og.note.rest"]);
		expect(html).toContain("pdf.kunatta.tools");
	});

	test("inlines its fonts, so rendering it requests nothing", () => {
		const html = card("es", fonts, "pdf.kunatta.tools");

		expect(html).toContain("url(data:font/woff2;base64,AQID)");
		expect(html).not.toMatch(/(?:src|href)=["']?https?:|url\(["']?https?:/u);
	});
});

describe("escapeHtml", () => {
	test("keeps copy from turning into markup", () => {
		expect(escapeHtml('<b class="x">A & B</b>')).toBe(
			"&lt;b class=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;",
		);
	});
});
