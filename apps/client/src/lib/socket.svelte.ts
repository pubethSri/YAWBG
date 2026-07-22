import {
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ClientIntent,
  type PrivateBoard,
  type PublicRoomState,
  type Settings,
} from "@yawbg/protocol";

const SESSION_KEY = "yawbg_session";
const RETRY_MS = 2000;

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

class GameSocket {
  status = $state<"idle" | "connecting" | "open" | "closed">("idle");
  roomState = $state<PublicRoomState | null>(null);
  privateBoard = $state<PrivateBoard | null>(null);
  lastError = $state<{ code: string; message: string } | null>(null);
  session = $state<Session | null>(loadSession());

  private ws: WebSocket | null = null;
  private displayCode: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private resuming = false;

  connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.status = "connecting";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.status = "open";
      // Reclaim whatever context this tab had (the phone-lock resume path).
      if (this.displayCode) {
        this.send({
          type: "display.join",
          payload: { code: this.displayCode, protocolVersion: PROTOCOL_VERSION },
        });
      } else if (this.session) {
        this.resuming = true;
        this.send({
          type: "session.resume",
          payload: { ...this.session, protocolVersion: PROTOCOL_VERSION },
        });
      }
    };
    ws.onmessage = (e) => this.handle(String(e.data));
    ws.onclose = () => {
      this.status = "closed";
      this.ws = null;
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.status !== "open") this.connect();
    }, RETRY_MS);
  }

  private handle(data: string): void {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = ServerMessageSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("dropping malformed server frame", parsed.error.issues);
      return;
    }
    const msg = parsed.data;
    switch (msg.type) {
      case "session.created":
        this.session = msg.payload;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(msg.payload));
        break;
      case "room.state":
        this.roomState = msg.payload;
        this.resuming = false;
        break;
      case "player.board":
        this.privateBoard = msg.payload;
        break;
      case "error":
        this.lastError = msg.payload;
        if (msg.payload.code === "VERSION_MISMATCH") {
          // Stale tab after a deploy: the server won't speak our version, so the
          // only recovery is to reload and pull the new client assets.
          this.clearSession();
          location.reload();
        } else if (
          msg.payload.code === "SESSION_INVALID" ||
          // Only a failed *resume* means the seat is gone. A ROOM_NOT_FOUND from a
          // mistyped manual join must not wipe an unrelated, still-valid session.
          (msg.payload.code === "ROOM_NOT_FOUND" && this.resuming)
        ) {
          this.clearSession();
        }
        this.resuming = false;
        break;
    }
  }

  send(intent: ClientIntent): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
      return true;
    }
    return false;
  }

  createRoom(playerName: string): void {
    this.send({ type: "room.create", payload: { playerName, protocolVersion: PROTOCOL_VERSION } });
  }

  joinRoom(code: string, playerName: string): void {
    this.send({
      type: "room.join",
      payload: { code: code.toUpperCase(), playerName, protocolVersion: PROTOCOL_VERSION },
    });
  }

  joinDisplay(code: string): void {
    this.displayCode = code.toUpperCase();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: "display.join",
        payload: { code: this.displayCode, protocolVersion: PROTOCOL_VERSION },
      });
    } else {
      this.connect();
    }
  }

  updateSettings(settings: Partial<Settings>): void {
    this.send({ type: "lobby.updateSettings", payload: { settings } });
  }

  startGame(): void {
    this.send({ type: "lobby.start", payload: {} });
  }

  writeCell(cellIndex: number, name: string): void {
    this.send({ type: "fill.writeCell", payload: { cellIndex, name } });
  }

  clearCell(cellIndex: number): void {
    this.send({ type: "fill.clearCell", payload: { cellIndex } });
  }

  writePool(slot: number, name: string): void {
    this.send({ type: "fill.writePool", payload: { slot, name } });
  }

  setDone(done: boolean): void {
    this.send({ type: "fill.setDone", payload: { done } });
  }

  forceStart(): void {
    this.send({ type: "fill.forceStart", payload: {} });
  }

  propose(cellIndex: number): void {
    this.send({ type: "round.propose", payload: { cellIndex } });
  }

  confirmLock(): void {
    this.send({ type: "round.confirm", payload: {} });
  }

  withdraw(): void {
    this.send({ type: "round.withdraw", payload: {} });
  }

  pass(): void {
    this.send({ type: "round.pass", payload: {} });
  }

  forceAdvance(): void {
    this.send({ type: "round.forceAdvance", payload: {} });
  }

  leave(): void {
    // Only forget the seat if the server actually heard us; otherwise keep the
    // session so grace + resume can still reclaim or clean up the seat rather
    // than stranding it as a ghost against the player cap.
    if (this.send({ type: "room.leave", payload: {} })) {
      this.clearSession();
    }
  }

  private clearSession(): void {
    this.session = null;
    this.roomState = null;
    this.privateBoard = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export const socket = new GameSocket();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && socket.status !== "open") {
    socket.connect();
  }
});
