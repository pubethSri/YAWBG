# 10 — The highlight reel & cheers

**Status: designed, not built.** Written in a design session (2026-07-23) for
implementation in the next session. This doc owns the reel's layout, the cheer
mechanic and the protocol they need; `07-design-system.md` still owns every
token and `03-protocol.md` carries the wire shapes this doc specifies.

## What it is

A fourth results stage. After the boards reveal, the display and every phone
land on a screen that says *"Wanna play more?"* (host) or *"Waiting for the
host…"* (everyone else) — and in the middle of it, a card rotates every few
seconds showing **one round's topic and the names people proposed for it**.

The point is the pairing. A topic and a name that should never have been said
together is the funniest artifact the game produces, and right now the game
throws most of them away: only *locked* names survive to results, and a name
that got laughed at and then withdrawn leaves no trace at all.

Two halves, built in that order:

1. **The reel** — cards built from every proposal, locked and withdrawn alike,
   ordered deterministically.
2. **Cheers** — any player can cheer any name proposed this round. Cheer counts
   are hidden until the reel, where they order the cards and crown the winner.

## The scope wall, and why this clears it

`02-architecture.md` lists *"No in-app voting/judging — the table judges"* among
the v1 non-goals, and `01-game-design.md` says *"There is no in-app voting in
v1 — the social contract is the mechanism."* Both walls are about **who decides
whether a name is accepted**. A cheer decides nothing: it does not gate a lock,
does not enter a score, and is not visible while the decision is being made.

That last clause is the load-bearing one. **A live cheer counter would recreate
exactly what the wall forbids** — the room would read "8 cheers" as the table
having spoken, and the app would have become the judge through the back door
while technically changing no rule. So the tally is hidden until the reel, and
that is not a polish choice that can be relaxed later without re-opening this
decision. See Decision 5.

The wall stands unchanged: nothing here affects whether a name locks.

## Decision 1 — a fourth reveal stage, and it owns *Play again*

`revealStage` goes from `0 | 1 | 2` to `0 | 1 | 2 | 3`, driven by the existing
host-only `results.advance`. Stage ③ is terminal.

**`game.playAgain` moves to stage ③.** Today it is reachable at stage ②, which
means a host who is ready in five seconds ends the game before anyone sees the
second card. Making the reel the screen that also holds the button means the
host stays on it for exactly as long as the room is still laughing, which is
the correct pacing mechanism and requires no timer.

Share-to-PNG stays available on **both** ② and ③ — it is per-player, harmless,
and a player who thinks of it late shouldn't have to go back.

Stage ③ is never skipped. Even a game with one usable card gets it, because it
is also the play-again screen.

## Decision 2 — they are **cheers**, not likes

The mechanic is called a *cheer*; the control is a Lucide `star` in the sticker
vocabulary, and the reel's winner is the **crowd favourite**.

This is not decoration. "Like" imports social-media semantics, and in a game
whose central pillar is *the app never judges* it reads as "I agree this name
fits the topic" — the precise meaning the design must not carry. "Cheer" is
applause for a bit that landed. It can be given to a name that was obviously
wrong for the topic, which is the entire joke.

## Decision 3 — a card is a **round**, not a pairing

The unit is one round: the topic is the setup, the names are the payoff.

```
        ┌─────────────────────────────────────┐
        │  ROUND 4  ·  17, 42                 │
        │                                     │
        │  “A person who has cried on screen” │   ← Game voice, large
        │                                     │
        │   Gordon Ramsay        Ann   ★★★    │   ← crowned entry
        │   สมชาย                 Bee  WITHDRAWN │
        │   Napoleon             Chai         │
        └─────────────────────────────────────┘
```

Rejected alternative: one card per (topic, name) pairing, ranked globally by
cheers. It reads as a leaderboard, and a leaderboard of jokes is the thing the
"no judging" pillar is nervous about. Grouping by round also means the card
still works with zero cheers — it degrades to "here's what round 4 produced",
which is exactly the reel's first half.

**Entries sort by cheers descending, then by the order they were proposed.** An
entry is *crowned* (starburst, per `07`'s sticker vocabulary) only when it has
at least one cheer **and** is a strict maximum on that card — no crown for a
three-way tie at one cheer, which would be noise rather than a verdict.

## Decision 4 — the cheer window is the whole round

A player may cheer **any name proposed in the current round**, from the moment
it is proposed until the round advances. Not just the name currently on stage.

The alternative — cheering only during the on-stage window — was rejected on
arithmetic: a proposer who confirms in two seconds gives the room no time, so
the reel would systematically over-represent names that got argued over and
under-represent the ones that were so obviously funny nobody contested them.
That is backwards.

Crucially, **a withdrawn name stays cheerable for the rest of the round.**
Withdrawal is often the moment the joke lands — the name gets pulled *because*
the table rejected it, and that is when people want to applaud it.

### Where the control lives

The open floor is already the most crowded screen in the game
(`06-key-screens.md` opens by saying so), so the cheer control adds **no new
permanent real estate**:

- **The stage strip** gains a cheer toggle at its right end, acting on the name
  currently on stage. One tap, ≥44 × 44 px hit area per `07`.
- **The queue sheet** — which already exists behind a tap on that strip — is
  re-framed as **"This round"** and lists every proposal made this round,
  live, locked and withdrawn, each with its own cheer toggle.

The button renders **only your own state** (cheered / not cheered). There is no
number anywhere on this screen.

You cannot cheer your own proposal; the control renders disabled on your own
entries, and the server rejects it regardless.

## Decision 5 — the tally is hidden until stage ③, across three channels

This is the decision the whole feature hangs on, and it needs three different
channels to hold:

| Fact | Channel | Why |
|---|---|---|
| Which proposals exist this round | `PublicRoomState.round.proposals` — public | The names are *already* public: `03`'s `Proposal` is documented as "public the moment it's proposed", the sole sanctioned exception to the public/private split. Keeping withdrawn ones exposes nothing new |
| Which of them **I** have cheered | `PrivateBoard.cheeredProposalIds` — owner socket only | Needed so the toggle survives a reconnect. It rides the existing per-socket private frame rather than inventing per-recipient redaction of the public one |
| How many cheers each has | `ResultsPayload.reel` — **`[]` until `revealStage === 3`** | The same gate `boards` uses at stage ①. One redaction point, one code path |

Client-local memory was rejected for the middle row: a phone that reconnects
mid-round would forget what it had cheered and let the player double-cheer, and
the private frame already exists for precisely this class of fact.

Per-recipient redaction of the public frame stays rejected for the same reason
`03` invariant 11 gives — that frame also feeds the display.

**Open risk for the playtest.** A cheer with no visible feedback beyond your own
button may feel like shouting into a void. The obvious fix — a sticker popping
on the display as cheers arrive — was considered and *not* taken, because
publishing the timing of cheers during a live argument is most of the way to
publishing the verdict. If the playtest says cheering feels inert, the fix to
reach for first is making the *reel* land harder, not leaking the tally
earlier.

## Decision 6 — withdrawn names are first class; outcome is a stamp

Every proposal is recorded with a terminal outcome and both render on the card:

| Outcome | Treatment |
|---|---|
| `locked` | Electric Violet chip with the lock tag, matching the board's daub |
| `withdrawn` | A coral diagonal label reading **WITHDRAWN**, rotated per `07`'s sticker vocabulary |

There is no third terminal outcome, and that falls out of the existing rules
rather than being a simplification: a round only advances when every player is
resolved, `pass` implicitly withdraws a live proposal (`03`), and
`forceAdvance` auto-withdraws a stalled one. So by the time a round ends,
every proposal in it is locked or withdrawn. If that ever stops being true, this
table needs a third row before the reel ships.

The label is **WITHDRAWN**, not "REJECTED" — it states what happened, and the
app does not get to characterise the table's reasoning.

## Decision 7 — the TV rotates, the phone swipes

Same data, two affordances, and it removes a synchronisation problem rather
than solving one.

- **Display:** auto-advances every **10 s**, looping. Cross-fade plus a change
  of tilt; `transform`/`opacity` only, one moving thing on screen, and the
  keyframes end on the resting state so `prefers-reduced-motion` collapses to an
  instant swap that lands identically (`07`).
- **Phone:** a swipeable stack with the same order, plus dots. No auto-advance —
  a phone that flips cards while you are reading one is hostile, and it would
  drift out of step with the TV within a minute the same way the round countdown
  does.

**Card order is a pure function of the payload**, so every surface agrees on the
sequence even when they are on different cards:

```
sort by  (max cheers on the card) DESC,
then by  fnv1a(topicText + round) ASC
```

With cheers, the funniest round leads — right for a looping idle screen, where
the first thing a newcomer sees should be the best one. With no cheers at all
the first key is constant and the hash gives a stable shuffle, which is the
"pick a random round" behaviour the reel needs in its first half. One rule
serves both halves.

## Decision 8 — one protocol version, two build slices

`PROTOCOL_VERSION` goes **3 → 4**, once, carrying the complete shape below.
Slice 1 implements the reel; slice 2 implements cheers.

This means `round.cheer` will sit in the schema, validated and rejected by
`Room`, before it does anything. That is the exact trap `CLAUDE.md` records
from M4 — a schema'd-but-unimplemented intent cost a session's planning time
when a later reader assumed it was live. So it is written down here loudly:

> **Slice 1 ships `reel` with every `cheers` field at `0` and
> `cheeredProposalIds` always empty. `round.cheer` is not accepted until slice 2.
> The milestone is not done until both have shipped.**

The alternative — bumping to 4 and then 5 — costs two client-compat breaks for
one feature, on a protocol whose version test asserts a literal on purpose.

## Protocol changes

All of these go in `packages/protocol`; `03-protocol.md` is updated in the same
change.

### Changed: `Proposal` gains an id

```ts
interface Proposal {
  id: string;            // NEW — server-assigned, unique within the game
  playerId: string;
  cellIndex: number;
  name: string;
}
```

`(playerId, cellIndex)` is *not* a safe key: a player may withdraw and re-propose
the same cell in the same round, which would collide.

### Changed: `RoundState` carries every proposal, not just the live queue

```ts
round: {
  number: number;
  drawnNumbers: number[];
  allDrawn: number[];
  topic: { id: string; text: string } | null;
  queue: Proposal[];        // unchanged — FIFO of *live* proposals, [0] is on stage
  proposals: {              // NEW — everything proposed this round, in order
    proposal: Proposal;
    outcome: 'live' | 'locked' | 'withdrawn';
  }[];
}
```

No cheer counts here. Cleared with the round.

### Changed: `PrivateBoard` carries my cheers

```ts
interface PrivateBoard {
  cells: PrivateCell[];
  poolSlots: (string | null)[];
  cheeredProposalIds: string[];   // NEW — current round only
}
```

### Changed: `ResultsPayload` gains the reel

```ts
interface ReelEntry {
  proposalId: string;
  playerId: string;
  playerName: string;        // carried, not looked up — see edge cases
  name: string;
  outcome: 'locked' | 'withdrawn';
  cheers: number;
}

interface ReelCard {
  round: number;
  topicText: string;
  drawnNumbers: number[];
  entries: ReelEntry[];
}

interface ResultsPayload {
  revealStage: 0 | 1 | 2 | 3;   // ③ = the reel
  winners: string[];
  boards: ResultsBoard[];       // [] until stage ①
  roundHistory: RoundHistoryEntry[];
  reel: ReelCard[];             // NEW — [] until stage ③
}
```

`roundHistory` and `reel` overlap on locked names. That duplication is
deliberate: `roundHistory` is the always-public record and `reel` is the gated
one, and collapsing them would put a gated field inside an ungated structure —
exactly the shape invariant 11 exists to avoid.

### New: `round.cheer`

| Type | Payload | Notes |
|---|---|---|
| `round.cheer` | `{ proposalId: string; on: boolean }` | Toggle a cheer. `open_floor` / `last_call` only; proposal must belong to the **current** round; self-cheer rejected |

`on` is explicit rather than a toggle so the intent is idempotent — a retry
after a flaky send can't silently un-cheer.

### New server-side invariants

Appended to `03-protocol.md`'s list:

13. `round.cheer`: current round only, `open_floor`/`last_call` only, never on
    your own proposal, at most one cheer per (player, proposal). Cheers survive
    the proposal being withdrawn, and are cleared when the round advances only
    in the sense that no *new* cheers are accepted — the counts persist into the
    reel.
14. **`revealStage` gates `reel` exactly as it gates `boards`.**
    `results.reel` is `[]` while `revealStage < 3`, on every socket including
    displays. Cheer counts are the surprise; leaking them early spoils the same
    way the authorship roast does.

## Server state

`Room` gains one record, server-only until stage ③:

```ts
interface ProposalRecord {
  id: string;
  round: number;
  playerId: string;
  playerName: string;
  cellIndex: number;
  name: string;
  outcome: 'live' | 'locked' | 'withdrawn';
  cheeredBy: Set<string>;      // playerIds — never leaves the server as a set
}
```

Kept for the whole game, keyed by round. `cheeredBy.size` becomes
`ReelEntry.cheers` at stage ③ and nowhere else — the set itself never goes on
the wire, so who cheered what is never published. That is deliberate: cheering
should cost nothing socially.

The game log (`GameLogSink`) persists the reel alongside the existing payload —
one more JSON column, same flat-row approach `GameLog.ts` already argues for.

**`resetForNewGame()` must clear the proposal records.** `CLAUDE.md` already
warns that a survivor there is a bug that only shows up in the *second* game of
a session; this is a new thing to forget.

## Edge cases

| Case | Behaviour |
|---|---|
| A round where everyone passed | No proposals, so **no card**. A topic with no names is not a joke |
| Game ends after one round | One card, no rotation, dots hidden |
| Every card has zero cheers | Order falls back to the stable hash shuffle; no crowns anywhere |
| A player was removed mid-game (grace expiry) | The entry still renders — `playerName` is carried on the entry rather than looked up in `players`, precisely because the player may no longer be there |
| 12 players all proposing on one card | Entries scale their type down to a floor, then cap with "+N more" — the same rule settled for the display's stage-① roast grid |
| Thai names and topics | Same wrap and grapheme rules as everywhere; verify ascenders on the card at display sizes |
| Reconnect mid-round | `cheeredProposalIds` arrives on the private frame, so the toggles restore. This is why it is not client-local |
| A player cheers, then the proposer withdraws | The cheer stands. This is the feature, not a leak |

## What this feature is *not*

- **Not a score.** Cheers never touch `linesCompleted`, `hasWon` or `winners`.
- **Not a judgement.** No cheer count is visible while any decision is live.
- **Not remote play.** The wall in `02` about in-app voting for fully-remote
  games is untouched; that is still a possible future mode and still not v1.
- **Not a new surface.** The reel is a stage of an existing screen on both the
  phone and the display.

## Verification expected of the implementer

- `bun test` and `bun run check` green. The protocol version test **will** fail
  on the bump — `packages/protocol/test/protocol.test.ts` asserts the literal on
  purpose; update it deliberately, in the same commit.
- New server tests, in the style of the existing round-loop tests: cheer
  accepted / self-cheer rejected / cheer on a previous round's proposal rejected
  / cheer survives withdrawal / `reel` is `[]` below stage ③ and populated at ③ /
  `playAgain` clears the records.
- `document.documentElement.scrollHeight === clientHeight` on the display at
  1920×1080, 1920×900 and 1366×768, on every card in the reel — the card is a
  new full-height object on a screen that never scrolls, and a long card with 12
  entries is exactly the shape that has broken this twice before.

### Manual test — numbered steps

**Setup**

1. `bun run build`, then `bun run dev:server`. Serve over the LAN IP, not
   `localhost`.
2. Three players and a display. Set `drawsPerRound: 3` and a small
   `houseBingoTarget` so the game reaches results in a few rounds.

**The reel (slice 1)**

3. Play a full game. In at least one round, have a player propose a name and
   then **withdraw** it. In at least one round, have everyone pass.
4. At results, advance to stage ③. Confirm the screen reads "Wanna play more?"
   on the host's phone and "Waiting for the host…" on the others.
5. Confirm **Play again** appears here and *not* on stage ②, and that **Share**
   is still reachable on both.
6. Confirm the withdrawn name appears on its round's card with a **WITHDRAWN**
   stamp, and that the locked names carry their violet lock tags.
7. Confirm the round where everyone passed has **no card**.
8. Watch the display for a full loop. Cards change every ~10 s and the sequence
   repeats.
9. On a phone, swipe through the cards. Confirm the **order matches the
   display's**, even though the phone is on a different card.
10. Set a topic and a proposal in **Thai**. Confirm the card renders Thai glyphs
    without clipping ascenders, at display sizes and on the phone.
11. Enable **reduced motion** and repeat step 8. Cards still change every ~10 s;
    only the cross-fade is gone, and each card lands in exactly the same
    position and tilt.
12. At 1920×1080, 1920×900 and 1366×768, run
    `document.documentElement.scrollHeight === document.documentElement.clientHeight`
    on every card. It must be `true`.

**Cheers (slice 2)**

13. During an open floor, cheer the name currently on stage from the stage
    strip. Confirm the button reflects *your* state and that **no number appears
    anywhere** — not on your phone, not on any other phone, not on the display.
14. Open the "This round" sheet. Confirm it lists live, locked and withdrawn
    proposals, each with its own cheer toggle.
15. Cheer a name, then have its proposer **withdraw** it. Confirm you can still
    cheer it, and that an existing cheer is not lost.
16. Try to cheer **your own** proposal. The control must be disabled, and the
    server must reject the intent if you send it anyway.
17. Cheer twice from the same phone. The count at results must be 1.
18. Reload a phone mid-round. Confirm the cheers you had given are still shown
    as given.
19. Advance the round, then try to cheer a proposal from the previous round via
    devtools. The server must reject it.
20. At results, confirm cheer counts are **absent** from the payload at stages
    ⓪–② (check the network frame, not just the render) and present at ③.
21. Confirm the card with the most-cheered name leads the reel, and that its top
    entry is crowned. Confirm a card whose top two entries tie has **no** crown.
22. Play a second game with **Play again**. Confirm no cheers, cards or
    proposals from the first game survive into the second.
