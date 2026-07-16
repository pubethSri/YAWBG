# 04 — Roadmap

Build order chosen so every milestone ends with something playable-ish, and the
riskiest reused assumptions (protocol package, reconnect) are validated first.

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

## M1 — Lobby & board fill

- Settings UI (host) + `SettingsSchema` validation; player list; start gating.
- Private board editor per `06-key-screens.md`: dump mode (rapid entry,
  own-board/pool toggle) + arrange mode (drag-to-swap, tap-tap fallback with
  select/scale affordance); ready freeze/un-ready semantics; pool slots when K > 0.
- Public/private split live: other boards render as status grids.
- `distribute` with round-robin offset + `fromPool` flags.

**Exit test:** 3 players fill boards with K = 5 `middleRow`; nobody receives own
pool names; boards look right on phones.

## M2 — Core round loop *(the game exists after this)*

- House board generation, draw engine (`drawsPerRound`, free center, target
  lines), lazy topic pairing, deck reshuffle-on-empty.
- `open_floor` per `06-key-screens.md`: topic banner + House chip, stage strip,
  board centerpiece with cell tap-sheet, propose → queue → on-stage takeover
  (confirm lock / withdraw) → pass with confirm tap; resolve-based auto-advance;
  inline host force-advance; lock tags on cells.
- House bingo detection → results (winners, plain reveal).
- Seeded `general` deck loaded from JSON into SQLite; lobby deck picker (single
  deck is fine here).

**Exit test:** full 3-player game played at one table, phones only, start to
results, with at least one heated argument. (Yes, this is a real test.)

## M3 — Display & drama

- Display "Stage" super-state per `05-ux-flow.md`: one persistent layout across
  the round loop — House board (per visibility mode), called numbers, current
  topic large, proposal "on stage" card, player status-grid strip.
- Lobby join affordances: display lobby splash with huge code + QR deep link
  (`/?code=XXXX`); share-link button in the phone lobby (zero-display path).
- Player-view polish: draw-moment takeover animation, proposal queue awareness,
  resolved indicators, lock animations, new-House-hit flash (client-side
  snapshot diff).
- `houseBoardVisibility` modes `progress` and `hidden`.
- `roundTimerSec` and `lastCall`.

**Exit test:** the 5-friend group plays with a TV; the room groans at a House
hit without anyone explaining the screen.

## M4 — Results, reveal & share

- Host-paced synchronized results sequence (`results.advance` / `revealStage`):
  winners → pool authorship roast → board reveal with lock tags +
  round-history replay list.
- Game log persisted to SQLite on completion.
- Canvas board render → PNG → `navigator.share()` / download.
- `game.playAgain`.

**Exit test:** a board screenshot gets posted to the group chat unprompted.

## M5 — Decks & admin

- Deck CRUD UI behind OIDC (org IdP); deck list endpoint for the lobby picker;
  multi-deck merge in lobby settings.
- Deck-size warning vs expected draw count.
- Game-log browser (admin).

## M6 — Hardening & polish

- PWA manifest + install prompt; landscape display tweaks.
- Responsive pass per `06-key-screens.md`: landscape-phone two-pane player
  layout; tablet/desktop inlining (House board + queue beside a max-width
  board); cell auto-shrink floor tuning on small phones.
- Reconnect edge cases: proposer drops mid-proposal, host drops (host migration
  to longest-connected player), display refresh storms.
- Room GC for abandoned lobbies; heartbeat tuning behind org proxy.
- Playtest-driven pacing defaults: revisit `numberPoolSize` / `drawsPerRound`
  after ~5 real games.

## Deliberately deferred (post-v1 ideas, keep out of scope)

- In-app voting/judging for fully-remote play.
- Fancy web share page with game replay (game logs already make this possible).
- Custom per-room topic submissions ("write a topic" party mode).
- Accounts/stats for players.
