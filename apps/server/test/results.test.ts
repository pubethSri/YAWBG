import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type PublicRoomState, type Settings } from "@yawbg/protocol";
import { createApp } from "../src/app";
import type { GameLogEntry, GameLogSink } from "../src/GameLog";
import { GameLogStore } from "../src/GameLog";
import { openDb } from "../src/db";
import { TestClient, fakeDeck } from "./TestClient";

// Every finished game in this file lands in `logged`, so the log assertions
// don't need their own server (and no test here opens a database — the sink is
// a fake, which is the whole point of it being a seam).
const logged: GameLogEntry[] = [];
const logSink: GameLogSink = { record: (e) => void logged.push(e) };

const app = createApp({
  graceMs: 5_000,
  clientDist: null,
  decks: fakeDeck(3),
  distributeMs: 1,
  drawMs: 1,
  heartbeatMs: 0,
  log: logSink,
});
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

const connect = () => TestClient.connect(port);

async function drainUntil(
  all: TestClient[],
  pred: (s: PublicRoomState) => boolean,
): Promise<PublicRoomState> {
  let last: PublicRoomState | null = null;
  for (const c of all) {
    let s = await c.expectState();
    while (!pred(s)) s = await c.expectState();
    last = s;
  }
  return last!;
}

interface Game {
  all: TestClient[];
  host: TestClient;
  p2: TestClient;
  ids: [string, string];
  code: string;
  state: PublicRoomState;
}

/**
 * Two players, so the round-robin pool offset can only be 1: everything the
 * host wrote into the pool lands on p2's board and vice versa. That makes the
 * authorship assertions exact rather than "somebody else's".
 */
async function playToResults(settings: Partial<Settings>): Promise<Game> {
  const host = await connect();
  host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
  const created = await host.next();
  if (created.type !== "session.created") throw new Error("unreachable");
  const code = created.payload.code;
  await host.expectState();

  const p2 = await connect();
  p2.send({ type: "room.join", payload: { code, playerName: "P2", protocolVersion: PROTOCOL_VERSION } });
  const joined = await p2.next();
  if (joined.type !== "session.created") throw new Error("unreachable");
  const all = [host, p2];
  for (const c of all) await c.expectState();

  host.send({ type: "lobby.updateSettings", payload: { settings } });
  for (const c of all) await c.expectState();
  host.send({ type: "lobby.start", payload: {} });
  for (const c of all) await c.expectState();

  await fillBoards(all);
  await drainUntil(all, (s) => s.phase === "open_floor");

  let s = await passUntilResults(all);
  return { all, host, p2, ids: [created.payload.playerId, joined.payload.playerId], code, state: s };
}

/** 25 - K own cells + K pool names for each player, then ready up. */
async function fillBoards(all: TestClient[]): Promise<void> {
  for (const [i, client] of all.entries()) {
    const label = i === 0 ? "host" : "p2";
    const s = await requestState(client);
    const K = s.settings.sabotageCells;
    for (let cell = 0; cell < 25 - K; cell++) {
      client.send({ type: "fill.writeCell", payload: { cellIndex: cell, name: `${label}-${cell}` } });
      for (const c of all) await c.expectState();
    }
    for (let slot = 0; slot < K; slot++) {
      client.send({ type: "fill.writePool", payload: { slot, name: `${label}-pool-${slot}` } });
      for (const c of all) await c.expectState();
    }
  }
  for (const [i, client] of all.entries()) {
    client.send({ type: "fill.setDone", payload: { done: true } });
    // The last setDone starts the game; stop counting frames and let drainUntil settle.
    if (i < all.length - 1) for (const c of all) await c.expectState();
  }
}

/**
 * Drains snapshots still queued from earlier broadcasts, then asserts the next
 * frame is the error. round.test.ts can use `expectError` directly because it
 * accounts for every frame; here a game ends with several identical `results`
 * snapshots per client, and counting those is not worth the reader's time.
 */
async function expectError(client: TestClient, code: string): Promise<void> {
  let msg = await client.next();
  while (msg.type === "room.state" || msg.type === "player.board") msg = await client.next();
  expect(msg).toMatchObject({ type: "error", payload: { code } });
}

async function requestState(client: TestClient): Promise<PublicRoomState> {
  client.send({ type: "state.request", payload: {} });
  return client.expectState();
}

/** Nobody locks anything: pass every round until the House finishes the game. */
async function passUntilResults(all: TestClient[]): Promise<PublicRoomState> {
  for (let i = 0; i < 60; i++) {
    for (const c of all) c.send({ type: "round.pass", payload: {} });
    const s = await drainUntil(
      all,
      (x) => x.phase === "results" || (x.phase === "open_floor" && x.players.every((p) => !p.resolved)),
    );
    if (s.phase === "results") return s;
  }
  throw new Error("game never reached results");
}

describe("M4 results.advance", () => {
  test("stage 0 withholds every board; stage 1 reveals the pool authorship", async () => {
    const g = await playToResults({ sabotageCells: 2, drawsPerRound: 3 });
    const [hostId, p2Id] = g.ids;

    // Stage 0: winners and history only. Nothing about anyone's board is on the
    // wire yet — devtools included.
    expect(g.state.results!.revealStage).toBe(0);
    expect(g.state.results!.boards).toEqual([]);
    const frame = JSON.stringify(g.state);
    expect(frame).not.toContain("host-pool-");
    expect(frame).not.toContain("p2-pool-");

    // Non-hosts don't pace the room.
    g.p2.send({ type: "results.advance", payload: {} });
    await expectError(g.p2, "NOT_HOST");

    g.host.send({ type: "results.advance", payload: {} });
    const s1 = await drainUntil(g.all, (x) => x.results!.revealStage === 1);
    expect(s1.results!.boards).toHaveLength(2);

    // With two players the offset is forced to 1: the host wrote p2's pool cells
    // and p2 wrote the host's.
    const hostBoard = s1.results!.boards.find((b) => b.playerId === hostId)!;
    const p2Board = s1.results!.boards.find((b) => b.playerId === p2Id)!;
    const hostPool = hostBoard.cells.filter((c) => c.authorId !== null);
    const p2Pool = p2Board.cells.filter((c) => c.authorId !== null);
    expect(hostPool).toHaveLength(2);
    expect(p2Pool).toHaveLength(2);
    for (const cell of hostPool) {
      expect(cell.authorId).toBe(p2Id);
      expect(cell.name.startsWith("p2-pool-")).toBe(true);
    }
    for (const cell of p2Pool) {
      expect(cell.authorId).toBe(hostId);
      expect(cell.name.startsWith("host-pool-")).toBe(true);
    }

    // Stage 2, then nowhere: the sequence is monotonic and finite.
    g.host.send({ type: "results.advance", payload: {} });
    const s2 = await drainUntil(g.all, (x) => x.results!.revealStage === 2);
    expect(s2.results!.boards).toHaveLength(2);
    g.host.send({ type: "results.advance", payload: {} });
    await expectError(g.host, "WRONG_PHASE");

    for (const c of g.all) c.close();
  }, 30_000);

  test("K = 0 skips the authorship stage", async () => {
    const g = await playToResults({ sabotageCells: 0, drawsPerRound: 3 });
    expect(g.state.results!.revealStage).toBe(0);

    g.host.send({ type: "results.advance", payload: {} });
    const s = await drainUntil(g.all, (x) => x.results!.revealStage > 0);
    expect(s.results!.revealStage).toBe(2); // never 1 — there is no pool to roast
    expect(s.results!.boards).toHaveLength(2);

    for (const c of g.all) c.close();
  }, 30_000);

  test("displays move with the room, and cannot pace it themselves", async () => {
    const g = await playToResults({ sabotageCells: 2, drawsPerRound: 3 });
    const display = await connect();
    display.send({ type: "display.join", payload: { code: g.code, protocolVersion: PROTOCOL_VERSION } });
    const joined = await display.expectState();
    expect(joined.phase).toBe("results");
    expect(joined.results!.revealStage).toBe(0);
    expect(joined.results!.boards).toEqual([]); // the TV is not a side channel

    display.send({ type: "results.advance", payload: {} });
    await expectError(display, "BAD_MESSAGE");

    // docs/05 decision 6: phones and displays move together, off the same frame.
    g.host.send({ type: "results.advance", payload: {} });
    const s = await drainUntil([...g.all, display], (x) => x.results!.revealStage === 1);
    expect(s.results!.boards).toHaveLength(2);

    display.close();
    for (const c of g.all) c.close();
  }, 30_000);

  test("advancing outside results is rejected", async () => {
    const host = await connect();
    host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
    await host.next();
    await host.expectState();
    host.send({ type: "results.advance", payload: {} });
    await expectError(host, "WRONG_PHASE");
    host.close();
  });
});

describe("M4 game.playAgain", () => {
  test("same lobby, same settings, fresh boards", async () => {
    const g = await playToResults({ sabotageCells: 2, drawsPerRound: 3, playerLinesToWin: 2 });
    const before = g.state;
    expect(before.phase).toBe("results");

    g.p2.send({ type: "game.playAgain", payload: {} });
    await expectError(g.p2, "NOT_HOST");

    g.host.send({ type: "game.playAgain", payload: {} });
    const s = await drainUntil(g.all, (x) => x.phase === "board_fill");

    // Settings and seats survive; everything the last game accumulated does not.
    expect(s.settings).toEqual(before.settings);
    expect(s.players.map((p) => p.name)).toEqual(["Host", "P2"]);
    expect(s.players[0]!.isHost).toBe(true);
    expect(s.results).toBeNull();
    expect(s.house).toBeNull();
    expect(s.round).toBeNull();
    for (const p of s.players) {
      expect(p.board.every((c) => c.status === "empty")).toBe(true);
      expect(p.linesCompleted).toBe(0);
      expect(p.hasWon).toBe(false);
      expect(p.fillDone).toBe(false);
    }

    // The private board is wiped too — including the pool names dealt last game.
    const board = await g.host.expectPlayerBoard();
    expect(board.cells.every((c) => c.name === null && !c.fromPool && c.locked === null)).toBe(true);
    expect(board.poolSlots).toEqual([null, null]);

    // And the room is genuinely playable again, round numbering included.
    await fillBoards(g.all);
    const opened = await drainUntil(g.all, (x) => x.phase === "open_floor");
    expect(opened.round!.number).toBe(1);
    expect(opened.round!.allDrawn).toEqual(opened.round!.drawnNumbers);

    for (const c of g.all) c.close();
  }, 60_000);

  test("playAgain outside results is rejected", async () => {
    const host = await connect();
    host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
    await host.next();
    await host.expectState();
    host.send({ type: "game.playAgain", payload: {} });
    await expectError(host, "WRONG_PHASE");
    host.close();
  });
});

describe("M4 game log", () => {
  test("a finished game is recorded once, unredacted", async () => {
    const before = logged.length;
    const g = await playToResults({ sabotageCells: 2, drawsPerRound: 3 });
    expect(logged.length).toBe(before + 1);

    const entry = logged.at(-1)!;
    expect(entry.code).toBe(g.code);
    expect(entry.endedAt).toBeGreaterThan(0);
    expect(entry.settings.sabotageCells).toBe(2);
    expect(entry.players.map((p) => p.name).sort()).toEqual(["Host", "P2"]);
    // The log keeps what the stage-0 wire frame withholds: it is the record.
    expect(entry.results.boards).toHaveLength(2);
    expect(entry.results.boards.some((b) => b.cells.some((c) => c.authorId !== null))).toBe(true);
    expect(entry.results.roundHistory.length).toBeGreaterThan(0);

    // Pacing the reveal is not a second game.
    g.host.send({ type: "results.advance", payload: {} });
    await drainUntil(g.all, (x) => x.results!.revealStage > 0);
    expect(logged.length).toBe(before + 1);

    for (const c of g.all) c.close();
  }, 30_000);

  test("GameLogStore round-trips an entry through SQLite", () => {
    const db = openDb(":memory:");
    const store = new GameLogStore(db);
    expect(store.count()).toBe(0);

    store.record({
      code: "ABCD",
      endedAt: 1_700_000_000_000,
      settings: { ...logged[0]!.settings },
      players: [{ id: "p1", name: "ริว", linesCompleted: 2, won: true }],
      results: {
        revealStage: 0,
        winners: ["p1"],
        boards: [
          {
            playerId: "p1",
            cells: Array.from({ length: 25 }, () => ({
              name: "สมชาย",
              authorId: null,
              locked: null,
            })),
          },
        ],
        roundHistory: [],
      },
    });

    expect(store.count()).toBe(1);
    const row = db.query(`SELECT code, players, results FROM games`).get() as {
      code: string;
      players: string;
      results: string;
    };
    expect(row.code).toBe("ABCD");
    // Thai survives the JSON column — the deck and the boards are both Thai-capable.
    expect(JSON.parse(row.players)[0].name).toBe("ริว");
    expect(JSON.parse(row.results).boards[0].cells[0].name).toBe("สมชาย");
    db.close();
  });
});
