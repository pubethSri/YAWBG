import { z } from "zod";
import { PublicRoomStateSchema, RoomCodeSchema } from "./state";

export const ErrorCodeSchema = z.enum([
  "BAD_MESSAGE",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "VERSION_MISMATCH",
  "SESSION_INVALID",
  "WRONG_PHASE",
  "NOT_HOST",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const SessionCreatedMessageSchema = z.object({
  type: z.literal("session.created"),
  payload: z.object({
    code: RoomCodeSchema,
    playerId: z.string(),
    token: z.string(),
  }),
});

export const RoomStateMessageSchema = z.object({
  type: z.literal("room.state"),
  payload: PublicRoomStateSchema,
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  payload: z.object({ code: ErrorCodeSchema, message: z.string() }),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SessionCreatedMessageSchema,
  RoomStateMessageSchema,
  ErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
