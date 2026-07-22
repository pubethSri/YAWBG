# YAWBG

**Y**et **A**nother **W**eb **B**oard **G**ame — or, if you're feeling generous,
**Y**ours **A**wesome **W**eb **B**in**G**o.

Reverse-trivia bingo for 2–12 friends in the same room, each on their own phone,
optionally with a big shared screen. Players fill a 5×5 board with **names of
specific individuals** (fictional or real), then race a system-controlled
**House** board — the doomsday clock. Every draw pairs a number with a **Topic**
(*"An assassin"*, *"A millionaire"*); players lock in names that fit, arguing
their case to the table out loud. When the House bingos, everyone who completed
a line wins.

The app is the board, the randomizer, and the record-keeper — **never the
judge**. The arguments stay human.

## Status

**Playable end to end.** M0 (skeleton), M1 (lobby & board fill) and M2 (core
round loop) are shipped: a room of phones can go from a 4-letter code to a
results screen, arguing the whole way. Next up is M3 — the display "Stage" and
the drama pass. Design artifacts live in `docs/` — start at
[`docs/INDEX.md`](docs/INDEX.md); milestone status is in
[`docs/04-roadmap.md`](docs/04-roadmap.md).

## Stack

Bun workspaces monorepo: **Elysia** server (single process, WebSocket,
server-authoritative room state machine) · **Svelte 5** (runes) + **Tailwind
v4** client · shared **`packages/protocol`** zod package as the single source of
truth for every wire type · **bun:sqlite** for decks (live game state is
memory-only by design) · single-origin Docker deploy. Details in
[`docs/02-architecture.md`](docs/02-architecture.md).

## Quick start

Requires [Bun](https://bun.sh).

```bash
bun install
bun run build       # build the client SPA
bun run dev:server  # single origin on :3000
```

Open `http://localhost:3000/` on each phone (same Wi-Fi — use the PC's LAN IP),
or `http://localhost:3000/display/CODE` for a read-only big screen.

| Command | Does |
|---|---|
| `bun test` | Protocol round-trip, bingo lines, WS integration + full round loop |
| `bun run check` | `tsc --noEmit` (server+protocol) and `svelte-check` (client) |
| `bun run dev:client` | Vite dev server on :5173, proxying `/ws` to :3000 |

## Repository layout

| Path | Purpose |
|---|---|
| [`docs/`](docs/INDEX.md) | Design artifacts — rules, architecture, protocol, roadmap, UX, design system |
| `apps/server/` | Elysia app: `RoomManager`, the `Room` state machine, deck store |
| `apps/client/` | Svelte 5 SPA: phase-renderer screens for player and display |
| `packages/protocol/` | Zod schemas — every wire type, and nothing outside here |
| [`decks/`](decks/) | Seed topic-deck JSON, upserted into SQLite on boot |

## Credits

The gameplay is adapted from the name-bingo party game played on the
[RUBSARB production](https://www.youtube.com/@RUBSARBproduction) YouTube
channel — their videos are the direct inspiration for this project.

## Origin

Second web adaptation by the same group that built a web version of *ito*
(Bun + Elysia + Svelte 5, fully server-authoritative). YAWBG reuses that proven
skeleton — room codes, reconnect tokens, thin-client renderers — and adds a
shared protocol package, a spectator display role, and a public/private state
split suited to a game where hidden boards are the drama.
