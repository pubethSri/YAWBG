# 12 — The hub, and the three-app deployment

**Status: decided 2026-08-04. This is the plan of record.** It picks up the
assessment parked in `11-cross-game-portal.md` and turns it into committed work,
which is the door that document said any pickup had to enter through.

Two things changed since doc 11 was written on 2026-07-27, and both matter:

- **There is a third app.** *Pastebin* (`C:\Pastebin`) was designed and built
  through its M7 on 2026-08-04. Doc 11 compares two codebases and never mentions
  it. Everything here is three-app.
- **The developer is back at the deployment site.** M6 was blocked on location,
  not code (`04-roadmap.md`). That block is lifted.

This is the canonical copy. Each other repo carries a scoped brief that points
here and does not repeat it:

| Repo | Brief |
|---|---|
| `C:\ito` | `docs/directions/hub-deployment-brief.md` |
| `C:\Pastebin` | `docs/02-hub-deployment-brief.md` |

---

## 0. What was decided (interview, 2026-08-04)

| # | Question | Decision |
|---|---|---|
| 1 | Combine the apps, or just the landing? | **Just the landing.** Three apps stay three codebases, three containers, three independent deploys. Doc 11's Option A. Not a registry (B), not a merge (C). |
| 2 | What is the hub, technically? | **Static files served directly by Caddy.** No container, no server, no shared state. |
| 3 | URL shape | **Flat subdomains** under `it.kmitl.ac.th`: `cruzhub`, `yawbg`, `ito`, `paste`. Three new A records, all pointing at the existing VM. |
| 4 | Host | **The org VM, with *ito* live on it today** behind its own nginx, holding the org wildcard cert pair. The cutover in `08-deployment.md` applies as written. |
| 5 | Pastebin in public? | **Yes, its own vhost.** With the hardening in §7.3 — none of which adds a login, a password or a captcha. |
| 6 | What does a deep link carry? | **Name *and* code, and the app joins automatically.** The hub *is* the join form: type your name, type the code, pick the app, and you land in the room. See §5. |

> **Decision 6 was reversed during the same interview.** The first version had
> the hub carry only the code, with each app collecting the name on its own
> landing page — cheaper, and it dodged three coupling problems. It was rejected
> on the only ground that matters: **if the hub hands you off to another form,
> it has added a step rather than removed one**, and there is then no reason for
> it to exist. The three problems are solved in §5 instead of avoided.

### The nesting trap, ruled out

`yawbg.cruzhub.it.kmitl.ac.th` was considered and **rejected on TLS grounds**. A
wildcard certificate covers exactly one label. The org pair is
`*.it.kmitl.ac.th` (the files are named `STAR_IT_KMITL_AC_TH*`), which covers
`cruzhub.it.kmitl.ac.th` but **not** anything below it. Nesting would need a
second wildcard for `*.cruzhub.it.kmitl.ac.th`, which means zone delegation and
an ACME DNS-01 setup — for no benefit, since it costs *more* DNS records, not
fewer. Confirm the SAN list once on the VM rather than trusting the filename:

```
openssl x509 -in STAR_IT_KMITL_AC_TH_PACK.crt -noout -text | grep -A2 "Subject Alternative Name"
```

---

## 1. Topology

```
DNS (3 new A records → the existing VM IP)

  cruzhub.it.kmitl.ac.th ─┐
  yawbg.it.kmitl.ac.th   ─┤                          ┌─ file_server → /srv/hub   (static)
  ito.it.kmitl.ac.th     ─┼─► VM :443  Caddy (edge) ─┼─ reverse_proxy yawbg:3000
  paste.it.kmitl.ac.th   ─┘        │                 ├─ reverse_proxy ito:3000
                                   │                 └─ reverse_proxy pastebin:3000
                                   │
                          one shared external
                          docker network: `edge`
```

Properties this preserves, deliberately:

- **Independent deploys.** One compose project per app. Shipping YAWBG cannot
  restart *ito*, and live room state is memory-only in both games — that is the
  property doc 11 refused to trade for a merge, and it survives here intact.
- **The hub cannot take an app down.** It is a directory of files. There is no
  process to crash and no request path through it at play time.
- **Zero application changes for the URL shape.** Every app keeps serving from
  `/` on its own origin. This is the entire reason flat subdomains beat
  path-based routing; see §2.

### Correction to `08-deployment.md`

That document specifies `reverse_proxy ito:3001`. **It should be `ito:3000`.**
The `:3001` was leftover port-publishing thinking: behind the `edge` network
with no host ports published, container DNS names disambiguate the three
services and all of them can listen on 3000. *ito* therefore needs **no port
change at all** — it is `PORT=3000` today. Doc 08 has been corrected.

---

## 2. Why not path-based routing

`cruzhub.it.kmitl.ac.th/yawbg/`, `/ito/`, `/paste/` was the serious alternative
and would have needed **zero** new DNS records. It was rejected once DNS turned
out to be easy, because it is not free on the application side:

- Caddy's `handle_path` strips the prefix, so the three *servers* need nothing.
  But SPA assets are requested absolute-from-root, so each *client* needs a base
  path — Vite `base`, a router base, and a prefixed WS URL. Real work in YAWBG
  and Pastebin, and asset/`/api`/`/ws` prefixing in *ito*, where the wire types
  are hand-duplicated so every change is two files.
- Pastebin costs the most: its QR and `/r/CODE` links, `/media/:id` and
  `/api/host` all encode URLs that would have to carry the path.
- **All three apps would share one origin, and web storage is per-origin, not
  per-path.** Their keys don't collide today (`yawbg_session`, `game_session`,
  Pastebin's own), but it becomes permanent coupling — a future key collision
  would silently break two apps at once.
- YAWBG's planned PWA would install as `cruzhub.../yawbg/`, an odd install
  identity for something that wants to be a home-screen app.

The one thing path-based would have bought — a shared parent origin for an admin
cookie — is available anyway: all four hostnames sit under `it.kmitl.ac.th`, so
a future cookie scoped to that parent works across them. Doc 11 §5.1's admin-OIDC
sharing is not foreclosed by this choice.

---

## 3. The edge stack

One directory (its own small repo or a directory on the VM), holding the
`Caddyfile`, the compose file, and the hub's static files. Created once.

```
docker network create edge
```

**`Caddyfile`:**

```caddy
(site) {
    tls /certs/server.crt /certs/server.key
    header X-Robots-Tag "noindex, nofollow"
}

cruzhub.it.kmitl.ac.th {
    import site
    root * /srv/hub
    file_server
}

yawbg.it.kmitl.ac.th {
    import site
    reverse_proxy yawbg:3000
}

ito.it.kmitl.ac.th {
    import site
    reverse_proxy ito:3000
}

paste.it.kmitl.ac.th {
    import site
    reverse_proxy pastebin:3000
}
```

`noindex` is global rather than per-site on purpose: every one of these
hostnames serves URLs that contain a live room code, and a search engine holding
`paste.../r/ABCD` is the cheapest possible way to leak a room. It costs users
nothing.

**`compose.yml`:**

```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./hub:/srv/hub:ro
      - /etc/org-certs:/certs:ro
      - caddy-data:/data
    networks: [edge]
    restart: unless-stopped
volumes:
  caddy-data:
networks:
  edge:
    external: true
```

The cert pair lives beside *ito*'s compose today. Either move it to
`/etc/org-certs` and point both at it, or mount it from where it is — but it is
one pair covering all four vhosts, and **YAWBG and Pastebin need no certificate
of their own**.

**Deploying the hub is `git pull` in this directory.** `file_server` reads from
disk per request, so no reload, no restart, no container rebuild. That is the
main practical dividend of the hub being static.

### Proxy requirements that are not optional

`08-deployment.md` has the full table. The one to not get wrong: **the idle/read
timeout must exceed the heartbeat interval.** Caddy has no default read timeout,
so this is satisfied by doing nothing — but if anything is ever put in front of
Caddy, note that YAWBG now sends real pings every 30 s (`CLAUDE.md`, heartbeat
section) and a proxy that severs quiet sockets faster reintroduces exactly the
symptom that bug produced. *ito* has **no heartbeat at all**, which is why its
nginx carries `proxy_read_timeout 3600s`; see its brief.

---

## 4. The hub

A single static page. **One name field at the top**, then three cards — one per
app — each with two ways in.

```
┌─────────────────────────────────────────┐
│  cruzhub                                │
│                                         │
│  Your name  [ Nok                     ] │
│                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────┐│
│  │ YAWBG       │ │ ito         │ │Paste││
│  │ reverse-    │ │ sort 1–100  │ │ drop││
│  │ trivia bingo│ │ without     │ │ text││
│  │             │ │ speaking    │ │     ││
│  │ [ Host ]    │ │ [ Host ]    │ │[Host]│
│  │ [code][Join]│ │ [code][Join]│ │[c][J]││
│  └─────────────┘ └─────────────┘ └─────┘│
└─────────────────────────────────────────┘
```

- **Host** → `https://yawbg.it.kmitl.ac.th/?name=Nok&new=1` → lands in a fresh
  lobby as host.
- **Join** → `https://yawbg.it.kmitl.ac.th/?code=ABCD&name=Nok` → lands in that
  room.

**The name field is shared across all three cards**, because your name doesn't
change depending on which app you picked, and three name inputs on one page is a
worse form. Remember it in `localStorage` so a return visit doesn't retype it.

The hub stays **static** despite now having inputs: collecting two strings and
building a URL is client-side JavaScript in a file. There is still no server and
no shared state, so §3's `file_server` deployment story is unaffected.

Two build details that are easy to get wrong:

- **Build the URL with `URLSearchParams`, not string concatenation.** Names here
  are Thai as often as English, and hand-built query strings break on the first
  space or non-ASCII character.
- **Cap the name input at the tightest limit across the three apps** —
  currently **30** (YAWBG's; Pastebin allows 32). Trim it, and disable Host/Join
  while it is empty. Validating here is what stops someone being teleported into
  an app only to be rejected by its schema, which is the worst possible place to
  discover a too-long name.

### What the hub must never become (the v1 scope wall)

Flagged here so it is a decision and not a drift, in the style of the non-goals
in `02-architecture.md`:

- **No server process.** The moment the hub needs one, re-read doc 11 §3 and
  decide Option B deliberately.
- **No shared room registry**, and therefore no code-only join. A bare 4-letter
  code is ambiguous across three apps to the *human*, not just the router — you
  do not "play" a paste room. The picker is the honest UI, not a compromise.
- **No live-rooms view.** It needs every app to expose a status endpoint; only
  *ito* has one, and its current shape returns player names (doc 11 §6).
- **No accounts and no shared session.** The hub collects a *display name*,
  which is not an identity: no credential, no account, nothing that survives the
  game. Doc 11 §0's correction is the governing one — this is a join form, not a
  login, and it does not breach `02-architecture.md`'s no-player-accounts wall.
  The name is passed in a URL and forgotten; it is never stored server-side by
  the hub, because the hub has no server.

---

## 5. The deep-link contract

**This is the one thing every app must implement, and the only cross-app
coupling in the whole plan. All three implement it identically.**

| URL | Behaviour |
|---|---|
| `/?code=ABCD&name=Nok` | Join room `ABCD` as `Nok`, automatically. Land in the room. |
| `/?name=Nok&new=1` | Create a room as `Nok`, automatically. Land in the new lobby as host. |
| `/?code=ABCD` (no name) | Prefill the code field, wait for a name. *(The pre-existing behaviour; YAWBG already does this.)* |
| no params | Today's landing page, unchanged. |

`new=1` is explicit rather than inferred from "name present, code absent" —
otherwise a bookmarked `?name=Nok` would silently create a fresh room on every
visit.

### Why a URL, and not a backchannel

Asked and answered 2026-08-04, recorded so it isn't re-derived. A ticket
handoff — hub POSTs `{app, code, name}`, the app mints a one-time ticket, the
browser is redirected with it — was considered and rejected.

**The deciding argument: the URL grants nothing the user could not already do by
typing.** They can open the app directly and enter any name and any code by
hand. The link is a convenience, not an authority, so no claim is being asserted
and there is nothing to forge. The app re-validates the code against its own
room map and takes the name at face value, exactly as it does from its own form.

Neither value is a secret, and both are deliberately public: the room code is a
rendezvous identifier that YAWBG renders as a **QR code on a television**, and
the display name is shown to the whole room within seconds and is tied to no
account. The usual query-string objections mostly don't apply — rule 5 strips
history, and modern browsers' default `strict-origin-when-cross-origin` referrer
policy means the path and query never travel cross-origin. What remains is the
name appearing in Caddy's access log, which is a one-line config change if it
ever matters.

The backchannel would cost: **the hub stops being static** (it needs a server,
or CORS in all three apps — killing the property that a static hub structurally
cannot take an app down), three new stateful mint/redeem endpoints, and new
failure modes for expired and replayed tickets. **And it would put a real secret
in the URL** — a leaked ticket is a stealable seat, where a leaked name is a
name. That trades a non-secret for a secret and calls it hardening.

Note also that the URL is the *only* mechanism available: subdomains do not
share `localStorage` or `sessionStorage`, so a static cross-origin page has no
side channel even in principle.

**Where this answer flips:** if the hub ever passes something the app must not
let the user forge — "this person is an admin", "this person is authenticated as
X" — URL params become wrong and a signed token or real backchannel is required.
That is doc 11 §5.1's admin-OIDC candidate, and the answer there is the org's
Authentik, not a homegrown ticket. **The line is: player join → URL params;
admin identity → OIDC.** The distinction is whether the payload is a claim worth
forging.

The one thing a backchannel would genuinely buy is validating the code *before*
the jump, so a bad code errors on the hub rather than after it. Rule 4 covers
that acceptably, and the alternative needs a room-existence endpoint — which is
a room-enumeration oracle for free, and Pastebin is already hardening against
exactly that (§7.3 item 2).

### The five rules that make it safe

These exist because auto-submitting is genuinely more delicate than prefilling.
Getting any of them wrong produces a bug that only shows up on the deep-link
path, which is the path nobody exercises while developing.

1. **Fire only once the socket is open, and only once ever.** The intent cannot
   be sent before the connection exists, so it hangs off the socket's ready
   state. It also needs an explicit `attempted` guard, or a mid-game reconnect
   re-fires the join and takes a second seat. In YAWBG, `Home.svelte:12` already
   exposes `ready = socket.status === "open"`.

2. **If the deep-link code equals the stored session's code, resume — don't
   join.** This is the easiest rule to miss and the worst to debug: someone in
   room `ABCD` who clicks a hub link for `ABCD` would otherwise take a *second*
   seat in the room they are already sitting in. Check the stored session's code
   before deciding which intent to send.

3. **Otherwise the deep link wins.** A URL the user just acted on is a stronger
   signal than a session left in a tab. Join the new room and let the old seat
   lapse — the server's 120 s grace drops it, exactly as it would if they had
   typed the code by hand. YAWBG already has the machinery for this and it was
   written for precisely this hazard: `Home.svelte:10` captures `priorSession`
   and the effect at `:26` navigates only once a *new* seat replaces it, so a
   leftover session can never redirect you into the old room.

4. **On failure, fall back to the app's own landing with both fields prefilled
   and the error shown.** Room not found, room full, game already started,
   version mismatch — the user auto-submitted from a page they never typed into,
   so dumping them on a bare error is hostile. Prefilled-landing-plus-error lets
   them fix a mistyped code without retyping anything. YAWBG renders
   `socket.lastError` at `Home.svelte:94` already. *(This is the design that was
   originally proposed as the happy path; it survives as the error path, which
   is where it actually belongs.)*

5. **Strip the query string after firing**, with `history.replaceState`. It
   keeps a display name out of the address bar and out of anything the user
   subsequently copies or shares, and it makes a refresh resume through the
   stored session rather than re-running the deep link. Note that the name still
   passes through Caddy's access log if request URIs are logged — fine at this
   scale, but know that it does.

### Per-app status

Costs recalculated against the auto-submit contract. None of this is large; the
work is in getting rules 1–4 right, not in volume.

| App | Starting point | Work |
|---|---|---|
| **YAWBG** | `routes/Home.svelte:6` already reads `?code=`, and the `priorSession` → navigate effect (`:10`, `:26`) is rule 3 already built | Add the `?name=` / `?new=` reads and the guarded auto-submit effect. Small — the hard part already exists for another reason. |
| **Pastebin** | Landing is structurally YAWBG's `Home.svelte` (its design doc decision 7) | Same shape. Rule 2 matters *more* here: its session lives in `localStorage` and survives a tab close, so a returning user meets it constantly. Empty inbound name must fall back to its auto-identity, not reject. |
| **ito** | No router; `App.svelte` switches views on store state, and `stores/socket.ts` has no reconnect retry | Most work of the three. Read params on boot, drive `CREATE_ROOM`/`JOIN_ROOM` once the socket opens. The missing retry makes rule 1's "wait for open" need care — see its brief §3.1. |

---

## 6. Development

### The env check, rejected

The proposal on the table was: in development use each app's own landing, then
integration-test against the hub. **Don't branch on environment.** The
assumption underneath it — that the hub replaces the app's landing in
production — is false, and worth killing explicitly:

- In production `yawbg.it.kmitl.ac.th/` still has to render YAWBG's own landing.
  The display's QR code points at a room URL on that origin, anyone who
  bookmarks the app never passes through the hub, and Pastebin's whole sharing
  story is a `/r/CODE` link that skips it too.
- So there is no "hub mode" to guard. **The hub is purely additive** — it adds
  inbound links, it removes nothing.
- An `import.meta.env.DEV` branch here would be actively harmful: it guarantees
  the code path you ship is the one you never exercise locally.

### The four layers

| Layer | What it covers | Where it lives | Hub running? |
|---|---|---|---|
| Unit / integration | Everything each app already tests (`bun test`) | Each repo, unchanged | No |
| Deep-link entry | `/?code=ABCD&name=Nok` lands **in the room**; `/?name=Nok&new=1` lands in a fresh lobby; a bad code falls back to the prefilled landing with an error; the same-code case resumes rather than double-joining | Each repo — a scripted browser check is worth it here, since this is five rules and not one | No |
| Link table | Every hub target resolves | The edge repo | n/a |
| Cross-app smoke | hub → app → join, all three | The deploy checklist on the VM | Yes |

The point of the first two rows: **each app is testable in complete isolation,
exactly as it is today, and the deep-link path is testable by typing a URL.** No
app ever needs the hub present to be developed or verified.

The only legitimate dev/prod difference is **the hub's link table** —
`localhost:5173` vs `yawbg.it.kmitl.ac.th`. That is config, it lives in one
repo, and it is not smeared across three applications.

### Local rehearsal before touching the VM

Do this off-site; it is the step that turns the cutover into a config swap
rather than a debugging session (`04-roadmap.md` already says so for YAWBG
alone, and it is more true with three apps):

1. `docker network create edge` locally.
2. Build all three images.
3. Local Caddy with the same `Caddyfile`, a self-signed cert, and four
   `hosts`-file entries.
4. Click hub → each app → create a room → **leave a socket idle for over two
   minutes.** This is the one thing a local rehearsal genuinely proves about the
   proxy, and it is what M0's exit test asked for.

---

## 7. Per-app work

### 7.1 YAWBG

- **Deep link: implement §5's five rules in `routes/Home.svelte`.** Two of the
  pieces already exist for unrelated reasons — `:6` reads `?code=`, and the
  `priorSession` capture at `:10` plus the navigate effect at `:26` is rule 3
  built already. What's new: reading `?name=` and `?new=`, the `attempted`
  guard, the same-code resume check (rule 2), and the `replaceState` strip.
- Deploy stack exists (`Dockerfile`, `deploy/compose.yml`) and already joins
  `edge` with a `yawbg-data` volume. It is correct as written.
- **Enable the deploy workflow.** `.github/workflows/deploy.yml` has its `push:`
  trigger commented out pending runner registration, and reads `vars.DEPLOY_DIR`
  — set that repo variable when the VM checkout exists.
- **M6's operability list is still code, not config** (`04-roadmap.md`): host
  migration on host-drop, proposer-drops-mid-proposal, room GC for abandoned
  lobbies. None of it is location-gated, and none of it blocks the cutover — but
  it must land before the playtest that settles M6's exit test, or the feedback
  will be about the crash rather than the game.
- Nightly SQLite backup per `08-deployment.md`.

### 7.2 ito

Full brief: `C:\ito\docs\directions\hub-deployment-brief.md`. Summary of what
the cutover needs from it:

- Drop the nginx prod overlay and the `3000:3000` port publish; join `edge`.
  The port publish is also today's TLS-bypass hole — the app is directly
  reachable over plain HTTP.
- Read `?code=` on boot.
- Fix its deploy workflow: it hardcodes `/home/cruz/RubsarbWebBoardgame` and
  runs `docker compose down` before `up`, which its own
  `docs/directions/README.md` says to drop.
- Its bind-mounted `./db_data` should become a named volume.
- **Independently valuable and now more so:** it has no client reconnect retry
  and no server heartbeat, so a dead socket can go unnoticed for an hour. A hub
  means more phones arriving over flaky connections. If a `pong` handler is
  added, read the `socketId(ws)` landmine in its brief first.

### 7.3 Pastebin

Full brief: `C:\Pastebin\docs\02-hub-deployment-brief.md`. It has **no
deployment story at all** — no Dockerfile, no compose, no CI — so this is the
largest slice of new work, and it is also the app whose design assumptions
change most by going public.

The headline: **HTTPS gives it a secure context, which retires its single worst
wart.** `navigator.clipboard` works for real on `paste.it.kmitl.ac.th`, and
image copy — currently Download-only *purely* because of the secure-context
limit — becomes possible. Its design doc and README both need that recorded as
conditional on origin, with the `execCommand` fallback **kept**, since it is
still the path when running on the LAN.

Hardening, sized for "students passing lab code between PCs, fast and not
troublesome" — no login, no password, no captcha:

| # | Item | Why | User friction |
|---|---|---|---|
| 1 | **`VACUUM`** | Images are BLOBs *inside* SQLite. The 5-minute empty-room sweep deletes rows and frees pages but never shrinks the file, so the volume grows forever. This is a bug-in-waiting, not a nicety. | none |
| 2 | **Rate-limit joins at the WS layer** | 4 letters is 456,976 codes — sweepable in minutes with concurrency. Joins are WS intents, so an HTTP rate limit sees nothing once the socket is open; it must live in `RoomManager`/`app.ts`, per-IP. | none |
| 3 | **Code length as an env var**, 5–6 in prod | 26× or 676× the space. Most joins arrive by QR or `/r/CODE` link and never type it at all. | one character |
| 4 | **`noindex`** | Already handled at the Caddy layer (§3). A search engine holding a live room URL is the cheapest possible leak. | none |
| 5 | **Per-room media budget + global disk ceiling** | 10 MB × unbounded rooms is a free file host. Refuse rather than fill the volume. | none in normal use |
| 6 | **Re-justify the link-preview guard** | `linkPreview.ts`'s SSRF guard is documented as mattering because "the server sits inside the LAN". On the org VM it sits inside **KMITL's network** — a far better position to attack from. The guard's shape is already right; the *rationale* needs updating, and it is worth re-verifying it handles IPv6 and connects to the resolved address rather than re-resolving. | none |
| 7 | **Say it in the UI** | One line: "anyone with this code can read this room." The design doc already treats no-password as deliberate; making it visible costs nothing. | none |

---

## 8. Sequencing

Steps 1–2 are off-site work. Step 3 onward needs the VM.

1. **Local rehearsal** (§6) with all three images and a local Caddy.
2. **Pastebin containerization** — Dockerfile, compose, and items 1–3 of the
   hardening table. Can run in parallel with anything.
3. **Add the three A records**, all pointing at the existing VM IP.
4. **On the VM:** `docker network create edge`; stand up the edge stack with
   Caddy and the hub, mounting the **same cert pair nginx uses today**.
5. **ito:** drop the nginx overlay and the port publish, join `edge`.
6. **Cut over:** down old nginx, up Caddy. 80/443 changes hands in one step.
   Brief downtime is fine and expected.
7. **YAWBG:** deploy onto `edge`. Verify `/healthz` through the vhost, then
   create a room from a phone and leave the WS idle for over two minutes.
8. **Pastebin:** deploy onto `edge`.
9. **YAWBG M6 operability work** (§7.1) — not location-gated, but before the
   playtest.
10. **Playtest** → settles M6's exit test, and the four other verdicts the
    roadmap's ledger has been accumulating.

### Sequencing decision: deploy before the rest of M5

`04-roadmap.md` currently orders the remaining M5 slices — cohesion audit,
motion pass, PWA — ahead of M6. **That inverts, for the same reason it was set
that way in the first place: location is the scarce resource.** M6 is blocked on
being at the site and on nothing else; the M5 leftovers are polish that can be
done from anywhere. The PWA slice even argues for deploying first, since install
behaviour wants a real HTTPS origin to test against.

---

## 9. Conflicts found and how they resolve

Surveyed across all three repos on 2026-08-04.

| # | Conflict | Resolution |
|---|---|---|
| 1 | `08-deployment.md` plans a cutover from *ito*'s **live** nginx with mounted wildcard certs. *ito*'s `STATUS.md` says the deployment is shut down, and its `docs/directions/README.md` says the old box is gone and a prod host is an open decision. | **ito is live on the VM** (confirmed 2026-08-04). Doc 08 is right; *ito*'s two documents are stale and its brief asks for them to be corrected. |
| 2 | Doc 08 specifies `reverse_proxy ito:3001`. | Wrong — `ito:3000`. See §1. Doc 08 corrected. |
| 3 | Doc 11 is banner-marked "parked, not a plan; nothing here is scheduled." | Picked up 2026-08-04 through the roadmap, as that banner required. Its banner now points here. Its §1 facts remain accurate and useful; its §7 question lists are largely **answered** by this document. |
| 4 | Doc 11 predates Pastebin by a week and describes a two-app world. | Superseded by this document on scope. Not rewritten — it stays the record of the two-codebase comparison that produced the Option A recommendation. |
| 5 | *ito*'s workflow hardcodes `/home/cruz/RubsarbWebBoardgame` and runs `docker compose down` before `up`; its own directions doc says to drop that step. | In *ito*'s brief. |
| 6 | Pastebin's design doc frames its LAN position as the reason its SSRF guard matters, and its clipboard fallback as unconditional. | Both change meaning on a public origin. In Pastebin's brief; the fallback is **kept**, the rationale is rewritten. |
| 7 | Doc 11 §5.2 proposes a shared analytics session envelope for two games. | **Still open, still cheap, still not scheduled.** Pastebin has no analytics and should not acquire any for this. It is an ito+YAWBG question and this document does not settle it. |

---

## 10. What this does not change

- **The v1 non-goals in `02-architecture.md` stand.** In particular *no player
  accounts*: doc 11 §0's correction is the governing one — what the hub offers
  is a join form, not a login. There is no credential, no account, and no
  identity that survives a game. Nothing here touches that wall.
- **No merge.** Three codebases, three protocols, three databases, three deploy
  pipelines. Doc 11 §4's reasoning against Option C is unchanged and Pastebin
  strengthens it — it is not even a game.
- **The rule of three still applies to shared code.** No `packages/session`, no
  shared Room skeleton. A third *app* now exists, but it does not need the
  games' room lifecycle, so it is not the third data point that would justify
  the abstraction.
