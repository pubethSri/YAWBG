# 10 — The highlight reel & cheers

**Status: built (2026-07-24), both slices, at `PROTOCOL_VERSION` 5.** Designed
2026-07-23; implemented in one session rather than two, so `round.cheer` was
never actually live-in-schema-only. **Decision 3 was reversed the same day**,
after a full table's card proved unreadable: a card is now one *name*, not one
round, and that reshaped `ReelCard` (v4 → v5). This doc owns the reel's layout, the cheer
mechanic and the protocol they need; `07-design-system.md` still owns every
token and `03-protocol.md` carries the wire shapes this doc specifies. See the
**implementation postscript** at the end for what the build changed and what it
measured. **The 25-step manual test below passed on 2026-07-29** (tier 2 — a
solo pass against the written steps). The exit test is a different thing and
still needs a playtest: see `04-roadmap.md`'s ledger, and don't fold one into
the other.

## What it is

A fourth results stage. After the boards reveal, the display and every phone
land on a screen that says *"Wanna play more?"* (host) or *"Waiting for the
host…"* (everyone else) — and in the middle of it, a card rotates every few
seconds showing **one round's topic and one name somebody proposed for it**.

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

## Decision 3 — a card is a **pairing**: one name, by one person

**Reversed 2026-07-24, after seeing a full table's card on a real screen.** The
original decision made the card a *round* carrying every name proposed in it;
what that produced at twelve players was twelve rows shrinking toward an 14 px
floor with "+6 more" underneath — the joke was on screen and unreadable, which
is the one failure a reel cannot have. The reasoning that was wrong is kept
below, because the objection it raised is still live.

The unit is one **proposal**: the topic is the setup, one name is the punchline,
and the proposer is who said it out loud. A round that produced five names
produces five cards that repeat its topic — the setup is *meant* to be re-read
with each new punchline, and it means a card always stands alone when the loop
brings it back around.

```
        ┌─────────────────────────────────────┐
        │  ROUND 4   17  42                   │
        │  “A person who has cried on screen” │   ← Game voice, the setup
        │   ┌───────────────────┐             │
        │   │  Gordon Ramsay    │      ✷ 8    │   ← speech bubble; crowned
        │   └──▼────────────────┘             │
        │     (Ann)  LOCKED IT                │   ← proposer + outcome
        └─────────────────────────────────────┘
```

The speech bubble is not decoration: `07` assigns it to "proposal on stage —
*Nok proposes Gordon Ramsay*", which is exactly what a card now is. Its tail
points down at the proposer's badge, so the card reads as that person saying
that name without a word of connective copy.

**The objection this originally lost to, and where it stands.** One card per
pairing ranked globally by cheers reads as a leaderboard, and a leaderboard of
jokes is what the "no judging" pillar is nervous about. That risk is real and is
now *accepted*, on two grounds. First, the reel is a **sequence, not a list**:
the TV shows one card at a time and the phone swipes one at a time, so no two
cards are ever side by side, and no card carries a rank number. Second, the old
format was already ordering by cheers and already crowning a winner — the change
moves the ranking from "which round led" to "which name led", which is a
smaller step than it looks. **What would cross the line is showing a position**
("#1 of 15") or listing cards in a grid; neither is built, and neither should
be.

The zero-cheer case still works, which was the other half of the original
argument: a card with no cheers is "Ann said Gordon Ramsay for *a person who has
cried on screen*", which is a complete joke on its own.

**Cards sort by cheers descending, then by a stable hash.** Exactly one card in
the reel is *crowned* (starburst, per `07`'s sticker vocabulary), and only when
it has at least one cheer **and** is a strict maximum across the whole reel — no
crown for a three-way tie at one cheer, which would be noise rather than a
verdict. Every other card with cheers shows a plain outlined `★ n` chip, so the
crown stays the single loud thing on the screen.

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
- **Phone:** a swipeable stack with the same order, plus arrows. No auto-advance
  — a phone that flips cards while you are reading one is hostile, and it would
  drift out of step with the TV within a minute the same way the round countdown
  does.
- **Position indicator:** dots up to 12 cards, a plain `n / N` counter beyond
  that. One name per card means a full table produces dozens, and a row of forty
  dots is unreadable on a phone and invisible across a room.

**Card order is decided by the server** and shipped pre-sorted, so every surface
walks one sequence even when they are on different cards:

```
sort by  cheers DESC,
then by  fnv1a(proposalId) ASC
```

`proposalId` is unique within a game, so the tiebreak is total and no two cards
can compare equal. With cheers, the best-loved name leads — right for a looping
idle screen, where the first thing a newcomer sees should be the best one. With
no cheers at all the first key is constant and the hash gives a stable shuffle,
which is the
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

`ReelEntry` existed in the v4 draft, when a card held a list. Decision 3's
reversal folded it into `ReelCard` and deleted it, at `PROTOCOL_VERSION` **5**.

```ts
interface ReelCard {
  // The setup — repeated across every card of the same round, by design.
  round: number;
  topicText: string;
  drawnNumbers: number[];

  // The punchline — one name, by one person.
  proposalId: string;
  playerId: string;
  playerName: string;        // carried, not looked up — see edge cases
  name: string;
  outcome: 'locked' | 'withdrawn';
  cheers: number;
}

interface ResultsPayload {
  revealStage: 0 | 1 | 2 | 3;   // ③ = the reel
  winners: string[];
  boards: ResultsBoard[];       // [] until stage ①
  roundHistory: RoundHistoryEntry[];
  reel: ReelCard[];             // NEW — [] until stage ③, server-sorted
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
`ReelCard.cheers` at stage ③ and nowhere else — the set itself never goes on
the wire, so who cheered what is never published. That is deliberate: cheering
should cost nothing socially.

The game log (`GameLogSink`) persists the reel. **No new column** — it rides
inside the existing `results` JSON, which already stores the *unredacted*
`ResultsPayload` and so already carries stage-gated `boards`. (The design draft
called for a second column; that would have duplicated data the row already
holds, and left two copies free to disagree. Corrected at build time.)

**`resetForNewGame()` must clear the proposal records.** `CLAUDE.md` already
warns that a survivor there is a bug that only shows up in the *second* game of
a session; this is a new thing to forget.

## Edge cases

| Case | Behaviour |
|---|---|
| A round where everyone passed | No proposals, so **no card**. A topic with no names is not a joke |
| Game ends after one round | As many cards as that round had names; a single card means no rotation and no dots |
| Every card has zero cheers | Order falls back to the stable hash shuffle; no crowns anywhere |
| A player was removed mid-game (grace expiry) | The entry still renders — `playerName` is carried on the entry rather than looked up in `players`, precisely because the player may no longer be there |
| 12 players all proposing in one round | **Twelve cards**, not one crowded card — this is what reversed decision 3. The type never shrinks to fit a list, because there is no list |
| Thai names and topics | Same wrap and grapheme rules as everywhere; verify ascenders on the card at display sizes |
| A round with many names | Each gets its own card, so the reel gets long. Position shows as `n / N` past 12 cards rather than a row of dots |
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
- On the display at 1920×1080, 1920×900 and 1366×768, on every card in the
  reel: `document.documentElement.scrollHeight === clientHeight`, **and** the
  card's own rect inside the viewport, **and** every descendant's rect inside
  the card's. The page assertion alone is not enough — the screen is
  `overflow-hidden`, so it reported `true` while a card ran 63 px off the
  bottom.

### Manual test — numbered steps

**Passed 2026-07-29**, solo, all 25 steps including the two added at build time.
Tier 2 in `04-roadmap.md`'s three-tier scheme: it establishes that the reel and
the cheer mechanic *work and read correctly*. It is **not** evidence for M5.5's
exit test, which is an observation about a room and needs the friend group.

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
6. Confirm the withdrawn name gets **its own card** with a **WITHDRAWN** stamp,
   and that locked names carry their violet **LOCKED IT** tag.
7. Confirm the round where everyone passed has **no card**, and that a round
   with several names produced **one card each**, all repeating that round's
   topic and numbers.
8. Watch the display for a full loop. Cards change every ~10 s and the sequence
   repeats.
9. On a phone, swipe through the cards. Confirm the **order matches the
   display's**, even though the phone is on a different card, and that the
   position reads as dots (≤ 12 cards) or `n / N` (more).
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
21. Confirm the most-cheered name leads the reel and is the **only** card with a
    starburst; every other cheered card shows a plain outlined `★ n`. Confirm a
    two-way tie at the top leaves **no** crown anywhere.
22. Play a second game with **Play again**. Confirm no cheers, cards or
    proposals from the first game survive into the second.

**Added at build time**

23. On the phone at stage ③, use the **‹ › arrows** as well as the swipe, and
    confirm the dots track the card. The arrows exist because a swipe is
    unreachable on a desktop browser and by keyboard; both drive the same index.
24. With the game still on the open floor, confirm the cheer control on the
    stage strip is **disabled** while the name on stage is your own, and that
    the same is true for your own row in the "This round" sheet.
25. With 12 players all proposing in one round, confirm the reel has **twelve
    cards** for it rather than one crowded card, that each is readable from
    across the room, and that they carry the same topic and numbers.

## Implementation postscript (2026-07-24)

What the build learned, beyond what the design said.

- **Card order is computed on the server, not by each client.** The design
  specified "a pure function of the payload", which two implementations could
  satisfy and still drift. Sorting in `Room.buildReel()` and shipping `reel`
  pre-ordered makes the TV and the phone walk the same sequence by construction.
  The FNV-1a tiebreak still exists; it just lives in one place.
- **The whole display card is height-bound, and the `--text-d-*` ramp is not.**
  That ramp is vw-driven so the display scales with width, which is right for
  every other display surface. This card is a vertical stack on a screen that
  never scrolls, so at 1920×900 the ramp handed it the same 72 px topic it uses
  at 1920×1080 with 180 px less room. The card now runs a local unit,
  `--reel-u: min(1vw, 1.78vh)` — exactly 1vw at the 16:9 design target, falling
  back to height on anything shorter — and every size on it is a multiple of
  that. Same both-axes rule `Starburst` and the stage-② boards follow.
- **`overflow-hidden` makes an overflow invisible, not absent.** A 12-entry card
  ran 63 px past the bottom of a 1920×900 screen while
  `scrollHeight === clientHeight` still reported `true`. The no-scroll assertion
  in the verification list is necessary and **not sufficient**: also assert the
  card's own rect is inside the viewport, and that the last entry's rect is
  inside the list's.
- **A percentage `max-height` against an auto-height parent resolves to
  `none`.** The card's `max-h-full` silently did nothing while its wrapper was
  centred (and therefore content-sized), which is what let the overflow above
  happen. The wrapper stretches to a definite height and centres *inside* itself.
- **`app.ts` routes intents by an explicit `case` list with no `default`**, so a
  new intent that is schema-valid but unlisted is silently dropped — no error,
  no broadcast, and the client just sees nothing happen. `round.cheer` hit this.
  Worth knowing before adding the next intent.
- **The fix for a cramped card was a smaller card, not smaller type.** The first
  build answered "twelve names don't fit" with a shrinking type ramp, a 6-entry
  cap and a "+N more" tail — three mechanisms, all of them ways of apologising
  for the format. Making the card one name deleted all three: no cap, no
  overflow tail, no dense tier, and the name became the biggest thing on the
  screen instead of the smallest. See decision 3.

Verified by measurement after the decision-3 reversal: a 15-card reel from a
12-player game, at 1920×1080, 1920×900 and 1366×768, across rotations — no page
scroll, the card's rect inside the viewport, and **zero descendants overflowing
the card's box** on every card measured. The crowned card renders the starburst
and no plain chip; the rest render `★ n`. Cheer toggles verified through the
real UI including the disabled self-cheer, cheer-survives-withdrawal, and
restoration after a full page reload. Server-side coverage is in
`apps/server/test/reel.test.ts`, whose ordering test asserts a round-3 card
landing *between* two round-1 cards — an order per-round grouping could not
produce.
