import {
  PROTOCOL_VERSION,
  defaultSettings,
  type PublicCell,
  type PublicRoomState,
  type ServerMessage,
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
}

export const MAX_PLAYERS = 12;

const emptyBoard = (): PublicCell[] =>
  Array.from({ length: 25 }, () => ({ status: "empty" as const }));

export class Room {
  readonly code: string;
  players: Player[] = [];
  private displays = new Set<Socket>();
  private settings = defaultSettings();
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
      this.broadcast();
    }, this.graceMs);
    this.broadcast();
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
    this.broadcast();
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

  getPublicState(): PublicRoomState {
    return {
      protocolVersion: PROTOCOL_VERSION,
      code: this.code,
      phase: "lobby",
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.isHost,
        board: emptyBoard(),
        linesCompleted: 0,
        hasWon: false,
      })),
      house: null,
      round: null,
      results: null,
    };
  }

  broadcast(): void {
    const frame = JSON.stringify({
      type: "room.state",
      payload: this.getPublicState(),
    } satisfies ServerMessage);
    for (const p of this.players) {
      if (p.connected && p.ws) p.ws.send(frame);
    }
    for (const d of this.displays) d.send(frame);
  }
}
