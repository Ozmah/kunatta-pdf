/** Apple keyboards paste with ⌘ instead of Ctrl. */
export function isApplePlatform(platform: string): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The modifier shown in "o pega con Ctrl V" on this device. */
export function pasteModifier(page: Document): string {
	const platform =
		page.defaultView?.navigator.platform || page.defaultView?.navigator.userAgent || "";

	return isApplePlatform(platform) ? "⌘" : "Ctrl";
}
