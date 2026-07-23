# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: implementation started — M0 through M4 shipped, M5 in slices

The design phase is complete (`docs/` holds the artifacts). **M0 — skeleton**,
**M1 — lobby & board fill**, **M2 — core round loop**, **M3 — display &
drama** and **M4 — results, reveal & share** are built; the game plays start to
finish and back again (`game.playAgain`), with a styled read-only display and a
share-to-PNG export. The repo is a Bun workspaces monorepo alongside the design
docs. Next up is **M5 — Polish & responsive** (see `docs/04-roadmap.md`), whose
display-Stage half is already specced in `docs/09-display-stage.md`. Build
milestone by milestone; don't design or build against the roadmap's deferred
lists without flagging it.

The post-M2 order is **M3 display → M4 results → M5 polish & responsive → M6
deploy & playtest → M7 decks & admin → M8 hardening**: polish and deployment
were moved ahead of decks/admin so friends can playtest a real build while
local work continues. The display ships *styled* in M3 (legibility across a
room is what its exit test measures); M5 owns cross-surface cohesion, motion
timing and the player-view responsive pass.

**M5 is being built in slices**, each ending with a manual test the user runs
before the next starts. Slice 1 — `docs/09-display-stage.md`'s Stage rebuild
plus the global tabletop texture — is **built**; see the M5 notes below. Still
outstanding: the cross-surface cohesion audit, the motion pass, the responsive
pass and the PWA. Decisions already settled for those (2026-07-23), so don't
re-open them: the PWA is **manifest + icons, no service worker** and still needs
an icon asset drawn (the repo has none, and no `apps/client/public/` directory);
the responsive pass covers the open floor, the board editor **and**
lobby/home/results; the display's stage-① roast grid **scales its type down to
fit** rather than clipping at large pools. There is currently not one responsive
breakpoint utility in the whole client — that pass is greenfield, not a
retro-fit, and `RoundScreen.svelte` (539 lines) is its biggest single item.

**`docs/10-highlight-reel.md` is designed but NOT built, and it is what the next
session builds** — ahead of M5's remaining slices, by decision (2026-07-23). It
adds a fourth results stage (a rotating card pairing each round's topic with
every name proposed for it, **withdrawn ones included**) plus a *cheer*
mechanic. It is the first thing since M4 to change the wire:
**`PROTOCOL_VERSION` 3 → 4**, once, for both build slices. Three things to know
before touching it:

- **The hidden tally is a rule, not a presentation choice.** Cheers clear the
  "no in-app voting/judging" wall in `docs/02` only because no count is visible
  while any decision is live. Making it live would re-open the scope wall.
  `docs/01`, `docs/03` invariant 14 and `docs/10` all say this; don't relax it
  in one of them.
- **`round.cheer` ships in the schema before it works.** `docs/03` marks it ✎
  (designed, not live) as distinct from ★ (host-only), because assuming ★ meant
  "unimplemented" cost a session's planning time at M4. Slice 1 is the reel with
  every `cheers` at 0; slice 2 makes the intent do something.
- **The proposal record is new server state that `resetForNewGame()` must
  clear**, and it is exactly the kind of survivor that only breaks the *second*
  game of a session.

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
- `results` already carried the full `ResultsPayload` (winners, boards with
  `authorId`, `roundHistory`) at M2, with `revealStage` parked at `0`. M4 added
  the host-paced sequence over that **state shape** unchanged — but it did add
  two *intents*, so it was not a no-protocol-change milestone. (An earlier
  version of this file claimed it would be; that was wrong, and it cost a
  session's planning time.)
- `packages/protocol/test/protocol.test.ts` asserts `PROTOCOL_VERSION` as a
  literal on purpose, so bumping it fails that test by design.
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

M4 notes for future sessions:

- **`PROTOCOL_VERSION` is now 3.** M4 added `results.advance` and
  `game.playAgain` — both host-only, both `{}` payloads, both enforced in
  `Room.handleIntent` rather than in the schema (the ★ in `docs/03`'s intent
  table means *host-only*, not *unimplemented*).
- **`revealStage` gates what the server sends, not just what clients draw.**
  `results.boards` is `[]` at stage ⓪ on every socket, displays included;
  `Room.resultsPublic()` is the single redaction point and `this.results` keeps
  the whole payload behind it. `winners` and `roundHistory` ship at every stage
  — a history entry names only locked cells, which were already public. Stage ①
  is where names *and* `authorId` first travel, under one gate, because the
  roast is made of exactly that data. Per-recipient redaction was rejected: the
  payload rides the one public frame that also feeds the TV. See `docs/03`
  invariant 11.
- **The game log is an injected sink (`GameLogSink`), not a `Room`
  dependency** — the same seam shape as `TopicSource`. A room built without one
  simply doesn't log, which is what keeps the server tests free of SQLite;
  `createApp({ log })` takes a fake, and `log: null` disables it. `Room` calls
  it fire-and-forget inside a try/catch: a log failure must never take a
  finished game down with it. The `games` table is one flat row with JSON
  columns on purpose (see `GameLog.ts` for why normalizing now would serve no
  query).
- **`resetForNewGame()` has to clear everything the round loop accumulated.** A
  survivor there is a bug that only appears in the *second* game of a session,
  which is the worst kind to reproduce — the reset is deliberately exhaustive
  rather than clever.
- **Share-to-PNG is `lib/share.ts`, canvas only** (server-side image rendering
  is a v1 non-goal). Colours are read off `:root` with `getComputedStyle`, so no
  hex is duplicated out of `app.css`, and a dismissed share sheet throws
  `AbortError` — a cancellation, which must not fall through to a surprise
  download. Two traps found by the first playtest:
  - **`ensureFonts()` must request every (family, *weight*) pair the render
    draws with**, each with sample text in its own script. Canvas never triggers
    a font download and `document.fonts.ready` only waits for loads something
    asked for. Getting the list wrong doesn't look like a font bug, it looks
    like a *layout* bug: `measureText` runs against the fallback, says a name
    fits on one line, and the paint lands ~3% wider and out of its cell. Missing
    Kanit **700** did exactly that to Thai names while 600/800 were listed.
  - **The header baselines and `BOARD_TOP` are derived constants, not hand-tuned
    numbers.** The first version hardcoded a 210px header while the last
    baseline sat at 224, so "N lines completed" rendered under row 1 of the
    board. `BOARD_TOP` is now `max()`-ed off both the last baseline and the
    starburst's reach; add a header line and it still can't collide.
  - `wrap()` guarantees no returned line exceeds `maxWidth` — it breaks inside a
    word when it has to, on grapheme clusters so a Thai tone mark is never
    stranded from its base. Thai doesn't space its words, so the break-inside
    path is not an edge case there.
- **On the display, anything square must be constrained on both axes.**
  `DisplayResults`'s stage-② boards used `aspect-square` inside a `1fr` column;
  at two players a column is ~46vw, so the board demanded ~46vw of *height* and
  the bottom row fell off a screen that never scrolls. They are now
  `w-[min(100%,64vh)]` — the same rule `Starburst` follows, and the same failure
  `docs/09` warns about for the House column. Verify with
  `scrollHeight === clientHeight` at 1920×1080, 1920×900 and 1366×768.
- Driving a game to results by hand is slow, and **scripted drivers only work
  with the Browser pane fronted**: a hidden pane throttles timers enough that
  force-advance sequences silently stall mid-round. Sheets swallow later clicks
  too — send `Escape` between steps, and pick board cells by their *name* text,
  since a locked cell leaves the `[role="button"]` set and shifts every index
  after it.

M5 notes (slice 1 — display Stage + tabletop texture, built 2026-07-23):

- **The Stage's "auto" House column is a container query, not `auto`.** CSS
  sizes a grid track before the item's height exists, so a literal
  `grid-template-columns: auto` collapses around an `aspect-ratio` board. The
  built form makes the body row a size container (`.stage-body`) and writes the
  column as `min(55cqw, calc(100cqh - var(--stage-house-chrome)))`. **An element
  is never its own container** — that is the only reason the body row and the
  column grid are two elements. Measured dead space in the House column is now
  0 px at 1920×1080, 1900×910 and 1366×768 (it was ~121 px at 1900×910).
- **`--stage-house-head` / `--stage-house-dread` are a contract between
  `app.css` and `HousePanel.svelte`.** The heading and dread rows are *given*
  those heights rather than measured, which is what makes the column-width
  subtraction exact. Change one without the other and the dead space comes back.
  It also hard-enforces "the panel's shape never changes between visibility
  modes": all three modes render inside the same `w-full aspect-square` slot.
- **The board is width-bound (`w-full aspect-square`), not height-bound.** The
  column is already the *smaller* of the two constraints, so a square filling
  its width always fits vertically; `h-full` would overflow horizontally
  whenever the 55% clamp wins. Same lesson as `DisplayResults` above, arrived at
  from the other direction.
- **The House does resize across a *round* boundary** (~24 px) because the topic
  lives in the header and a two-line topic shortens the body row. Within a round
  the draw→open-floor delta is exactly 0. Accepted — see `docs/09`'s postscript
  for why reserving two topic lines is the worse trade.
- **The waiting-room chips' rotation is a lookup table, not arithmetic.** The
  first version used `(i * 7) % 15 - 7`, which puts index 1 at exactly 0° — with
  two players that is one tilted chip beside one untilted one, and it reads as a
  bug. The table also guarantees neighbours never share a sign. Rotation is keyed
  on the player's index in `players`, never on the sorted position, or every chip
  twitches when someone joins the queue.
- **Rotated chips bleed past their layout box** (~14 px on a full-width chip at
  7°). The waiting room's `py-[1.5vh]` exists for that, not for rhythm; the worst
  case is 12 players at 1920×900, where clearance to the "Called" heading is
  11 px. Layout boxes themselves fit exactly — the flex rows stretch to the pane.
- The texture ships to all three consumers. `body` carries it at 24 px;
  `body.display-shell` overrides to 48 px and the class is added/removed by
  `routes/Display.svelte` on mount, because `background-size` on a wrapper with
  no `background-image` does nothing. `share.ts` draws the same tile in *logical*
  units, so SCALE gives it 2× resolution at the same physical pitch. Verified in
  an exported PNG: dot centres are exactly `#f0d0a8`, and 0 mark pixels landed
  inside the 25 cells across 58k samples.

The stack is Bun workspaces + Elysia server + Svelte 5 (runes) + Tailwind v4
client + a shared `packages/protocol` zod package (see `docs/02-architecture.md`).

Commands (run from the repo root; requires Bun):

| Command | Does |
|---|---|
| `bun install` | Install all workspaces (single root `bun.lock`) |
| `bun test` | Protocol round-trip, bingo lines, server WS integration, full round loop, results reveal + game log |
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
| `docs/09-display-stage.md` | Display Stage layout + the tabletop texture; built, with an implementation postscript |
| `docs/10-highlight-reel.md` | **Next to build.** The results reel, the cheer mechanic, and the v4 protocol shapes |
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
