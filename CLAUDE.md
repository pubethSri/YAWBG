# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: implementation started — M0 through M3 shipped

The design phase is complete (`docs/` holds the artifacts). **M0 — skeleton**,
**M1 — lobby & board fill**, **M2 — core round loop** and **M3 — display &
drama** are built; the game is playable start to results on phones, with a
styled read-only display. The repo is a Bun workspaces monorepo alongside the
design docs. Next up is **M4 — Results, reveal & share** (see
`docs/04-roadmap.md`). Build milestone by milestone; don't design or build
against the roadmap's deferred lists without flagging it.

The post-M2 order is **M3 display → M4 results → M5 polish & responsive → M6
deploy & playtest → M7 decks & admin → M8 hardening**: polish and deployment
were moved ahead of decks/admin so friends can playtest a real build while
local work continues. The display ships *styled* in M3 (legibility across a
room is what its exit test measures); M5 owns cross-surface cohesion, motion
timing and the player-view responsive pass.

M1 notes that still hold: pool distribution uses a round-robin *offset* — each
player's whole K-name block rotates to exactly one other player, not a full
cross-player shuffle of individual names. The board editor implements
tap-tap-to-swap (arrange mode's documented accessible path) but not
pointer-drag-to-swap; revisit if playtesting shows tap-tap alone feels wrong on
a real phone.

M2 notes for future sessions:

- **The server owns both phase timers.** `distribute` auto-advances after
  `distributeMs` (4 s) and is skipped entirely when K = 0; `draw` dwells for
  `drawMs` (2.5 s) then opens the floor. Both are injectable through
  `createApp` like `graceMs`, so tests never sleep. Proposals are correctly
  rejected during the `draw` window — the table sees the topic first.
- **A disconnected player blocks round auto-advance.** `docs/01`'s edge-case
  table beat `docs/03`'s "every *connected* player" wording, and `03` has been
  corrected. This is what makes host force-advance meaningful.
- **`Player.authors[]` is server-only** and is the *only* record of who wrote
  each pool name — it must never move onto `PrivateCell`, which ships to the
  owner every snapshot while authorship stays hidden until results.
- `results` already carries the full `ResultsPayload` (winners, boards with
  `authorId`, `roundHistory`) with `revealStage` parked at `0`. M4 adds the
  host-paced sequence over it with **no protocol change**.
- `PROTOCOL_VERSION` is now **2**; `packages/protocol/test/protocol.test.ts`
  asserts the literal on purpose, so bumping it fails that test by design.
- SQLite (`bun:sqlite`) holds decks only; live game state stays memory-only and
  a restart dropping in-progress games is accepted. Tests inject a fake
  `TopicSource` (`apps/server/test/TestClient.ts`) so they never open a DB.

M3 notes for future sessions:

- **M3 changed no wire types.** `PROTOCOL_VERSION` is still **2**. The Stage,
  the House-hit flash and the draw moment are all derived from consecutive
  `room.state` snapshots, per `docs/03` — there is deliberately no event channel.
- **`roundTimerSec` has its own timer slot** (`roundTimer`), *not* the shared
  `phaseTimer`: it runs during the open floor while `phaseTimer` is idle, and
  sharing would let one cancel the other. It fires `advanceRound()` — literally
  the force-advance path — and also arms during `last_call`. Scale it in tests
  with `createApp({ roundTimerMsPerSec: 1 })` so a "60 s" timer takes 60 ms.
- **No countdown deadline is on the wire.** Clients count down locally from
  when they see the floor open (`lib/countdown.svelte.ts` explains the
  trade-off). A mid-round reconnect shows a generous countdown; the server is
  the only thing that actually ends a round.
- **Anything derived from a snapshot must be keyed, not re-run.** Every
  `room.state` frame replaces the whole object, so *any* `$effect` reading
  `roomState` re-runs on every broadcast — a propose, a pass, a reconnect. The
  countdown arms on a round key for this reason (re-arming per frame pushed the
  deadline forward all round and it never reached zero), and `RoundScreen`
  closes its action sheets on a round-number change for the mirror-image reason:
  a sheet opened in round N would otherwise confirm against round N+1.
- **The display type ramp lives in `app.css` as `--text-d-*`**, each a
  `clamp(floor, vw-at-1920, spec)`. On the 1920px design target every token
  resolves to exactly `docs/07`'s display column; a smaller screen scales the
  whole ramp down rather than overflowing. The display never scrolls — layouts
  are `h-dvh` + `overflow-hidden`, and the called-number row is height-capped so
  a long game clips its oldest numbers instead of squeezing the stage.
- **`hidden` House visibility no longer gates the House sheet shut.** The chip
  opens in all three modes because the sheet also carries the called-number
  history, which is public regardless — the display shows it in every mode, and
  no public fact may live only on the TV (`docs/05`).
- QR is `qrcode-generator` (~15 KB gzipped, zero deps), rendered as inline SVG
  by `lib/display/QrCode.svelte`; ink-on-white, with the spec's quiet zone.
- **`Starburst` is a square SVG at a caller-given `size`, with its label drawn
  as SVG text.** Both parts are load-bearing: an earlier version sized itself to
  its HTML text box, so a 1-digit draw made a tiny sticker and a 2-digit one
  overflowed the star's points. SVG text scales with the viewBox, so the label
  always lands inside the inner radius — including 3-digit numbers at
  `numberPoolSize: 100`. Sizes constrain **both** axes (`min(30vh, 22vw)` on the
  display): a vh-only rule collapses on a landscape tablet, a vw-only rule on a
  portrait phone.
- Motion helpers are global classes in `app.css` (`.anim-slam`, `.anim-pop`,
  `.anim-rise`, `.fill-transition`). Every keyframe set **ends on the resting
  state**, so the `prefers-reduced-motion` collapse lands on an identical final
  state. Colour fills transition (the named moments ask for it); nothing that
  reflows the board grid is ever animated.

The stack is Bun workspaces + Elysia server + Svelte 5 (runes) + Tailwind v4
client + a shared `packages/protocol` zod package (see `docs/02-architecture.md`).

Commands (run from the repo root; requires Bun):

| Command | Does |
|---|---|
| `bun install` | Install all workspaces (single root `bun.lock`) |
| `bun test` | Protocol round-trip, bingo lines, server WS integration + full round loop |
| `bun run check` | `tsc --noEmit` (server+protocol) and `svelte-check` (client) |
| `bun run dev:server` | Elysia server on :3000 (serves `apps/client/dist` + `/ws` + `/healthz` + `/api/decks`) |
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
| `docs/04-roadmap.md` | Milestones M0–M8, each ending playable-ish |
| `docs/05-ux-flow.md` | Routes, screen inventory (player + display), locked flow decisions |
| `docs/06-key-screens.md` | The two hard screens: board editor & open floor interaction design |
| `docs/07-design-system.md` | Visual language: colors, three-voice typography (EN+TH), shape, components |
| `docs/08-deployment.md` | Ship recipe: shared VM + Caddy vhosts, TLS modes, compose, deploy flow |
| `decks/general.json` | The seed deck (60 topics), loaded into SQLite on boot |
| `decks/general.example.json` | Schema reference — deliberately skipped by the seeder |

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
