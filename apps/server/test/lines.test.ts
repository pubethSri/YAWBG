import { describe, expect, test } from "bun:test";
import { LINES, bestLineNeeds, countLines } from "../src/lines";

const mask = (...marked: number[]) => {
  const m = Array.from({ length: 25 }, () => false);
  for (const i of marked) m[i] = true;
  return m;
};

describe("lines", () => {
  test("12 lines: 5 rows, 5 columns, 2 diagonals", () => {
    expect(LINES).toHaveLength(12);
    for (const line of LINES) expect(line).toHaveLength(5);
    // Every cell appears in at least 2 lines; the center sits on 4.
    const appearances = (i: number) => LINES.filter((l) => l.includes(i)).length;
    expect(appearances(12)).toBe(4); // center: row, col, both diagonals
    expect(appearances(0)).toBe(3); // corner: row, col, one diagonal
    expect(appearances(1)).toBe(2); // edge: row, col only
  });

  test("empty board completes nothing", () => {
    expect(countLines(mask())).toBe(0);
  });

  test("a full row counts once", () => {
    expect(countLines(mask(5, 6, 7, 8, 9))).toBe(1);
  });

  test("four of five completes nothing", () => {
    expect(countLines(mask(5, 6, 7, 8))).toBe(0);
  });

  test("a shared cell can complete a row and a column at once", () => {
    // top row + left column intersect at 0
    expect(countLines(mask(0, 1, 2, 3, 4, 5, 10, 15, 20))).toBe(2);
  });

  test("full board completes all 12", () => {
    expect(countLines(mask(...Array.from({ length: 25 }, (_, i) => i)))).toBe(12);
  });

  test("bestLineNeeds counts down to zero", () => {
    expect(bestLineNeeds(mask())).toBe(5);
    expect(bestLineNeeds(mask(0, 1, 2))).toBe(2);
    expect(bestLineNeeds(mask(0, 1, 2, 3))).toBe(1);
    expect(bestLineNeeds(mask(0, 1, 2, 3, 4))).toBe(0);
  });

  test("players have no free center: the center is not marked for free", () => {
    // countLines is a pure function of the mask — a player's diagonal needs all
    // five cells locked, center included.
    expect(countLines(mask(0, 6, 18, 24))).toBe(0);
    expect(countLines(mask(0, 6, 12, 18, 24))).toBe(1);
  });
});
