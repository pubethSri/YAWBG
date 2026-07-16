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

Round auto-advances to the next `draw` when every connected, board-active player
is resolved. Optional `roundTimerSec` fires a server-side auto-advance identically
to `forceAdvance`.

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

interface Proposal { playerId: string; cellIndex: number;
                     name: string; }  // name is public the moment it's proposed

type HousePublic =
  | { mode: 'full'; board: number[]; freeCenter: boolean; hits: number[];
      linesCompleted: number }
  | { mode: 'progress'; bestLineNeeds: number; linesCompleted: number }
  | { mode: 'hidden' };

interface PublicRoomState {
  protocolVersion: number;
  code: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  house: HousePublic | null;         // null before distribute
  round: {
    number: number;
    drawnNumbers: number[];          // this round (length = drawsPerRound)
    allDrawn: number[];              // whole game, for the display's called-number board
    topic: { id: string; text: string } | null;
    queue: Proposal[];               // FIFO; index 0 is "on stage"
  } | null;
  results: ResultsPayload | null;    // phase === 'results'
}

interface PrivateCell {
  name: string | null;
  fromPool: boolean;                 // author hidden until results
  locked: LockTag | null;
}
interface PrivateBoard { cells: PrivateCell[]; poolSlots: (string | null)[]; }

interface ResultsPayload {
  revealStage: 0 | 1 | 2;   // host-paced: ⓪ winners → ① pool authorship → ② boards + share
  winners: string[];                                  // playerIds
  boards: { playerId: string;
            cells: { name: string; authorId: string | null;  // null = self
                     locked: LockTag | null }[] }[];
  roundHistory: { round: number; drawnNumbers: number[];
                  topicText: string;
                  locks: { playerId: string; name: string;
                           cellIndex: number }[] }[];
}
```

## Server-side invariants (enforced in `Room`, not trusted from clients)

1. One live proposal per player; proposals only in `open_floor` / `last_call`.
2. `confirm`/`withdraw` only by the proposal's owner.
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

## Wire-size note

`PublicRoomState` for 12 players ≈ a few KB of JSON. Full snapshots per change
are far below any relevant bandwidth threshold; do not optimize this.
