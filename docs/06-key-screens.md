# 06 — The two hard screens

The two screens where a phone layout can make or break the game: the **board
editor** (`board_fill`) and the **open floor** (`open_floor` / `last_call`).
Everything else in `05-ux-flow.md` is conventional; these two earn their own doc.

## Screen 1: Board editor

**Problem.** Get 25 names (+ up to 8 pool names) out of a player's head into a
grid, on a ~360 px phone, without it feeling like a tax form.

**Driving insight.** Writing names and placing names are different mental
activities — and position genuinely matters: the center cell sits on 4 potential
lines, corners on 3, edges on only 2. Flexible names (fit many topics) belong
center/corners; one-trick names belong on edges. The editor separates the two
activities instead of forcing a placement decision 25 times mid-brainstorm.

### Two modes

**Dump mode** *(default on entry)* — for the "who" activity:

- One big autofocused text input; type a name, hit enter → fills the next open
  slot, input clears, counter ticks ("14/25"). Rapid-fire entry.
- A segmented toggle **Own board / Pool** chooses where entries land. Default
  sequence is own board first, then pool — when the own board fills, the editor
  nudges and switches to pool — but the player can flip the toggle any time an
  idea belongs to the other bucket.
- Entries land in row-major order into open cells; placement is refined later
  in arrange mode.
- **Tapping a filled cell opens the edit sheet** — the same one arrange's pencil
  opens. Empty cells are inert here; they fill by typing. See the escape-hatch
  note below for why this is dump's job and not a violation of the split.

**Arrange mode** — for the "where" activity:

- Full-width 5×5 grid (+ pool slots below), names visible.
- **Drag-to-swap** (primary): strict swap-only — the dragged cell trades places
  with the cell it's released over. No reordering/reflow semantics; that's what
  keeps it stable.
- **Tap-tap-to-swap** (coexists; also the accessible path): first tap selects
  and slightly scales the cell up, second tap swaps with an animation. Tap the
  selected cell again to deselect.
- Edit/clear a single cell via its pencil affordance (opens a small edit sheet).

### Placement-setting interactions

- `sabotagePlacement: middleRow` (K = 5): row 3 renders locked-empty in both
  modes; dump mode counts to 20.
- `sabotagePlacement: random`, K > 0: the K cells left empty are themselves a
  strategic choice, made in arrange mode (empty cells are swappable like any
  other).

### Ready semantics

- A single **Ready** toggle, enabled once every required cell + pool slot is
  filled.
- Ready **freezes the editor** (board read-only, banner shows "waiting — 4/6
  ready").
- While the phase hasn't advanced, the player may un-ready to resume editing
  (matches `fill.setDone` toggleability in `03-protocol.md`).
- All ready → server auto-advances; host retains a force-start for stragglers.

*Committed with a playtest escape hatch: if real fills feel awkward, revisit the
mode split before polishing it.*

**Playtest #1 (2026-07-27) pulled that hatch.** A player expected to fix a typo
in **dump mode** and couldn't — dump was write-only, and editing an existing
name meant switching to arrange mode and tapping its pencil. The split was
*understood*; the write-only dump felt like a dead end mid-entry.

**Resolved 2026-07-29: dump mode edits in place, and the mode split stands.**
The decision turned on re-reading this section's own rationale. The split is
between *writing* names and *placing* them — and fixing a typo is writing. The
built version had drawn a stricter line than the rationale argues for
(append-only vs everything-else), so widening dump to in-place editing is more
faithful to the design than the original build was, not a retreat from it.

What dump still does **not** get is placement: no selection, no swap, no
reordering. That is the line that carries the meaning, and it is intact.

Implementation is deliberately small — `BoardEditor.svelte`'s grid tap routes
through one `activateCell()` that branches on mode, and the edit sheet
(`openEdit`/`saveEdit`) was already mode-independent, so nothing new was built.
Closing the sheet in dump mode returns focus to the dump input, so a typo fix
doesn't cost the player their place in a rapid-fire run.

**Known remaining gap:** pool chips are still hidden entirely in dump mode
(they render only in arrange, or once ready), so a *pool* typo has the same dead
end plus an invisibility problem. Deliberately left alone — K defaults to 0, so
no playtest has hit it yet. Fix it the same way if one does.

## Screen 2: Open floor

**Problem.** The screen players stare at for ~90% of the game. Six elements
compete for ~360×700 px: current topic, own board, proposal queue, House
status, propose/pass actions, and table resolution progress.

### Layout stack (portrait phone, top to bottom)

1. **Topic banner, pinned.** Round number, drawn number(s), topic text large —
   it's the question everyone is answering. Hosts the **House chip**: a compact
   dread indicator per `houseBoardVisibility` ("House: 2 away"); tap → full
   House board sheet. The House gets detail-on-demand, not permanent real estate.
2. **Stage strip.** One-line ticker: *"On stage: Nok — Gordon Ramsay"* + a
   queue-depth badge ("+2 waiting"); tap → full queue sheet. Empty state:
   "floor is open".
3. **Own board, the centerpiece.** Full 5×5 with names. Locked cells render
   daubed with their topic tag; near-complete lines get a subtle highlight.
   Tap a cell → bottom sheet: full name, lock tag if locked, **Propose** button
   when the cell is proposable.
4. **Action bar, pinned bottom.** Persistent **Pass** button + resolution count
   ("4/8 resolved"). The host-only force-advance materializes here when the
   round stalls (inline host controls, per `05`).

### Key interactions

- **Cell text fitting**: auto-shrink the name to a floor size, then truncate;
  the tap sheet always shows the full name. Rarely triggers at tablet widths+.
- **Propose**: cell sheet → Propose → enters the FIFO queue; your pending
  proposal is reflected in the stage strip.
- **On-stage takeover**: when *your* proposal reaches the queue front, a
  takeover sheet presents the name huge with **Confirm lock** (styled as the
  irreversible act it is) and **Withdraw**. Deliberately no board browsing
  behind it — the cell choice already happened; the argument is happening out
  loud.
- **Pass costs a confirm tap** ("Pass this round?") because pass is final for
  the round per `03-protocol.md`. Cheap insurance; passing isn't time-critical.
- `last_call` renders this same screen with final-round framing.

## Responsive behavior (both screens)

**Built 2026-07-29** (M5's responsive slice). See the implementation postscript
at the end of this section for the four things the build learned.

Principle: **breakpoints reveal, they don't add.** The same components and
information hierarchy exist at every size; larger screens merely inline what
phones put behind taps. No information appears on desktop that a phone can't
reach — the display-optional principle (`05`) is unaffected.

- **Portrait phone** — the baseline everything above describes.
- **Landscape phone** — two-pane grid: board left, sized to viewport height;
  right pane stacks topic banner, stage strip/queue, action bar.
- **Tablet / desktop** — board caps at a max width (~600 px, cells stay
  square); the freed space inlines the House board and the full proposal queue
  beside the board. Cell auto-shrink rarely engages at these widths.
- **Display view** stays landscape-first (`05`) and is unrelated to these
  player-view breakpoints.

### The rest of the player view

Settled 2026-07-23, when M5's responsive slice was scoped: the pass covers the
two hard screens above **and** the conventional ones — landing, lobby, board
editor and results. They are not designed here because they need no interaction
design, only a width constraint, but leaving them out of scope would defeat the
milestone's exit test.

The rule for all of them is the same and it is one line: **cap the content
column and centre it.** A form or a roster stretched across a 1440 px laptop is
precisely what "looks like a placeholder" means, and the lobby is the first
screen a desktop playtester ever sees. No new components, no reflow, no
information that a phone can't reach — the "breakpoints reveal, they don't add"
principle above applies unchanged.

### Implementation postscript (2026-07-29)

The client had no breakpoint utility at all before this, so the pass was
greenfield. It added exactly two custom variants (`lsphone`, `wide`) and one
utility (`content-col`) in `app.css`, and `RoundScreen.svelte`'s three layouts
as three grid definitions beside the Stage's.

- **The screens were already capped and centred at `max-w-md`** — the "one
  line" rule above was, in a sense, already satisfied. What was wrong was the
  *number*: a 448 px column on a 1440 px laptop trades "stretched" for "phone
  emulator in the middle of a monitor", which fails the same exit test from the
  other side. `content-col` widens one step to 34rem at tablet+; the visible
  effect is the board editor's cells going from ~80 px to ~100 px.
- **A grid area only works on a grid child.** The action bar was a *sibling* of
  the layout wrapper, so `grid-area: actions` silently did nothing and the
  landscape bar landed below the other-players list instead of in the right
  pane. It now lives inside the grid; in the two layouts where it is
  `position: fixed` it is out of flow and its area is simply never used.
- **`lsphone` and `wide` could both match, and the later rule won.** A
  1100x400 window is landscape, short, *and* wider than 64rem — which handed a
  400 px-tall viewport a 600 px board. `wide` now carries a `min-height` clause
  one pixel past `lsphone`'s ceiling, so the two are mutually exclusive by
  construction rather than by source order.
- **Tailwind's `@custom-variant` silently emits nothing for CSS range syntax.**
  `(height <= 30rem)` parses without error and generates no rule at all, so the
  class stays in the markup and never matches — a failure with no symptom
  except the thing not working. The legacy `max-height` spelling works. Worth
  knowing generally: a variant that produces no CSS looks exactly like a
  specificity problem.
- One consequence worth keeping in mind: the layout rules are **unlayered**,
  and Tailwind v4's utilities live in `@layer utilities`, so unlayered wins.
  That is what lets a media query switch off the markup's `sticky`, `-mx-4` and
  `pb-40` without `!important` or a pile of variants — and it also means
  anything set there beats a utility of the same name on the same element.
  Keep those rules to layout only.

Verified by measurement at 320x568, 390x844, 768x1024, 844x390, 1100x400,
1280x800 and 1440x900: correct layout at each, no horizontal scroll at any, and
at `wide` the pinned action bar's ends align to the grid (Pass under the board's
left edge, the resolved count under the aside's right edge). **Not** yet checked
by eye — that is the tier-2 solo pass, and it is what M5's exit test needs.
