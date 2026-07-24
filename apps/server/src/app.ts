import { existsSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import {
  ClientIntentSchema,
  PROTOCOL_VERSION,
  type ErrorCode,
  type ServerMessage,
} from "@yawbg/protocol";
import { DeckStore, type TopicSource } from "./DeckStore";
import { GameLogStore, type GameLogSink } from "./GameLog";
import { openDb } from "./db";
import { MAX_PLAYERS, type Socket } from "./Room";
import { RoomManager } from "./RoomManager";

export interface AppOptions {
  graceMs?: number;
  /** Directory of the built SPA; null skips static routes (tests). */
  clientDist?: string | null;
  /** SQLite file; ":memory:" in tests. Ignored when `decks` is supplied. */
  dbPath?: string;
  /** Directory of deck JSON to seed; null skips seeding. */
  decksDir?: string | null;
  /** Test override — bypasses SQLite entirely. */
  decks?: TopicSource;
  /**
   * Where finished games are recorded. Defaults to the same SQLite file the
   * decks live in; `null` disables logging, and a fake sink lets a test assert
   * the write without a database.
   */
  log?: GameLogSink | null;
  /** Pool-deal reveal window before auto-advancing into the first draw. */
  distributeMs?: number;
  /** Draw-moment window before the floor opens. */
  drawMs?: number;
  /** Test override: how long a `roundTimerSec` second lasts (default 1000ms). */
  roundTimerMsPerSec?: number;
  /** Ping interval; two missed pongs closes the socket. 0 disables (tests). */
  heartbeatMs?: number;
}

type SocketSession =
  | { code: string; playerId: string }
  | { code: string; role: "display" };

const send = (ws: Socket, message: ServerMessage) =>
  ws.send(JSON.stringify(message));

const sendError = (ws: Socket, code: ErrorCode, message: string) =>
  send(ws, { type: "error", payload: { code, message } });

// Native WS ping/pong: browsers answer automatically, so liveness costs no
// protocol surface. Elysia wraps Bun's socket, so the method may sit on either.
function pingSocket(ws: any): void {
  try {
    if (typeof ws.ping === "function") ws.ping();
    else if (typeof ws.raw?.ping === "function") ws.raw.ping();
  } catch {
    /* socket already gone; the close handler will clean up */
  }
}

/**
 * The socket's stable identity, whichever object Elysia hands us.
 *
 * `open`, `message` and `close` receive Elysia's `ElysiaWS` wrapper, which
 * carries `.id`. **`pong` receives Bun's raw `ServerWebSocket`**, which does
 * not — there the same id lives at `.data.id`. Reading `ws.id` in `pong`
 * therefore yielded `undefined`, every `live.get()` missed, `lastPong` never
 * advanced past the connect time, and the heartbeat closed *every* socket after
 * `heartbeatMs * 2.5` regardless of health. Clients reconnected and resumed, so
 * games kept working and it read as ordinary network flakiness for four
 * milestones.
 *
 * Resolving it here rather than in the one broken handler is deliberate: the
 * trap is that the handler signature is not uniform, and nothing about a call
 * site tells you which shape it got.
 */
const socketId = (ws: any): string => ws.id ?? ws.data?.id;

export function createApp(opts: AppOptions = {}) {
  const graceMs = opts.graceMs ?? 120_000;
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const clientDist =
    opts.clientDist === undefined
      ? join(import.meta.dir, "../../client/dist")
      : opts.clientDist;

  let decks: TopicSource;
  let deckList: () => unknown;
  // Undefined means "derive from the database"; explicit null means "don't log".
  let log: GameLogSink | undefined = opts.log ?? undefined;
  if (opts.decks) {
    decks = opts.decks;
    deckList = () => [];
  } else {
    const db = openDb(opts.dbPath ?? process.env.DB_PATH ?? "yawbg.sqlite");
    const store = new DeckStore(db);
    const decksDir =
      opts.decksDir === undefined ? join(import.meta.dir, "../../../decks") : opts.decksDir;
    if (decksDir) store.seedFromDir(decksDir);
    decks = store;
    deckList = () => store.list();
    if (opts.log === undefined) log = new GameLogStore(db);
  }

  const manager = new RoomManager({
    graceMs,
    decks,
    log,
    distributeMs: opts.distributeMs,
    drawMs: opts.drawMs,
    roundTimerMsPerSec: opts.roundTimerMsPerSec,
  });
  const sockets = new Map<string, SocketSession>();

  const app = new Elysia()
    .get("/healthz", () => ({ ok: true }))
    // No auth: the lobby picker needs this. The deck *editor* is OIDC-gated (M5).
    .get("/api/decks", () => deckList());

  if (clientDist && existsSync(clientDist)) {
    const index = () => Bun.file(join(clientDist, "index.html"));
    app
      .get("/", index)
      .get("/index.html", index)
      .get("/room/*", index)
      .get("/display/*", index)
      .get("/assets/*", async ({ params, set }) => {
        const rel = params["*"];
        if (rel.includes("..")) {
          set.status = 404;
          return "not found";
        }
        const file = Bun.file(join(clientDist, "assets", rel));
        if (!(await file.exists())) {
          set.status = 404;
          return "not found";
        }
        return file;
      });
  } else if (clientDist) {
    console.warn(`client dist not found at ${clientDist} - serving /ws and /healthz only`);
  }

  // Without this, a socket that dies without a clean close is never noticed
  // (idleTimeout is an hour), the grace timer never starts, and a silently-dead
  // proposer holds the queue front forever. M6 owns tuning it behind the proxy.
  const live = new Map<string, { ws: any; lastPong: number }>();
  if (heartbeatMs > 0) {
    const timer = setInterval(() => {
      const deadline = Date.now() - heartbeatMs * 2.5;
      for (const entry of live.values()) {
        if (entry.lastPong < deadline) {
          try {
            entry.ws.close();
          } catch {
            /* already gone */
          }
          continue;
        }
        pingSocket(entry.ws);
      }
    }, heartbeatMs);
    timer.unref?.(); // never keep the process alive on our account
  }

  app.ws("/ws", {
    idleTimeout: 3600,
    open(ws: any) {
      live.set(socketId(ws), { ws, lastPong: Date.now() });
    },
    pong(ws: any) {
      const entry = live.get(socketId(ws));
      if (entry) entry.lastPong = Date.now();
    },
    message(ws: any, raw: unknown) {
      let data: unknown = raw;
      if (typeof raw === "string") {
        try {
          data = JSON.parse(raw);
        } catch {
          return void sendError(ws, "BAD_MESSAGE", "frame is not valid JSON");
        }
      }
      const parsed = ClientIntentSchema.safeParse(data);
      if (!parsed.success) {
        return void sendError(ws, "BAD_MESSAGE", "unknown or malformed intent");
      }
      const intent = parsed.data;
      const session = sockets.get(socketId(ws));

      // Displays are read-only spectators: any intent is an error.
      if (session && "role" in session) {
        return void sendError(ws, "BAD_MESSAGE", "display sockets are read-only");
      }

      switch (intent.type) {
        case "room.create":
        case "room.join":
        case "display.join":
        case "session.resume": {
          if (session) {
            return void sendError(ws, "BAD_MESSAGE", "socket already bound to a room");
          }
          if (intent.payload.protocolVersion !== PROTOCOL_VERSION) {
            return void sendError(
              ws,
              "VERSION_MISMATCH",
              `server speaks protocol v${PROTOCOL_VERSION} - reload the page`,
            );
          }
          break;
        }
        default: {
          if (!session) return; // intent from an unbound socket: drop
        }
      }

      switch (intent.type) {
        case "room.create": {
          const room = manager.create();
          const player = room.addPlayer(intent.payload.playerName, ws);
          sockets.set(socketId(ws), { code: room.code, playerId: player.id });
          send(ws, {
            type: "session.created",
            payload: { code: room.code, playerId: player.id, token: player.token },
          });
          room.notifyAll();
          break;
        }
        case "room.join": {
          const room = manager.get(intent.payload.code);
          if (!room) {
            return void sendError(ws, "ROOM_NOT_FOUND", `no room ${intent.payload.code}`);
          }
          if (room.phase !== "lobby") {
            return void sendError(ws, "WRONG_PHASE", "this room has already started");
          }
          if (room.players.length >= MAX_PLAYERS) {
            return void sendError(ws, "ROOM_FULL", `room is full (${MAX_PLAYERS} players)`);
          }
          const player = room.addPlayer(intent.payload.playerName, ws);
          sockets.set(socketId(ws), { code: room.code, playerId: player.id });
          send(ws, {
            type: "session.created",
            payload: { code: room.code, playerId: player.id, token: player.token },
          });
          room.notifyAll();
          break;
        }
        case "display.join": {
          const room = manager.get(intent.payload.code);
          if (!room) {
            return void sendError(ws, "ROOM_NOT_FOUND", `no room ${intent.payload.code}`);
          }
          room.addDisplay(ws);
          sockets.set(socketId(ws), { code: room.code, role: "display" });
          send(ws, { type: "room.state", payload: room.getPublicState() });
          break;
        }
        case "session.resume": {
          const room = manager.get(intent.payload.code);
          if (!room) {
            return void sendError(ws, "ROOM_NOT_FOUND", `no room ${intent.payload.code}`);
          }
          const player = room.resume(intent.payload.playerId, intent.payload.token, ws);
          if (!player) {
            return void sendError(ws, "SESSION_INVALID", "seat gone or token invalid");
          }
          // Drop any earlier socket still mapped to this seat, so its (possibly
          // late) close can't call handleDisconnect on the freshly-resumed player.
          for (const [id, s] of sockets) {
            if (id !== socketId(ws) && "playerId" in s && s.playerId === player.id) {
              sockets.delete(id);
            }
          }
          sockets.set(socketId(ws), { code: room.code, playerId: player.id });
          break; // resume() notifies everyone with the fresh state, including this socket
        }
        case "room.leave": {
          const { code, playerId } = session as { code: string; playerId: string };
          sockets.delete(socketId(ws));
          const room = manager.get(code);
          if (!room) return;
          room.removePlayer(playerId);
          room.notifyAll();
          break;
        }
        case "state.request": {
          const s = session!;
          const room = manager.get(s.code);
          if (!room) return;
          send(ws, { type: "room.state", payload: room.getPublicState() });
          if (!("role" in s)) {
            const player = room.getPlayer(s.playerId);
            if (player) send(ws, { type: "player.board", payload: room.getPrivateBoard(player) });
          }
          break;
        }
        case "lobby.updateSettings":
        case "lobby.start":
        case "fill.writeCell":
        case "fill.clearCell":
        case "fill.writePool":
        case "fill.setDone":
        case "fill.forceStart":
        case "round.propose":
        case "round.confirm":
        case "round.withdraw":
        case "round.pass":
        case "round.cheer":
        case "round.forceAdvance":
        case "results.advance":
        case "game.playAgain": {
          const { code, playerId } = session as { code: string; playerId: string };
          const room = manager.get(code);
          if (!room) return;
          const result = room.handleIntent(playerId, intent);
          if (!result.ok) return void sendError(ws, result.code, result.message);
          room.notifyAll();
          break;
        }
      }
    },
    close(ws: any) {
      const id = socketId(ws);
      live.delete(id);
      const session = sockets.get(id);
      if (!session) return;
      sockets.delete(id);
      const room = manager.get(session.code);
      if (!room) return;
      if ("role" in session) {
        room.removeDisplay(ws);
      } else {
        room.handleDisconnect(session.playerId);
      }
    },
  });

  return app;
}
