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

export const TopicSchema = z.object({ id: z.string(), text: z.string() });
export type Topic = z.infer<typeof TopicSchema>;

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
    // null at index 12 when freeCenter — a real bingo card prints FREE there,
    // and a number on a free cell would be undrawable dead weight.
    board: z.array(z.number().int().nullable()).length(25),
    freeCenter: z.boolean(),
    hits: z.array(z.number().int().min(0).max(24)), // cell indices, not numbers
    linesCompleted: z.number().int(),
    // Sent here as well as in `progress` so the House chip reads the same in
    // every mode and the client never has to compute lines itself.
    bestLineNeeds: z.number().int(),
  }),
  z.object({
    mode: z.literal("progress"),
    bestLineNeeds: z.number().int(),
    linesCompleted: z.number().int(),
  }),
  z.object({ mode: z.literal("hidden") }),
]);
export type HousePublic = z.infer<typeof HousePublicSchema>;

// `name` is public the moment it's proposed (docs/03) — the sole sanctioned
// exception to the public/private split: an unlocked name leaves its owner's
// socket by being copied in here, which getPublicState() emits to everyone.
export const ProposalSchema = z.object({
  // v4: server-assigned, unique within the game. (playerId, cellIndex) is *not*
  // a safe key — a player may withdraw and re-propose the same cell in the same
  // round, and the reel has to tell those two apart to attach cheers correctly.
  id: z.string(),
  playerId: z.string(),
  cellIndex: z.number().int().min(0).max(24),
  name: z.string(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ProposalOutcomeSchema = z.enum(["live", "locked", "withdrawn"]);
export type ProposalOutcome = z.infer<typeof ProposalOutcomeSchema>;

export const RoundProposalSchema = z.object({
  proposal: ProposalSchema,
  outcome: ProposalOutcomeSchema,
});
export type RoundProposal = z.infer<typeof RoundProposalSchema>;

export const RoundStateSchema = z.object({
  number: z.number().int(),
  drawnNumbers: z.array(z.number().int()),
  allDrawn: z.array(z.number().int()),
  topic: TopicSchema.nullable(),
  queue: z.array(ProposalSchema),
  /**
   * v4: everything proposed *this* round, in the order it was proposed —
   * withdrawn names included, so they stay cheerable and still reach the reel
   * (docs/10 decision 4). Carries no cheer counts: the tally is the surprise,
   * and nothing on this frame may hint at it while a decision is live. Cleared
   * with the round.
   */
  proposals: z.array(RoundProposalSchema),
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
  /**
   * v4: which of this round's proposals *I* have cheered. On the private frame
   * rather than kept client-local, so a phone that reconnects mid-round can't
   * forget and let the same player cheer the same name twice. Only ever my own
   * state — the counts live nowhere on the wire until `results.reel`.
   */
  cheeredProposalIds: z.array(z.string()),
});
export type PrivateBoard = z.infer<typeof PrivateBoardSchema>;

export const ResultsBoardCellSchema = z.object({
  name: z.string(),
  authorId: z.string().nullable(), // null = self; a pool name's author, revealed at last
  locked: LockTagSchema.nullable(),
});
export type ResultsBoardCell = z.infer<typeof ResultsBoardCellSchema>;

export const ResultsBoardSchema = z.object({
  playerId: z.string(),
  cells: z.array(ResultsBoardCellSchema).length(25),
});
export type ResultsBoard = z.infer<typeof ResultsBoardSchema>;

export const RoundHistoryEntrySchema = z.object({
  round: z.number().int(),
  drawnNumbers: z.array(z.number().int()),
  topicText: z.string(),
  locks: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      cellIndex: z.number().int().min(0).max(24),
    }),
  ),
});
export type RoundHistoryEntry = z.infer<typeof RoundHistoryEntrySchema>;

export const ReelEntrySchema = z.object({
  proposalId: z.string(),
  playerId: z.string(),
  // Carried, not looked up: a player removed by grace expiry mid-game is gone
  // from `players` by results, and their entry still has to render (docs/10).
  playerName: z.string(),
  name: z.string(),
  outcome: z.enum(["locked", "withdrawn"]),
  cheers: z.number().int().min(0),
});
export type ReelEntry = z.infer<typeof ReelEntrySchema>;

export const ReelCardSchema = z.object({
  round: z.number().int(),
  topicText: z.string(),
  drawnNumbers: z.array(z.number().int()),
  entries: z.array(ReelEntrySchema),
});
export type ReelCard = z.infer<typeof ReelCardSchema>;

export const ResultsPayloadSchema = z.object({
  // Host-paced: 0 winners -> 1 pool authorship -> 2 boards + share -> 3 the
  // reel, driven by the host-only `results.advance` intent. When K = 0 stage 1
  // is skipped (docs/03 invariant 10) — there is no pool to roast. Stage 3 is
  // never skipped: it is also the play-again screen (docs/10 decision 1).
  revealStage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  winners: z.array(z.string()), // playerIds
  /**
   * **Empty at stage 0.** The stage gates the wire, not just the render: the
   * authorship roast is the best moment in the game and shipping it one stage
   * early would spoil it for anyone with devtools open. Stage 1 is where names
   * and `authorId` first travel, and it is also what the roast is made of, so
   * the two stages share one gate. Redacting per-recipient is not an option —
   * this payload rides the single public frame that also feeds displays.
   */
  boards: z.array(ResultsBoardSchema),
  // Sent at every stage: a history entry only names *locked* cells, and locks
  // have been public since the round they happened in.
  roundHistory: z.array(RoundHistoryEntrySchema),
  /**
   * **Empty below stage 3** (docs/03 invariant 14) — the same gate `boards`
   * uses at stage 1, on every socket including displays. The cheer tally is the
   * surprise, and leaking it early spoils the reel exactly the way an early
   * `boards` would spoil the authorship roast.
   *
   * Already sorted by the server: cards by (max cheers on the card) DESC, then
   * by a stable hash of (topicText + round). Ordering it here rather than in
   * each client is what guarantees the auto-rotating TV and the swiped phone
   * are walking the same sequence (docs/10 decision 7).
   *
   * Overlaps `roundHistory` on locked names. That duplication is deliberate:
   * `roundHistory` is the always-public record and this is the gated one, and
   * merging them would put a gated field inside an ungated structure.
   */
  reel: z.array(ReelCardSchema),
});
export type ResultsPayload = z.infer<typeof ResultsPayloadSchema>;

export const PublicRoomStateSchema = z.object({
  protocolVersion: z.number().int(),
  code: RoomCodeSchema,
  phase: PhaseSchema,
  settings: SettingsSchema,
  players: z.array(PublicPlayerSchema),
  house: HousePublicSchema.nullable(), // null before the round loop
  round: RoundStateSchema.nullable(),
  results: ResultsPayloadSchema.nullable(), // phase === 'results'
});
export type PublicRoomState = z.infer<typeof PublicRoomStateSchema>;
