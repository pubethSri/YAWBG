# 01 — Game Design

## Concept

Reverse-trivia bingo. Instead of receiving a board of random numbers, each player
fills a 5×5 board with **names of individuals** — anime characters, movie characters,
historical figures, celebrities, real people. During play, the system draws numbers
for a conventional bingo board owned by the **House**. Every draw also produces a
**Topic** (a description of a person, e.g. *"An assassin"*, *"A millionaire"*,
*"A person who has a disciple"*). Players lock in one name per round that fits the
topic, arguing their case to the table. When the House board gets bingo, the game
ends: every player who completed a bingo line **wins**; everyone else loses.

The House is the game's doomsday clock. It is guaranteed to finish (all its numbers
are in the draw pool) but nobody knows when, which gives every draw double tension:
*is this topic good for me?* and *is this number bad for all of us?* Players compete
individually but share a common enemy, so finishing a line early stays fun (you keep
playing your board) and losing doesn't feel wasted.

This is a **same-room social game**. The app is the board, the randomizer, and the
record-keeper. Judging whether a name fits a topic is done by the humans at the
table, out loud. The app only structures that argument; it never rules on it.

## The one-entity rule

A written name points to **exactly one individual**, literally.

- "John Wick" means the character John Wick — an assassin. ✔ for *"An assassin"*.
- "Keanu Reeves" means the actor — **not** an assassin. ✘ for *"An assassin"*.
- The reverse also holds: "John Wick" is not *"A person who plays bass in a band"* —
  Keanu is.

Duplicate names across players (and even within the pool) are **allowed**. Two
players both having "Gordon Ramsay" is part of the fun, not a conflict.

Enforcement is social. The app never validates names; the table does, during the
open floor.

## Roles

| Role | Description |
|---|---|
| **Player** | Has a private 5×5 name board. Writes names, proposes locks, argues. 2–12 per room. |
| **Lobby host** | The player who created the room. Controls settings, starts the game, can force-advance a stalled round. A role on a player, not a separate device. |
| **House** | System-controlled. Owns a conventional numbered 5×5 bingo board drawn from the number pool — **B-I-N-G-O columns**: column *c* holds 5 numbers from its own fifth of the pool (1–15, 16–30, … at pool 75; 1–20, … at 100 — both divide by 5). With `houseFreeCenter` the centre cell prints FREE and holds no number. Acts as the game timer. Not a seat. |
| **Display** | Optional read-only big screen (TV / PC / tablet). Renders public state only: House board, current draw & topic, proposal queue, board-status grids. Zero displays and multiple displays both work. |

## Phase machine

```
lobby
  └─ host configures settings; players join with room code
board_fill
  └─ each player writes (25 − K) names into their own board
     and K names into the communal pool (K = sabotageCells setting)
  └─ player presses "Done"; host may start distribution when all done
distribute            (skipped when K = 0)
  └─ system shuffles the pool and deals K names into each player's
     empty cells; round-robin offset guarantees nobody receives a
     name they authored; players see their completed board
     (pool cells marked as "from the pool", author hidden)
round loop:
  draw
    └─ system draws N numbers (drawsPerRound setting) from the pool,
       marks any hits on the House board, and pops ONE topic from the
       deck (attached to the first drawn number)
    └─ if the House board now has bingo → exit loop
  open_floor
    └─ players inspect the topic against their unlocked names
    └─ a player may PROPOSE a cell → enters the proposal queue,
       shown big on the display → table argues out loud →
       proposer CONFIRMS (cell locks, permanently) or WITHDRAWS
    └─ players with nothing (or nothing they want to spend) press PASS
    └─ when every player has confirmed-or-passed → next draw
       (host has a force-advance button; optional soft timer)
last_call             (optional, off by default)
  └─ one final topic is drawn after House bingo; one last lock window
results
  └─ winners = players with ≥ playerLinesToWin completed lines
  └─ full board reveal: all names, lock tags, and pool-name authorship
  └─ share: render your tagged board to a PNG for socials/chat
```

## Lock semantics

These four rules are the heart of the game state:

1. **One lock per player per round.** Even if three of your names fit the topic,
   choose one.
2. **A confirmed lock is permanent.** The cell is daubed forever. It can never be
   re-locked under a different topic. Locked cells count toward bingo lines.
3. **A lock carries a tag**: `{ topicText, roundNumber, drawnNumber }`. The board
   renders the tag on the cell ("John Wick 🔒 *An assassin* — R7"). Tags make the
   final board self-documenting and screenshot-worthy.
4. **Failed or withdrawn proposals cost nothing.** The name stays unlocked and may
   be proposed again in any future round. The only consumable action is CONFIRM.

Publicity: unlocked cells are private (only the owner sees the names). A locked
cell's name and tag become public — it was presented to the table anyway — so the
display may show it.

## The open floor (dispute resolution)

Arguments happen **out loud**; the app is the stage, not the judge.

- Proposals are broadcast to everyone and rendered prominently on the display:
  *"Nok proposes **Gordon Ramsay** → 'A millionaire'"*.
- Concurrent proposals are allowed but **queued**; the display presents one at a
  time so the table argues serially.
- After discussion, the proposer either **confirms** (self-daub; the table already
  voiced its verdict) or **withdraws**. There is no in-app voting in v1 — the
  social contract is the mechanism. (In-app majority voting is a possible future
  lobby option for remote play.)
- **Cheers are not votes.** Players may applaud any name proposed in the current
  round, withdrawn ones included, and the tally is *hidden until the results
  reel* — it never gates a lock, never enters a score, and is never visible
  while a decision is live. A visible live tally would be a verdict by another
  name, which is why hiding it is a rule and not a presentation choice. Designed
  in `10-highlight-reel.md`; not built yet.
- PASS doubles as the ready signal. The round auto-advances when everyone has
  resolved (confirmed or passed).

## Peer fill — the pool mechanic

The tabletop original had players fill each other's middle rows. The web version
generalizes this via a communal pool:

- Lobby setting `sabotageCells: K` (0–8, default 0).
- During `board_fill`, each player writes `25 − K` own cells + `K` pool names.
- At `distribute`, the pool is shuffled and dealt: each player receives exactly
  `K` names into their empty cells. A round-robin offset ensures **you never get
  your own contributions back**.
- Placement of received names: `sabotagePlacement` = `random` (any empty cells;
  the player chooses which K cells to leave empty) or `middleRow` (the classic —
  players leave row 3 empty; requires K = 5).
- Authorship is tracked but **hidden during play**. The results screen reveals who
  wrote what into whose board. This is deliberate roast material.

## Lobby options

| Setting | Values | Default | Notes |
|---|---|---|---|
| `numberPoolSize` | 75 / 100 | 75 | 75 ≈ house bingo around draw 40; 100 runs longer |
| `drawsPerRound` | 1–3 | 1 | N numbers advance the House per round, but only ONE topic (attached to the first). Compresses game length without cutting fun rounds |
| `houseFreeCenter` | on / off | on | Free center makes the House faster |
| `houseBingoTarget` | 1 / 2 lines | 1 | 2 lines ≈ a longer game; alternative pacing lever to `drawsPerRound` |
| `houseBoardVisibility` | `full` / `progress` / `hidden` | `full` | `full`: the doom clock on every screen. `progress`: abstract only ("House needs 2 more for a line"). `hidden`: pure jump-scare ending |
| `sabotageCells` (K) | 0–8 | 0 | Pool mechanic above |
| `sabotagePlacement` | `random` / `middleRow` | `random` | `middleRow` requires K = 5 |
| `playerLinesToWin` | 1–3 | 1 | Lines needed for a player to count as a winner |
| `roundTimerSec` | off / 30–120 | off | Soft timer for `open_floor`. Off for face-to-face; useful for bigger/looser lobbies |
| `lastCall` | on / off | off | One final topic + lock window after House bingo |
| `deckIds` | multi-select | `general` | Selected decks are merged and shuffled together |

Not settings (fixed rules): duplicate names allowed; players fill all 25 cells
(no player free-center); one lock per round; locks permanent.

## Topics & decks

- A deck is a JSON list of topics (see `decks/general.example.json`). Decks live
  in SQLite and are editable via an admin/deck-editor UI.
- **Lazy pairing**: there is no pre-built number→topic table. At game start the
  merged deck is shuffled into a draw pile; each round pops the next topic.
  Statistically identical to the tabletop table, but decks don't need exactly
  `numberPoolSize` entries and any mix of decks works.
- Topic writing guide: describe *kinds of people*. Range from broad ("A chef",
  "A bald person") to weirdly specific ("A person who experienced a near-death
  situation", "A person who has a disciple"). Specific topics create the best
  arguments.

## Game end & win conditions

- The game **always terminates**: every House number is in the pool, so within
  `numberPoolSize` draws the House must bingo (24 numbers with a free centre,
  25 without). No draw-exhaustion stall exists.
- Winners: all players with ≥ `playerLinesToWin` completed lines when the House
  bingos (plus `last_call` locks if enabled). Multiple winners is normal and
  desired. Zero winners is a valid, hilarious outcome.
- A player who completes a line early keeps playing — more lines, more locked
  tags, better share screenshot. The results screen ranks by lines completed,
  then by earliest completing round, for bragging rights only.

## Edge cases

| Case | Ruling |
|---|---|
| Topic deck runs out mid-game | Reshuffle used topics into a fresh pile. Repeats are usually dead topics (fitting names already locked) — acceptable. Warn the host at game start if merged deck size < expected draw count |
| Player disconnects mid-round | Seat held for a 120 s grace window (see architecture). While disconnected they're treated as not-yet-resolved; host can force-advance past them. Auto-PASS on removal |
| Player leaves permanently | Board frozen and excluded from win check; their authored pool names stay in other boards |
| Proposal pending when proposer disconnects | Proposal auto-withdrawn after grace or via host force-advance |
| All players bingo before the House | Game continues (more lines, more tags) — House bingo is still the only end trigger, unless the host ends it early via a host control |
| Fewer than 2 players after removals | Host may end the game; results render normally |

## Share feature

After results, each player can export their board as an image: the client renders
the final tagged board (names, daubs, topic tags, room code, date, win/lose stamp)
to a `<canvas>` → PNG, then `navigator.share()` on mobile (falls back to download).
No server-side image generation. The full round history is persisted in the game
log, leaving room for a future fancy share page with a game replay.
