import { z } from "zod";
import { SettingsSchema } from "./settings";

export const RoomCodeSchema = z.string().regex(/^[A-Z]{4}$/);

export const PhaseSchema = z.enum([
  "lobby",
  "board_fill",
  "distribute",
  "draw",
  "open_floor",
  "last_call",
  "results",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const LockTagSchema = z.object({
  round: z.number().int(),
  drawnNumber: z.number().int(),
  topicId: z.string(),
  topicText: z.string(),
});
export type LockTag = z.infer<typeof LockTagSchema>;

export const PublicCellSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("empty") }),
  z.object({ status: z.literal("filled") }), // name hidden
  z.object({ status: z.literal("locked"), name: z.string(), tag: LockTagSchema }),
]);
export type PublicCell = z.infer<typeof PublicCellSchema>;

export const PublicPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
  fillDone: z.boolean().optional(), // board_fill only
  resolved: z.boolean().optional(), // open_floor: confirmed-or-passed
  board: z.array(PublicCellSchema).length(25),
  linesCompleted: z.number().int(),
  hasWon: z.boolean(),
});
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const HousePublicSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("full"),
    board: z.array(z.number().int()),
    freeCenter: z.boolean(),
    hits: z.array(z.number().int()),
    linesCompleted: z.number().int(),
  }),
  z.object({
    mode: z.literal("progress"),
    bestLineNeeds: z.number().int(),
    linesCompleted: z.number().int(),
  }),
  z.object({ mode: z.literal("hidden") }),
]);
export type HousePublic = z.infer<typeof HousePublicSchema>;

export const ProposalSchema = z.object({
  playerId: z.string(),
  cellIndex: z.number().int().min(0).max(24),
  name: z.string(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const RoundStateSchema = z.object({
  number: z.number().int(),
  drawnNumbers: z.array(z.number().int()),
  allDrawn: z.array(z.number().int()),
  topic: z.object({ id: z.string(), text: z.string() }).nullable(),
  queue: z.array(ProposalSchema),
});
export type RoundState = z.infer<typeof RoundStateSchema>;

export const PrivateCellSchema = z.object({
  name: z.string().nullable(),
  fromPool: z.boolean(), // author hidden until results
  locked: LockTagSchema.nullable(),
});
export type PrivateCell = z.infer<typeof PrivateCellSchema>;

export const PrivateBoardSchema = z.object({
  cells: z.array(PrivateCellSchema).length(25),
  poolSlots: z.array(z.string().nullable()),
});
export type PrivateBoard = z.infer<typeof PrivateBoardSchema>;

export const PublicRoomStateSchema = z.object({
  protocolVersion: z.number().int(),
  code: RoomCodeSchema,
  phase: PhaseSchema,
  settings: SettingsSchema,
  players: z.array(PublicPlayerSchema),
  house: HousePublicSchema.nullable(), // null before distribute
  round: RoundStateSchema.nullable(),
  results: z.null(), // widens to ResultsPayload | null when M4 lands
});
export type PublicRoomState = z.infer<typeof PublicRoomStateSchema>;
