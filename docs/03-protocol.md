# 03 — Protocol

Blueprint for `packages/protocol`. Every message and shape below becomes a zod
schema; TypeScript types are derived with `z.infer`. The server validates every
inbound frame with `safeParse` and replies `error` on failure. **No wire type is
ever declared outside the protocol package.**

## Conventions

- Envelope: `{ "type": string, "payload": object }`, JSON over one WS endpoint.
- `PROTOCOL_VERSION` exported constant; client sends it on join/resume, server
  rejects mismatches (prevents stale-tab weirdness after deploys).
- Server → client state is **full-snapshot**, not diffs.
- IDs: `playerId` = nanoid; `code` = 4 uppercase letters; cells indexed `0–24`
  (row-major, row 3 = indices 10–14).

## Client → server intents

### Session

| Type | Payload | Notes |
|---|---|---|
| `room.create` | `{ playerName, protocolVersion }` | Creator becomes lobby host. Reply: `session.created` + state |
| `room.join` | `{ code, playerName, protocolVersion }` | Joinable during `lobby` only |
| `display.join` | `{ code, protocolVersion }` | Read-only; receives public state only; any further intent from a display socket → `error` |
| `session.resume` | `{ code, playerId, token, protocolVersion }` | Reclaim seat within grace window; full resync |
| `room.leave` | `{}` | Voluntary leave = immediate removal (no grace) |

### Lobby (host-only where marked ★)

| Type | Payload | Notes |
|---|---|---|
| `lobby.updateSettings` ★ | `{ settings: Partial<Settings> }` | Validated against `SettingsSchema`; broadcast on change |
| `lobby.start` ★ | `{}` | Requires ≥ 2 connected players; locks settings; → `board_fill` |

### Board fill

| Type | Payload | Notes |
|---|---|---|
| `fill.writeCell` | `{ cellIndex, name }` | Own board; `middleRow` placement rejects indices 10–14 when K = 5 |
| `fill.clearCell` | `{ cellIndex }` | |
| `fill.writePool` | `{ slot, name }` | `slot: 0..K-1`; player's pool contributions |
| `fill.setDone` | `{ done: boolean }` | Toggleable until distribution. Server auto-advances (`distribute` or first `draw`) when all players are done; host may also start early via `lobby.start`-style ★ `fill.forceStart` for stragglers |

### Round loop

| Type | Payload | Notes |
|---|---|---|
| `round.propose` | `{ cellIndex }` | Cell must be `filled` (not locked); one live proposal per player; enqueued FIFO |
| `round.confirm` | `{}` | Own queued proposal only → cell **locks** with tag `{ round, drawnNumber, topicId, topicText }`; marks player resolved |
| `round.withdraw` | `{}` | Own proposal; name stays free; player may re-propose or pass this round |
| `round.pass` | `{}` | Marks player resolved (= ready). Revocable until round advances? **No** — pass is final for the round (keeps advance logic simple) |
| `round.forceAdvance` ★ | `{}` | Host skips unresolved players (they auto-pass); also auto-withdraws a stalled pending proposal |
| `round.cheer` ✎ | `{ proposalId, on }` | Applaud any name proposed **this** round, withdrawn ones included. Never your own; at most one per (player, proposal); `on` is explicit so a retry is idempotent. **No count is public until `revealStage` 3** — see `10-highlight-reel.md` |

✎ marks a **designed, not yet implemented** intent (protocol v4). It is in the
schema and rejected by `Room` until the reel milestone's second slice lands.
The ★/✎ distinction matters: ★ means *host-only*, ✎ means *not live yet*.
Assuming ★ meant "unimplemented" cost a session's planning time once already.

Round auto-advances to the next `draw` when **every** player is resolved —
including disconnected ones, who are treated as not-yet-resolved per the
edge-case table in `01-game-design.md`. A brief drop must not silently spend a
player's round; the host's `forceAdvance` is the designed escape hatch, and grace
expiry auto-PASSes on removal. Optional `roundTimerSec` fires a server-side
auto-advance identically to `forceAdvance`.

`confirm` requires only that the proposal is yours, **not** that it is at the
queue front. Front-of-queue is a UX pacing device (`06-key-screens.md`'s on-stage
takeover); enforcing it server-side would deadlock the room whenever the front
proposer drops. `pass` implicitly withdraws a live proposal, so no card is left
stranded on the display's stage.

### Post-game

| Type | Payload | Notes |
|---|---|---|
| `results.advance` ★ | `{}` | Advances the synchronized results reveal (`revealStage`); see `05-ux-flow.md` |
| `game.playAgain` ★ | `{}` | Same lobby, same settings, fresh boards → `board_fill` |
| `state.request` | `{}` | Explicit resync (client watchdog after suspected drop) |

## Server → client messages

| Type | Audience | Payload |
|---|---|---|
| `session.created` | Joining socket | `{ code, playerId, token }` (also on `room.join`) |
| `room.state` | Everyone in room | `PublicRoomState` (full snapshot, on every change) |
| `player.board` | Owner only | `PrivateBoard` (on own-board change and on resync) |
| `error` | Offending socket | `{ code: ErrorCode, message }` — e.g. `BAD_MESSAGE`, `WRONG_PHASE`, `NOT_HOST`, `CELL_LOCKED`, `ALREADY_RESOLVED`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `VERSION_MISMATCH`, `SESSION_INVALID` (bad/expired resume token), `NAME_TAKEN`? (no — duplicate player display names get a numeric suffix instead) |

Everything renderable (proposal queue changes, House hits, phase transitions,
bingo events) is *derived from consecutive `room.state` snapshots* — no separate
event messages in v1. Clients may diff snapshots locally purely for animations
(e.g. flash a new House hit).

## State shapes

```ts
type Phase = 'lobby' | 'board_fill' | 'distribute'
           | 'draw' | 'open_floor' | 'last_call' | 'results';

interface Settings {
  numberPoolSize: 75 | 100;
  drawsPerRound: 1 | 2 | 3;
  houseFreeCenter: boolean;
  houseBingoTarget: 1 | 2;
  houseBoardVisibility: 'full' | 'progress' | 'hidden';
  sabotageCells: number;          // 0–8 (K)
  sabotagePlacement: 'random' | 'middleRow';   // middleRow ⇒ K must be 5
  playerLinesToWin: 1 | 2 | 3;
  roundTimerSec: number | null;
  lastCall: boolean;
  deckIds: string[];
}

type PublicCell =
  | { status: 'empty' }
  | { status: 'filled' }                       // name hidden
  | { status: 'locked'; name: string; tag: LockTag };  // presented publicly

interface LockTag { round: number; drawnNumber: number;
                    topicId: string; topicText: string; }

interface PublicPlayer {
  id: string; name: string;
  connected: boolean;
  isHost: boolean;
  fillDone?: boolean;                 // board_fill only
  resolved?: boolean;                 // open_floor: confirmed-or-passed
  board: PublicCell[];                // 25
  linesCompleted: number;
  hasWon: boolean;                    // linesCompleted ≥ playerLinesToWin
}

// `id` is server-assigned and unique for the game: (playerId, cellIndex) is NOT
// a safe key, because a player may withdraw and re-propose the same cell in one
// round. Added in v4 for the reel (`10-highlight-reel.md`).
interface Proposal { id: string; playerId: string; cellIndex: number;
                     name: string; }  // name is public the moment it's proposed

type HousePublic =
  // board: 25 entries, null at index 12 when freeCenter (a real bingo card
  // prints FREE there). hits: cell INDICES, not numbers — directly renderable,
  // and allDrawn already carries the numbers. bestLineNeeds ships in `full` too
  // so the House chip reads the same in every mode.
  | { mode: 'full'; board: (number | null)[]; freeCenter: boolean;
      hits: number[]; linesCompleted: number; bestLineNeeds: number }
  | { mode: 'progress'; bestLineNeeds: number; linesCompleted: number }
  | { mode: 'hidden' };

interface PublicRoomState {
  protocolVersion: number;
  code: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  house: HousePublic | null;         // null before the round loop (K=0 skips distribute)
  round: {
    number: number;
    drawnNumbers: number[];          // this round (length = drawsPerRound)
    allDrawn: number[];              // whole game, for the display's called-number board
    topic: { id: string; text: string } | null;
    queue: Proposal[];               // FIFO of *live* proposals; index 0 is "on stage"
    // v4: everything proposed this round, in the order made — withdrawn ones
    // included, so they can still be cheered and still reach the reel. Carries
    // no cheer counts. Cleared with the round.
    proposals: { proposal: Proposal;
                 outcome: 'live' | 'locked' | 'withdrawn' }[];
  } | null;
  results: ResultsPayload | null;    // phase === 'results'
}

interface PrivateCell {
  name: string | null;
  fromPool: boolean;                 // author hidden until results
  locked: LockTag | null;
}
interface PrivateBoard {
  cells: PrivateCell[];
  poolSlots: (string | null)[];
  // v4: which proposals *I* have cheered this round. On the private frame, not
  // client-local, so a reconnect can't let a player cheer the same name twice —
  // and not on the public frame, which also feeds the display.
  cheeredProposalIds: string[];
}

interface ResultsPayload {
  revealStage: 0 | 1 | 2 | 3;  // host-paced: ⓪ winners → ① pool authorship
                               // → ② boards + share → ③ the reel (v4)
                               // boards is [] below ①, reel is [] below ③ —
                               // the stage gates the wire, see below
  winners: string[];                                  // playerIds
  boards: { playerId: string;
            cells: { name: string; authorId: string | null;  // null = self
                     locked: LockTag | null }[] }[];
  roundHistory: { round: number; drawnNumbers: number[];
                  topicText: string;
                  locks: { playerId: string; name: string;
                           cellIndex: number }[] }[];
  // v4. Overlaps roundHistory on locked names deliberately: roundHistory is the
  // always-public record, reel is the gated one, and merging them would put a
  // gated field inside an ungated structure. `playerName` is carried rather
  // than looked up because a player removed at grace expiry is no longer in
  // `players`.
  reel: { round: number; topicText: string; drawnNumbers: number[];
          entries: { proposalId: string; playerId: string; playerName: string;
                     name: string; outcome: 'locked' | 'withdrawn';
                     cheers: number }[] }[];
}
```

## Server-side invariants (enforced in `Room`, not trusted from clients)

1. One live proposal per player; proposals only in `open_floor` / `last_call`.
2. `confirm`/`withdraw` only by the proposal's owner (ownership, not queue position).
3. A locked cell can never change again.
4. One lock per player per round (a confirm resolves the player).
5. Pool distribution: round-robin offset ⇒ no player receives own contribution;
   every player receives exactly K.
6. Deck pile reshuffles used topics when empty.
7. House bingo check runs after each draw batch; on target met → `last_call`
   (if enabled) else `results`.
8. Displays cannot mutate anything.
9. Intents from disconnected/removed players are dropped.
10. `results.advance`: host-only, `results` phase only, stages advance
    monotonically; when K = 0 the authorship stage (①) is skipped.
11. **`revealStage` gates the wire, not just the render.** `results.boards` is
    `[]` while `revealStage` is 0, on every socket including displays: the
    authorship roast is the game's best moment and shipping it a stage early
    spoils it for anyone with devtools open. Stage ① is where cell names and
    `authorId` first travel — the same gate covers both, because the roast is
    made of exactly that data. `winners` and `roundHistory` ship at every
    stage; a history entry names only *locked* cells, which have been public
    since the round they happened in. Per-recipient redaction is deliberately
    not an option: the results payload rides the one public frame that also
    feeds displays, and one gate on one code path is what makes the invariant
    hold without call sites having to remember it.
12. `game.playAgain`: host-only, `results` phase only. Same seats, same
    settings, everything the round loop accumulated cleared → `board_fill`.
    From v4 that includes the per-round proposal records the reel is built from.
13. ✎ `round.cheer`: `open_floor`/`last_call` only; the proposal must belong to
    the **current** round; never your own proposal; at most one cheer per
    (player, proposal). A cheer survives its proposal being withdrawn — that is
    the feature, not a leak. The `cheeredBy` set stays server-side: only its
    size ever ships, so who cheered what is never published and cheering costs
    nothing socially.
14. ✎ **`revealStage` gates `reel` exactly as it gates `boards`.**
    `results.reel` is `[]` while `revealStage < 3`, on every socket including
    displays. The cheer tally is the surprise; leaking it early spoils the reel
    the way an early `boards` would spoil the authorship roast. **No cheer count
    is public at any point while the game is still being played** — that is what
    keeps the mechanic applause rather than a verdict, and what keeps it inside
    the "no in-app voting/judging" wall in `02`. See `10-highlight-reel.md`.

## Wire-size note

`PublicRoomState` for 12 players ≈ a few KB of JSON. Full snapshots per change
are far below any relevant bandwidth threshold; do not optimize this.
