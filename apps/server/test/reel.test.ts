import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type PublicRoomState, type Settings } from "@yawbg/protocol";
import { createApp } from "../src/app";
import { TestClient, fakeDeck } from "./TestClient";

/**
 * M5.5 — the highlight reel and cheers (docs/10).
 *
 * Frame accounting here is exact rather than drained: a *failed* intent sends
 * only an error and broadcasts nothing (app.ts), and a successful one broadcasts
 * exactly once to every socket. That matters more in this file than elsewhere
 * because a cheer changes nothing anyone else can see — the public frame it
 * produces is byte-identical to the one before it, so "wait until the state
 * changes" is not available as a synchronisation strategy.
 */
const app = createApp({
  graceMs: 5_000,
  clientDist: null,
  decks: fakeDeck(3),
  distributeMs: 1,
  drawMs: 1,
  heartbeatMs: 0,
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

/** One successful intent's worth of frames: one broadcast per client. */
async function settle(all: TestClient[]): Promise<PublicRoomState> {
  let last: PublicRoomState | null = null;
  for (const c of all) last = await c.expectState();
  return last!;
}

/**
 * Settle the cheer's broadcast, then read `actor`'s *current* private frame —
 * the only place `cheeredProposalIds` is observable.
 *
 * The flush is load-bearing: every earlier `expectState` skipped a
 * `player.board` without consuming it, so by now the actor has a stack of stale
 * private frames queued and reading one naively returns the state *before* the
 * cheer. Draining the broadcast first is what makes the flush safe — after it,
 * everything left in the queue is known to be stale.
 */
async function cheeredIds(all: TestClient[], actor: TestClient): Promise<string[]> {
  for (const c of all) await c.expectState();
  actor.flush();
  actor.send({ type: "state.request", payload: {} });
  return (await actor.expectPlayerBoard()).cheeredProposalIds;
}

async function expectError(client: TestClient, code: string): Promise<void> {
  let msg = await client.next();
  while (msg.type === "room.state" || msg.type === "player.board") msg = await client.next();
  expect(msg).toMatchObject({ type: "error", payload: { code } });
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

/** Three players, K = 0 (no distribute), open floor of round 1. */
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

  host.send({ type: "lobby.updateSettings", payload: { settings: { drawsPerRound: 3, ...settings } } });
  for (const c of all) await c.expectState();
  host.send({ type: "lobby.start", payload: {} });
  for (const c of all) await c.expectState();

  await fillBoard(all, host, "host");
  await fillBoard(all, p2, "p2");
  await fillBoard(all, p3, "p3");

  for (const c of all) {
    c.send({ type: "fill.setDone", payload: { done: true } });
    if (c !== p3) for (const other of all) await other.expectState();
  }
  const state = await drainUntil(all, (s) => s.phase === "open_floor");

  return { all, host, p2, p3, ids: [created.payload.playerId, c2.payload.playerId, c3.payload.playerId], state };
}

/** Everyone passes; settles on the next open floor, or on results. */
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

async function passUntilResults(g: Game, from: PublicRoomState): Promise<PublicRoomState> {
  let s = from;
  for (let i = 0; i < 60 && s.phase !== "results"; i++) s = await passRound(g, s.round!.number);
  if (s.phase !== "results") throw new Error("game never reached results");
  return s;
}

/**
 * Walk the reveal up to `stage`. Takes the current state rather than draining
 * for it: the caller already holds the frame that got the room to results, and
 * waiting for another one would block until somebody else acted.
 */
async function advanceTo(g: Game, from: PublicRoomState, stage: number): Promise<PublicRoomState> {
  let s = from;
  while (s.results!.revealStage < stage) {
    const at = s.results!.revealStage;
    g.host.send({ type: "results.advance", payload: {} });
    s = await drainUntil(g.all, (x) => (x.results?.revealStage ?? 0) > at);
  }
  return s;
}

describe("M5.5 the round's proposal record", () => {
  test("withdrawn names stay on the round frame, and no count rides along", async () => {
    const g = await startGame();

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    let s = await settle(g.all);
    expect(s.round!.proposals).toHaveLength(1);
    const first = s.round!.proposals[0]!;
    expect(first.outcome).toBe("live");
    expect(first.proposal.name).toBe("host-0");

    // The public frame is the one that also feeds the TV, so its shape is the
    // scope wall: proposals carry an outcome and nothing that could be read as
    // a verdict while the argument is still going.
    expect(Object.keys(first).sort()).toEqual(["outcome", "proposal"]);
    expect(Object.keys(first.proposal).sort()).toEqual(["cellIndex", "id", "name", "playerId"]);

    // Withdrawing takes the name off the floor but not out of the round — that
    // is the moment the joke usually lands (docs/10 decision 4).
    g.host.send({ type: "round.withdraw", payload: {} });
    s = await settle(g.all);
    expect(s.round!.queue).toEqual([]);
    expect(s.round!.proposals).toHaveLength(1);
    expect(s.round!.proposals[0]!.outcome).toBe("withdrawn");

    // And it is still cheerable.
    g.p2.send({ type: "round.cheer", payload: { proposalId: first.proposal.id, on: true } });
    expect(await cheeredIds(g.all, g.p2)).toEqual([first.proposal.id]);

    // Re-proposing the same cell is a genuinely new proposal with its own id,
    // which is exactly why (playerId, cellIndex) can't be the key.
    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    s = await settle(g.all);
    expect(s.round!.proposals).toHaveLength(2);
    expect(s.round!.proposals[1]!.proposal.id).not.toBe(first.proposal.id);

    for (const c of g.all) c.close();
  }, 30_000);

  test("cheers are mine alone, idempotent, and never my own name", async () => {
    const g = await startGame();

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    const s = await settle(g.all);
    const id = s.round!.proposals[0]!.proposal.id;

    // Self-cheer is refused server-side as well as disabled in the UI: the
    // control being disabled is a courtesy, this is the rule.
    g.host.send({ type: "round.cheer", payload: { proposalId: id, on: true } });
    await expectError(g.host, "BAD_MESSAGE");

    g.p2.send({ type: "round.cheer", payload: { proposalId: "p999", on: true } });
    await expectError(g.p2, "BAD_MESSAGE");

    // `on` is explicit, so a resend is a no-op rather than an un-cheer.
    g.p2.send({ type: "round.cheer", payload: { proposalId: id, on: true } });
    expect(await cheeredIds(g.all, g.p2)).toEqual([id]);
    g.p2.send({ type: "round.cheer", payload: { proposalId: id, on: true } });
    expect(await cheeredIds(g.all, g.p2)).toEqual([id]);

    // One player's cheer is invisible to the next — p3 has cheered nothing.
    g.p3.send({ type: "round.cheer", payload: { proposalId: id, on: false } });
    expect(await cheeredIds(g.all, g.p3)).toEqual([]);

    g.p2.send({ type: "round.cheer", payload: { proposalId: id, on: false } });
    expect(await cheeredIds(g.all, g.p2)).toEqual([]);

    for (const c of g.all) c.close();
  }, 30_000);

  test("a previous round's proposal can no longer be cheered", async () => {
    const g = await startGame();

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    const s = await settle(g.all);
    const stale = s.round!.proposals[0]!.proposal.id;

    const next = await passRound(g, s.round!.number);
    expect(next.round!.proposals).toEqual([]); // cleared with the round

    // The window is the round, and it closes. A hand-rolled intent from devtools
    // is exactly the thing this guard exists for (docs/03 invariant 13).
    g.p2.send({ type: "round.cheer", payload: { proposalId: stale, on: true } });
    await expectError(g.p2, "BAD_MESSAGE");

    for (const c of g.all) c.close();
  }, 30_000);

  test("cheering outside the open floor is rejected", async () => {
    const g = await startGame();
    let s = await passUntilResults(g, g.state);
    expect(s.phase).toBe("results");

    g.p2.send({ type: "round.cheer", payload: { proposalId: "p1", on: true } });
    await expectError(g.p2, "WRONG_PHASE");

    for (const c of g.all) c.close();
  }, 60_000);
});

describe("M5.5 the reel", () => {
  test("empty below stage 3, ordered by cheers at 3, and no card for a round nobody answered", async () => {
    const g = await startGame();
    const [hostId, p2Id] = g.ids;

    // Round 1 produces two entries: one locked with two cheers, one withdrawn
    // with one. Round 2 (and every round after) produces none.
    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    let s = await settle(g.all);
    const lockedId = s.round!.proposals[0]!.proposal.id;
    g.p2.send({ type: "round.cheer", payload: { proposalId: lockedId, on: true } });
    await settle(g.all);
    g.p3.send({ type: "round.cheer", payload: { proposalId: lockedId, on: true } });
    await settle(g.all);
    g.host.send({ type: "round.confirm", payload: {} });
    await settle(g.all);

    g.p2.send({ type: "round.propose", payload: { cellIndex: 5 } });
    s = await settle(g.all);
    const withdrawnId = s.round!.proposals[1]!.proposal.id;
    g.p3.send({ type: "round.cheer", payload: { proposalId: withdrawnId, on: true } });
    await settle(g.all);
    g.p2.send({ type: "round.withdraw", payload: {} });
    await settle(g.all);

    // A cheer given before the withdrawal survives it — the feature, not a leak.
    g.p2.send({ type: "round.pass", payload: {} });
    await settle(g.all);
    g.p3.send({ type: "round.pass", payload: {} });
    // `open_floor` is part of the predicate on purpose: `draw()` increments the
    // round number *before* setting the phase, so "round > 1" alone settles on a
    // frame where the floor is still closed and the next pass is a WRONG_PHASE.
    let opened = await drainUntil(
      g.all,
      (x) => (x.phase === "open_floor" && x.round!.number > 1) || x.phase === "results",
    );

    // Round 2: everybody passes, so it contributes no card at all.
    for (const c of g.all) c.send({ type: "round.pass", payload: {} });
    opened = await drainUntil(
      g.all,
      (x) => (x.phase === "open_floor" && x.round!.number > 2) || x.phase === "results",
    );

    // Round 3: one proposal with one cheer — fewer than round 1's leader, more
    // than round 1's other card. Its position in the finished reel is the whole
    // proof that cards are no longer grouped by round.
    //
    // Asserted rather than guarded: the House needs a full line and gets three
    // numbers a round, so ending before round 3 would take a ~1-in-a-million
    // draw. If that ever fires, the interleave assertions below would silently
    // stop running, which is worse than a flake.
    expect(opened.phase).toBe("open_floor");
    expect(opened.round!.number).toBe(3);
    g.p3.send({ type: "round.propose", payload: { cellIndex: 9 } });
    s = await settle(g.all);
    const middleId = s.round!.proposals[0]!.proposal.id;
    g.host.send({ type: "round.cheer", payload: { proposalId: middleId, on: true } });
    await settle(g.all);
    g.p3.send({ type: "round.confirm", payload: {} });
    await settle(g.all);
    g.host.send({ type: "round.pass", payload: {} });
    await settle(g.all);
    g.p2.send({ type: "round.pass", payload: {} });
    opened = await drainUntil(
      g.all,
      (x) => (x.phase === "open_floor" && x.round!.number > 3) || x.phase === "results",
    );

    s = await passUntilResults(g, opened);

    // Stage 0 and stage 2 (K = 0 skips 1): the tally is withheld from every
    // socket, displays included, exactly the way `boards` is at stage 0.
    expect(s.results!.revealStage).toBe(0);
    expect(s.results!.reel).toEqual([]);
    s = await advanceTo(g, s, 2);
    expect(s.results!.reel).toEqual([]);
    expect(JSON.stringify(s.results)).not.toContain("cheers");

    s = await advanceTo(g, s, 3);
    const reel = s.results!.reel;
    // One card per *proposal*, not per round: round 1 made two, round 3 made
    // one, round 2 and every later round made none.
    expect(reel).toHaveLength(3);
    for (const c of reel) {
      expect(c.topicText).toBeTruthy();
      expect(c.drawnNumbers).toHaveLength(3);
    }

    // Sorted by cheers descending across the whole reel, so round 3's single
    // card lands *between* round 1's two. Grouping by round could not produce
    // this order, which is exactly what the assertion is for.
    expect(reel[0]).toMatchObject({
      proposalId: lockedId,
      playerId: hostId,
      playerName: "Host",
      name: "host-0",
      outcome: "locked",
      cheers: 2,
    });
    expect(reel.at(-1)).toMatchObject({
      proposalId: withdrawnId,
      playerId: p2Id,
      playerName: "P2",
      name: "p2-5",
      outcome: "withdrawn",
      cheers: 1,
    });
    expect(reel.map((c) => c.cheers)).toEqual([...reel.map((c) => c.cheers)].sort((a, b) => b - a));
    expect(reel[1]!.proposalId).toBe(middleId);
    expect(reel[1]!.round).toBe(3);
    // Two cards of round 1 with a round-3 card wedged between them.
    expect(reel.map((c) => c.round)).toEqual([1, 3, 1]);
    // Cards of the same round repeat its setup — the format, not a bug.
    expect(reel[0]!.topicText).toBe(reel[2]!.topicText);
    expect(reel[0]!.topicText).not.toBe(reel[1]!.topicText);

    // Nothing is ever left `live`: docs/10's outcome table has two rows because
    // every path out of a round settles the floor.
    for (const c of reel) expect(["locked", "withdrawn"]).toContain(c.outcome);

    for (const c of g.all) c.close();
  }, 60_000);

  test("a game where nobody proposed still reaches stage 3, with an empty reel", async () => {
    const g = await startGame();
    const s = await passUntilResults(g, g.state);
    const final = await advanceTo(g, s, 3);

    // Stage 3 is never skipped even with nothing to show — it is also the
    // play-again screen (docs/10 decision 1).
    expect(s.phase).toBe("results");
    expect(final.results!.revealStage).toBe(3);
    expect(final.results!.reel).toEqual([]);

    for (const c of g.all) c.close();
  }, 60_000);

  test("playAgain clears the proposal records", async () => {
    const g = await startGame();

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    let s = await settle(g.all);
    expect(s.round!.proposals).toHaveLength(1);

    s = await passUntilResults(g, s);
    await advanceTo(g, s, 3);

    g.host.send({ type: "game.playAgain", payload: {} });
    await drainUntil(g.all, (x) => x.phase === "board_fill");

    await fillBoard(g.all, g.host, "host2");
    await fillBoard(g.all, g.p2, "p22");
    await fillBoard(g.all, g.p3, "p32");
    for (const c of g.all) {
      c.send({ type: "fill.setDone", payload: { done: true } });
      if (c !== g.p3) for (const other of g.all) await other.expectState();
    }
    s = await drainUntil(g.all, (x) => x.phase === "open_floor");

    // The sharp edge: game two's round 1 has the same round *number* as game
    // one's, so a surviving record would surface right here — and then again on
    // game two's reel, which is built from the same array.
    expect(s.round!.number).toBe(1);
    expect(s.round!.proposals).toEqual([]);

    g.host.send({ type: "round.propose", payload: { cellIndex: 0 } });
    s = await settle(g.all);
    expect(s.round!.proposals).toHaveLength(1);
    expect(s.round!.proposals[0]!.proposal.name).toBe("host2-0");

    for (const c of g.all) c.close();
  }, 120_000);
});
