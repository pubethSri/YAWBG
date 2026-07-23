# 09 — Display Stage: layout spec & the tabletop texture

**Status: built** (2026-07-23), as the first slice of M5. Designed in an earlier
session the same day; the spec below is what was implemented, with an
implementation postscript at the end recording the two things the build learned.
`07-design-system.md` owns the texture's *tokens and rules* — this doc owns the
*Stage layout*.

Scope wall: this is part of M5 pulled ahead of M4 (see `04-roadmap.md`). It is
a restyle. **No protocol change, no new wire type, no new server state.**
`PROTOCOL_VERSION` stays 2. Everything below is derived from `PublicRoomState`
fields that already ship.

## The problem being solved

M3 shipped the Stage structurally correct and visually sparse. Observed on a
1900×910 display at `open_floor`, round 1, two players, nothing proposed — the
**empty state**, which is what the TV shows for a large share of every game:

1. ~60% of the screen is dead space. The right pane's `1fr` row holds one short
   sentence.
2. The House board renders small — it is one of the *smaller* objects on a
   screen whose job is to make everyone watch it.
3. The dread chip ("4 away") is pinned to the bottom of the House column,
   separated from the board by that dead space, so it reads as unrelated.
4. The player strip is two small chips in the bottom-left corner — the least
   legible row on screen, despite being the "who are we waiting for" signal.
5. "The floor is open." is Slate Gray at 72 px. `07` restricts Slate Gray to
   helper copy; grey-on-cream as the largest element reads *disabled*, not
   *waiting*.
6. No sticker energy. Only `LAST CALL` rotates. `07` asks for game-night
   paraphernalia; the Stage is a rectilinear dashboard.

## Constraints that survive unchanged

Breaking any of these is a regression, not a restyle.

- **One persistent layout across `draw` / `open_floor` / `last_call`**
  (`05` locked decision #3). The House never moves between phases — that
  stability is *why* a hit lands where the room is already looking. Content
  inside a pane may change per phase; the frame may not.
- **Display-optional** (`05`): every public fact already has a first-class
  rendering on the phone. The display duplicates and dramatizes; it never owns
  information. Nothing below is TV-only.
- **The display never scrolls.** `h-dvh` + `overflow-hidden`; the called-number
  row stays height-capped so a long game clips its oldest numbers rather than
  squeezing the stage.
- **Read-only, no session.** The display never sends an intent.
- **Type ramp:** display sizes are the `--text-d-*` tokens. One new token is
  added below; it goes in the ramp and in `07`, not inline as px.
- **Banned pairs:** white-on-coral, white-on-aqua. The House hit is coral with
  **ink** text.
- **Motion:** `transform`/`opacity` only; colour fills may transition; one
  moving thing per screen; every keyframe set ends on the resting state.

## Decision 1 — the House sizes itself; it is not given a percentage

The House column changes from `minmax(0,38%)` to **`auto`**, and the board
becomes **height-bound** — `h-full aspect-square` rather than
`aspect-square max-h-full max-w-full` — so the column ends up exactly as wide as
the board is tall, and every pixel the board cannot use flows to the right pane.

**This corrects a wrong first instinct.** The obvious fix is "make the column
52%", and the arithmetic says that is a bug. On 1920×1080 the available height
leaves a board of roughly 730 px, which *is* 38% — the current split is already
near-optimal there, and widening the column would waste the extra width exactly
as it is wasted today. The reported problem appears at 1900×**910**, where the
same 38% column is ~722 px wide but only ~580 px tall: about 140 px of dead
horizontal space inside the House column, caused by the viewport's shape, not
by the percentage. A fixed percentage cannot be right for both. Auto-sizing is
right for every viewport, including ones nobody has tested on.

Clamp the board at **55% of the row width** so an extremely tall/narrow display
can't starve the right pane.

The House still gets meaningfully bigger, from reclaimed *vertical* space:
removing the bottom player strip (Decision 3) returns ~60–70 px of height, and
the board grows by that amount directly.

## Decision 2 — the dread chip docks to the board

Today the chip is pushed to the bottom of the column by the `flex-1` above it.
Board and chip move into one centred wrapper:

```
section (col)
  h2 "The House"
  div (flex-1, centred)
    div (col, items-center)      ← the wrapper
      div (h-full aspect-square) ← board
      div (dread row)            ← chip(s), width tracks the board
```

Because the wrapper centres its children, the chip row is as wide as its
content and sits directly beneath the board — a caption on the House rather
than an orphan in the corner. The panel's *shape* still never changes between
`full` / `progress` / `hidden`: same heading, same board slot, same dread line
in the same place. That invariant is the whole point of `HousePanel` and is
preserved.

## Decision 3 — the right pane becomes [stage object] over [waiting room]

Right pane rows go from `[minmax(0,1fr)_auto]` to
**`[auto_minmax(0,1fr)_auto]`**:

| Row | Content |
|---|---|
| `auto` | The stage object: starburst during `draw`, speech bubble when someone is on stage, nothing otherwise |
| `1fr` | **The waiting room** — one chip per player |
| `auto` | `CalledNumbers`, unchanged |

State by state:

- **Nothing proposed** — the stage row is empty and the waiting room takes the
  whole pane. This is the empty state that was ~60% dead; it now shows the room
  the one thing it actually wants to know.
- **Someone on stage** — the speech bubble sits on top, the waiting room beneath
  it. This replaces the `+{n} waiting to speak` string, which the chips say
  better and per-player.
- **Drawing** — the waiting room is **hidden** and the starburst owns the pane.
  The queue is empty and everyone is unresolved at that moment, so the chips
  would be a wall of identical "deciding" and nothing else; hiding them also
  keeps `07`'s one-moving-thing-per-screen rule honest during the showpiece.
  This is a content change *within* the persistent layout — the House does not
  move, so decision #3 in `05` holds.

### The waiting-room chip

A scaled-up, rotated `PlayerStrip` chip. Same data, same semantics, read from
across a room.

| State | Treatment |
|---|---|
| Still deciding (`!resolved`) | Paper White fill, 2 px Ink Black border |
| Resolved — proposed or passed | Aqua Pop fill, ink text |
| Proposal currently on stage | The die-cut ring |
| Disconnected | Mist Gray dot + "away", as today |

Retained from `PlayerStrip`: the yellow `BINGO` badge and the violet
lines-completed count.

**Queue members sort to the front, in queue order.** Position in the queue is
carried by placement, not by a badge or a colour — reading left to right *is*
reading the speaking order. This is what lets the chip fill stay at three
values.

**Coral is dropped from the strip.** Today a queued player gets a coral "on the
floor" chip. On the Stage, coral should mean exactly one thing — House
drama, the draw, `LAST CALL` — and a player waiting their turn is not urgency
in `07`'s sense. Removing it also keeps the composition inside the
four-sticker-colour cap.

> **Colour budget — no room for a fifth.** The Stage composition is violet
> (round badge, lines count), coral (House hit / starburst / `LAST CALL`), aqua
> (resolved chips) and yellow (die-cut ring, `BINGO` badge). That is exactly
> `07`'s max of four sticker colours in one composition. Anything new must
> replace one of these.

**Rotation: -7° to 7°**, deterministic from the player's index so it is stable
across every broadcast. This is a deliberate subset of `07`'s -15°/15° sticker
range: these chips are dense, adjacent and must stay scannable at 3 m, and at
full tilt a wrapped grid of them stops being readable. It is the sticker energy
the Stage is missing, applied to something load-bearing rather than to
decoration.

**Sizing: the box grows, the text doesn't.** Chips `flex-grow` to fill the pane,
so two players make large stickers and twelve wrap into a readable grid — but
the label stays at one size. Past ~40 px a longer name buys nothing in
legibility and costs wrapping, so the pane is filled by padding and box size,
not by type.

New ramp token, to be added to `app.css` **and** to `07`'s ramp table:

```css
--text-d-chip: clamp(20px, 2.08vw, 40px);   /* 40px at the 1920 design target */
```

## Decision 4 — three removals

- **"The floor is open." goes.** Not restyled — deleted. Once the pane shows who
  we are waiting for, the sentence is narration of something visible. This also
  removes the off-voice Slate-Gray-at-72px element rather than arguing about
  what colour it should be.
- **`{n}/{n} resolved` in the header goes.** The chips say it per-player.
- **`PlayerStrip` goes — from the Stage only.** It stays as-is on the lobby and
  fill screens. The Stage's outer grid drops from
  `[auto_minmax(0,1fr)_auto]` to `[auto_minmax(0,1fr)]`.

Both removed elements were Slate Gray, so the Stage ends with **zero Slate Gray**
— the right answer for a surface read from across a room, and consistent with
`07` reserving it for helper copy.

## Decision 5 — no wordmark on the Stage

The room code alone identifies the screen. The Stage's job is the game, not the
brand; `DisplayLobby` already does the branding while people are joining, which
is when a newcomer needs it. Every pixel of a TV is contested and the wordmark
earns none of it mid-round.

## The tabletop texture

Full spec — token, geometry, technique, the display's doubled tile, and the
contrast bounds — lives in **`07-design-system.md`** under "The tabletop
texture". Summary for implementers:

- `--color-tabletop-mark: #f0d0a8` — measured **1.25:1** against Cream Blush
  (a deliberate *ceiling*, not a floor) and **14.29:1** for ink over the mark.
- Round dots, orthogonal grid, 1.5 px radius on a 24 px pitch; inline SVG
  `data:` URI on `body`, declared **once**.
- The display shell overrides `background-size` to 48 px. Same SVG, same token.
- The mark hex is duplicated inside the `url()` because CSS variables do not
  interpolate there. Comment it.
- Nothing else re-declares it. Paper White surfaces occlude it by being opaque.
- The share-to-PNG export carries it at the base 24 px pitch.

## Verification expected of the implementer

- `bun run check` and `bun test` (62 tests at the time of the build) green. A
  styling pass should touch neither, so any change there is a signal, not a
  result.
- `document.documentElement.scrollHeight === clientHeight` on the display after
  every layout change, in all states below.

### Manual test — numbered steps

Run on a real display if possible; a browser at the stated sizes otherwise.
Serve over the LAN IP, not `localhost`, or the QR points a scanning phone at
itself.

**Setup**

1. `bun run build`, then `bun run dev:server`.
2. Open the display at `http://<LAN-IP>:3000/display/<CODE>` and two player
   tabs at `http://<LAN-IP>:3000/`.
3. Set the browser window to exactly **1600×900**. Repeat the whole run at
   **1920×1080**.

**The texture**

4. On a player phone, look at the cream canvas from normal reading distance.
   The dots should read as a faint grain. Confirm you are *not* tempted to
   count them, and that no dot sits visibly on top of any card, cell, sheet or
   speech bubble — those surfaces are opaque and must show clean white.
5. Stand ~3 m from the display. The texture must be *perceptible as texture*.
   If it has vanished, the display's 48 px override is not applying.
6. From 3 m, confirm the dot grid does not read as a countable lattice or as a
   border/structure. If your eye tries to parse it as a grid, the mark is too
   dark.
7. Read a block of body copy on the phone over the texture. It must feel exactly
   as legible as before.
8. Scan the lobby QR code with a phone. It must still resolve. The quiet zone
   must be clean white, with no dots inside it.

**The Stage — empty state**

9. Drive a game to `open_floor` with **2 players** and propose nothing.
10. The House board should be the largest object on screen. From 3 m, confirm
    you can read individual House numbers.
11. The dread chip ("N away") must sit directly under the board and read as
    belonging to it — not floating in a corner.
12. Two large, slightly rotated player chips fill the right pane. There should
    be no large empty region anywhere on screen.
13. Confirm the words "The floor is open." do **not** appear, and that there is
    no `n/n resolved` line in the header and no chip strip along the bottom.
14. Confirm nothing on screen is grey except a disconnected player's "away".

**The Stage — populated state**

15. Propose a name from one phone. A speech bubble appears above the waiting
    room; the proposing player's chip picks up the die-cut ring.
16. Propose from the second phone. Its chip moves ahead of any non-queued
    players and turns aqua; confirm the left-to-right order matches the actual
    speaking order.
17. Confirm no `+N waiting to speak` text appears anywhere.
18. Pass from a phone instead of proposing. That chip turns aqua too — passed
    and proposed both read as "resolved".
19. Force-advance to trigger a draw. During the ~2.5 s draw window the waiting
    room must be **hidden** and the starburst alone occupies the pane. The
    House must not move by a single pixel between the draw and the open floor.

**House visibility modes**

20. Repeat steps 9–12 with House visibility set to **`progress`**, then to
    **`hidden`**. The panel's heading, board slot and dread line must sit in the
    same places in all three modes.

**Edges**

21. Run a game with **12 players**. Chips must wrap into a readable grid with
    no overflow, no clipping and still no page scroll.
22. Set a topic and a proposal in **Thai**. Confirm the topic, the speech bubble
    and the chip labels all render Thai glyphs without clipping their ascenders
    or breaking the line height.
23. Play until `last_call`. Confirm `LAST CALL` still rotates and that the
    layout is otherwise identical.
24. Enable **reduced motion** at the OS level and repeat steps 15 and 19. Every
    element must land in exactly the same final position and colour as with
    motion on — only the transition is gone.
25. At both window sizes, run
    `document.documentElement.scrollHeight === document.documentElement.clientHeight`
    in the console. It must be `true` in every state above.

## Implementation postscript

Two things the build had to settle that the spec did not anticipate.

### The `auto` column is a container query, not `grid-template-columns: auto`

Decision 1 asks for a column exactly as wide as its board is tall. Literal
`auto` cannot do this: CSS resolves a grid track's width *before* the item's
height is known, so an `aspect-ratio: 1; height: 100%` board contributes its
text-based min-content width to track sizing and the column collapses.

The built version makes the Stage's body row a **size container**
(`.stage-body { container-type: size }`) and writes the column as

```css
grid-template-columns: min(55cqw, calc(100cqh - var(--stage-house-chrome))) minmax(0, 1fr);
```

which is the same intent expressed in terms the browser can resolve: the row's
height is externally definite, so the board's size is too. `--stage-house-chrome`
is the panel's heading plus its dread row plus two gaps — and those two elements
are *given* fixed heights (`--stage-house-head`, `--stage-house-dread`) rather
than measured, which makes the subtraction exact by construction and, as a
bonus, hard-enforces the "the panel's shape never changes between visibility
modes" invariant. An element is never its own container, which is why the body
row and the column grid are two elements rather than one.

Because the column is the smaller of the two constraints, the board is
**width-bound** (`w-full aspect-square`) in both branches — the height-bound
`h-full` the spec suggested would overflow horizontally when the 55% clamp wins.

Measured after the build, board width × height vs. column width:

| Viewport | Column | Board | Dead space in the column |
|---|---|---|---|
| 1920×1080 | 729px | 729×729 | 0px (was ~0 at this size) |
| 1900×910 | 572px | 572×572 | 0px (**was ~121px**) |
| 1366×768 | 537px | 537×537 | 0px |

### The House does move between *rounds* — and that is not the invariant

Step 19's "not by a single pixel" holds exactly: draw → open floor within one
round measures `dx/dy/dw/dh = 0`. But the House does resize by ~24px *across* a
round boundary, because the topic sits in the header and a topic that wraps to a
second line makes the header taller, which shortens the body row, which is now
what the column width is derived from.

This is accepted, not a defect. The board already resized this way before the
rebuild (it was `max-h-full`); what is new is that the right pane's width moves
with it. It happens on the exact frame where the topic slams in and the
starburst plays, so nothing about it is legible as motion. Fixing it would mean
reserving two lines of topic height permanently, which costs real board size on
every single-line topic — a worse trade. Revisit only if a playtester notices.
