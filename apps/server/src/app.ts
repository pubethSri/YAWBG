import { existsSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import {
  ClientIntentSchema,
  PROTOCOL_VERSION,
  type ErrorCode,
  type ServerMessage,
} from "@yawbg/protocol";
import { MAX_PLAYERS, type Socket } from "./Room";
import { RoomManager } from "./RoomManager";

export interface AppOptions {
  graceMs?: number;
  /** Directory of the built SPA; null skips static routes (tests). */
  clientDist?: string | null;
}

type SocketSession =
  | { code: string; playerId: string }
  | { code: string; role: "display" };

const send = (ws: Socket, message: ServerMessage) =>
  ws.send(JSON.stringify(message));

const sendError = (ws: Socket, code: ErrorCode, message: string) =>
  send(ws, { type: "error", payload: { code, message } });

export function createApp(opts: AppOptions = {}) {
  const graceMs = opts.graceMs ?? 120_000;
  const clientDist =
    opts.clientDist === undefined
      ? join(import.meta.dir, "../../client/dist")
      : opts.clientDist;

  const manager = new RoomManager(graceMs);
  const sockets = new Map<string, SocketSession>();

  const app = new Elysia().get("/healthz", () => ({ ok: true }));

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

  app.ws("/ws", {
    idleTimeout: 3600,
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
      const session = sockets.get(ws.id);

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
          sockets.set(ws.id, { code: room.code, playerId: player.id });
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
          sockets.set(ws.id, { code: room.code, playerId: player.id });
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
          sockets.set(ws.id, { code: room.code, role: "display" });
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
            if (id !== ws.id && "playerId" in s && s.playerId === player.id) {
              sockets.delete(id);
            }
          }
          sockets.set(ws.id, { code: room.code, playerId: player.id });
          break; // resume() notifies everyone with the fresh state, including this socket
        }
        case "room.leave": {
          const { code, playerId } = session as { code: string; playerId: string };
          sockets.delete(ws.id);
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
        case "fill.forceStart": {
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
      const session = sockets.get(ws.id);
      if (!session) return;
      sockets.delete(ws.id);
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
