import {
  PROTOCOL_VERSION,
  SettingsSchema,
  defaultSettings,
  type ClientIntent,
  type ErrorCode,
  type Phase,
  type PrivateBoard,
  type PrivateCell,
  type PublicCell,
  type PublicRoomState,
  type ServerMessage,
  type Settings,
} from "@yawbg/protocol";

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

export class Room {
  readonly code: string;
  players: Player[] = [];
  phase: Phase = "lobby";
  private settings: Settings = defaultSettings();
  private displays = new Set<Socket>();
  private graceMs: number;
  private onEmpty: () => void;

  constructor(code: string, opts: { graceMs: number; onEmpty: () => void }) {
    this.code = code;
    this.graceMs = opts.graceMs;
    this.onEmpty = opts.onEmpty;
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
    if (this.players.length === 0) {
      for (const d of this.displays) d.close();
      this.displays.clear();
      this.onEmpty();
    }
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
          this.distribute();
        }
        return { ok: true };
      }
      case "fill.forceStart": {
        if (!player.isHost) return err("NOT_HOST", "only the host can force-start");
        if (this.phase !== "board_fill") return err("WRONG_PHASE", "not filling boards");
        for (const p of this.players) {
          if (!p.fillDone) this.autoCompleteFill(p);
        }
        this.distribute();
        return { ok: true };
      }
      default:
        return err("BAD_MESSAGE", `intent not handled here: ${intent.type}`);
    }
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
    }
    this.phase = "board_fill";
  }

  // Round-robin offset: each player's K pool contributions rotate to exactly
  // one other player (offset != 0 mod n), so nobody can receive their own
  // names back, while every player receives exactly K.
  private distribute(): void {
    const K = this.settings.sabotageCells;
    if (K > 0) {
      const n = this.players.length;
      const blocks = this.players.map((p) => shuffled(p.poolSlots.map((name) => name!)));
      const offset = 1 + Math.floor(Math.random() * (n - 1));
      for (let i = 0; i < n; i++) {
        const recipient = this.players[(i + offset) % n]!;
        const names = blocks[i]!;
        const emptyIndices = recipient.board
          .map((c, idx) => (c.name === null ? idx : -1))
          .filter((idx) => idx !== -1);
        for (let j = 0; j < names.length; j++) {
          recipient.board[emptyIndices[j]!] = { name: names[j]!, fromPool: true, locked: null };
        }
      }
    }
    this.phase = "distribute";
  }

  getPrivateBoard(player: Player): PrivateBoard {
    return { cells: player.board, poolSlots: player.poolSlots };
  }

  private toPublicCell(cell: PrivateCell): PublicCell {
    if (cell.locked) return { status: "locked", name: cell.name!, tag: cell.locked };
    if (cell.name !== null) return { status: "filled" };
    return { status: "empty" };
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
        board: p.board.map((c) => this.toPublicCell(c)),
        linesCompleted: 0,
        hasWon: false,
      })),
      house: null,
      round: null,
      results: null,
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
