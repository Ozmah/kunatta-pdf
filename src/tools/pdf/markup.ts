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
