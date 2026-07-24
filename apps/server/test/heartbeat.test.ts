import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { fakeDeck } from "./TestClient";

/**
 * The one suite that runs with the heartbeat **on**. Every other server test
 * passes `heartbeatMs: 0`, which is exactly why this went unnoticed for four
 * milestones: a healthy socket was closed after `heartbeatMs * 2.5` because the
 * pong never registered, and real clients hid it by reconnecting and resuming.
 *
 * `heartbeatMs` is scaled right down so "two and a half missed pings" is a few
 * hundred milliseconds rather than 75 seconds — the same trick
 * `roundTimerMsPerSec` uses for the round timer.
 */
const HEARTBEAT_MS = 120;
const DEADLINE_MS = HEARTBEAT_MS * 2.5; // what app.ts closes a stale socket at

const app = createApp({
  graceMs: 5_000,
  clientDist: null,
  decks: fakeDeck(3),
  heartbeatMs: HEARTBEAT_MS,
});
app.listen({ port: 0, hostname: "127.0.0.1" });
const port = app.server!.port!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("WS heartbeat", () => {
  test("an idle but healthy socket survives well past the stale deadline", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let closeCode: number | null = null;
    ws.onclose = (e) => (closeCode = e.code);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = reject;
    });

    // Four times the deadline, sending nothing at all. A real client answers a
    // protocol-level ping automatically, so application silence is not evidence
    // of a dead socket — which is the whole distinction the heartbeat draws.
    await sleep(DEADLINE_MS * 4);

    expect(closeCode).toBeNull();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  /**
   * The other half: a socket that goes silent at the *protocol* level must
   * still be reaped, or a dead proposer holds the queue front forever.
   *
   * This one can't use `WebSocket` — every conforming client answers a ping
   * automatically, so there is no way to fake a half-open socket through it.
   * A raw TCP connection that completes the HTTP upgrade and then simply never
   * speaks again is the real shape of the failure, and it exercises the
   * production path rather than reaching into `createApp`'s internals.
   */
  test("a socket that never pongs is closed once the deadline passes", async () => {
    const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    let upgraded = false;
    let closed = false;

    const conn = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        data(_s, chunk) {
          if (new TextDecoder().decode(chunk).includes("101")) upgraded = true;
        },
        close() {
          closed = true;
        },
        error() {
          closed = true;
        },
      },
    });

    conn.write(
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );

    // Let the upgrade land, then say nothing at all — no pong will ever go back.
    await sleep(200);
    expect(upgraded).toBe(true);

    await sleep(DEADLINE_MS * 4);
    expect(closed).toBe(true);
  });
});
