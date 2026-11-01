import { onCLS, onFCP, onINP, onLCP, type Metric } from "web-vitals";

type Vitals = Partial<Record<`$web_vitals_${Metric["name"]}_value`, number>>;

/**
 * Collects the page's Core Web Vitals and reports them together, once, when the page is hidden
 * or all four arrived. Only the numbers leave; the elements and URLs the library notes stay here.
 */
export function watchVitals(report: (vitals: Vitals) => void): void {
	const collected: Vitals = {};
	let sent = false;

	const flush = (): void => {
		if (sent || Object.keys(collected).length === 0) return;

		sent = true;
		report(collected);
	};

	const collect = (metric: Metric): void => {
		collected[`$web_vitals_${metric.name}_value`] = metric.value;

		if (Object.keys(collected).length === 4) flush();
	};

	onCLS(collect);
	onFCP(collect);
	onINP(collect);
	onLCP(collect);
	addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flush();
	});
	addEventListener("pagehide", flush);
}
