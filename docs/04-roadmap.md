# 04 — Roadmap

Build order chosen so every milestone ends with something playable-ish, and the
riskiest reused assumptions (protocol package, reconnect) are validated first.

**Reordered after M2** (2026-07-23): the game became playable at the end of M2,
so polish and deployment moved *ahead* of decks/admin — M5 (polish) and M6
(ship) now precede M7 (decks & admin). The point is to get a real build in
friends' hands and let playtest feedback accumulate while local work continues.
Decks & admin was the safest thing to defer: the seeded `general` deck ships
from JSON, so a public build needs no deck UI at all.

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

## M5 — Polish & responsive *(make it look finished)*

Every screen exists and works by the end of M4. This milestone makes the set
cohere and covers non-phone form factors, so the first public build isn't
embarrassing.

- Cross-surface cohesion audit against `07-design-system.md`: the House board,
  cells, lock tags and status grids must read as the same objects on phone and
  display. Retro-fit anything M1/M2 shipped rough.
- Motion pass: draw-moment, lock, House-hit and results-reveal timings tuned
  together rather than per-screen.
- Responsive pass per `06-key-screens.md` (player view only — the display is
  landscape-first and unrelated): landscape-phone two-pane layout;
  tablet/desktop inlining (House board + queue beside a max-width board); cell
  auto-shrink floor tuning on small phones.
- PWA manifest + install prompt.

**Exit test:** the game looks deliberate on a phone, a tablet and a laptop, and
nothing on screen looks like a placeholder.

## M6 — Ship it *(first public build; playtesting starts here)*

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
  after ~5 real games.

## Deliberately deferred (post-v1 ideas, keep out of scope)

- In-app voting/judging for fully-remote play.
- Fancy web share page with game replay (game logs already make this possible).
- Custom per-room topic submissions ("write a topic" party mode).
- Accounts/stats for players.
