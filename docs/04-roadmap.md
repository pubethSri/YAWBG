# 04 — Roadmap

Build order chosen so every milestone ends with something playable-ish, and the
riskiest reused assumptions (protocol package, reconnect) are validated first.

**Reordered after M2** (2026-07-23): the game became playable at the end of M2,
so polish and deployment moved *ahead* of decks/admin — M5 (polish) and M6
(ship) now precede M7 (decks & admin). The point is to get a real build in
friends' hands and let playtest feedback accumulate while local work continues.
Decks & admin was the safest thing to defer: the seeded `general` deck ships
from JSON, so a public build needs no deck UI at all.

**Part of M5 was pulled ahead of M4** (2026-07-23): the display Stage's cohesion
pass and a new global canvas texture were designed before the results reveal
exists, because the TV is what a playtest audience actually stares at and M3
shipped it structurally sound but visually sparse. Both are now **built** —
`07-design-system.md` (the texture) and `09-display-stage.md` (the Stage
layout). The rest of M5 (motion pass, player-view responsive, PWA manifest)
stays in M5 and resumes after M5.5.

**Reordered again after playtest #1** (2026-07-29): **M6 moves back behind the
rest of M5.** The reason M6 was ahead — get a build in friends' hands for
feedback — was satisfied by a local LAN playtest that needed no deployment, and
the developer is away from the deploy site, so M6's exit test (a public URL, no
build team in the room) is unreachable regardless. The remaining M5 slices feed
a verdict that *is* reachable. Full reasoning at the top of M6 below.

## Exit-test ledger

Milestones are marked done when their **code** is built and verified. Several
exit tests are deliberately *not* satisfiable that way, and they are piling up
on one event rather than blocking the build — this table is so nobody
mistakes an unrun exit test for an unfinished milestone.

Three tiers of verification, and they are not interchangeable:

1. **Scriptable** — `bun test`, `bun run check`, DOM/pixel assertions. Run by
   whoever builds the thing.
2. **Solo manual pass** — a human following written numbered steps, alone.
   Establishes that a surface *works and reads correctly*.
3. **Playtest** — the friend group, in one room, playing a real game. The only
   thing that can settle an exit test phrased as an observation about a room.

| Milestone | Exit test | Status |
|---|---|---|
| M2 | "full game at one table, phones only, start to results, with at least one heated argument" | ✅ **playtest #1** — the loop is fun and social on its own |
| M3 | "the room groans at a House hit without anyone explaining the screen" | ⏳ playtest #1 was positive overall; the *display-specific* reaction was not separately reported (unclear a TV was in use) |
| M4 | "a board screenshot gets posted to the group chat unprompted" | ⏳ not observed at playtest #1 — watch for it next time |
| M5 | "looks deliberate on a phone, a tablet and a laptop; nothing looks like a placeholder" | ⏳ phone confirmed great at playtest #1; tablet/laptop + the responsive pass are still outstanding |
| M5.5 | "the room keeps watching after the game is over, and somebody says 'wait, go back to that one'" | ⏳ not separately reported at playtest #1 (see the balance caveat in the log — the game may not have reached a tense ending) |
| M6 | "friends play a full game on the public URL with nobody from the build team in the room" | ⏳ **untouched** — playtest #1 was local LAN with the build team present. Unreachable until the developer is back at the deploy site, which is why M6 was reordered behind M5 on 2026-07-29 |

**`09-display-stage.md`'s 25-step manual test passed on 2026-07-24**, and
**`10-highlight-reel.md`'s passed on 2026-07-29** — both tier 2, solo. They are
evidence that the Stage and the reel are correct, and they are *not* evidence
for M3's or M5.5's exit tests, which are about how a room reacts. Do not fold
one into the other; the whole reason M3 shipped the display styled was to make
the eventual playtest produce feedback about the game rather than about rough
edges, and that only pays off if the playtest actually happens.

**Every written manual test in the repo has now passed.** What is left in the
ledger below is exclusively tier 3 — five verdicts that only a playtest can
settle, four of which need one that happens on the public URL.

The honest sequencing: **M5 makes it look finished, M5.5 gives it an ending,
M6 ships it, and all five verdicts land in the same session.** If a playtest
happens sooner, fold the observations in early.

## Playtest log

### Playtest #1 — 2026-07-27 (local LAN, not deployed)

4 players, general deck, `numberPoolSize: 75`, `drawsPerRound: 1`. Run off a
local `bun run dev:server` over the LAN, **not** the public build — so it is
the first real room feedback but does **not** satisfy M6's exit test.

What it settled and what it raised:

1. **The core works.** Visuals read as deliberate and the loop is fun on its
   social merits — "the game does its job as the system that drives the
   gameplay." This is strong evidence for M2's exit test and for M5's phone
   verdict; it is *not* a substitute for the M3 / M4 / M5.5 room observations,
   which nobody reported hitting specifically.
2. **Board editor friction — ✅ settled 2026-07-29.** The dump/arrange split was
   understandable, but you could not edit an existing name in dump mode; a
   playtester expected to fix a typo without switching modes. This was exactly
   the "if real fills feel awkward, revisit the mode split" escape hatch `06`
   reserved. **Decided: dump mode now edits in place, and the split stands** —
   `06`'s rationale is *writing* vs *placing*, and a typo fix is writing. Dump
   still gets no placement (no selection, no swap). Built and verified the same
   day; see `06-key-screens.md` for the reasoning and the one gap left open
   (pool chips).
3. **Pacing: `drawsPerRound: 1` felt slow — ✅ settled 2026-07-29.** With one
   number a round the House crawled and every player finished their board
   *before* it bingoed, so the doom-clock race was gone. **Decided: the default
   is now 2**, on one playtest, because the House half of the race turned out to
   have no social component — a 20,000-game model puts House bingo at ~42 rounds
   at `drawsPerRound: 1` against a hard ≥25-round floor on filling a board (a
   player locks at most one cell per round). No table behaviour closes a
   17-round gap. The full table and the part that *is* still social — real fill
   rates are below 1/round, so `numberPoolSize: 100` is the next lever if boards
   end too empty — are in `01-game-design.md`'s † note. This also discharges
   M8's "revisit pacing defaults after real games" item for `drawsPerRound`.

## Design runway (now, before/alongside M0)

Design-phase artifacts, in their intended order:

| Artifact | Status |
|---|---|
| Screen inventory & flow (`05-ux-flow.md`) | ✅ done |
| Hard-screen interaction design (`06-key-screens.md`) | ✅ done |
| Design system — visual direction, tokens, typography (`07-design-system.md`) | ✅ done |

The design runway is complete. All styling work from M1 onward follows
`07-design-system.md` (light-only for v1); M0 remains visual-free plumbing.

## M0 — Skeleton *(the boring milestone that saves the project)* ✅ done

- Bun workspaces monorepo: `apps/server`, `apps/client`, `packages/protocol`.
- Protocol package with envelope schema, `PROTOCOL_VERSION`, `room.create` /
  `room.join` / `session.resume` / `room.state` round-tripping.
- Elysia `/ws` endpoint, `RoomManager`, 4-letter codes, session tokens,
  disconnect grace + resume (port from *ito*, adapt to protocol package).
- Svelte SPA shell with routes `/`, `/room/:code`, `/display/:code`; renders raw
  `PublicRoomState` as JSON.
- Multi-stage Dockerfile, single origin, deploy to org server early — find the
  reverse-proxy WS quirks now, not at v1.

**Exit test:** two phones + one display join a room, one phone locks its screen
for 60 s and resumes its seat.

## M1 — Lobby & board fill ✅ done

- Settings UI (host) + `SettingsSchema` validation; player list; start gating.
- Private board editor per `06-key-screens.md`: dump mode (rapid entry,
  own-board/pool toggle) + arrange mode (drag-to-swap, tap-tap fallback with
  select/scale affordance); ready freeze/un-ready semantics; pool slots when K > 0.
- Public/private split live: other boards render as status grids.
- `distribute` with round-robin offset + `fromPool` flags.

**Exit test:** 3 players fill boards with K = 5 `middleRow`; nobody receives own
pool names; boards look right on phones.

## M2 — Core round loop *(the game exists after this)* ✅ done

- House board generation, draw engine (`drawsPerRound`, free center, target
  lines), lazy topic pairing, deck reshuffle-on-empty.
- `open_floor` per `06-key-screens.md`: topic banner + House chip, stage strip,
  board centerpiece with cell tap-sheet, propose → queue → on-stage takeover
  (confirm lock / withdraw) → pass with confirm tap; resolve-based auto-advance;
  inline host force-advance; lock tags on cells.
- House bingo detection → results (winners, plain reveal).
- Seeded `general` deck loaded from JSON into SQLite; lobby deck picker (single
  deck is fine here).

**Pulled forward into M2** (both were cheap once the loop existed): `lastCall`
(the setting already existed; the server side is one phase transition and `06`
reuses the open-floor screen) and basic WS ping/pong (real gameplay depends on
liveness — a silently-dead proposer holds the queue front). M6 still owns
heartbeat *tuning* behind the org proxy.

**Exit test:** full 3-player game played at one table, phones only, start to
results, with at least one heated argument. (Yes, this is a real test.)

## M3 — Display & drama ✅ done

The display is the one surface whose primary job is *being looked at*, so it
ships styled: build it to the `07-design-system.md` baseline (tokens, type
scale, die-cut ring, legible across a room) rather than deferring its look to
M5. Legibility at 3 m is what the exit test measures. `06-key-screens.md` also
puts the display outside the player-view breakpoints — it is a single
landscape target, so there is no later responsive sweep to batch it into.
What M5 *does* own for the display: cross-surface cohesion and motion timing.

- Display "Stage" super-state per `05-ux-flow.md`: one persistent layout across
  the round loop — House board (per visibility mode), called numbers, current
  topic large, proposal "on stage" card, player status-grid strip.
- Lobby join affordances: display lobby splash with huge code + QR deep link
  (`/?code=XXXX`); share-link button in the phone lobby (zero-display path).
- Player-view polish: draw-moment takeover animation, proposal queue awareness,
  resolved indicators, lock animations, new-House-hit flash (client-side
  snapshot diff).
- Client rendering for `houseBoardVisibility` modes `progress` and `hidden`
  (the server already emits all three).
- `roundTimerSec`. (`lastCall` shipped in M2.)

**Exit test:** the 5-friend group plays with a TV; the room groans at a House
hit without anyone explaining the screen.

Built with **no protocol change** — `PROTOCOL_VERSION` stays 2. Two decisions
worth carrying forward:

- **The round timer has no deadline on the wire.** The server owns the real
  timer (its own slot in `Room`, not the shared `phaseTimer`) and auto-advances
  identically to `forceAdvance`; each client counts down locally from the
  moment it sees the floor open. A client that reconnects mid-round therefore
  shows a generous countdown. Accepted for a *soft* timer — adding
  `RoundState.endsAt` would cost a version bump.
- **`hidden` House visibility no longer hides the called-number list.** The
  phone's House chip opens in every mode now: the display shows called numbers
  in all three, and no public fact may live only on the TV.

## M4 — Results, reveal & share

- Host-paced synchronized results sequence (`results.advance` / `revealStage`):
  winners → pool authorship roast → board reveal with lock tags +
  round-history replay list.
- Game log persisted to SQLite on completion.
- Canvas board render → PNG → `navigator.share()` / download.
- `game.playAgain`.

**Exit test:** a board screenshot gets posted to the group chat unprompted.

Built at **`PROTOCOL_VERSION` 3**: the `ResultsPayload` shape was already
complete at M2, but `results.advance` and `game.playAgain` were specified in
`03-protocol.md` and never implemented, so the intent union grew. Three
decisions worth carrying forward:

- **The reveal stage gates the wire.** `results.boards` is empty at stage ⓪ on
  every socket including displays, so the authorship roast cannot be spoiled
  from devtools (`03-protocol.md` invariant 11).
- **The game log is an injected sink, not a `Room` dependency.** SQLite gained
  a `games` table, and the server tests still never open a database.
- **The PNG export ships without the tabletop texture**, on plain cream, with a
  `TODO(M5)` — the texture is designed (`07-design-system.md`) but not built.
  M5 owns making the export carry it.

## M5 — Polish & responsive *(make it look finished)*

Every screen exists and works by the end of M4. This milestone makes the set
cohere and covers non-phone form factors, so the first public build isn't
embarrassing.

Built in slices, each ending with a manual test the user runs before the next
begins. **Slice 1 (the display Stage + the texture) is done**; the cohesion
audit, motion pass, responsive pass and PWA are outstanding — and by decision
(2026-07-23) **M5.5 is built before them**, so the remaining slices resume after
the reel. Every open question in them was settled in that same session; the
bullets below are the answers, not options.

- Cross-surface cohesion audit against `07-design-system.md`: the House board,
  cells, lock tags and status grids must read as the same objects on phone and
  display. Retro-fit anything M1/M2 shipped rough.
- **Display Stage rebuild + canvas texture — ✅ built (2026-07-23), see
  `09-display-stage.md`.** Column rebalance to make the House the largest
  object, the waiting room replacing the empty right pane, and the global
  tabletop texture (all three consumers: `body`, the display's 48px override,
  and the share-to-PNG export). No protocol change; `PROTOCOL_VERSION` stays 3.
- Motion pass: draw-moment, lock, House-hit and results-reveal timings tuned
  together rather than per-screen.
- **Responsive pass — ✅ built (2026-07-29), see `06-key-screens.md`'s
  implementation postscript.** Player view only; the display is landscape-first
  and unrelated. Landscape-phone two-pane layout, tablet/desktop inlining (the
  House board and the round list beside a 600px-capped board), cell auto-shrink
  tuned per layout rather than by name length alone, and the capped centred
  content column on landing, lobby, board editor and results. Greenfield as
  predicted — two custom variants and one utility in `app.css` are the whole
  breakpoint vocabulary, and `RoundScreen.svelte` was indeed the bulk of it.
  Verified by measurement at seven viewport sizes; the by-eye pass is still
  outstanding and is what the exit test needs.
- **Display results, stage ①:** the roast grid is `overflow-hidden` with
  auto-fill columns, so a large lobby with a big pool (12 × K=8 = 96 entries)
  silently clips. Fix by **scaling the entry type down to a floor** rather than
  clipping. Realistic games (5 × K=3) fit today, so this is a robustness item,
  not a visible bug.
- **PWA: manifest + icons, no service worker.** The game is WebSocket-all-the-way
  down, so an offline shell would buy a splash screen and cost a stale-worker
  update prompt to design. Installable, correct name / theme-color / icons /
  standalone. **An icon asset still has to be drawn** — the repo has none and
  there is no `apps/client/public/` directory yet.

**Exit test:** the game looks deliberate on a phone, a tablet and a laptop, and
nothing on screen looks like a placeholder.

## M5.5 — The highlight reel & cheers *(the ending the game deserves)*

Inserted (2026-07-23) between M5 and M6 rather than renumbering M6–M8, which
would churn every doc that references them. Designed in full ahead of the build:
see **`10-highlight-reel.md`** for the layout, the mechanic and the protocol.

Sequenced before the first playtest deliberately. It changes the round loop, so
retrofitting it after M6 would mean a second protocol bump *and* a second
playtest to judge it — and the ending is exactly the part of the game a playtest
has opinions about.

- **A fourth reveal stage (③).** After the boards, a rotating card pairs one
  round's topic with one name proposed for it — locked and **withdrawn** alike,
  one card per name.
  `game.playAgain` moves here, so the host paces the reel by staying on it.
- **Cheers.** Any player may applaud any name proposed in the current round.
  The tally is hidden until stage ③, where it orders the cards and crowns a
  crowd favourite. It gates nothing and scores nothing.
- Game log persists the reel.

**Built 2026-07-24 at `PROTOCOL_VERSION` 5**, both slices in one session, so
`round.cheer` was never live-in-schema-only and `03-protocol.md` no longer
carries the ✎ marker. The reel shipped at v4 and went to v5 the same day:
`docs/10` decision 3 was reversed once a full table's card was on a real screen,
so a card is now one **name** rather than one round. A second bump was
affordable only because nothing is deployed yet. **`docs/10`'s 25-step manual
test passed 2026-07-29** (tier 2, solo); the exit test still needs the playtest
(see the ledger above).

**Scope-wall note:** `02-architecture.md` bans in-app voting/judging. Cheers
clear that wall because they decide nothing *and* are invisible while decisions
are live; the second half of that sentence is load-bearing and is written up in
`10`. Flagged rather than assumed, per the convention below.

**Exit test:** the room keeps watching the screen after the game is over, and
somebody says "wait, go back to that one."

## M6 — Ship it *(first public build; playtesting starts here)*

**Sequencing question resolved 2026-07-29: M6 moves behind the rest of M5.**
M6 was pulled ahead of decks/admin specifically to get a build in friends' hands
for playtest feedback (see the top of this doc). Playtest #1 delivered that
feedback **without a deployment** — a local LAN game was enough — which removed
the original reason for M6-first. Meanwhile the developer is **away from the
deployment site** (the org VM; see `08-deployment.md` and the *ito* migration
notes), so the real cutover cannot happen now.

The deciding argument: **M6's exit test is unreachable from here.** It needs a
public URL and a room with nobody from the build team in it. A local rehearsal
would produce no verdict, while the remaining M5 slices feed a verdict that
*is* reachable (M5's tablet/laptop observation) and raise the quality of the
next local playtest, which can happen any time.

**New order: the remaining M5 slices (cohesion audit, motion, player-view
responsive, PWA) → M6 → M7 → M8.** The two playtest-driven fixes above were
landed immediately on 2026-07-29 rather than being slotted into a milestone;
they were a handful of lines each.

M6 itself is unchanged and still fully specced — it is waiting on *location*,
not on code or on a decision. When it starts, the local rehearsal (docker build,
`deploy/compose.yml` up, WS-behind-proxy dry-run against a local Caddy) is still
the right first step, so the eventual cutover is a config swap rather than a
debugging session. One thing that got *more* important since it was written: the
heartbeat fix means real pings now go out every 30 s, so an edge proxy that
severs quiet sockets faster than that reintroduces the exact symptom that bug
produced — see the `proxy_read_timeout` row in `08-deployment.md`.

The rest of M6 as specced:

Cutover per `08-deployment.md` — shared org VM behind Caddy, compose, the
existing deploy workflow. Decks and admin are deliberately *not* here: the
seeded `general` deck ships from JSON and is enough for real games.

- Deployment cutover: vhost, TLS, WS proxying, SQLite volume + backup.
- Minimum operability for an unattended public URL — without these a dropped
  host or a stale lobby costs you a playtest session and the feedback you get
  is about the crash, not the game:
  - host drops → host migration to longest-connected player;
  - proposer drops mid-proposal;
  - room GC for abandoned lobbies;
  - heartbeat tuning behind the org proxy.
- Feedback path for playtesters (however lightweight — a group chat is fine).

**Exit test:** friends play a full game on the public URL with nobody from the
build team in the room, and the server is still healthy the next morning.

## M7 — Decks & admin

- Deck CRUD UI behind OIDC (org IdP); deck list endpoint for the lobby picker;
  multi-deck merge in lobby settings.
- Deck-size warning vs expected draw count.
- Game-log browser (admin).

## M8 — Hardening from playtest

Driven by what M6 actually surfaced, not guessed in advance.

- Remaining reconnect edge cases (display refresh storms, anything playtesting
  found).
- Playtest-driven pacing defaults: revisit `numberPoolSize` / `drawsPerRound`
  after ~5 real games. **First data point in (playtest #1, 2026-07-27):
  `drawsPerRound: 1` felt too slow — the House lost the race to the players.**
  See the playtest log; the default change is a live open question, not yet an
  M8 item.

## Deliberately deferred (post-v1 ideas, keep out of scope)

- In-app voting/judging for fully-remote play. (Still deferred. **Cheers in
  M5.5 are not this** — they decide nothing and are hidden while decisions are
  live; see `10-highlight-reel.md`.)
- Fancy web share page with game replay (game logs already make this possible).
- Custom per-room topic submissions ("write a topic" party mode).
- Accounts/stats for players.
