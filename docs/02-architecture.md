# 02 — Architecture

## Summary

Same proven skeleton as the group's *ito* web adaptation — fully
server-authoritative, thin-client renderers, single origin — plus three upgrades:
a shared protocol package (fixes the hand-duplicated-types wart), a read-only
**display** client role, and a strict public/private state split (hidden boards
are the drama here, not just a mechanic).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime / server | **Bun + Elysia**, single process, TypeScript | One WebSocket endpoint `/ws` for all gameplay; REST only for out-of-band (decks, admin, OIDC) |
| Client | **Svelte 5 (runes) + Vite + Tailwind v4**, PWA | Installs to phone home screens; player routes + display route in one SPA |
| Protocol | **`packages/protocol`** — zod schemas, inferred TS types | Single source of truth for every message and state shape |
| Persistence | **bun:sqlite** | Persistent things only: topic decks, users (admin), game logs. Live game state is memory-only |
| Deployment | Multi-stage **Dockerfile**, single origin | Bun server serves the built SPA + API + WS. Deployed on an org server |

## Monorepo layout (Bun workspaces)

```
yawbg/
├── apps/
│   ├── server/          Elysia app, RoomManager, Room state machine, sqlite
│   └── client/          Svelte SPA: /            join & lobby
│                                    /room/:code   player view
│                                    /display/:code big-screen view
├── packages/
│   └── protocol/        zod schemas + z.infer types for intents, broadcasts,
│                        state shapes, settings; PROTOCOL_VERSION const
├── decks/               seed deck JSON files (imported into sqlite)
└── docs/
```

Rule from day one: **no type describing a wire message or shared state may be
declared outside `packages/protocol`.** Server validates every inbound message at
the boundary with `IntentSchema.safeParse`; the client imports the same types.

## Server model

### RoomManager & Room

- `RoomManager`: in-memory `Map<code, Room>`; 4-letter room codes; creates,
  looks up, garbage-collects idle rooms.
- `Room`: the single authoritative state machine — players, boards, pool, deck
  pile, House board, draw history, proposal queue, phase. All game logic lives
  here. Clients only send **intents**; they never compute outcomes locally.
- Live state is memory-only. A server restart drops in-progress games — accepted
  trade-off, kept everything simple in *ito* and stays acceptable at
  friends/org scale.
- Completed games write a **game log** row to SQLite (settings, players, full
  round history, final boards) — powers the results reveal, future replays, and
  the share feature's provenance.

### Public / private state split

Two broadcast shapes, strictly separated:

- **`PublicRoomState`** — sent to every socket in the room (players + displays)
  on any change. Contains: phase, settings, players (name, connected,
  resolved-this-round, board as a 5×5 grid of *statuses* only — `empty | filled
  | locked` — with locked cells including their now-public name + tag), House
  board per `houseBoardVisibility`, current draw & topic, proposal queue,
  round history summary.
- **`PrivateBoard`** — sent only to the owning player's socket. Full cell
  contents including unlocked names and a `fromPool` flag (pool authors stay
  hidden until results).

Names on unlocked cells never leave the owner's socket — leaks are prevented by
construction, same principle as *ito*'s server-side hands.

The full public state is small (a few KB), so every update is a full snapshot —
no diffing, no client-side merge bugs. Re-render on `ROOM_STATE`, done.

### Display role

A display is a **read-only spectator socket**, not an owner and not a seat:

- Joins via `/display/:code`; receives `PublicRoomState` only; sends no intents
  (server rejects any).
- Zero displays or multiple displays both work; a sleeping display affects
  nothing and resyncs on reconnect like any client.
- Room creation and host controls always live on a *player* device. This is the
  deliberate anti-Jackbox choice: the big screen is a projector, not a console.

### Reconnection (the over-engineered part, on purpose)

Mobile browsers kill sockets constantly. Stolen from *ito* verbatim:

- On join, the server issues a per-player random **session token**, deliberately
  not tied to the WS connection id.
- Client stores `{ code, playerId, token }` in **sessionStorage** (per-tab —
  keeps multi-tab local testing trivial).
- On disconnect: player marked disconnected, **120 s grace timer** before
  removal. Reconnect within the window with the token reclaims the seat and
  gets a full resync (`PublicRoomState` + own `PrivateBoard`).
- Removal consequences are game-phase-aware (auto-PASS, auto-withdraw pending
  proposal, freeze board) — see design doc edge cases.

### Connection/session bookkeeping

`Map<wsId, { roomCode, playerId | 'display' }>` at module level, same as *ito*.
Heartbeat ping/pong to detect dead sockets faster than TCP timeouts.

## Client model

- Thin renderer: hold latest `PublicRoomState` + own `PrivateBoard` in runes
  state; every screen is a pure function of those two objects + local UI state.
- Route split: player view is board-first (phones), display view is
  House-board-and-proposal-first (landscape big screen). Both are just layouts
  over the same public state.
- Board share: results screen renders the tagged board to `<canvas>` → PNG →
  `navigator.share()` with download fallback. Client-side only.
- PWA manifest + service worker for home-screen install; no offline gameplay
  (it's a realtime game), just shell caching.

## REST surface (out-of-band only)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/decks` | none | List decks for lobby deck picker |
| `CRUD /api/admin/decks*` | OIDC | Deck editor |
| `GET /api/admin/logs*` | OIDC | Browse game logs |
| `GET /healthz` | none | Deploy checks |

Game rooms are joinable by code **without accounts** — friends shouldn't need to
sign in to play bingo. OIDC (org IdP) protects only the admin/deck-editor
routes, reusing the optional OIDC piece from *ito*.

## Deployment

*(Concrete ship recipe — compose layout, Caddy vhosts, TLS modes, deploy
flow — lives in `08-deployment.md`.)*

- Multi-stage Dockerfile: build client → build server → slim Bun runtime image
  serving SPA static files, `/api`, and `/ws` from one origin (no CORS, one TLS
  cert, WS same-origin).
- Org server behind the org's reverse proxy; ensure proxy WS upgrade + idle
  timeout ≥ heartbeat interval.
- SQLite file on a mounted volume; that's the entire persistence story.
- Single process is plenty: a room's traffic is a dozen tiny messages per round.
  If it ever needs to scale, rooms shard trivially by code — but don't build that.

## Explicit non-goals (v1)

- No accounts for players, no matchmaking, no public room list.
- No in-app voting/judging — the table judges (possible future remote-play mode).
  **The M5.5 cheer mechanic is not a breach of this** and was flagged rather than
  assumed: a cheer gates no lock, enters no score, and is invisible while any
  decision is live. That last clause is what keeps it applause instead of a
  verdict — a live tally would re-open this wall. See `10-highlight-reel.md`.
- No server-side image rendering.
- No horizontal scaling, no Redis, no message queue.
- No persistence of live games across restarts.
