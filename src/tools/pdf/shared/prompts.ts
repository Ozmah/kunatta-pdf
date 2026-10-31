import type { InputKind } from "../contract/kinds.ts";
import type { JobError } from "../contract/errors.ts";
import type { PileEntry } from "./entry.ts";

export type SingleChoice = "make" | "back" | "more";

/** What the user can be asked along the way. Each prompt resolves to undefined when they back out. */
export interface Prompts {
	/** A protected file needs its password; `retry` is true after a wrong one. */
	incomingPassword(entry: PileEntry, retry: boolean): Promise<string | undefined>;
	/** The password for the result, typed twice; only asked when the setting is on. */
	resultPassword(name: string, pages: number | undefined): Promise<string | undefined>;
	/** The single-PDF dialog: make the PDF, go back, or add more files around it. */
	confirmSinglePdf(entry: PileEntry, name: string, pages: number): Promise<SingleChoice>;
}

/** A file that keeps the list from being composed as it is. */
export interface Problem {
	readonly name: string;
	readonly kind: InputKind;
	/** Why it failed; undefined while it still waits for its password. */
	readonly error: JobError | undefined;
}

export interface AssemblyPrompts {
	/** "No pudimos convertir N de M": back to the list, or make the PDF without them. */
	summary(problems: ReadonlyArray<Problem>, total: number): Promise<"back" | "without">;
	resultPassword(name: string, pages: number): Promise<string | undefined>;
}
