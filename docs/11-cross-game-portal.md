# 11 — Cross-game portal & shared session assessment

> ## ✅ Picked up 2026-08-04 — superseded by `12-hub-and-deployment.md`.
>
> Parked on 2026-07-29, unparked on 2026-08-04 when the developer returned to
> the deployment site. It entered through the roadmap, as the parked banner
> required. **`12-hub-and-deployment.md` is the plan of record; read that for
> anything you intend to act on.**
>
> What this document is still good for, and why it is kept rather than rewritten:
>
> - **§1's two-codebase comparison is the evidence** behind the decision. It is
>   accurate as of 2026-07-27 and is what makes "the handoff surface is tiny"
>   a finding rather than a hope.
> - **§2–4's option analysis produced the answer.** Option A was chosen. Its
>   reasoning against a merge (§4) is unchanged and doc 12 §10 restates the wall.
> - **§5's centralisation candidates are still open**, and deliberately not
>   scheduled: shared admin OIDC (§5.1) and the analytics session envelope
>   (§5.2). Doc 12 does not settle either.
>
> Two things here are now out of date. **§7's question lists are largely
> answered** — doc 12 §5 closes the deep-link and session-conflict questions for
> both games, and closes the code-allocation question by not building a registry.
> And this document describes a **two-app** world: *Pastebin* (`C:\Pastebin`) was
> designed and built a week after it was written, and doc 12 is the three-app
> version.

**Status: assessment, no decision made, nothing built.** Written 2026-07-27 by
reading both codebases (`C:\YAWBG` and `C:\ito`) at that date. This is the
canonical copy; `C:\ito\docs\directions\cross-game-portal.md` is ito's brief and
points here.

**Purpose.** The author is considering a single entry point across *ito*, YAWBG
and future web board games: host creates a game and gets a room code, player
types name + code and lands in the right game. The question is whether to
combine the projects, and what that means for ito's planned data-insights system
and for game management. This doc establishes the shared facts and hands each
project a scoped list of things only that project's agent can answer.

---

## 0. One correction to the framing, up front

**What's being described is a join form, not a login.** "Player types their name
and a code" involves no credential, no account and no identity that survives the
game. Both projects deliberately have *no player accounts* — it's an explicit v1
non-goal in `02-architecture.md`, and ito runs fully anonymous with OIDC
disabled. A portal that stays a join form breaches nothing. A portal that
becomes a real login is a re-identity of both games and should be decided on its
own merits, not smuggled in as plumbing.

There *is* one real login in play, and it's the more interesting sharing
candidate: **admin/creator OIDC**. ito already has a working Authentik
integration (`server/src/services/authentik.ts`, roles from groups:
`ito-admin` → ADMIN, `ito-creator` → CREATOR); YAWBG has the same thing planned
but unbuilt (M7, deck editor + game-log browser). That is one Authentik client,
one role map, and one admin shell serving two games — a much smaller, more
certain win than the player portal. See §5.

---

## 1. Verified facts: how each game handles connection & session

Both are Bun + Elysia, one `/ws` endpoint, in-memory `Map<code, Room>`,
4-uppercase-letter room codes from the same 26-letter alphabet, per-player
random token for reconnect, 120 s grace, session in **`sessionStorage`**
(per-tab, so multi-tab local testing works). **The skeletons are the same
because YAWBG copied them.** The contracts around them are not.

| Aspect | ito | YAWBG |
|---|---|---|
| Inbound validation | none — `JSON.parse` then trust (`server/src/index.ts:105`) | `ClientIntentSchema.safeParse` at the boundary (`apps/server/src/app.ts:186`) |
| Wire types | hand-duplicated in `server/src/types.ts` and `client/src/lib/types.ts`, no compiler check | single source: `packages/protocol` (zod), imported by both sides |
| Protocol version | **none** | `PROTOCOL_VERSION` (currently 5) checked on every entry intent; `VERSION_MISMATCH` → client clears session and reloads (`app.ts:206`, `socket.svelte.ts:106`) |
| Entry messages | `CREATE_ROOM` / `JOIN_ROOM` / `RECONNECT`, payload `{playerName}` / `{roomCode, playerName}` / `{token, roomId}` | `room.create` / `room.join` / `display.join` / `session.resume`, each also carrying `protocolVersion` |
| Session map | `activeSessions: Map<ws.id, {roomId, playerId}>`, module-level (`index.ts:22`) | `sockets: Map<socketId(ws), {code, playerId} \| {code, role:'display'}>`, closure-scoped in `createApp` |
| Socket id access | `ws.id` directly (no `pong` handler, so never bitten) | must go through `socketId(ws)` — Elysia hands `pong` Bun's raw socket where the id is at `.data.id` (`app.ts:79`; see the heartbeat bug in `CLAUDE.md`) |
| Player identity | **`playerId = ws.id`** (`index.ts:112`) — identity minted from the connection | `playerId = crypto.randomUUID()` (`Room.ts:179`), independent of any socket |
| Reconnect lookup | by **token alone**, scanned across the room (`Room.reconnectPlayer`) | by `playerId`, then constant-compare `token` (`Room.ts:229`) |
| Client reconnect | none — on close the socket is nulled and nothing retries until the user reloads (`stores/socket.ts:95`) | 2 s retry loop + `visibilitychange` re-connect (`socket.svelte.ts:71,240`) |
| Heartbeat | **none**; `idleTimeout: 3600` and nginx `proxy_read_timeout 3600s` | WS ping/pong every 30 s, 2.5 missed intervals closes (`app.ts:149`) |
| Spectator role | none | `display` — read-only socket, any intent rejected |
| Auth | Authentik OIDC, optional (`AuthentikService.fromEnv()` → `null`), cookie `auth_token`; gates pack creation + admin | none built; M7 owns OIDC for deck editor + log browser |
| Storage key | `sessionStorage['game_session'] = {token, roomId, playerId}` | `sessionStorage['yawbg_session'] = {code, playerId, token}` |

### What this means for a portal

**The handoff surface is tiny.** In both games the entire join handshake is:
open a WS → send one message containing a display name (and a code) → receive a
token → store it per-tab. A portal never has to unify the two socket protocols.
It has to produce `{game, code, playerName}` and get the browser to the right
origin. That's a link.

**The one genuinely shared resource is the room-code namespace.** Both mint
4 letters from A–Z into a *per-process* map. Nothing prevents an ito room `ABCD`
and a YAWBG room `ABCD` existing simultaneously. **A portal that accepts a bare
code and routes on it needs a global answer to "which game is `ABCD`?"** — this
is the only technical constraint the portal idea actually imposes, and every
option below is really a different answer to it.

**Two ito-side asymmetries a portal would make worse, worth flagging regardless
of the decision:** no client-side reconnect retry, and no heartbeat. Deep links
from a portal mean more phones arriving over flaky mobile connections, and ito
currently notices a dead socket only after up to an hour. YAWBG hit the same
class of bug and fixed it (`CLAUDE.md`, heartbeat section) — the fix and its
test are portable.

---

## 2. Option A — stay separate, add a static portal page

A `games.<org>` vhost serving a static page: pick a game, then either "Host" (→
that game's create flow) or type a code and name (→ deep link, e.g.
`yawbg.<org>/?code=ABCD&name=Nok`).

- **Cost:** a static page and one query-param read per client. No server, no
  protocol change, no shared state, no new failure mode.
- **Codes stay per-app**, so the namespace question never arises.
- **What the player loses:** they must pick the game. In practice the host
  already told them ("we're playing bingo") — this is a real but small cost.
- Preserves `08-deployment.md`'s independent-deploy property exactly: the portal
  is a third vhost that can't take a game down.

## 3. Option B — a shared room registry behind the portal *(recommended if code-only join is a requirement)*

One small service owning code allocation and lookup:

- `POST /rooms` → allocates a globally-unique code, records `{code, game, ttl}`;
  each game server calls this instead of generating its own code, and `DELETE`s
  on room-empty (both games already have the exact hook: `onEmpty` in
  `RoomManager.create` / `Room.removePlayer`).
- `GET /r/:code` → `{game, url}`; the portal redirects.

- **Cost:** ~150 LOC plus one call site per game. Game protocols untouched.
- **New failure mode:** registry down = nobody can *create* a room. Mitigate by
  falling back to local generation on error and accepting the collision risk, or
  by partitioning the space (e.g. each game owns a first-letter range) so the
  registry becomes an optimisation rather than a dependency.
- Also the natural home for a "which games are live right now" view — see §5.

## 4. Option C — merge the projects into one codebase/one server

- **Cost is the whole point of the assessment: it is large.** ito would have to
  adopt `packages/protocol` (which means rewriting the hand-duplicated types it
  ships today — that duplication is precisely the wart YAWBG exists to fix), the
  two `Room` state machines would need a shared lifecycle, and the two SQLite
  databases would need merging or namespacing.
- **It destroys the independent-deploy property.** `08-deployment.md` chose
  separate containers on a shared edge network specifically so shipping YAWBG
  never touches ito. One process means one restart drops *both* games' live
  state — and live state is memory-only in both, by design.
- The plausible upside is code reuse, but reuse can be had via a package without
  a merge, and there is currently no third game to prove what the right shared
  abstraction even is.

**Recommendation: A now, B when the third game exists or when code-only join is
judged worth a service. Not C.** The specific reason to prefer A *today*: YAWBG
is not deployed yet (M6 is the deploy-and-playtest milestone, and four exit
tests are still unjudged pending that playtest). Building cross-game
infrastructure before either game has been played by the friend group on real
hardware is building against an unmeasured requirement.

**Rule of three for shared code:** extract `packages/session`, or a shared Room
skeleton, when a *third* game needs it — not on the second. With two data points
the abstraction is a guess; the skeleton was already successfully shared once by
copying, which is evidence copying is cheap enough.

---

## 5. The parts genuinely worth centralising now (and they aren't the player portal)

### 5.1 Admin identity — the strongest candidate

ito's Authentik integration works and is optional-by-construction. YAWBG needs
the same thing for M7 and hasn't started. Sharing here means: one Authentik
client/app, one group→role mapping convention (`<game>-admin` / `<game>-creator`
generalises cleanly), and — if desired — one admin surface listing both games'
live rooms and logs. The cookie is per-origin, so under separate vhosts each app
still needs its own session cookie unless a parent domain is used; that's a
detail for whoever implements it, not a blocker.

The concrete cheap version: YAWBG ports ito's `services/authentik.ts` shape when
M7 lands, using the same env-var names and the same "null service = anonymous
mode" pattern, so a later merge into one admin app is mechanical.

### 5.2 Analytics envelope — decide the shape *before* both games have data

This is where "combine or separate" has a real, time-sensitive answer, because
**the two projects are at opposite ends of the same problem**:

- **ito**: `docs/directions/data-insights.md` is a thorough, verified design —
  denormalized tables, topic keyed on `(pack_id, topic_text)` because topic UUIDs
  are re-minted on every boot, **names never enter analytics tables** (positional
  index only), notes truncated and gated by `ANALYTICS_NOTES=off`, admin-only
  access. It is explicitly **not implemented**. Its own sequencing note says the
  capture layer should ship *first*, so data accrues while everything else is
  built.
- **YAWBG**: capture *is* implemented (`apps/server/src/GameLog.ts`) but is one
  flat `games` row with JSON columns — settings, players, full results — chosen
  deliberately because the planned consumers (M7 admin browser, possible replay)
  want the whole game at once. Note that this row **does contain player names**,
  which is the opposite of ito's design stance.

Those two are not in conflict yet, and they don't need the same schema. What
they should agree on is a thin **session envelope** — one row per finished game,
identical columns in both databases:

```
game        TEXT    -- 'ito' | 'yawbg'
session_id  TEXT    -- stable per room lifetime (ito: Room.sessionId; YAWBG: needs one)
room_code   TEXT
started_at / ended_at
player_count INTEGER
settings    TEXT    -- JSON, game-specific
```

Everything interesting stays in each game's own detail tables. Agreeing this
costs nothing now and makes "how much are these games actually played, by how
many people, for how long" a two-line UNION later. Retrofitting it after both
have months of rows is the expensive version.

**Two decisions to make explicitly, not by drift:**

1. **Names in analytics.** ito's design says never; YAWBG's `games` row says
   yes. Pick one stance per project and write it down — or make the envelope
   name-free and let the detail tables differ.
2. **Whether the envelope lives in one database or two.** Two files with the
   same schema is fine at this scale and keeps deploys independent; one shared
   file couples the containers. Default to two.

---

## 6. Impact on game management

Whichever option is chosen, note what each game already exposes: ito has
`GET /api/admin/stats` (live rooms, per-room player names, state, pack) behind
the admin guard; YAWBG has no equivalent endpoint yet. A cross-game "what's live
right now" view is the natural first feature of either a shared admin (§5.1) or
the registry (§3) — and ito's `directions/README.md` already flags the practical
reason to want it: *every deploy kills all running games*, so knowing whether
rooms are active is a pre-deploy check, not a vanity dashboard.

---

## 7. What each project's agent should assess

Each list is scoped to what only that repo can answer. Neither agent should
change code for this — the output wanted is answers and cost estimates.

### For the YAWBG agent (`C:\YAWBG`)

1. **Deep-link entry.** What actually has to change in `routes/Home.svelte` and
   `lib/router.svelte.ts` to accept `?code=&name=` and go straight to join?
   Does an existing `yawbg_session` in `sessionStorage` conflict with an
   inbound deep link, and which should win?
2. **Code allocation seam.** How invasive is it for `RoomManager.generateCode()`
   to call out to a registry (async) instead of generating locally? `create()`
   is synchronous today and called inline from the `room.create` intent handler
   — cost that honestly.
3. **`session_id`.** ito's `Room` has a stable `sessionId` per room lifetime;
   YAWBG's `Room` does not. What does adding one cost, and does the `games` row
   need it before more logs accumulate?
4. **Analytics stance.** `GameLog.record()` writes player names. Is that
   intended long-term, and does the M7 admin browser need them? If not, is
   changing it cheaper now than after the M6 playtest generates real rows?
5. **Admin OIDC (M7).** Confirm whether porting ito's `AuthentikService` shape
   (env-var-driven, `fromEnv() → null` disables) is still the plan, and what the
   cookie/origin story is under `yawbg.<org>` vs a shared parent domain.
6. **Scope-wall check.** Does anything in the portal idea touch the "no player
   accounts" non-goal in `02-architecture.md`? Flag it if so rather than
   assuming.

### For the ito agent (`C:\ito`)

1. **Deep-link entry.** `App.svelte` switches views on store state with no
   router. What's the cost of reading `?code=&name=` on boot and driving
   `JOIN_ROOM` from it?
2. **Protocol version.** ito has none. If a portal deep-links stale clients into
   ito, what breaks, and what would a minimal version check cost given the
   hand-duplicated types in `server/src/types.ts` + `client/src/lib/types.ts`?
3. **Client reconnect + heartbeat.** `stores/socket.ts` never retries after a
   close, and the server has no ping/pong. Both matter more with portal-driven
   mobile traffic. Cost to port YAWBG's approach (`apps/server/src/app.ts:149`
   heartbeat + `socket.svelte.ts:71` retry)? **If you add a `pong` handler,
   read the `socketId(ws)` note in §1 first — Elysia hands `pong` a different
   object shape and this cost YAWBG four milestones of silent breakage.**
4. **Player identity.** `playerId = ws.id` couples identity to the connection.
   Does that constrain anything a portal or a shared registry would want, and
   is decoupling it (as YAWBG did) worth doing on its own merits?
5. **Data-insights sequencing.** `directions/data-insights.md` says ship capture
   first and alone. Does the portal idea change that sequencing, and can Phase 1
   adopt the §5.2 session envelope at no extra cost while it's being written?
6. **Code allocation seam.** Same question as YAWBG's #2, for
   `RoomManager.createRoom()`.
7. **Admin surface.** `GET /api/admin/stats` already exists. What would it take
   to make it consumable by a cross-game view — and does the current shape leak
   anything (it returns player *names*) that a shared surface shouldn't?

### The one question neither agent can answer alone

**Is code-only join (no game picker) worth a service?** That's a product call,
and it decides A vs B. Everything else in this doc follows from it.

> **Answered 2026-08-04: no.** Option A, a static picker. The deciding argument
> turned out not to be cost but honesty — with a third app that is not a game, a
> bare 4-letter code is ambiguous to the *player*, not just the router. You
> don't "play" a paste room. See `12-hub-and-deployment.md` §0 and §4.
