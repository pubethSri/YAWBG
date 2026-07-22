import { z } from "zod";
import { PrivateBoardSchema, PublicRoomStateSchema, RoomCodeSchema } from "./state";

export const ErrorCodeSchema = z.enum([
  "BAD_MESSAGE",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "VERSION_MISMATCH",
  "SESSION_INVALID",
  "WRONG_PHASE",
  "NOT_HOST",
  "ALREADY_RESOLVED",
  "CELL_LOCKED",
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

// Owner only — carries the names that never travel on anyone else's socket.
export const PlayerBoardMessageSchema = z.object({
  type: z.literal("player.board"),
  payload: PrivateBoardSchema,
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  payload: z.object({ code: ErrorCodeSchema, message: z.string() }),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SessionCreatedMessageSchema,
  RoomStateMessageSchema,
  PlayerBoardMessageSchema,
  ErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
