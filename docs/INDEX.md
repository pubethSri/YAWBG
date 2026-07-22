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
| 04 | [`04-roadmap.md`](04-roadmap.md) | Design-runway status, milestones **M0–M6** with exit tests, deliberately-deferred list | You're deciding what to build next (or resisting building something too early) |
| 05 | [`05-ux-flow.md`](05-ux-flow.md) | Routes, phase-renderer model, player & display screen inventories, display-optional principle, locked flow decisions | You need to know what screen exists when, or how devices move through the game |
| 06 | [`06-key-screens.md`](06-key-screens.md) | Interaction design for the two hard screens: board editor (dump/arrange modes, swap gestures, ready semantics) and open floor (layout stack, takeover, pass confirm); responsive/landscape rules | You're building or changing the board-fill or round-loop UI |
| 07 | [`07-design-system.md`](07-design-system.md) | Visual language: sticker-bombed-tabletop theme, color tokens + measured contrast table + game-state mapping, three-voice typography (Fraunces / Inter+Kanit / Baloo 2, Thai included), shape & the die-cut ring, motion, component recipes, Tailwind `@theme` quick start | You're styling anything. Light-only for v1 |
| 08 | [`08-deployment.md`](08-deployment.md) | Ship recipe: shared org VM with *ito* via Caddy vhosts, TLS modes (incl. org certs), compose layout, proxy WS requirements, deploy flow, SQLite backup | You're deploying, or touching proxy/TLS/compose |

Seed topic decks live outside `docs/` in [`../decks/`](../decks/):
`general.json` is the deck that actually ships (upserted into SQLite on boot),
and `general.example.json` stays as the schema reference — the seeder skips
`*.example.json` deliberately.

## Implementation status

Design is complete and the game is **playable end to end**. **M0 (skeleton), M1
(lobby & board fill) and M2 (core round loop) are shipped** — the repo is a Bun
workspaces monorepo (`apps/server`, `apps/client`, `packages/protocol`) beside
these docs. See `04-roadmap.md` for milestone status and `../CLAUDE.md` for the
command list and implementation notes. Next milestone: **M3 — Display & drama**.

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

## Conventions for new artifacts

- New design docs continue the numbered prefix (`08-…`) and get a row in the
  table above.
- Stay consistent with the phase machine and the settings table in 01; if a
  new idea changes rules or protocol, update 01/03 in the same change — no
  drift between artifacts.
- The v1 non-goals (02) and deliberately-deferred list (04) are intentional
  scope walls; don't design against them without flagging it.
