# Handoff: YAWBG — implement M1 (Lobby & board fill)

**Repo:** `C:\YAWBG` (github.com/pubethSri/YAWBG, branch `main`).
**Prev milestone:** M0 shipped and committed — Bun workspaces monorepo, protocol
package, Elysia WS server with rooms/session/reconnect, unstyled Svelte 5 SPA
rendering raw `PublicRoomState` JSON. The M0 exit test passes (multi-tab join +
60 s disconnect/resume). **Your job:** build **M1** from `docs/04-roadmap.md`.

## Authoritative specs for M1

Route through `docs/INDEX.md`, but the load-bearing ones here are:

- `docs/04-roadmap.md` — M1 scope + exit test (3 players fill boards with
  `K = 5` `middleRow`; nobody receives their own pool names; boards look right on
  phones).
- `docs/01-game-design.md` — lobby settings table (defaults already encoded in
  `packages/protocol/src/settings.ts`), the pool/sabotage mechanic, board-fill
  rules (`25 − K` own cells + `K` pool names; `middleRow` ⇒ K must be 5).
- `docs/06-key-screens.md` — **the** spec for the board editor: dump mode (rapid
  entry, own-board/pool toggle) + arrange mode (drag-to-swap, tap-tap fallback
  with select/scale affordance), ready freeze/un-ready semantics, pool slots.
- `docs/03-protocol.md` — the intents/messages you'll add (board fill + lobby
  sections already written there; turn them into zod schemas).
- `docs/07-design-system.md` — **M1 is the first styled milestone.** Follow the
  design system (light-only v1). Tailwind v4 is already wired via
  `@tailwindcss/vite`; `apps/client/src/app.css` is just `@import "tailwindcss";`
  with zero utilities so far — start styling immediately.

## What M1 must add (from the roadmap)

- **Lobby:** host settings UI + `SettingsSchema` validation on
  `lobby.updateSettings`; live player list; `lobby.start` gating (≥ 2 connected).
- **Private board editor** per `06-key-screens.md` (dump + arrange modes; ready
  freeze/un-ready; pool slots when `K > 0`).
- **Public/private split goes live:** other players' boards render as status
  grids (`empty | filled | locked`); the owner's own names travel only on their
  socket via a new `player.board` (`PrivateBoard`) message.
- **`distribute`:** round-robin offset so no player receives their own pool
  contribution; every player receives exactly `K`; `fromPool` flags set.

**Exit test:** 3 players fill boards with `K = 5` `middleRow`; nobody receives
own pool names; boards look right on phones.

## Where the M0 code stands (facts you need, not in the docs)

- **Monorepo & commands** are in the updated `CLAUDE.md` (`bun test`,
  `bun run check`, `bun run dev:server`, `bun run dev:client`, `bun run build`).
- **Protocol package (`packages/protocol/src/`)** is intentionally scoped to M0
  today: `settings.ts` has the full `SettingsSchema` + `defaultSettings()`;
  `state.ts` has the full `PublicRoomState`/`PublicCell`/`PublicPlayer`/`House`/
  `Round` shapes; `intents.ts`/`messages.ts` only carry the **session** surface.
  M1 adds: `lobby.updateSettings` / `lobby.start`, `fill.writeCell` /
  `fill.clearCell` / `fill.writePool` / `fill.setDone` / `fill.forceStart`, the
  `player.board` server message, and the `PrivateBoard`/`PrivateCell` schemas
  (documented in `03-protocol.md`, not yet coded). Everything crossing the wire
  goes here — nowhere else.
- **Server (`apps/server/src/`)** — `Room.getPublicState()` currently
  **hardcodes `phase: "lobby"`, empty 25-cell boards, `house: null`,
  `round: null`.** M1 makes phase and boards real. Two seams to build well
  (flagged in the M0 review as the main altitude debt — fix them now rather than
  bolting onto them):
  1. **Per-recipient broadcast.** `Room.broadcast()` sends one shared public
     frame to everyone. M1 needs each player to also get their own `player.board`
     (`PrivateBoard`). Build a single "notify each recipient the correct view"
     method (public snapshot for all + private board per owner; displays stay
     public-only) so the name-leak invariant is enforced by construction.
  2. **Intent handling seam.** Gameplay routing lives in one big `switch` in
     `app.ts` that pokes `Room` internals directly. M1 adds ~7 intents needing
     host-check + phase-check + validation + error reply. Consider a
     `room.handleIntent(playerId, intent)` returning `{ ok } | { error }` so
     `app.ts` stays a thin transport/session router and `Room` owns invariants.
- **Client (`apps/client/src/`)** — routes render `<pre>{JSON.stringify(...)}</pre>`.
  M1 replaces these with real lobby + board-editor UI per `05/06/07`. The runes
  socket store (`lib/socket.svelte.ts`) already handles connect/resume/retry and
  validates inbound frames with `ServerMessageSchema`; add a `privateBoard`
  `$state` fed by the new `player.board` message.
- **Tests:** `apps/server/test/ws.test.ts` uses a `TestClient` WebSocket helper
  and `createApp({ graceMs: 300, clientDist: null }).listen(0)`. Note the
  deliberate **no `afterAll(app.stop())`** — Elysia's `stop()` blocks on lingering
  sockets under `bun test` on Windows; the server dies with the process. Keep
  `graceMs` injectable so tests never wait real seconds.

## Deferred M0 review items — decide during M1

- **WS heartbeat.** There's no ping/pong; `idleTimeout` is 3600 s, so a socket
  dropped *without* a clean close isn't noticed for up to an hour (the grace
  timer never starts). The M0 exit test dodges this via clean screen-lock
  closes. `docs/04-roadmap.md` defers "heartbeat tuning" to M6, but basic
  ping/pong is arguably worth adding once real gameplay depends on liveness.
- **`room.join` lobby-only gate.** Not enforced today; harmless in M0 because
  phase is hardcoded `lobby`. **This becomes a real bug the moment M1 introduces
  phase state** — add the `WRONG_PHASE` gate when you build the phase machine.
- Minor: the client's `Session` interface duplicates the `session.created`
  payload shape — could be inferred from the protocol schema instead.

## Working style & conventions (carried from prior sessions)

- Discuss/propose before building; the user decides quickly and settled
  decisions stay settled (fonts, light-only theme, UX in 05–07 are locked).
- **Commit and push only when asked.** Commit style: imperative subject + bullet
  body; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Testing split (user preference):** Claude runs all scriptable tests
  (`bun test`, WS integration, docker) and debugs in the built-in browser; the
  **user runs visual web tests personally** from written numbered steps — end
  each UI-affecting milestone with a manual-test-steps section.
- Thai text support is required (fonts chosen in `07-design-system.md`); the
  board editor will hold real names including Thai.
- Keep the roadmap's deferred lists and the v1 non-goals (`02-architecture.md`)
  as scope walls — flag before designing against them.

## Suggested skills

- `karpathy-guidelines` before coding (M1 is bigger than M0; resist gold-plating
  the editor beyond `06-key-screens.md`).
- `run` to launch the dev server and smoke-test the lobby/editor flow.
- `verify` before committing — drive a real 3-player fill + distribute.
- `code-review` at the end (the M0 pass caught 6 real bugs; worth repeating).

## Definition of done

The M1 exit test, minus real phones: 3 browser tabs fill boards with `K = 5`
`middleRow`; after `distribute`, no player holds their own pool name and each
holds exactly 5 pool names; the styled board editor (dump + arrange, ready
semantics) works on a phone viewport; other players show as status grids;
`bun test` + `bun run check` green.
