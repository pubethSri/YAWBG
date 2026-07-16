# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: implementation started — M0 and M1 shipped

The design phase is complete (`docs/` holds the artifacts). **M0 — the skeleton
milestone** and **M1 — lobby & board fill** are both built and their exit tests
pass. The repo is now a Bun workspaces monorepo alongside the design docs. Next
up is **M2 — Core round loop** (see `docs/04-roadmap.md`). Build milestone by
milestone; don't design or build against the roadmap's deferred lists without
flagging it.

M1 notes for future sessions: the `distribute` phase is the resting state
until M2 builds the draw engine — there's no `draw` phase to auto-advance into
yet, so the client's pool-deal reveal screen doesn't time out or navigate away
on its own. Pool distribution uses a round-robin *offset*: each player's whole
K-name block rotates to exactly one other player (per `docs/01-game-design.md`'s
"round-robin offset" wording), not a full cross-player shuffle of individual
names. The board editor implements tap-tap-to-swap (arrange mode's documented
accessible path) but not pointer-drag-to-swap; revisit if playtesting shows
tap-tap alone feels wrong on a real phone.

The stack is Bun workspaces + Elysia server + Svelte 5 (runes) + Tailwind v4
client + a shared `packages/protocol` zod package (see `docs/02-architecture.md`).

Commands (run from the repo root; requires Bun):

| Command | Does |
|---|---|
| `bun install` | Install all workspaces (single root `bun.lock`) |
| `bun test` | Protocol round-trip + server WS integration tests |
| `bun run check` | `tsc --noEmit` (server+protocol) and `svelte-check` (client) |
| `bun run dev:server` | Elysia server on :3000 (serves `apps/client/dist` + `/ws` + `/healthz`) |
| `bun run dev:client` | Vite dev server on :5173 (proxies `/ws` to :3000) |
| `bun run build` | Build the client SPA into `apps/client/dist` |

`docker build -t yawbg .` builds the multi-stage image; `deploy/compose.yml` and
`.github/workflows/deploy.yml` exist but the org-VM cutover is a separate
coordinated session (see `docs/08-deployment.md`). No wire type may be declared
outside `packages/protocol` — zod schemas are the single source of truth.

## What the game is (read `docs/01-game-design.md` for full rules)

Reverse-trivia bingo for 2–12 friends in the same room, each on their own phone,
optionally with a big read-only display. Players fill a 5×5 board with **names of
specific individuals**; the system draws numbers for a system-owned **House**
board (the doomsday clock) and pairs each round with a **Topic** ("An assassin",
"A millionaire"). Players propose one name per round that fits the topic, argue
it out loud, and lock it permanently. When the House bingos, everyone with enough
completed lines wins. The app is the board/randomizer/record-keeper — **never the
judge**; disputes are resolved socially at the table.

## Design pillars that constrain every artifact

These recur across all docs and should shape any new design work:

- **Server-authoritative, thin clients.** Clients send intents, render snapshots.
  All game logic lives in a server-side `Room` state machine.
- **Public/private state split.** Unlocked board names never leave the owner's
  socket. Hidden boards are the drama. Locked cells (name + topic tag) become public.
- **Full-snapshot broadcasts, no diffs.** `PublicRoomState` is a few KB; every
  change resends it all. Don't optimize this.
- **No wire type outside `packages/protocol`.** Zod schemas are the single source
  of truth (this fixes a known wart from the group's previous project).
- **Display is a projector, not a console** (anti-Jackbox): read-only spectator
  socket; room creation and host controls live on a player's phone.
- **No accounts for players** — join by 4-letter room code. OIDC guards only
  admin/deck-editor routes.
- **Mobile-first player view, landscape display view**, both layouts over the
  same public state. PWA install, reconnect-tolerant (session token + 120s grace).
- **Locks are permanent and tagged** `{ topic, round, number }` — the final board
  is self-documenting and screenshot-worthy (share-to-PNG is a core feature).

## Repository layout

| Path | Purpose |
|---|---|
| `docs/INDEX.md` | Artifact index — the entry point that points to every design doc |
| `docs/01-game-design.md` | Rules, phase machine, lobby options, lock semantics, edge cases |
| `docs/02-architecture.md` | Stack, server model, monorepo layout, deployment |
| `docs/03-protocol.md` | Every intent/broadcast message and state shape (blueprint for the zod package) |
| `docs/04-roadmap.md` | Milestones M0–M6, each ending playable-ish |
| `docs/05-ux-flow.md` | Routes, screen inventory (player + display), locked flow decisions |
| `docs/06-key-screens.md` | The two hard screens: board editor & open floor interaction design |
| `docs/07-design-system.md` | Visual language: colors, three-voice typography (EN+TH), shape, components |
| `docs/08-deployment.md` | Ship recipe: shared VM + Caddy vhosts, TLS modes, compose, deploy flow |
| `decks/general.example.json` | Sample topic deck schema (seed decks live in `decks/`) |

## Reference implementation: *ito* at `C:\ito`

The group's previous project (*ito*) is checked out at `C:\ito`, **outside this
repo** — it is a reference to port from, never code to import. Reusable
subsystems: WS session/reconnect handling, `RoomManager`/room lifecycle, the
client socket store, multi-stage Dockerfile, and the self-hosted-runner deploy
workflow. Every ported file changes at its boundaries: ito hand-duplicates
wire types between server and client, which is exactly the wart
`packages/protocol` exists to fix. Its git history is available for
archaeology (`git -C C:\ito log`).

## Conventions for new design artifacts

- New design docs go in `docs/` with the numbered-prefix naming (`08-…`, `09-…`)
  and get a row in the `docs/INDEX.md` artifact table.
- Keep artifacts consistent with the phase machine (`lobby → board_fill →
  distribute → draw/open_floor loop → last_call → results`) and the settings
  table in `01-game-design.md`; if a new design idea changes rules or protocol,
  update those docs rather than letting artifacts drift apart.
- The v1 non-goals in `02-architecture.md` (no in-app voting, no player accounts,
  no scaling infra, no server-side image rendering) and the "deliberately
  deferred" list in `04-roadmap.md` are intentional scope walls — don't design
  against them without flagging it.
- The project name is **YAWBG** ("Yet Another Web Board Game" / "Yours Awesome
  Web BinGo"); slug `yawbg`.
