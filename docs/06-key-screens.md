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
