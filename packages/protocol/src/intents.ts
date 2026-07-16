import { z } from "zod";
import { RoomCodeSchema } from "./state";
import { SettingsObjectSchema } from "./settings";

const protocolVersion = z.number().int();
const playerName = z.string().trim().min(1).max(30);
const cellIndex = z.number().int().min(0).max(24);
const cellName = z.string().trim().min(1).max(60);
const poolSlot = z.number().int().min(0).max(7);

export const RoomCreateIntentSchema = z.object({
  type: z.literal("room.create"),
  payload: z.object({ playerName, protocolVersion }),
});

export const RoomJoinIntentSchema = z.object({
  type: z.literal("room.join"),
  payload: z.object({ code: RoomCodeSchema, playerName, protocolVersion }),
});

export const DisplayJoinIntentSchema = z.object({
  type: z.literal("display.join"),
  payload: z.object({ code: RoomCodeSchema, protocolVersion }),
});

export const SessionResumeIntentSchema = z.object({
  type: z.literal("session.resume"),
  payload: z.object({
    code: RoomCodeSchema,
    playerId: z.string(),
    token: z.string(),
    protocolVersion,
  }),
});

export const RoomLeaveIntentSchema = z.object({
  type: z.literal("room.leave"),
  payload: z.object({}),
});

export const StateRequestIntentSchema = z.object({
  type: z.literal("state.request"),
  payload: z.object({}),
});

// Host-only (★ in docs/03-protocol.md); enforcement lives in Room.handleIntent.
export const LobbyUpdateSettingsIntentSchema = z.object({
  type: z.literal("lobby.updateSettings"),
  payload: z.object({ settings: SettingsObjectSchema.partial() }),
});

export const LobbyStartIntentSchema = z.object({
  type: z.literal("lobby.start"),
  payload: z.object({}),
});

export const FillWriteCellIntentSchema = z.object({
  type: z.literal("fill.writeCell"),
  payload: z.object({ cellIndex, name: cellName }),
});

export const FillClearCellIntentSchema = z.object({
  type: z.literal("fill.clearCell"),
  payload: z.object({ cellIndex }),
});

export const FillWritePoolIntentSchema = z.object({
  type: z.literal("fill.writePool"),
  payload: z.object({ slot: poolSlot, name: cellName }),
});

export const FillSetDoneIntentSchema = z.object({
  type: z.literal("fill.setDone"),
  payload: z.object({ done: z.boolean() }),
});

export const FillForceStartIntentSchema = z.object({
  type: z.literal("fill.forceStart"),
  payload: z.object({}),
});

export const ClientIntentSchema = z.discriminatedUnion("type", [
  RoomCreateIntentSchema,
  RoomJoinIntentSchema,
  DisplayJoinIntentSchema,
  SessionResumeIntentSchema,
  RoomLeaveIntentSchema,
  StateRequestIntentSchema,
  LobbyUpdateSettingsIntentSchema,
  LobbyStartIntentSchema,
  FillWriteCellIntentSchema,
  FillClearCellIntentSchema,
  FillWritePoolIntentSchema,
  FillSetDoneIntentSchema,
  FillForceStartIntentSchema,
]);
export type ClientIntent = z.infer<typeof ClientIntentSchema>;
