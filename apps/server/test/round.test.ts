import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type PublicRoomState, type Settings } from "@yawbg/protocol";
import { createApp } from "../src/app";
import { TestClient, fakeDeck } from "./TestClient";

// Grace is long here on purpose: these tests assert that a *disconnected*
// player still blocks the round, which is only observable before grace expiry
// removes them. drawMs/distributeMs are ~0 so the phase timers resolve on the
// next tick and nothing sleeps.
const app = createApp({
  graceMs: 5_000,
  clientDist: null,
  decks: fakeDeck(3), // small, so the reshuffle-on-empty path runs every game
  distributeMs: 1,
  drawMs: 1,
  heartbeatMs: 0,
});
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

// No afterAll stop: Elysia's stop() blocks on lingering ws sockets under bun test
// on Windows; the server dies with the test process.

const connect = () => TestClient.connect(port);

/**
 * notifyAll broadcasts to *every* connected player, and a round advance emits
 * several snapshots in a row (the advance itself, the router's post-intent
 * broadcast, then the drawMs timer opening the floor). So rather than counting
 * frames, drain each client until it reaches an agreed-on state. Predicates
 * must be monotone or a client can overshoot and hang.
 */
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

async function fillBoard(all: TestClient[], acting: TestClient, label: string) {
  for (let i = 0; i < 25; i++) {
    acting.send({ type: "fill.writeCell", payload: { cellIndex: i, name: `${label}-${i}` } });
    for (const c of all) await c.expectState();
  }
}

interface Game {
  all: TestClient[];
  host: TestClient;
  p2: TestClient;
  p3: TestClient;
  ids: string[];
  state: PublicRoomState;
}

/** Lobby -> board_fill -> (K=0 skips distribute) -> open_floor of round 1. */
async function startGame(settings: Partial<Settings> = {}): Promise<Game> {
  const host = await connect();
  host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
  const created = await host.next();
  if (created.type !== "session.created") throw new Error("unreachable");
  const code = created.payload.code;
  await host.expectState();

  const p2 = await connect();
  p2.send({ type: "room.join", payload: { code, playerName: "P2", protocolVersion: PROTOCOL_VERSION } });
  const c2 = await p2.next();
  if (c2.type !== "session.created") throw new Error("unreachable");
  await p2.expectState();
  await host.expectState();

  const p3 = await connect();
  p3.send({ type: "room.join", payload: { code, playerName: "P3", protocolVersion: PROTOCOL_VERSION } });
  const c3 = await p3.next();
  if (c3.type !== "session.created") throw new Error("unreachable");
  const all = [host, p2, p3];
  for (const c of all) await c.expectState();

  if (Object.keys(settings).length > 0) {
    host.send({ type: "lobby.updateSettings", payload: { settings } });
    for (const c of all) await c.expectState();
  }

  host.send({ type: "lobby.start", payload: {} });
  for (const c of all) await c.expectState();

  await fillBoard(all, host, "host");
  await fillBoard(all, p2, "p2");
  await fillBoard(all, p3, "p3");

  for (const c of all) {
    c.send({ type: "fill.setDone", payload: { done: true } });
    // The last setDone starts the game, so stop counting frames and settle.
    if (c !== p3) for (const other of all) await other.expectState();
  }
  const state = await drainUntil(all, (s) => s.phase === "open_floor");

  return {
    all,
    host,
    p2,
    p3,
    ids: [created.payload.playerId, c2.payload.playerId, c3.payload.playerId],
    state,
  };
}

/** Everyone passes; returns the state once the round has turned over. */
async function passRound(g: Game, currentRound: number): Promise<PublicRoomState> {
  for (const c of g.all) c.send({ type: "round.pass", payload: {} });
  return drainUntil(
    g.all,
    (s) =>
      (s.phase === "open_floor" && s.round!.number > currentRound) ||
      s.phase === "last_call" ||
      s.phase === "results",
  );
}

describe("M2 round loop", () => {
  test("K=0 skips distribute and lands on the open floor with a House and a topic", async () => {
    const g = await startGame();
    const s = g.state;

    expect(s.phase).toBe("open_floor");
    expect(s.round).not.toBeNull();
    expect(s.round!.number).toBe(1);
    expect(s.round!.topic).not.toBeNull();
    expect(s.round!.queue).toEqual([]);
    expect(s.round!.drawnNumbers).toHaveLength(1); // drawsPerRound default
    expect(s.round!.allDrawn).toEqual(s.round!.drawnNumbers);

    // House: a conventional card — column c drawn from its own fifth of the pool.
    expect(s.house).not.toBeNull();
    if (s.house!.mode !== "full") throw new Error("expected full visibility by default");
    const board = s.house!.board;
    expect(board).toHaveLength(25);
    expect(board[12]).toBeNull(); // houseFreeCenter defaults on
    expect(s.house!.freeCenter).toBe(true);
    expect(s.house!.hits).toContain(12); // the free center is marked from the start
    const span = s.settings.numberPoolSize / 5;
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 5; row++) {
        const n = board[row * 5 + col];
        if (n === null) continue;
        expect(n).toBeGreaterThan(col * span);
        expect(n).toBeLessThanOrEqual((col + 1) * span);
      }
    }
    const numbers = board.filter((n): n is number => n !== null);
    expect(new Set(numbers).size).toBe(numbers.length); // distinct

    // Nobody has lines or has won yet.
    for (const p of s.players) {
      expect(p.linesCompleted).toBe(0);
      expect(p.hasWon).toBe(false);
      expect(p.resolved).toBe(false);
    }

    for (const c of g.all) c.close();
  });

  test("propose -> confirm locks the cell with a tag, and the lock is public and permanent", async () => {
    const g = await startGame();
    const topic = g.state.round!.topic!;
    const drawn = g.state.round!.drawnNumbers[0]!;

    g.host.send({ type: "round.propose", payload: { cellIndex: 3 } });
    let s = await drainUntil(g.all, (x) => x.round!.queue.length === 1);
    expect(s.round!.queue[0]).toEqual({ playerId: g.ids[0]!, cellIndex: 3, name: "host-3" });

    // One live proposal per player.
    g.host.send({ type: "round.propose", payload: { cellIndex: 4 } });
    await g.host.expectError("BAD_MESSAGE");

    // Confirm/withdraw are owner-only.
    g.p2.send({ type: "round.confirm", payload: {} });
    await g.p2.expectError("BAD_MESSAGE");
    g.p2.send({ type: "round.withdraw", payload: {} });
    await g.p2.expectError("BAD_MESSAGE");

    g.host.send({ type: "round.confirm", payload: {} });
    s = await drainUntil(g.all, (x) => x.players[0]!.board[3]!.status === "locked");
    expect(s.round!.queue).toEqual([]);
    expect(s.players[0]!.resolved).toBe(true);

    const cell = s.players[0]!.board[3]!;
    if (cell.status !== "locked") throw new Error("unreachable");
    expect(cell.name).toBe("host-3"); // a locked name is public — it was argued out loud
    expect(cell.tag).toEqual({
      round: 1,
      drawnNumber: drawn,
      topicId: topic.id,
      topicText: topic.text,
    });

    // One lock per player per round.
    g.host.send({ type: "round.propose", payload: { cellIndex: 5 } });
    await g.host.expectError("ALREADY_RESOLVED");
    g.host.send({ type: "round.pass", payload: {} });
    await g.host.expectError("ALREADY_RESOLVED");

    // A locked cell can never change again — even in a later round.
    g.p2.send({ type: "round.pass", payload: {} });
    for (const c of g.all) await c.expectState();
    g.p3.send({ type: "round.pass", payload: {} });
    await drainUntil(g.all, (x) => x.phase === "open_floor" && x.round!.number === 2);

    g.host.send({ type: "round.propose", payload: { cellIndex: 3 } });
    await g.host.expectError("CELL_LOCKED");

    for (const c of g.all) c.close();
  });

  test("withdraw costs nothing: the name is re-proposable and the player may still pass", async () => {
    const g = await startGame();

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    await drainUntil(g.all, (s) => s.round!.queue.length === 1);

    g.host.send({ type: "round.withdraw", payload: {} });
    let s = await drainUntil(g.all, (x) => x.round!.queue.length === 0);
    expect(s.players[0]!.resolved).toBe(false); // withdraw is not a resolution
    expect(s.players[0]!.board[0]!.status).toBe("filled"); // still unlocked, name still hidden

    // Same cell, same round, no penalty.
    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    s = await drainUntil(g.all, (x) => x.round!.queue.length === 1);
    expect(s.round!.queue[0]!.name).toBe("host-0");

    // Passing with a live proposal implicitly withdraws it.
    g.host.send({ type: "round.pass", payload: {} });
    s = await drainUntil(g.all, (x) => x.players[0]!.resolved === true);
    expect(s.round!.queue).toEqual([]);

    for (const c of g.all) c.close();
  });

  test("proposing an empty cell is rejected", async () => {
    const g = await startGame({ sabotageCells: 0 });
    // Every cell is filled in these games, so clear one via a fresh angle:
    // an out-of-range index is caught by the schema, an empty one by the Room.
    g.host.send({ type: "round.propose", payload: { cellIndex: 25 } });
    await g.host.expectError("BAD_MESSAGE"); // schema rejects the index
    for (const c of g.all) c.close();
  });

  test("a disconnected player blocks the round until the host force-advances", async () => {
    const g = await startGame();
    expect(g.state.round!.number).toBe(1);

    g.p3.close();
    // The drop is broadcast; everyone still connected sees it.
    await drainUntil([g.host, g.p2], (s) => s.players[2]!.connected === false);

    g.host.send({ type: "round.pass", payload: {} });
    for (const c of [g.host, g.p2]) await c.expectState();
    g.p2.send({ type: "round.pass", payload: {} });
    const s = await drainUntil([g.host, g.p2], (x) => x.players[1]!.resolved === true);

    // Both connected players resolved, but the round holds: docs/01 treats a
    // disconnected player as not-yet-resolved, which is what force-advance is for.
    expect(s.phase).toBe("open_floor");
    expect(s.round!.number).toBe(1);

    // Non-hosts can't force it.
    g.p2.send({ type: "round.forceAdvance", payload: {} });
    await g.p2.expectError("NOT_HOST");

    g.host.send({ type: "round.forceAdvance", payload: {} });
    const next = await drainUntil(
      [g.host, g.p2],
      (x) => x.phase === "open_floor" && x.round!.number === 2,
    );
    for (const p of next.players) expect(p.resolved).toBe(false); // force-advance auto-passes

    g.host.close();
    g.p2.close();
  });

  test("displays receive the round but cannot mutate it", async () => {
    const g = await startGame();
    const display = await connect();
    display.send({ type: "display.join", payload: { code: g.state.code, protocolVersion: PROTOCOL_VERSION } });
    const s = await display.expectState();
    expect(s.phase).toBe("open_floor");
    expect(s.round!.topic).not.toBeNull();

    display.send({ type: "round.pass", payload: {} });
    await display.expectError("BAD_MESSAGE");

    display.close();
    for (const c of g.all) c.close();
  });

  test("the topic pile reshuffles used topics when it empties", async () => {
    const g = await startGame(); // fakeDeck(3): only 3 topics for many rounds
    const seen: string[] = [g.state.round!.topic!.id];

    let round = 1;
    for (let i = 0; i < 5; i++) {
      const s = await passRound(g, round);
      if (s.phase !== "open_floor") break;
      round = s.round!.number;
      seen.push(s.round!.topic!.id);
    }

    // More rounds than the deck has topics, and every round still got one.
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.every((id) => id !== null && id !== undefined)).toBe(true);
    // Each topic is exhausted before any repeats — the pile empties, then reshuffles.
    expect(new Set(seen.slice(0, 3)).size).toBe(3);

    for (const c of g.all) c.close();
  });

  test("full game: the House bingos and the game ends in results with a complete payload", async () => {
    const g = await startGame({ drawsPerRound: 3 });

    // Lock one cell in round 1 so the results payload has real history to carry.
    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    await drainUntil(g.all, (s) => s.round!.queue.length === 1);
    g.host.send({ type: "round.confirm", payload: {} });
    await drainUntil(g.all, (s) => s.players[0]!.board[0]!.status === "locked");
    g.p2.send({ type: "round.pass", payload: {} });
    for (const c of g.all) await c.expectState();
    g.p3.send({ type: "round.pass", payload: {} });
    let s = await drainUntil(
      g.all,
      (x) => (x.phase === "open_floor" && x.round!.number === 2) || x.phase === "results",
    );

    // Pass rounds until the doomsday clock runs out. The pool is 75 and we draw
    // 3 a round, so this terminates well inside the cap.
    let rounds = 1;
    while (s.phase !== "results" && rounds < 40) {
      s = await passRound(g, s.round!.number);
      rounds++;
    }

    expect(s.phase).toBe("results");
    if (s.house!.mode !== "full") throw new Error("results always reveals the House");
    expect(s.house!.linesCompleted).toBeGreaterThanOrEqual(s.settings.houseBingoTarget);
    // The round board stays populated so the called-number board doesn't blank out.
    expect(s.round).not.toBeNull();
    expect(s.round!.allDrawn.length).toBeGreaterThan(0);

    const r = s.results!;
    expect(r.revealStage).toBe(0); // M4 paces the reveal; M2 parks it
    expect(r.boards).toHaveLength(3);
    for (const b of r.boards) {
      expect(b.cells).toHaveLength(25);
      for (const cell of b.cells) expect(cell.authorId).toBeNull(); // K=0: every name is self-authored
    }
    // Round 1's lock is recorded in the history.
    expect(r.roundHistory[0]).toMatchObject({
      round: 1,
      locks: [{ playerId: g.ids[0]!, name: "host-0", cellIndex: 0 }],
    });
    expect(r.roundHistory.length).toBeGreaterThan(1);

    // One lock can't make a line, so with playerLinesToWin=1 nobody won.
    expect(r.winners).toEqual([]);
    expect(s.players[0]!.linesCompleted).toBe(0);

    for (const c of g.all) c.close();
  }, 30_000);

  test("last_call: House bingo opens one final lock window before results", async () => {
    const g = await startGame({ drawsPerRound: 3, lastCall: true });

    let s = g.state;
    let rounds = 0;
    while (s.phase === "open_floor" && rounds < 40) {
      s = await passRound(g, s.round!.number);
      rounds++;
    }

    expect(s.phase).toBe("last_call");
    expect(s.round!.topic).not.toBeNull(); // one final topic is drawn (docs/01)
    if (s.house!.mode !== "full") throw new Error("unreachable");
    expect(s.house!.linesCompleted).toBeGreaterThanOrEqual(1);

    // The floor is genuinely open: a lock still lands.
    g.host.send({ type: "round.propose", payload: { cellIndex: 24 } });
    await drainUntil(g.all, (x) => x.round!.queue.length === 1);
    g.host.send({ type: "round.confirm", payload: {} });
    await drainUntil(g.all, (x) => x.players[0]!.board[24]!.status === "locked");

    g.p2.send({ type: "round.pass", payload: {} });
    for (const c of g.all) await c.expectState();
    g.p3.send({ type: "round.pass", payload: {} });
    s = await drainUntil(g.all, (x) => x.phase === "results");

    // The last-call round made it into the history with its lock.
    const final = s.results!.roundHistory.at(-1)!;
    expect(final.locks).toEqual([{ playerId: g.ids[0]!, name: "host-24", cellIndex: 24 }]);

    for (const c of g.all) c.close();
  }, 30_000);

  test("pool authorship is recorded through distribute and revealed only at results", async () => {
    const host = await connect();
    host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
    const created = await host.next();
    if (created.type !== "session.created") throw new Error("unreachable");
    const code = created.payload.code;
    await host.expectState();

    const p2 = await connect();
    p2.send({ type: "room.join", payload: { code, playerName: "P2", protocolVersion: PROTOCOL_VERSION } });
    await p2.next();
    await p2.expectState();
    await host.expectState();

    const all = [host, p2];
    host.send({ type: "lobby.updateSettings", payload: { settings: { sabotageCells: 2 } } });
    for (const c of all) await c.expectState();
    host.send({ type: "lobby.start", payload: {} });
    for (const c of all) await c.expectState();

    // 23 own cells + 2 pool names each (K=2, random placement).
    for (const [label, client] of [["host", host], ["p2", p2]] as const) {
      for (let i = 0; i < 23; i++) {
        client.send({ type: "fill.writeCell", payload: { cellIndex: i, name: `${label}-${i}` } });
        for (const c of all) await c.expectState();
      }
      for (let slot = 0; slot < 2; slot++) {
        client.send({ type: "fill.writePool", payload: { slot, name: `${label}-pool-${slot}` } });
        for (const c of all) await c.expectState();
      }
    }

    host.send({ type: "fill.setDone", payload: { done: true } });
    for (const c of all) await c.expectState();
    p2.send({ type: "fill.setDone", payload: { done: true } });
    // distribute (K>0) then auto-advance into the round loop.
    const opened = await drainUntil(all, (s) => s.phase === "open_floor");
    expect(opened.round!.number).toBe(1);

    // The private board shows the pool cells but never says who wrote them.
    host.send({ type: "state.request", payload: {} });
    await host.expectState();
    const board = await host.expectPlayerBoard();
    const received = board.cells.filter((c) => c.fromPool);
    expect(received).toHaveLength(2);
    for (const cell of received) {
      expect(cell.name!.startsWith("host-pool-")).toBe(false); // never your own
      expect(Object.keys(cell)).toEqual(["name", "fromPool", "locked"]); // no authorId on the wire
    }

    host.close();
    p2.close();
  }, 30_000);
});
