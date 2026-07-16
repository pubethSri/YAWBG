import { z } from "zod";

// Unrefined shape, exported so intents.ts can build a `.partial()` from it —
// `SettingsSchema` below wraps it in `.refine()`, and ZodEffects has no `.partial()`.
export const SettingsObjectSchema = z.object({
  numberPoolSize: z.union([z.literal(75), z.literal(100)]),
  drawsPerRound: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  houseFreeCenter: z.boolean(),
  houseBingoTarget: z.union([z.literal(1), z.literal(2)]),
  houseBoardVisibility: z.enum(["full", "progress", "hidden"]),
  sabotageCells: z.number().int().min(0).max(8),
  sabotagePlacement: z.enum(["random", "middleRow"]),
  playerLinesToWin: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  roundTimerSec: z.number().int().positive().nullable(),
  lastCall: z.boolean(),
  deckIds: z.array(z.string()),
});

export const SettingsSchema = SettingsObjectSchema.refine(
  (s) => s.sabotagePlacement !== "middleRow" || s.sabotageCells === 5,
  { message: "sabotagePlacement 'middleRow' requires sabotageCells === 5" },
);
export type Settings = z.infer<typeof SettingsSchema>;

// Defaults per the lobby-options table in docs/01-game-design.md.
export function defaultSettings(): Settings {
  return {
    numberPoolSize: 75,
    drawsPerRound: 1,
    houseFreeCenter: true,
    houseBingoTarget: 1,
    houseBoardVisibility: "full",
    sabotageCells: 0,
    sabotagePlacement: "random",
    playerLinesToWin: 1,
    roundTimerSec: null,
    lastCall: false,
    deckIds: ["general"],
  };
}
