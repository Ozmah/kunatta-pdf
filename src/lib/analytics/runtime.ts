import type { PostHogConfig } from "posthog-js";

import { documentLocale } from "../../i18n/locales.ts";
import {
	pages,
	privacyRequested,
	sanitize,
	type Catalog,
	type Context,
	type Page,
} from "./events.ts";
import { connectTracking, disableTracking, enableTracking } from "./track.ts";

/**
 * Starts anonymous product analytics. Main thread only; the worker never imports it.
 * Nothing is stored on the device, no profile is built, and only allowlisted events leave.
 */

/** Every automatic feature off: no autocapture, replay, surveys, flags or remote scripts. */
const options = {
	api_host: "https://us.i.posthog.com",
	defaults: "2026-08-30",
	persistence: "memory",
	disable_persistence: true,
	person_profiles: "never",
	autocapture: false,
	capture_pageview: false,
	capture_pageleave: true,
	capture_performance: false,
	capture_exceptions: false,
	capture_heatmaps: false,
	capture_dead_clicks: false,
	rageclick: false,
	disable_session_recording: true,
	disable_surveys: true,
	disable_product_tours: true,
	disable_conversations: true,
	disable_web_experiments: true,
	disable_external_dependency_loading: true,
	advanced_disable_flags: true,
	disable_capture_url_hashes: true,
	save_referrer: false,
	save_campaign_params: false,
	respect_dnt: true,
} satisfies Partial<PostHogConfig>;

const campaign = ["utm_source", "utm_medium", "utm_campaign"] as const;

function browserAsksForPrivacy(): boolean {
	// SAFETY: Global Privacy Control is missing from the DOM types; where a browser lacks it the
	// property reads as undefined, which counts as no signal.
	const signals = navigator as Navigator & { readonly globalPrivacyControl?: boolean };

	return privacyRequested(signals.globalPrivacyControl, navigator.doNotTrack);
}

function contextOf(root: Document): Context {
	const page: Page = pages.find((known) => known === root.body.dataset["page"]) ?? "tool";

	return { page, lang: documentLocale(root) };
}

/** The campaign tags in the address; `sanitize` drops any that is not a short plain tag. */
function campaignTags(search: string): Partial<Record<(typeof campaign)[number], string>> {
	const params = new URLSearchParams(search);

	return Object.fromEntries(
		campaign.flatMap((key) => {
			const value = params.get(key);

			return value === null ? [] : [[key, value]];
		}),
	);
}

/** `catalog` is the tool's own events; anything outside it and the page events is dropped. */
export function startAnalytics(token: string, site: URL, catalog: Catalog): void {
	if (browserAsksForPrivacy()) return;

	enableTracking();

	const where = contextOf(document);

	void import("posthog-js/dist/module.slim.no-external")
		.then(({ default: posthog }) => {
			posthog.init(token, {
				...options,
				before_send: (event) =>
					browserAsksForPrivacy() ? null : sanitize(event, catalog, where, site, token),
				loaded: (client) => {
					client.capture("$pageview", campaignTags(location.search));
					connectTracking(client);
					void import("./vitals.ts").then(({ watchVitals }) =>
						watchVitals((properties) => client.capture("$web_vitals", properties)),
					);
				},
			});
		})
		.catch(disableTracking);
}
