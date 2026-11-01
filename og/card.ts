import { translator } from "../src/i18n/translate.ts";
import type { Locale } from "../src/i18n/locales.ts";

/**
 * The share image as one self-contained HTML document: the tool's drop zone turning files into
 * a PDF, next to the promise that nothing is uploaded. Fonts arrive inlined, so rendering it
 * makes no request at all. `render.ts` turns it into public/og/<locale>.png.
 */

export const size = { width: 1200, height: 630 } as const;

export interface Fonts {
	/** Inter, latin, variable: the same file the site serves. */
	readonly inter: Uint8Array;
	/** Paper Mono, variable. */
	readonly mono: Uint8Array;
}

const palette = {
	cheviot: "#f6f2e8",
	grape: "#c5c0c9",
	pacific: "#c0d6ea",
	lime: "#ddff55",
	neptune: "#11425d",
	midnight: "#002233",
} as const;

/** The fan from the empty drop zone, a little larger. */
const fan: ReadonlyArray<readonly [string, string, string, number]> = [
	["JPG", palette.grape, "translate(-140px, 14px) rotate(-16deg)", 0],
	["DOCX", palette.cheviot, "translate(-72px, -2px) rotate(-7deg)", 1],
	["PPTX", palette.pacific, "translateY(-12px) rotate(-1deg)", 2],
	["XLSX", palette.cheviot, "translate(72px, -2px) rotate(8deg)", 1],
	["PNG", palette.grape, "translate(140px, 14px) rotate(17deg)", 0],
];

const logo = `<svg width="56" height="56" viewBox="0 0 64 64"><g transform="rotate(-8 32 32)"><polygon points="11,9 37,9 47,19 47,61 11,61" fill="${palette.lime}"/><polygon points="14,6 40,6 50,16 50,58 14,58" fill="${palette.cheviot}" stroke="${palette.midnight}" stroke-width="3"/><polyline points="40,6 40,16 50,16" fill="none" stroke="${palette.midnight}" stroke-width="3"/></g><g transform="translate(3 4) scale(2.45)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="${palette.lime}" stroke="${palette.midnight}" stroke-width="1.2" stroke-linejoin="round"/></g></svg>`;

export function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function fontUrl(bytes: Uint8Array): string {
	return `data:font/woff2;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function card(locale: Locale, fonts: Fonts, host: string): string {
	const t = translator(locale);
	const title = escapeHtml(t("og.title")).replace("{pdf}", "<em>PDF</em>");

	const cards = fan
		.map(
			([label, color, place, layer]) =>
				`<span class="card" style="background:${color};transform:${place};z-index:${layer}">${label}</span>`,
		)
		.join("");

	return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${fontUrl(fonts.inter)}) format("woff2");font-weight:100 900}
@font-face{font-family:"Paper Mono";src:url(${fontUrl(fonts.mono)}) format("woff2");font-weight:100 800}
*{margin:0;box-sizing:border-box}
body{position:relative;width:${size.width}px;height:${size.height}px;overflow:hidden;background:${palette.midnight};color:${palette.cheviot};font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.brand{position:absolute;top:56px;left:72px;display:flex;align-items:center;gap:16px;font-weight:800;font-size:40px;letter-spacing:-.04em}
.copy{position:absolute;top:180px;left:72px;width:640px;display:flex;flex-direction:column;gap:24px}
h1{font-size:78px;font-weight:800;letter-spacing:-.05em;line-height:1;white-space:nowrap}
em{font-style:normal;color:${palette.lime}}
p{max-width:600px;font:500 22px "Paper Mono",monospace;line-height:1.45;color:${palette.pacific}}
.url{position:absolute;bottom:56px;left:72px;padding-bottom:6px;border-bottom:3px solid ${palette.lime};font:700 24px "Paper Mono",monospace}
.panel{position:absolute;top:110px;right:56px;width:400px;height:410px;isolation:isolate;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.panel::before{content:"";position:absolute;inset:0;z-index:-2;background:${palette.neptune};transform:translate(-12px,12px) rotate(-1deg)}
.panel::after{content:"";position:absolute;inset:0;z-index:-1;border:3px dashed ${palette.pacific};transform:rotate(.6deg)}
.fan{position:relative;width:340px;height:130px;transform:scale(.92)}
.card{position:absolute;bottom:0;left:50%;width:78px;height:100px;margin-left:-39px;display:grid;place-items:center;border:2.5px solid ${palette.midnight};box-shadow:-5px 5px 0 ${palette.midnight};color:${palette.midnight};font:700 14px "Paper Mono",monospace}
.down path{fill:none;stroke:${palette.pacific};stroke-width:3;stroke-linecap:square}
.pdf{display:grid;place-items:center;width:104px;height:134px;background:${palette.lime};border:3px solid ${palette.midnight};box-shadow:-7px 7px 0 ${palette.midnight};color:${palette.midnight};font:800 22px "Paper Mono",monospace;transform:rotate(-3deg)}
</style></head><body>
<div class="brand">${logo}kunatta</div>
<div class="copy"><h1>${title}<br>${escapeHtml(t("og.title.rest"))}</h1><p>${escapeHtml(t("og.note"))}<br>${escapeHtml(t("og.note.rest"))}</p></div>
<span class="url">${escapeHtml(host)}</span>
<div class="panel"><div class="fan">${cards}</div><svg class="down" width="28" height="44" viewBox="0 0 28 44"><path d="M14 2v36M4 28l10 12 10-12"/></svg><span class="pdf">PDF</span></div>
</body></html>`;
}
