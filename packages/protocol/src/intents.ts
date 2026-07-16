import { z } from "zod";
import { RoomCodeSchema } from "./state";

const protocolVersion = z.number().int();
const playerName = z.string().trim().min(1).max(30);

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

export const ClientIntentSchema = z.discriminatedUnion("type", [
  RoomCreateIntentSchema,
  RoomJoinIntentSchema,
  DisplayJoinIntentSchema,
  SessionResumeIntentSchema,
  RoomLeaveIntentSchema,
  StateRequestIntentSchema,
]);
export type ClientIntent = z.infer<typeof ClientIntentSchema>;
