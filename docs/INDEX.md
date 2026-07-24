# YAWBG — Artifact index

`docs/` is the design-artifact store for **YAWBG** ("Yet Another Web Board
Game" / "Yours Awesome Web BinGo"): every decision made before and during the
build lives in one of the numbered artifacts below. **This file is the entry
point** — point a new session (human or AI) here and it points onward.

## Orientation in one paragraph

YAWBG is reverse-trivia bingo for 2–12 friends in the same room, each on their
own phone, optionally with a big read-only display. Players fill a 5×5 board
with names of specific individuals; the system draws numbers for a
system-owned House board and pairs each round with a Topic ("An assassin");
players propose one fitting name per round, argue it out loud, and lock it
permanently. House bingo ends the game; enough completed lines = you win. The
app never judges — disputes are social. Server-authoritative, no player
accounts, join by 4-letter room code.

## The artifacts

| # | File | Contains | Read it when… |
|---|---|---|---|
| 01 | [`01-game-design.md`](01-game-design.md) | Rules, one-entity rule, roles, phase machine, lock semantics, pool/sabotage mechanic, **lobby settings table**, win conditions, edge-case rulings, share feature | You need to know how the game is *played*, or whether a rule exists |
| 02 | [`02-architecture.md`](02-architecture.md) | Stack, monorepo layout, `RoomManager`/`Room` server model, public/private state split, display role, reconnection design, REST surface, deployment, **v1 non-goals** | You need to know how the system is *built*, or whether something is in scope |
| 03 | [`03-protocol.md`](03-protocol.md) | Every client intent & server message, full state shapes (`PublicRoomState`, `PrivateBoard`, `ResultsPayload`), server-side invariants | You're touching anything that crosses the wire — this is the blueprint for `packages/protocol` |
| 04 | [`04-roadmap.md`](04-roadmap.md) | Design-runway status, milestones **M0–M8** with exit tests, deliberately-deferred list | You're deciding what to build next (or resisting building something too early) |
| 05 | [`05-ux-flow.md`](05-ux-flow.md) | Routes, phase-renderer model, player & display screen inventories, display-optional principle, locked flow decisions | You need to know what screen exists when, or how devices move through the game |
| 06 | [`06-key-screens.md`](06-key-screens.md) | Interaction design for the two hard screens: board editor (dump/arrange modes, swap gestures, ready semantics) and open floor (layout stack, takeover, pass confirm); responsive/landscape rules | You're building or changing the board-fill or round-loop UI |
| 07 | [`07-design-system.md`](07-design-system.md) | Visual language: sticker-bombed-tabletop theme, color tokens + measured contrast table + game-state mapping, three-voice typography (Fraunces / Inter+Kanit / Baloo 2, Thai included), shape & the die-cut ring, motion, component recipes, Tailwind `@theme` quick start | You're styling anything. Light-only for v1 |
| 08 | [`08-deployment.md`](08-deployment.md) | Ship recipe: shared org VM with *ito* via Caddy vhosts, TLS modes (incl. org certs), compose layout, proxy WS requirements, deploy flow, SQLite backup | You're deploying, or touching proxy/TLS/compose |
| 09 | [`09-display-stage.md`](09-display-stage.md) | **Built.** Display Stage layout spec: auto-sized House, the waiting room replacing the empty right pane, three removals, colour budget; the 25-step manual test; and an implementation postscript on why the "auto" column is a container query | You're touching the display Stage, or wondering why the House column isn't a percentage |
| 10 | [`10-highlight-reel.md`](10-highlight-reel.md) | **Designed, not built.** The fourth results stage: rotating cards pairing a round's topic with every name proposed for it (withdrawn included), plus the **cheer** mechanic, its hidden tally, the v4 protocol shapes and a 22-step manual test | You're building M5.5, or you need to know why cheers aren't voting |

Seed topic decks live outside `docs/` in [`../decks/`](../decks/):
`general.json` is the deck that actually ships (upserted into SQLite on boot),
and `general.example.json` stays as the schema reference — the seeder skips
`*.example.json` deliberately.

## Implementation status

Design is complete and the game is **playable start to finish and back again**.
**M0 (skeleton) through M4 (results, reveal & share) are shipped**, and **M5
(polish & responsive) is in progress, built in slices** — the repo is a Bun
workspaces monorepo (`apps/server`, `apps/client`, `packages/protocol`) beside
these docs. See `04-roadmap.md` for milestone status and `../CLAUDE.md` for the
command list and implementation notes.

The post-M2 roadmap was **reordered** (2026-07-23) to ship a public build
early: M3 display → M4 results → M5 polish & responsive → M5.5 reel → M6 deploy
& playtest → M7 decks & admin → M8 hardening. The display ships styled in M3
rather than waiting for M5 — see the note at the top of that milestone.

M5's first slice — the display Stage rebuild and the global tabletop texture,
designed ahead of time in `09` — is **built** (2026-07-23), and `09`'s 25-step
manual test **passed** (2026-07-24, solo). Outstanding in M5: the cohesion
audit, the motion pass, the player-view responsive pass and the PWA.
`PROTOCOL_VERSION` is **3**.

Several milestones are code-complete with their **exit tests still unjudged**,
because those tests describe how a room of people reacts. `04-roadmap.md` has
an **exit-test ledger** tracking all of them; they land together at the M6
playtest. A solo manual pass is not a substitute for one.

**M5.5 was inserted** (2026-07-23) between polish and ship: a fourth results
stage that replays each round's topic beside every name proposed for it, plus a
*cheer* mechanic whose tally stays hidden until that reveal. Designed in full in
`10`, not built. It bumps the protocol to **4**. It sits before the playtest on
purpose — it changes the round loop, so doing it afterwards would cost a second
bump and a second playtest.

Two rulings settled during M2 that these artifacts now reflect:

- **A disconnected player blocks round auto-advance** — `01`'s edge-case table
  won over `03`'s earlier "every *connected* player" wording, which has been
  corrected. This is what makes the host's force-advance meaningful.
- **`lastCall` and WS ping/pong shipped early** (M2 rather than M3/M6), because
  both were small once the round loop existed. M6 still owns heartbeat *tuning*.

## Cross-cutting facts (asserted across multiple artifacts)

- **Phase machine:** `lobby → board_fill → distribute → (draw → open_floor)* →
  last_call? → results` — defined in 01, mirrored by 03's `Phase` type and
  05's screen inventory.
- **Server-authoritative, thin clients**: clients send intents, render
  full-snapshot broadcasts; no wire type outside `packages/protocol` (02, 03).
- **Public/private split**: unlocked board names never leave the owner's
  socket; locked cells (name + tag) become public (01, 02, 03).
- **Display is optional and read-only** — a projector, not a console; phones
  are the baseline experience (02, 05).
- **Locks are permanent and tagged** `{ topic, round, number }`; the final
  board is self-documenting and exports to PNG (01, 03, 07).
- **The app never judges.** Disputes are settled out loud; no in-app voting in
  v1 (01, 02). The M5.5 cheer mechanic is compatible *because* its tally is
  hidden until results — a live count would be a verdict by another name
  (01, 03, 04, 10).

## Conventions for new artifacts

- New design docs continue the numbered prefix (`08-…`) and get a row in the
  table above.
- Stay consistent with the phase machine and the settings table in 01; if a
  new idea changes rules or protocol, update 01/03 in the same change — no
  drift between artifacts.
- The v1 non-goals (02) and deliberately-deferred list (04) are intentional
  scope walls; don't design against them without flagging it.
