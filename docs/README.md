# Name Bingo *(working title)*

A web-based social bingo game where players fill their own boards with **names of
specific individuals** (fictional or real), then race a system-controlled **House**
board. Each drawn number comes with a **Topic** — a way of describing a person —
and players lock in names from their board that fit. The game ends when the House
gets bingo; every player who completed a line by then wins.

Designed for face-to-face play: friends in the same room (or on a call), each on
their own phone/tablet, optionally with a big screen showing the shared game state.
The web app replaces the paperwork — the arguments stay human.

## Documents

| File | Purpose |
|---|---|
| [`docs/01-game-design.md`](docs/01-game-design.md) | Rules, phase machine, lobby options, lock semantics, edge cases |
| [`docs/02-architecture.md`](docs/02-architecture.md) | Stack, server-authoritative model, display role, deployment |
| [`docs/03-protocol.md`](docs/03-protocol.md) | Every intent & broadcast message, public/private state shapes |
| [`docs/04-roadmap.md`](docs/04-roadmap.md) | Build order and milestones |
| [`decks/general.example.json`](decks/general.example.json) | Sample topic deck showing the deck schema |

## Origin

Second web adaptation by the same group that built a web version of *ito*
(Bun + Elysia + Svelte 5, fully server-authoritative). This project reuses that
proven skeleton — room codes, reconnect tokens, thin-client renderers — and adds
a shared protocol package, a spectator display role, and a public/private state
split suited to a game where hidden boards are the drama.

## Working title

"Name Bingo" is a placeholder. Candidates welcome. The repo slug `name-bingo`
is used throughout the docs; find-and-replace when a real name lands.
