import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION } from "@yawbg/protocol";
import { createApp } from "../src/app";
import { TestClient, fakeDeck } from "./TestClient";

const GRACE_MS = 300;

const app = createApp({ graceMs: GRACE_MS, clientDist: null, decks: fakeDeck(), heartbeatMs: 0 });
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

const connect = () => TestClient.connect(port);

// No afterAll stop: Elysia's stop() blocks on lingering ws sockets under bun test
// on Windows; the server dies with the test process.


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


describe("M0 exit scenario over real sockets", () => {
  test("create → join → display → disconnect → resume → expiry → leave", async () => {
    // c1 creates a room
    const c1 = await connect();
    c1.send({ type: "room.create", payload: { playerName: "Alice", protocolVersion: PROTOCOL_VERSION } });
    const created = await c1.next();
    expect(created.type).toBe("session.created");
    if (created.type !== "session.created") throw new Error("unreachable");
    const code = created.payload.code;
    expect(code).toMatch(/^[A-Z]{4}$/);

    let state = await c1.expectState();
    expect(state.phase).toBe("lobby");
    expect(state.house).toBeNull();
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({ name: "Alice", isHost: true, connected: true });

    // c2 joins; both get the 2-player snapshot
    const c2 = await connect();
    c2.send({ type: "room.join", payload: { code, playerName: "Bob", protocolVersion: PROTOCOL_VERSION } });
    const c2Created = await c2.next();
    expect(c2Created.type).toBe("session.created");
    if (c2Created.type !== "session.created") throw new Error("unreachable");
    expect(c2Created.payload.token).not.toBe(created.payload.token);
    const bob = c2Created.payload;

    expect((await c2.expectState()).players).toHaveLength(2);
    expect((await c1.expectState()).players).toHaveLength(2);

    // display joins read-only
    const d = await connect();
    d.send({ type: "display.join", payload: { code, protocolVersion: PROTOCOL_VERSION } });
    expect((await d.expectState()).players).toHaveLength(2);

    // display intents are rejected
    d.send({ type: "room.create", payload: { playerName: "Evil", protocolVersion: PROTOCOL_VERSION } });
    await d.expectError("BAD_MESSAGE");

    // c2 drops: everyone sees the seat disconnected but still present
    c2.close();
    state = await c1.expectState();
    expect(state.players).toHaveLength(2);
    expect(state.players.find((p) => p.id === bob.playerId)?.connected).toBe(false);
    await d.expectState();

    // resume within grace on a fresh socket: full resync, seat reclaimed
    const c2b = await connect();
    c2b.send({
      type: "session.resume",
      payload: { code, playerId: bob.playerId, token: bob.token, protocolVersion: PROTOCOL_VERSION },
    });
    state = await c2b.expectState();
    expect(state.players.find((p) => p.id === bob.playerId)?.connected).toBe(true);
    await c1.expectState();
    await d.expectState();

    // resume with a bad token
    const impostor = await connect();
    impostor.send({
      type: "session.resume",
      payload: { code, playerId: bob.playerId, token: "wrong", protocolVersion: PROTOCOL_VERSION },
    });
    await impostor.expectError("SESSION_INVALID");
    impostor.close();

    // grace expiry: c2b drops and stays gone → removed after graceMs
    c2b.close();
    state = await c1.expectState(); // disconnected broadcast
    expect(state.players).toHaveLength(2);
    await d.expectState();
    await sleep(GRACE_MS * 2);
    state = await c1.expectState(); // removal broadcast
    expect(state.players).toHaveLength(1);
    await d.expectState();

    // voluntary leave: immediate removal; last player out kills the room
    c1.send({ type: "room.leave", payload: {} });
    await sleep(100);
    const late = await connect();
    late.send({ type: "room.join", payload: { code, playerName: "Zoe", protocolVersion: PROTOCOL_VERSION } });
    await late.expectError("ROOM_NOT_FOUND");

    late.close();
    c1.close();
    d.close();
  });

  test("bad frames and version mismatch", async () => {
    const c = await connect();

    c.sendRaw("not json{");
    await c.expectError("BAD_MESSAGE");

    c.sendRaw(JSON.stringify({ type: "room.hack", payload: {} }));
    await c.expectError("BAD_MESSAGE");

    c.send({ type: "room.join", payload: { code: "XXXX", playerName: "Nobody", protocolVersion: PROTOCOL_VERSION } });
    await c.expectError("ROOM_NOT_FOUND");

    c.send({ type: "room.create", payload: { playerName: "Old", protocolVersion: 999 } });
    await c.expectError("VERSION_MISMATCH");

    c.close();
  });

  test("resume evicts the prior socket so its late close can't disconnect the live seat", async () => {
    const host = await connect();
    host.send({ type: "room.create", payload: { playerName: "Host", protocolVersion: PROTOCOL_VERSION } });
    const created = await host.next();
    if (created.type !== "session.created") throw new Error("unreachable");
    const code = created.payload.code;
    await host.expectState();

    // p2 joins on socket B
    const b = await connect();
    b.send({ type: "room.join", payload: { code, playerName: "P2", protocolVersion: PROTOCOL_VERSION } });
    const bCreated = await b.next();
    if (bCreated.type !== "session.created") throw new Error("unreachable");
    const seat = bCreated.payload;
    await b.expectState();
    await host.expectState();

    // p2 resumes on a fresh socket C while B is still open (duplicate tab / late close)
    const c = await connect();
    c.send({
      type: "session.resume",
      payload: { code, playerId: seat.playerId, token: seat.token, protocolVersion: PROTOCOL_VERSION },
    });
    await c.expectState();
    await host.expectState();

    // now B closes; without eviction this would flip the live seat to disconnected
    b.close();
    await sleep(GRACE_MS * 2);
    c.send({ type: "state.request", payload: {} });
    const state = await c.expectState();
    expect(state.players.find((p) => p.id === seat.playerId)?.connected).toBe(true);
    expect(state.players).toHaveLength(2);

    host.close();
    c.close();
  });

  test("intent from unbound socket is dropped, state.request resyncs", async () => {
    const c = await connect();
    c.send({ type: "state.request", payload: {} }); // no session: silently dropped

    c.send({ type: "room.create", payload: { playerName: "Solo", protocolVersion: PROTOCOL_VERSION } });
    await c.next(); // session.created
    await c.expectState();

    c.send({ type: "state.request", payload: {} });
    expect((await c.expectState()).players).toHaveLength(1);

    c.close();
  });
});
