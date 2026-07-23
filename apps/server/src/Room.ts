import {
  PROTOCOL_VERSION,
  SettingsSchema,
  defaultSettings,
  type ClientIntent,
  type ErrorCode,
  type HousePublic,
  type Phase,
  type PrivateBoard,
  type PrivateCell,
  type Proposal,
  type PublicCell,
  type PublicRoomState,
  type ResultsPayload,
  type RoundHistoryEntry,
  type RoundState,
  type ServerMessage,
  type Settings,
  type Topic,
} from "@yawbg/protocol";
import type { TopicSource } from "./DeckStore";
import { bestLineNeeds, countLines } from "./lines";

// Narrow view of an Elysia WS connection — keeps `any` at the handler boundary.
export interface Socket {
  send(data: string): void;
  close(): void;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  ws: Socket | null;
  connected: boolean;
  isHost: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  board: PrivateCell[]; // 25, index 0-24 row-major
  poolSlots: (string | null)[]; // length = settings.sabotageCells as of lobby.start
  fillDone: boolean;
  /** open_floor/last_call: confirmed-or-passed. Seat state, so it survives a resume. */
  resolved: boolean;
  /**
   * 25, parallel to `board`; null = self, else the pool contributor's playerId.
   * Server-only on purpose — it must never reach PrivateCell, which goes over
   * the wire to the owner every snapshot, and authorship is hidden until
   * results (docs/01). This is the only record of who wrote what.
   */
  authors: (string | null)[];
}

interface House {
  board: (number | null)[]; // 25; null at index 12 when freeCenter
  freeCenter: boolean;
  hits: Set<number>; // cell indices, not numbers
  linesCompleted: number;
}

export type IntentResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

export const MAX_PLAYERS = 12;
const RESERVED_MIDDLE_ROW = [10, 11, 12, 13, 14];

const emptyBoard = (): PrivateCell[] =>
  Array.from({ length: 25 }, () => ({ name: null, fromPool: false, locked: null }));

// Fisher-Yates.
function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export class Room {
  readonly code: string;
  players: Player[] = [];
  phase: Phase = "lobby";
  private settings: Settings = defaultSettings();
  private displays = new Set<Socket>();
  private graceMs: number;
  private onEmpty: () => void;

  private house: House | null = null;
  private numberPile: number[] = [];
  private allDrawn: number[] = [];
  /** Counts rounds that get an open floor, so LockTag.round stays contiguous. */
  private roundNumber = 0;
  private roundDrawnNumbers: number[] = [];
  private topic: Topic | null = null;
  private topicPile: Topic[] = [];
  private usedTopics: Topic[] = [];
  /** FIFO; index 0 is on stage. Carries proposed names, which are public. */
  private queue: Proposal[] = [];
  private roundLocks: RoundHistoryEntry["locks"] = [];
  private roundHistory: RoundHistoryEntry[] = [];
  private results: ResultsPayload | null = null;
  private lastCallDone = false;
  /** distribute->draw and draw->open_floor never overlap, so one slot is enough. */
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * roundTimerSec gets its own slot: it runs *during* the open floor, and the
   * draw->open_floor phase timer is still nominally the last thing to have used
   * `phaseTimer`. Sharing the slot would let one cancel the other.
   */
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private decks: TopicSource;
  private distributeMs: number;
  private drawMs: number;
  private roundTimerMsPerSec: number;

  constructor(
    code: string,
    opts: {
      graceMs: number;
      onEmpty: () => void;
      decks: TopicSource;
      distributeMs?: number;
      drawMs?: number;
      roundTimerMsPerSec?: number;
    },
  ) {
    this.code = code;
    this.graceMs = opts.graceMs;
    this.onEmpty = opts.onEmpty;
    this.decks = opts.decks;
    this.distributeMs = opts.distributeMs ?? 4_000; // docs/05: "~4 s, auto-advances"
    this.drawMs = opts.drawMs ?? 2_500; // the draw-moment takeover
    // The setting is in seconds and the lobby's smallest option is 30, so tests
    // scale a "second" down rather than sleeping for half a minute.
    this.roundTimerMsPerSec = opts.roundTimerMsPerSec ?? 1_000;
  }

  addPlayer(name: string, ws: Socket): Player {
    if (this.players.length >= MAX_PLAYERS) throw new Error("ROOM_FULL");
    const player: Player = {
      id: crypto.randomUUID(),
      name: this.dedupeName(name),
      token: crypto.randomUUID(),
      ws,
      connected: true,
      isHost: this.players.length === 0,
      disconnectTimer: null,
      board: emptyBoard(),
      poolSlots: [],
      fillDone: false,
      resolved: false,
      authors: Array.from({ length: 25 }, () => null),
    };
    this.players.push(player);
    return player;
  }

  // Duplicate display names get a numeric suffix (docs/03).
  private dedupeName(name: string): string {
    if (!this.players.some((p) => p.name === name)) return name;
    let n = 2;
    while (this.players.some((p) => p.name === `${name} ${n}`)) n++;
    return `${name} ${n}`;
  }

  addDisplay(ws: Socket): void {
    this.displays.add(ws);
  }

  removeDisplay(ws: Socket): void {
    this.displays.delete(ws);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  handleDisconnect(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.connected = false;
    player.ws = null;
    player.disconnectTimer = setTimeout(() => {
      this.removePlayer(playerId);
      this.notifyAll();
    }, this.graceMs);
    this.notifyAll();
  }

  resume(playerId: string, token: string, ws: Socket): Player | null {
    const player = this.getPlayer(playerId);
    if (!player || player.token !== token) return null;
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.ws = ws;
    player.connected = true;
    this.notifyAll();
    return player;
  }

  // Voluntary leave and grace expiry both land here.
  removePlayer(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    this.players = this.players.filter((p) => p.id !== playerId);
    if (player.isHost && this.players.length > 0) {
      this.players[0]!.isHost = true;
    }
    // A pending proposal is auto-withdrawn on grace expiry (docs/01).
    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    if (this.players.length === 0) {
      // Don't let a pending timer outlive the room and notify a ghost.
      this.clearPhaseTimer();
      this.clearRoundTimer();
      for (const d of this.displays) d.close();
      this.displays.clear();
      this.onEmpty();
      return;
    }
    this.maybeAdvance(); // removal is an auto-PASS, and may be the last holdout
  }

  // Gameplay intents that need host-check + phase-check + validation. Session
  // management (room.create/join/display.join/session.resume/room.leave/
  // state.request) stays in app.ts since it manipulates socket bindings, not
  // Room invariants.
  handleIntent(playerId: string, intent: ClientIntent): IntentResult {
    const player = this.getPlayer(playerId);
    if (!player) return err("BAD_MESSAGE", "unknown player");

    switch (intent.type) {
      case "lobby.updateSettings": {
        if (!player.isHost) return err("NOT_HOST", "only the host can change settings");
        if (this.phase !== "lobby") return err("WRONG_PHASE", "settings are locked once the game starts");
        const merged = { ...this.settings, ...intent.payload.settings };
        const parsed = SettingsSchema.safeParse(merged);
        if (!parsed.success) {
          return err("BAD_MESSAGE", parsed.error.issues[0]?.message ?? "invalid settings");
        }
        this.settings = parsed.data;
        return { ok: true };
      }
      case "lobby.start": {
        if (!player.isHost) return err("NOT_HOST", "only the host can start the game");
        if (this.phase !== "lobby") return err("WRONG_PHASE", "game already started");
        const connectedCount = this.players.filter((p) => p.connected).length;
        if (connectedCount < 2) return err("BAD_MESSAGE", "need at least 2 connected players");
        if (this.decks.topicsFor(this.settings.deckIds).length === 0) {
          return err("BAD_MESSAGE", "the selected decks have no topics");
        }
        this.beginBoardFill();
        return { ok: true };
      }
      case "fill.writeCell": {
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        if (player.fillDone) return err("ALREADY_RESOLVED", "un-ready to keep editing");
        if (this.isReservedCell(intent.payload.cellIndex)) {
          return err("BAD_MESSAGE", "that cell is reserved for the pool deal");
        }
        player.board[intent.payload.cellIndex] = {
          name: intent.payload.name,
          fromPool: false,
          locked: null,
        };
        return { ok: true };
      }
      case "fill.clearCell": {
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        if (player.fillDone) return err("ALREADY_RESOLVED", "un-ready to keep editing");
        if (this.isReservedCell(intent.payload.cellIndex)) {
          return err("BAD_MESSAGE", "that cell is reserved for the pool deal");
        }
        player.board[intent.payload.cellIndex] = { name: null, fromPool: false, locked: null };
        return { ok: true };
      }
      case "fill.writePool": {
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        if (player.fillDone) return err("ALREADY_RESOLVED", "un-ready to keep editing");
        if (intent.payload.slot >= this.settings.sabotageCells) {
          return err("BAD_MESSAGE", "no such pool slot");
        }
        player.poolSlots[intent.payload.slot] = intent.payload.name;
        return { ok: true };
      }
      case "fill.setDone": {
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        if (intent.payload.done && !this.isFillComplete(player)) {
          return err("BAD_MESSAGE", "board isn't complete yet");
        }
        player.fillDone = intent.payload.done;
        if (this.players.filter((p) => p.connected).every((p) => p.fillDone)) {
          this.startGame();
        }
        return { ok: true };
      }
      case "fill.forceStart": {
        if (!player.isHost) return err("NOT_HOST", "only the host can force-start");
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        this.startGame(); // fills stragglers' gaps itself
        return { ok: true };
      }
      case "round.propose": {
        const guard = this.roundGuard(player);
        if (guard) return guard;
        if (player.resolved) return err("ALREADY_RESOLVED", "you already locked or passed this round");
        const cell = player.board[intent.payload.cellIndex]!;
        if (cell.name === null) return err("BAD_MESSAGE", "that cell is empty");
        if (cell.locked) return err("CELL_LOCKED", "that cell is already locked");
        if (this.queue.some((q) => q.playerId === player.id)) {
          return err("BAD_MESSAGE", "you already have a proposal on the floor");
        }
        this.queue.push({ playerId: player.id, cellIndex: intent.payload.cellIndex, name: cell.name });
        return { ok: true };
      }
      case "round.confirm": {
        const guard = this.roundGuard(player);
        if (guard) return guard;
        // Ownership is the invariant; being at the queue front is not. Enforcing
        // the front server-side would deadlock the room if the front player drops.
        const idx = this.queue.findIndex((q) => q.playerId === player.id);
        if (idx === -1) return err("BAD_MESSAGE", "you have no proposal to confirm");
        const proposal = this.queue[idx]!;
        const cell = player.board[proposal.cellIndex]!;
        if (cell.locked) return err("CELL_LOCKED", "that cell is already locked");
        if (!this.topic) return err("WRONG_PHASE", "no topic on the floor");
        cell.locked = {
          round: this.roundNumber,
          drawnNumber: this.roundDrawnNumbers[0] ?? 0, // the topic hangs off the first of the batch
          topicId: this.topic.id,
          topicText: this.topic.text,
        };
        this.queue.splice(idx, 1);
        this.roundLocks.push({ playerId: player.id, name: cell.name!, cellIndex: proposal.cellIndex });
        player.resolved = true; // one lock per player per round
        this.maybeAdvance();
        return { ok: true };
      }
      case "round.withdraw": {
        const guard = this.roundGuard(player);
        if (guard) return guard;
        const idx = this.queue.findIndex((q) => q.playerId === player.id);
        if (idx === -1) return err("BAD_MESSAGE", "you have no proposal to withdraw");
        this.queue.splice(idx, 1); // costs nothing; re-propose or pass is still open
        return { ok: true };
      }
      case "round.pass": {
        const guard = this.roundGuard(player);
        if (guard) return guard;
        if (player.resolved) return err("ALREADY_RESOLVED", "you already resolved this round");
        // Passing with a live proposal implicitly withdraws it — otherwise it
        // strands a card on the display's stage that nobody can act on.
        this.queue = this.queue.filter((q) => q.playerId !== player.id);
        player.resolved = true; // pass is final for the round
        this.maybeAdvance();
        return { ok: true };
      }
      case "round.forceAdvance": {
        if (!player.isHost) return err("NOT_HOST", "only the host can force-advance");
        const guard = this.roundGuard(player);
        if (guard) return guard;
        // No auto-pass loop needed: advanceRound clears the queue and resets
        // every resolved flag, which *is* the documented auto-pass/auto-withdraw.
        if (this.phase === "last_call") {
          this.flushRoundHistory();
          this.endGame();
        } else {
          this.advanceRound();
        }
        return { ok: true };
      }
      default:
        return err("BAD_MESSAGE", `intent not handled here: ${intent.type}`);
    }
  }

  /** Round intents need an open floor and a live seat (docs/03 invariants 1, 9). */
  private roundGuard(player: Player): IntentResult | null {
    if (this.phase !== "open_floor" && this.phase !== "last_call") {
      return err("WRONG_PHASE", "the floor isn't open");
    }
    if (!player.connected) return err("BAD_MESSAGE", "you are disconnected");
    return null;
  }

  private isReservedCell(cellIndex: number): boolean {
    return this.settings.sabotagePlacement === "middleRow" && RESERVED_MIDDLE_ROW.includes(cellIndex);
  }

  private isFillComplete(player: Player): boolean {
    const K = this.settings.sabotageCells;
    if (this.settings.sabotagePlacement === "middleRow") {
      const ownFilled = player.board.every((c, i) => RESERVED_MIDDLE_ROW.includes(i) || c.name !== null);
      if (!ownFilled) return false;
    } else {
      const filledCount = player.board.filter((c) => c.name !== null).length;
      if (filledCount !== 25 - K) return false;
    }
    return player.poolSlots.every((s) => s !== null);
  }

  // Host force-start for stragglers: fills any gaps with a visible placeholder
  // so the distribute-time invariants (every player has exactly K empty own
  // cells / K pool contributions) still hold.
  private autoCompleteFill(player: Player): void {
    for (let i = 0; i < 25; i++) {
      if (!this.isReservedCell(i) && player.board[i]!.name === null) {
        player.board[i] = { name: "(blank)", fromPool: false, locked: null };
      }
    }
    for (let i = 0; i < player.poolSlots.length; i++) {
      if (player.poolSlots[i] === null) player.poolSlots[i] = "(blank)";
    }
    player.fillDone = true;
  }

  private beginBoardFill(): void {
    const K = this.settings.sabotageCells;
    for (const p of this.players) {
      p.board = emptyBoard();
      p.poolSlots = Array.from({ length: K }, () => null);
      p.fillDone = false;
      p.resolved = false;
      p.authors = Array.from({ length: 25 }, () => null);
    }
    this.phase = "board_fill";
  }

  // Both paths out of board_fill land here.
  private startGame(): void {
    // fill.setDone's all-done check filters to connected, so a player who
    // dropped mid-fill can reach this with an unfinished board and would be
    // dealt K pool names into 25 empty cells. Fill their gaps the same way
    // fill.forceStart already does.
    for (const p of this.players) if (!p.fillDone) this.autoCompleteFill(p);

    this.initHouse();
    this.numberPile = shuffled(range(1, this.settings.numberPoolSize));
    this.topicPile = shuffled(this.decks.topicsFor(this.settings.deckIds));
    this.dealPool();

    if (this.settings.sabotageCells > 0) {
      this.phase = "distribute";
      this.setPhaseTimer(this.distributeMs, () => this.advanceRound());
    } else {
      this.advanceRound(); // K = 0 => distribute is skipped (docs/01)
    }
  }

  // A conventional bingo card: column c holds 5 numbers from its own fifth of
  // the pool (1-15, 16-30, ... at 75; 1-20, ... at 100 — both divide by 5).
  private initHouse(): void {
    const span = this.settings.numberPoolSize / 5;
    const board: (number | null)[] = Array.from({ length: 25 }, () => null);
    for (let col = 0; col < 5; col++) {
      const column = shuffled(range(col * span + 1, (col + 1) * span)).slice(0, 5);
      for (let row = 0; row < 5; row++) board[row * 5 + col] = column[row]!;
    }
    const freeCenter = this.settings.houseFreeCenter;
    if (freeCenter) board[12] = null;
    this.house = {
      board,
      freeCenter,
      hits: freeCenter ? new Set([12]) : new Set(),
      linesCompleted: 0,
    };
    this.house.linesCompleted = countLines(this.houseMask());
  }

  // Round-robin offset: each player's K pool contributions rotate to exactly
  // one other player (offset != 0 mod n), so nobody can receive their own
  // names back, while every player receives exactly K.
  private dealPool(): void {
    const K = this.settings.sabotageCells;
    if (K === 0) return;
    const n = this.players.length;
    const blocks = this.players.map((p) => shuffled(p.poolSlots.map((name) => name!)));
    const offset = 1 + Math.floor(Math.random() * (n - 1));
    for (let i = 0; i < n; i++) {
      const author = this.players[i]!;
      const recipient = this.players[(i + offset) % n]!;
      const names = blocks[i]!;
      const emptyIndices = recipient.board
        .map((c, idx) => (c.name === null ? idx : -1))
        .filter((idx) => idx !== -1);
      for (let j = 0; j < names.length; j++) {
        const idx = emptyIndices[j]!;
        recipient.board[idx] = { name: names[j]!, fromPool: true, locked: null };
        recipient.authors[idx] = author.id; // the results roast needs this; nothing else records it
      }
    }
  }

  // The single entry point for ending a round: resolve-based auto-advance, host
  // force-advance, and (M3) the roundTimerSec expiry all land here.
  private advanceRound(): void {
    this.clearPhaseTimer();
    this.clearRoundTimer();
    this.flushRoundHistory();
    this.queue = [];
    this.roundLocks = [];
    for (const p of this.players) p.resolved = false;
    this.draw();
    // Timers fire outside app.ts's router, which is what normally broadcasts —
    // so every path through here must send its own snapshot.
    this.notifyAll();
  }

  private flushRoundHistory(): void {
    if (this.topic === null) return; // before round 1
    this.roundHistory.push({
      round: this.roundNumber,
      drawnNumbers: this.roundDrawnNumbers,
      topicText: this.topic.text,
      locks: this.roundLocks,
    });
  }

  private draw(): void {
    if (this.numberPile.length === 0) return void this.endGame(); // unreachable; see below

    this.roundDrawnNumbers = this.numberPile.splice(-this.settings.drawsPerRound);
    this.allDrawn.push(...this.roundDrawnNumbers);
    this.markHouseHits(this.roundDrawnNumbers);

    // Checked before the topic pop so a game-ending draw doesn't burn a topic on
    // a round that never gets an open floor. Always terminates: every House
    // number is in the pile, so the board completes at or before exhaustion.
    if (this.house!.linesCompleted >= this.settings.houseBingoTarget) {
      if (this.settings.lastCall && !this.lastCallDone) return void this.beginLastCall();
      return void this.endGame();
    }

    this.roundNumber++;
    this.topic = this.popTopic();
    this.phase = "draw";
    this.setPhaseTimer(this.drawMs, () => {
      this.phase = "open_floor";
      this.startRoundTimer(); // the clock starts when the floor does, not at the draw
      this.notifyAll();
    });
  }

  // docs/01: one final topic is drawn after House bingo, for one last lock
  // window. No new number is drawn, so roundDrawnNumbers deliberately keeps the
  // batch that ended the game — a last-call lock tags the House's killing blow.
  private beginLastCall(): void {
    this.lastCallDone = true;
    this.roundNumber++;
    this.topic = this.popTopic();
    this.phase = "last_call";
    // last_call is an open-floor variant (docs/06), so the soft timer applies
    // here too — otherwise the one phase with no next round is also the one
    // phase that can only be un-stalled by the host.
    this.startRoundTimer();
  }

  private markHouseHits(numbers: number[]): void {
    const house = this.house!;
    for (const n of numbers) {
      const idx = house.board.indexOf(n);
      if (idx >= 0) house.hits.add(idx);
    }
    house.linesCompleted = countLines(this.houseMask());
  }

  private houseMask(): boolean[] {
    return Array.from({ length: 25 }, (_, i) => this.house!.hits.has(i));
  }

  /** Reshuffles used topics when the pile empties (docs/03 invariant 6). */
  private popTopic(): Topic | null {
    if (this.topicPile.length === 0) {
      this.topicPile = shuffled(this.usedTopics);
      this.usedTopics = [];
    }
    const topic = this.topicPile.pop() ?? null;
    if (topic) this.usedTopics.push(topic);
    return topic;
  }

  private maybeAdvance(): void {
    if (this.phase !== "open_floor" && this.phase !== "last_call") return;
    if (this.players.length === 0) return;
    // Disconnected players are treated as not-yet-resolved (docs/01's edge-case
    // table) — a tunnel blip must not silently spend someone's round. The host's
    // force-advance is the designed escape hatch, and the heartbeat means a truly
    // dead socket drops to grace and auto-passes on its own.
    if (!this.players.every((p) => p.resolved)) return;
    if (this.phase === "last_call") {
      this.flushRoundHistory();
      this.endGame();
      this.notifyAll();
      return;
    }
    this.advanceRound();
  }

  private endGame(): void {
    this.clearPhaseTimer();
    this.clearRoundTimer();
    this.results = this.buildResults();
    this.phase = "results";
  }

  private buildResults(): ResultsPayload {
    return {
      revealStage: 0, // M4 paces this via results.advance
      winners: this.players.filter((p) => this.hasWon(p)).map((p) => p.id),
      boards: this.players.map((p) => ({
        playerId: p.id,
        cells: p.board.map((c, i) => ({
          name: c.name ?? "(blank)",
          authorId: p.authors[i] ?? null,
          locked: c.locked,
        })),
      })),
      roundHistory: this.roundHistory,
    };
  }

  private playerMask(player: Player): boolean[] {
    return player.board.map((c) => c.locked !== null); // no player free center
  }

  private countPlayerLines(player: Player): number {
    return countLines(this.playerMask(player));
  }

  private hasWon(player: Player): boolean {
    return this.countPlayerLines(player) >= this.settings.playerLinesToWin;
  }

  private setPhaseTimer(ms: number, fn: () => void): void {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      fn();
    }, ms);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  /**
   * The optional soft round timer (docs/03): on expiry it does *exactly* what
   * host force-advance does, by calling the same code — unresolved players
   * auto-pass and a stalled proposal is auto-withdrawn by advanceRound's reset.
   */
  private startRoundTimer(): void {
    this.clearRoundTimer();
    const sec = this.settings.roundTimerSec;
    if (sec === null) return;
    this.roundTimer = setTimeout(() => {
      this.roundTimer = null;
      if (this.phase !== "open_floor" && this.phase !== "last_call") return;
      if (this.phase === "last_call") {
        this.flushRoundHistory();
        this.endGame();
      } else {
        this.advanceRound(); // notifies on its own
        return;
      }
      // Fires outside app.ts's router, so this path sends its own snapshot.
      this.notifyAll();
    }, sec * this.roundTimerMsPerSec);
  }

  private clearRoundTimer(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }

  getPrivateBoard(player: Player): PrivateBoard {
    return { cells: player.board, poolSlots: player.poolSlots };
  }

  private toPublicCell(cell: PrivateCell): PublicCell {
    if (cell.locked) return { status: "locked", name: cell.name!, tag: cell.locked };
    if (cell.name !== null) return { status: "filled" };
    return { status: "empty" };
  }

  private housePublic(): HousePublic | null {
    const house = this.house;
    if (!house) return null; // before the round loop
    // Results reveals the House whatever the visibility mode — docs/01 promises
    // a full board reveal, and the doom clock has finished doing its job.
    if (this.phase === "results" || this.settings.houseBoardVisibility === "full") {
      return {
        mode: "full",
        board: house.board,
        freeCenter: house.freeCenter,
        hits: [...house.hits].sort((a, b) => a - b),
        linesCompleted: house.linesCompleted,
        bestLineNeeds: bestLineNeeds(this.houseMask()),
      };
    }
    if (this.settings.houseBoardVisibility === "progress") {
      return {
        mode: "progress",
        bestLineNeeds: bestLineNeeds(this.houseMask()),
        linesCompleted: house.linesCompleted,
      };
    }
    return { mode: "hidden" };
  }

  private roundPublic(): RoundState | null {
    if (this.roundNumber === 0) return null;
    // Stays non-null through results so the display's called-number board
    // doesn't blank out at the end.
    return {
      number: this.roundNumber,
      drawnNumbers: this.roundDrawnNumbers,
      allDrawn: this.allDrawn,
      topic: this.topic,
      queue: this.queue,
    };
  }

  getPublicState(): PublicRoomState {
    return {
      protocolVersion: PROTOCOL_VERSION,
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.isHost,
        fillDone: p.fillDone,
        resolved: p.resolved,
        board: p.board.map((c) => this.toPublicCell(c)),
        linesCompleted: this.countPlayerLines(p),
        hasWon: this.hasWon(p),
      })),
      house: this.housePublic(),
      round: this.roundPublic(),
      results: this.results,
    };
  }

  // Sends every recipient the correct view: the shared public snapshot to
  // everyone, plus each player's own private board to their socket only.
  // Displays only ever get the public frame — the name-leak invariant is
  // enforced by construction here, not by remembering to check call sites.
  notifyAll(): void {
    const publicFrame = JSON.stringify({
      type: "room.state",
      payload: this.getPublicState(),
    } satisfies ServerMessage);
    for (const p of this.players) {
      if (!p.connected || !p.ws) continue;
      p.ws.send(publicFrame);
      p.ws.send(
        JSON.stringify({
          type: "player.board",
          payload: this.getPrivateBoard(p),
        } satisfies ServerMessage),
      );
    }
    for (const d of this.displays) d.send(publicFrame);
  }
}

function err(code: ErrorCode, message: string): IntentResult {
  return { ok: false, code, message };
}
