import { describe, expect, test } from "bun:test";

import { edgeSpeed, targetPosition } from "./reorder-motion.ts";

// Four other rows, 64 px tall with 8 px gaps; the second one is pinned.
const others = [
	{ mid: 32, pinned: false },
	{ mid: 104, pinned: true },
	{ mid: 176, pinned: false },
	{ mid: 248, pinned: false },
];

describe("targetPosition", () => {
	test("counts the unpinned rows above the dragged row's center", () => {
		expect(targetPosition(others, 0)).toBe(0);
		expect(targetPosition(others, 40)).toBe(1);
		expect(targetPosition(others, 200)).toBe(2);
		expect(targetPosition(others, 400)).toBe(3);
	});

	test("skips pinned rows: crossing one does not change the slot", () => {
		expect(targetPosition(others, 90)).toBe(targetPosition(others, 120));
	});

	test("an empty list always lands first", () => {
		expect(targetPosition([], 500)).toBe(0);
	});
});

describe("edgeSpeed", () => {
	test("does not scroll away from the edges", () => {
		expect(edgeSpeed(400, 800)).toBe(0);
		expect(edgeSpeed(64, 800)).toBe(0);
		expect(edgeSpeed(736, 800)).toBe(0);
	});

	test("scrolls up near the top and down near the bottom, faster closer to the edge", () => {
		expect(edgeSpeed(32, 800)).toBe(-8);
		expect(edgeSpeed(0, 800)).toBe(-16);
		expect(edgeSpeed(768, 800)).toBe(8);
		expect(edgeSpeed(800, 800)).toBe(16);
	});

	test("caps the speed when the pointer leaves the viewport", () => {
		expect(edgeSpeed(-50, 800)).toBe(-16);
		expect(edgeSpeed(900, 800)).toBe(16);
	});
});
