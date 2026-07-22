import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type PublicRoomState } from "@yawbg/protocol";
import { createApp } from "../src/app";
import { TestClient, fakeDeck } from "./TestClient";

// Its own app so grace can be short: this file is about what happens when the
// grace window actually expires.
const GRACE_MS = 300;
const app = createApp({
  graceMs: GRACE_MS,
  clientDist: null,
  decks: fakeDeck(3),
  distributeMs: 1,
  drawMs: 1,
  heartbeatMs: 0,
});
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

// No afterAll stop: Elysia's stop() blocks on lingering ws sockets under bun test
// on Windows; the server dies with the test process.

const connect = () => TestClient.connect(port);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Two players, boards filled, parked on the open floor of round 1. */
async function twoPlayerGame() {
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
  const all = [host, p2];
  for (const c of all) await c.expectState();

  host.send({ type: "lobby.start", payload: {} });
  for (const c of all) await c.expectState();

  for (const [label, client] of [["host", host], ["p2", p2]] as const) {
    for (let i = 0; i < 25; i++) {
      client.send({ type: "fill.writeCell", payload: { cellIndex: i, name: `${label}-${i}` } });
      for (const c of all) await c.expectState();
    }
  }

  host.send({ type: "fill.setDone", payload: { done: true } });
  for (const c of all) await c.expectState();
  p2.send({ type: "fill.setDone", payload: { done: true } });
  await drainUntil(all, (s) => s.phase === "open_floor");

  return {
    host,
    p2,
    all,
    code,
    hostId: created.payload.playerId,
    p2Id: c2.payload.playerId,
    p2Token: c2.payload.token,
  };
}

describe("disconnect during the open floor", () => {
  test("grace expiry removes the player, which auto-PASSes and unblocks the round", async () => {
    const g = await twoPlayerGame();

    g.host.send({ type: "round.pass", payload: {} });
    let s = await g.host.expectState();
    expect(s.phase).toBe("open_floor"); // p2 hasn't resolved, so the round holds
    expect(s.round!.number).toBe(1);

    g.p2.close();
    // While disconnected p2 still blocks — the round must not advance yet.
    await sleep(GRACE_MS / 3);
    g.host.send({ type: "state.request", payload: {} });
    s = await g.host.expectState();
    expect(s.phase).toBe("open_floor");
    expect(s.round!.number).toBe(1);
    expect(s.players.find((p) => p.id === g.p2Id)?.connected).toBe(false);

    // Once grace expires the seat is removed, which counts as a PASS (docs/01)
    // and lets the round turn over on its own.
    s = await drainUntil([g.host], (x) => x.phase === "open_floor" && x.round!.number === 2);
    expect(s.players).toHaveLength(1);
    expect(s.players[0]!.id).toBe(g.hostId);

    g.host.close();
  }, 15_000);

  test("a dropped proposer's pending proposal is withdrawn when the seat goes", async () => {
    const g = await twoPlayerGame();

    g.p2.send({ type: "round.propose", payload: { cellIndex: 4 } });
    let s = await drainUntil(g.all, (x) => x.round!.queue.length === 1);
    expect(s.round!.queue[0]!.name).toBe("p2-4");

    g.p2.close();
    // The proposal stays on stage through the grace window — the table may still
    // be arguing about it, and p2 may come back to confirm.
    await sleep(GRACE_MS / 3);
    g.host.send({ type: "state.request", payload: {} });
    s = await g.host.expectState();
    expect(s.round!.queue).toHaveLength(1);

    // After grace, the seat and its proposal are both gone.
    s = await drainUntil([g.host], (x) => x.players.length === 1);
    expect(s.round!.queue).toEqual([]);

    g.host.close();
  }, 15_000);

  test("resolved survives a reconnect: a player who passed then dropped is still passed", async () => {
    const g = await twoPlayerGame();

    g.p2.send({ type: "round.pass", payload: {} });
    let s = await drainUntil(g.all, (x) => x.players.find((p) => p.id === g.p2Id)?.resolved === true);
    expect(s.phase).toBe("open_floor"); // host still to go

    // Drop and resume well inside the grace window.
    g.p2.close();
    await sleep(GRACE_MS / 3);
    const back = await connect();
    back.send({
      type: "session.resume",
      payload: { code: g.code, playerId: g.p2Id, token: g.p2Token, protocolVersion: PROTOCOL_VERSION },
    });
    s = await back.expectState();

    // resolved is seat state, not socket state — the pass was not refunded.
    const p2 = s.players.find((p) => p.id === g.p2Id)!;
    expect(p2.connected).toBe(true);
    expect(p2.resolved).toBe(true);
    expect(s.phase).toBe("open_floor");
    expect(s.round!.number).toBe(1);

    // And passing again is still refused.
    back.send({ type: "round.pass", payload: {} });
    await back.expectError("ALREADY_RESOLVED");

    back.close();
    g.host.close();
  }, 15_000);
});
