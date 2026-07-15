# 05 — UX flow & screen inventory

Screen-level design for both clients. Layout and visual style are deliberately
out of scope here (see the design-direction artifact, later); this doc fixes
*what screens exist, when they show, and how players move between them*.

## Routes — three, and nobody navigates

| Route | Client | Behavior |
|---|---|---|
| `/` | Landing | Name entry + join by code or create room. Accepts `?code=XXXX` deep link (pre-fills the code) |
| `/room/:code` | Player | Everything below renders here, driven by `phase` |
| `/display/:code` | Display | Read-only; states driven by the same `phase` |

There is no in-room navigation. Each screen is a **phase renderer**: a pure
function of `PublicRoomState` (+ own `PrivateBoard`). This makes reconnect free —
resume mid-game and you land on the correct screen because the screen *is* the
state. One server hosts many concurrent rooms (see `02-architecture.md`,
`RoomManager`); rooms are fully isolated and identified by their 4-letter code.

## The display-optional principle

**Phones-only is the baseline experience; the display is an amplifier.**

- Every public fact — House board (per visibility setting), called numbers,
  current topic, proposal on stage, player statuses — must have a first-class
  rendering on the *player* screen. The display duplicates and dramatizes; it
  never owns information.
- No game action may depend on a display existing (it is read-only by protocol;
  this extends the rule to UX: no "look at the TV to find out" moments).
- Join affordances exist in both worlds: the display's lobby splash shows the
  room code huge plus a QR deep link; with zero displays, the phone lobby has a
  share-link button doing the same job.

## Player screens

| Phase | Screen | Contents & notes |
|---|---|---|
| — | **Landing** (`/`) | Display name + room code inputs, join / create buttons. Rejoin banner when a `sessionStorage` token for a live room exists |
| `lobby` | **Lobby** | Roster with connect status, room code + share link, settings (host: editable; others: read-only view), start button (host, gated ≥ 2 players) |
| `board_fill` | **Board editor** | 25 cells + K pool slots, done toggle, others' fill progress. *One of the two hard screens — see `06`* |
| `distribute` | **Pool deal reveal** | Transition, not a destination: received cells highlight ("these K just arrived, author hidden"), ~4 s, auto-advances. Skipped when K = 0 |
| `draw` | **Draw moment** | Not a separate screen: a short takeover animation on the round screen — number(s) roll in, House hits flash, topic slams down — then settles into the open floor |
| `open_floor` | **Open floor** | Topic banner, own board, propose / confirm / withdraw / pass, proposal queue awareness, House status. *The other hard screen — see `06`* |
| `last_call` | **Last call** | Open floor variant with "final round" framing. Only when `lastCall` on |
| `results` | **Results sequence** | Staged reveal, in order: ① winners → ② pool authorship roast (when K > 0) → ③ full boards + lock tags + share-to-PNG + play again (host) |

## Display states

| Phase | State | Contents |
|---|---|---|
| — | **Connect** | Room code entry |
| `lobby` | **Lobby splash** | Room code huge + QR (`/?code=XXXX`), live roster |
| `board_fill` / `distribute` | **Fill progress** | Who's done, ambient |
| `draw` + `open_floor` + `last_call` | **Stage** | One persistent super-state: House board + called numbers always visible, current topic huge, spotlight card for the proposal at queue front, player status strip. Draw plays as theatre *within* this layout — the House board never jumps around between phases |
| `results` | **Results reveal** | Mirrors the phone sequence stage-by-stage |

## Locked flow decisions

1. **Draw is a moment, not a screen.** Client-side merge of `draw` +
   `open_floor` phases into one round screen with a reveal animation.
2. **Pool deal reveal is a transition** — no interaction, auto-advance.
3. **The display's Stage is a super-state** spanning the whole round loop;
   stability of the big screen beats per-phase layouts.
4. **Display is optional, always** (principle above).
5. **Host controls are inline and contextual** (v1): e.g. a force-advance
   button that appears for the host only when the round stalls. If host verbs
   accumulate, revisit as a host drawer — not now.
6. **Results is a host-paced, synchronized sequence.** All phones and displays
   move through stages ①→②→③ together — the authorship roast is a shared moment,
   not a private scroll. Protocol: host-only `results.advance` ★ intent +
   `revealStage` field in `ResultsPayload` (now specified in `03-protocol.md`).

## Open items

None — interaction design lives in `06-key-screens.md`, visual language in
`07-design-system.md`.
