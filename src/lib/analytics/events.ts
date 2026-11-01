import type { CaptureResult, Properties } from "posthog-js";
import * as v from "valibot";

import { locales } from "../../i18n/locales.ts";

/**
 * The analytics allowlist. Each tool brings a catalog of its own events; this module adds the
 * SDK's page events and rebuilds every event from both right before it leaves the browser.
 * Values are enums or ranges, never free text, so a file name, a password or anything typed
 * cannot fit in them.
 */

export const pages = ["tool", "not_found", "privacy"] as const;

export type Page = (typeof pages)[number];

/** What every event carries: the page and its language, added as each event leaves. */
const context = v.object({ page: v.picklist(pages), lang: v.picklist(locales) });

export type Context = v.InferInput<typeof context>;

/** A tool's events: each name with the only properties it may carry. */
export type Catalog = Readonly<Record<string, v.GenericSchema<unknown, Properties>>>;

/** A short campaign tag such as `reddit` or `launch-week`; anything else drops the event. */
const campaignTag = v.pipe(v.string(), v.toLowerCase(), v.regex(/^[a-z0-9._-]{1,40}$/u));

const vital = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(600_000));

const pageEvents = {
	$pageview: v.object({
		utm_source: v.optional(campaignTag),
		utm_medium: v.optional(campaignTag),
		utm_campaign: v.optional(campaignTag),
	}),
	$pageleave: v.object({
		$prev_pageview_duration: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(86_400))),
	}),
	$web_vitals: v.object({
		$web_vitals_LCP_value: v.optional(vital),
		$web_vitals_INP_value: v.optional(vital),
		$web_vitals_CLS_value: v.optional(vital),
		$web_vitals_FCP_value: v.optional(vital),
	}),
} satisfies Catalog;

const id = v.pipe(v.string(), v.maxLength(64));
const label = v.pipe(v.string(), v.maxLength(40));

/**
 * Properties the SDK adds that are safe and needed for sessions, browsers and referrers.
 * `$process_person_profile: false` keeps PostHog from building a profile per visitor.
 */
const sdkProperties = v.object({
	distinct_id: id,
	$session_id: v.optional(id),
	$window_id: v.optional(id),
	$insert_id: v.optional(id),
	$time: v.optional(v.number()),
	$lib: v.optional(label),
	$lib_version: v.optional(label),
	$browser: v.optional(label),
	$os: v.optional(label),
	$device_type: v.optional(v.picklist(["Desktop", "Mobile", "Tablet", "Console", "Wearable"])),
	$referring_domain: v.optional(v.pipe(v.string(), v.regex(/^(?:\$direct|[a-z0-9.-]{1,253})$/u))),
	$process_person_profile: v.literal(false),
});

/** The address of a page without query or fragment, which may carry anything. */
function pagePath(where: Context): string {
	if (where.page === "not_found") return `/${where.lang}/404/`;

	if (where.page === "privacy") return `/${where.lang}/privacy/`;

	return `/${where.lang}/`;
}

/** Own keys only, so `constructor` or `__proto__` never pass for an event. */
function lookup(events: Catalog, name: string): Catalog[string] | undefined {
	return Object.hasOwn(events, name) ? events[name] : undefined;
}

/** A PostHog project key: public by design, it only lets a browser send events. */
export function isProjectKey(key: string | undefined): key is string {
	return key !== undefined && /^phc_[A-Za-z0-9]{20,64}$/u.test(key);
}

/**
 * The event rebuilt from the allowlist, or null when the event or any of its values is not on it.
 * Runs as PostHog's `before_send`, after the SDK has added its own properties.
 */
export function sanitize(
	event: CaptureResult | null,
	catalog: Catalog,
	where: Context,
	site: URL,
	token: string,
): CaptureResult | null {
	if (event === null) return null;

	const schema = lookup(pageEvents, event.event) ?? lookup(catalog, event.event);

	if (schema === undefined) return null;

	const own = v.safeParse(schema, event.properties);
	const sdk = v.safeParse(sdkProperties, event.properties);
	const page = v.safeParse(context, where);

	if (!own.success || !sdk.success || !page.success) return null;

	const pathname = pagePath(page.output);

	// Rebuilt field by field, so person updates ($set, $set_once, $unset) never ride along.
	const rebuilt: CaptureResult = {
		uuid: event.uuid,
		event: event.event,
		properties: {
			...sdk.output,
			...own.output,
			...page.output,
			token,
			$current_url: new URL(pathname, site).href,
			$host: site.host,
			$pathname: pathname,
		},
	};

	if (event.timestamp !== undefined) rebuilt.timestamp = event.timestamp;

	return rebuilt;
}

/** Do Not Track or Global Privacy Control, in any of the shapes browsers report them. */
export function privacyRequested(
	...signals: ReadonlyArray<boolean | string | null | undefined>
): boolean {
	return signals.some((signal) => signal === true || /^\s*(?:1|yes)\s*$/iu.test(String(signal)));
}
