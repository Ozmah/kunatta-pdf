import { Panic } from "better-result";

/**
 * An element the page always renders. When it is missing, the markup and the script drifted apart:
 * a bug to fix, not a failure to show the user.
 */
export function required<Element extends HTMLElement>(root: ParentNode, selector: string): Element {
	const element = root.querySelector<Element>(selector);

	if (element === null) throw new Panic({ message: `The page is missing ${selector}` });

	return element;
}

/**
 * A custom element the page always renders, already upgraded to its class. Each component's
 * script defines its element, and module scripts run in document order, before the script that
 * wires them; a mismatch means the markup or that script went missing: a bug, like a missing selector.
 */
export function upgraded<Custom extends HTMLElement>(
	root: ParentNode,
	tag: string,
	kind: new () => Custom,
): Custom {
	const element = root.querySelector(tag);

	if (!(element instanceof kind)) throw new Panic({ message: `The page is missing <${tag}>` });

	return element;
}

/** Defines a custom element once; a second evaluation of the module must not throw. */
export function defineOnce(tag: string, kind: CustomElementConstructor): void {
	if (customElements.get(tag) === undefined) customElements.define(tag, kind);
}
