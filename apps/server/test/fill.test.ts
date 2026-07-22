import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION } from "@yawbg/protocol";
import { createApp } from "../src/app";
import { TestClient, fakeDeck } from "./TestClient";

// distributeMs is large here so the M1 assertions can still observe the
// `distribute` phase before it auto-advances into the round loop.
const app = createApp({
  graceMs: 300,
  clientDist: null,
  decks: fakeDeck(),
  distributeMs: 10_000,
  heartbeatMs: 0,
});
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

// No afterAll stop: Elysia's stop() blocks on lingering ws sockets under bun test
// on Windows; the server dies with the test process.

const connect = () => TestClient.connect(port);

const MIDDLE_ROW = [10, 11, 12, 13, 14];

// notifyAll broadcasts every fill write to *all* connected players, so every
// client's queue must be drained after each action — not just the acting
// client's — or the bystanders' queues fall behind and later reads go stale.
async function fillOwnBoard(all: TestClient[], acting: TestClient, label: string) {
  let cellIndex = 0;
  for (let i = 0; i < 20; i++) {
    while (MIDDLE_ROW.includes(cellIndex)) cellIndex++;
    acting.send({ type: "fill.writeCell", payload: { cellIndex, name: `${label}-own-${i}` } });
    for (const c of all) await c.expectState();
    cellIndex++;
  }
}

async function fillPool(all: TestClient[], acting: TestClient, label: string, k: number) {
  for (let slot = 0; slot < k; slot++) {
    acting.send({ type: "fill.writePool", payload: { slot, name: `${label}-pool-${slot}` } });
    for (const c of all) await c.expectState();
  }
}

describe("M1 exit scenario: lobby settings, board fill, distribute", () => {
  test("3 players, K=5 middleRow: nobody receives own pool names, everyone gets exactly 5", async () => {
    const host = await connect();
    host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
    const created = await host.next();
    if (created.type !== "session.created") throw new Error("unreachable");
    const code = created.payload.code;
    await host.expectState();

    const p2 = await connect();
    p2.send({ type: "room.join", payload: { code, playerName: "P2", protocolVersion: PROTOCOL_VERSION } });
    await p2.next(); // session.created
    await p2.expectState();
    await host.expectState();

    const p3 = await connect();
    p3.send({ type: "room.join", payload: { code, playerName: "P3", protocolVersion: PROTOCOL_VERSION } });
    await p3.next();
    await p3.expectState();
    await p2.expectState();
    await host.expectState();

    // Non-host settings change is rejected.
    p2.send({ type: "lobby.updateSettings", payload: { settings: { sabotageCells: 5 } } });
    await p2.expectError("NOT_HOST");

    // middleRow requires K=5 — rejected while cells is still 0.
    host.send({ type: "lobby.updateSettings", payload: { settings: { sabotagePlacement: "middleRow" } } });
    await host.expectError("BAD_MESSAGE");

    // Set both together.
    host.send({
      type: "lobby.updateSettings",
      payload: { settings: { sabotageCells: 5, sabotagePlacement: "middleRow" } },
    });
    let state = await host.expectState();
    expect(state.settings.sabotageCells).toBe(5);
    expect(state.settings.sabotagePlacement).toBe("middleRow");
    await p2.expectState();
    await p3.expectState();

    // A room mid-lobby is still joinable; once started it should not be (checked below).

    host.send({ type: "lobby.start", payload: {} });
    state = await host.expectState();
    expect(state.phase).toBe("board_fill");
    await p2.expectState();
    await p3.expectState();

    // room.join after start is rejected (M0-deferred WRONG_PHASE gate).
    const late = await connect();
    late.send({ type: "room.join", payload: { code, playerName: "Late", protocolVersion: PROTOCOL_VERSION } });
    await late.expectError("WRONG_PHASE");
    late.close();

    // Middle row (indices 10-14) is reserved — writing there is rejected.
    host.send({ type: "fill.writeCell", payload: { cellIndex: 12, name: "Nope" } });
    await host.expectError("BAD_MESSAGE");

    const all = [host, p2, p3];
    await fillOwnBoard(all, host, "host");
    await fillPool(all, host, "host", 5);
    await fillOwnBoard(all, p2, "p2");
    await fillPool(all, p2, "p2", 5);
    await fillOwnBoard(all, p3, "p3");
    await fillPool(all, p3, "p3", 5);

    host.send({ type: "fill.setDone", payload: { done: true } });
    state = await host.expectState();
    expect(state.players.find((p) => p.id === created.payload.playerId)?.fillDone).toBe(true);
    expect(state.phase).toBe("board_fill"); // p2, p3 not done yet
    await p2.expectState();
    await p3.expectState();

    p2.send({ type: "fill.setDone", payload: { done: true } });
    await host.expectState();
    await p2.expectState();
    await p3.expectState();

    // Editing while frozen (fillDone) is rejected.
    host.send({ type: "fill.writeCell", payload: { cellIndex: 0, name: "edit-after-ready" } });
    await host.expectError("ALREADY_RESOLVED");

    p3.send({ type: "fill.setDone", payload: { done: true } });
    state = await host.expectState(); // all done -> auto distribute
    expect(state.phase).toBe("distribute");
    await p2.expectState();
    await p3.expectState();

    // Each player's own pool contribution must never appear on their own board.
    const boards: Record<string, { own: string; board: Awaited<ReturnType<TestClient["expectPlayerBoard"]>> }> = {};
    for (const [label, client] of [
      ["host", host],
      ["p2", p2],
      ["p3", p3],
    ] as const) {
      client.send({ type: "state.request", payload: {} });
      await client.expectState();
      const board = await client.expectPlayerBoard();
      boards[label] = { own: label, board };
    }

    for (const [label, { board }] of Object.entries(boards)) {
      const middleRowNames = MIDDLE_ROW.map((i) => board.cells[i]!.name);
      expect(middleRowNames.every((n) => n !== null)).toBe(true);
      expect(middleRowNames).toHaveLength(5);
      // fromPool flag set on every received cell.
      for (const i of MIDDLE_ROW) expect(board.cells[i]!.fromPool).toBe(true);
      // Nobody receives a name they authored themselves.
      for (const name of middleRowNames) {
        expect(name!.startsWith(`${label}-pool-`)).toBe(false);
      }
      // Non-middle-row cells are the player's own, untouched.
      for (let i = 0; i < 25; i++) {
        if (MIDDLE_ROW.includes(i)) continue;
        expect(board.cells[i]!.name!).toStartWith(`${label}-own-`);
        expect(board.cells[i]!.fromPool).toBe(false);
      }
    }

    // Public boards show the received cells as "filled" (name hidden), not locked.
    host.send({ type: "state.request", payload: {} });
    const pub = await host.expectState();
    for (const p of pub.players) {
      expect(p.board.every((c) => c.status === "filled")).toBe(true);
    }

    host.close();
    p2.close();
    p3.close();
  });
});
