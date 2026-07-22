import { describe, expect, test } from "bun:test";
import {
  ClientIntentSchema,
  PROTOCOL_VERSION,
  PublicRoomStateSchema,
  ServerMessageSchema,
  defaultSettings,
  type ClientIntent,
  type PublicRoomState,
  type ServerMessage,
} from "@yawbg/protocol";

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

const lobbyState: PublicRoomState = {
  protocolVersion: PROTOCOL_VERSION,
  code: "ABCD",
  phase: "lobby",
  settings: defaultSettings(),
  players: [
    {
      id: "p1",
      name: "Ryu",
      connected: true,
      isHost: true,
      board: Array.from({ length: 25 }, () => ({ status: "empty" as const })),
      linesCompleted: 0,
      hasWon: false,
    },
  ],
  house: null,
  round: null,
  results: null,
};

describe("intents", () => {
  const intents: ClientIntent[] = [
    { type: "room.create", payload: { playerName: "Ryu", protocolVersion: PROTOCOL_VERSION } },
    { type: "room.join", payload: { code: "ABCD", playerName: "Mai", protocolVersion: PROTOCOL_VERSION } },
    { type: "display.join", payload: { code: "ABCD", protocolVersion: PROTOCOL_VERSION } },
    { type: "session.resume", payload: { code: "ABCD", playerId: "p1", token: "t", protocolVersion: PROTOCOL_VERSION } },
    { type: "room.leave", payload: {} },
    { type: "state.request", payload: {} },
    { type: "round.propose", payload: { cellIndex: 7 } },
    { type: "round.confirm", payload: {} },
    { type: "round.withdraw", payload: {} },
    { type: "round.pass", payload: {} },
    { type: "round.forceAdvance", payload: {} },
  ];

  test.each(intents.map((i) => [i.type, i] as const))("%s round-trips", (_type, intent) => {
    expect(ClientIntentSchema.parse(roundTrip(intent))).toEqual(intent);
  });

  test("unknown type rejected", () => {
    expect(ClientIntentSchema.safeParse({ type: "room.nuke", payload: {} }).success).toBe(false);
  });

  test("bad payload rejected", () => {
    expect(
      ClientIntentSchema.safeParse({ type: "room.join", payload: { code: "abcd", playerName: "x", protocolVersion: 1 } }).success,
    ).toBe(false); // lowercase code
    expect(
      ClientIntentSchema.safeParse({ type: "room.create", payload: { playerName: "", protocolVersion: 1 } }).success,
    ).toBe(false); // empty name
  });
});

describe("server messages", () => {
  const messages: ServerMessage[] = [
    { type: "session.created", payload: { code: "ABCD", playerId: "p1", token: "tok" } },
    { type: "room.state", payload: lobbyState },
    { type: "error", payload: { code: "ROOM_NOT_FOUND", message: "no such room" } },
  ];

  test.each(messages.map((m) => [m.type, m] as const))("%s round-trips", (_type, message) => {
    expect(ServerMessageSchema.parse(roundTrip(message))).toEqual(message);
  });

  test("unknown error code rejected", () => {
    expect(ServerMessageSchema.safeParse({ type: "error", payload: { code: "NOPE", message: "?" } }).success).toBe(false);
  });
});

describe("PublicRoomState", () => {
  test("lobby snapshot parses", () => {
    expect(PublicRoomStateSchema.parse(roundTrip(lobbyState))).toEqual(lobbyState);
  });

  test("board must have exactly 25 cells", () => {
    const bad = roundTrip(lobbyState);
    bad.players[0].board.pop();
    expect(PublicRoomStateSchema.safeParse(bad).success).toBe(false);
  });

  test("PROTOCOL_VERSION is 2", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  test("cellIndex out of range rejected", () => {
    expect(ClientIntentSchema.safeParse({ type: "round.propose", payload: { cellIndex: 25 } }).success).toBe(false);
  });

  test("results snapshot parses", () => {
    const state: PublicRoomState = {
      ...lobbyState,
      phase: "results",
      house: {
        mode: "full",
        board: Array.from({ length: 25 }, (_, i) => (i === 12 ? null : i + 1)),
        freeCenter: true,
        hits: [12],
        linesCompleted: 0,
        bestLineNeeds: 4,
      },
      results: {
        revealStage: 0,
        winners: ["p1"],
        boards: [
          {
            playerId: "p1",
            cells: Array.from({ length: 25 }, () => ({ name: "Gordon Ramsay", authorId: null, locked: null })),
          },
        ],
        roundHistory: [
          {
            round: 1,
            drawnNumbers: [12],
            topicText: "A millionaire",
            locks: [{ playerId: "p1", name: "Gordon Ramsay", cellIndex: 0 }],
          },
        ],
      },
    };
    expect(PublicRoomStateSchema.parse(roundTrip(state))).toEqual(state);
  });

  test("house board must have exactly 25 cells", () => {
    const bad = roundTrip({
      ...lobbyState,
      house: { mode: "full", board: [1, 2, 3], freeCenter: false, hits: [], linesCompleted: 0 },
    });
    expect(PublicRoomStateSchema.safeParse(bad).success).toBe(false);
  });
});
