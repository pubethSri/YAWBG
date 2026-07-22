// Bingo lines over a 5x5 row-major board: 5 rows, 5 columns, 2 diagonals.
// One module, two callers — the House (marked = cell index is hit) and each
// player (marked = cell is locked). The only difference is how the mask is
// built. NOTE players have no free center: docs/01 fixes "players fill all 25
// cells (no player free-center)" as a rule, not a setting.
export const LINES: readonly (readonly number[])[] = [
  // rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function countLines(marked: readonly boolean[]): number {
  return LINES.filter((line) => line.every((i) => marked[i])).length;
}

/** Fewest unmarked cells across all lines; 0 once any line is complete. */
export function bestLineNeeds(marked: readonly boolean[]): number {
  return Math.min(...LINES.map((line) => line.filter((i) => !marked[i]).length));
}
