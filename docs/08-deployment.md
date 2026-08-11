# 08 — Deployment & shipping

How YAWBG gets to production. Extends the deployment section of
`02-architecture.md` (multi-stage Dockerfile, single origin, SQLite volume)
into a concrete ship recipe. Friends/org scale throughout — minimal moving
parts beats clever infrastructure.

## Topology decision

**One org VM hosts every app behind a single edge proxy (Caddy), using
name-based virtual hosts.** A dedicated fresh VM is the same recipe with fewer
vhosts.

> **Extended 2026-08-04 by `12-hub-and-deployment.md`**, which is the plan of
> record for the actual cutover. It adds a third app (*Pastebin*) and a static
> landing page (`cruzhub`) as a fourth vhost, and fixes the port error noted
> below. This document remains the reference for *how* the proxy, TLS, compose
> and SQLite care work; doc 12 is the reference for *what is being shipped and
> in what order*.

```
DNS: cruzhub.<org-domain> ─┐                        ┌─► static hub page (file_server)
DNS: yawbg.<org-domain>   ─┤                        ├─► yawbg container    (Bun :3000)
DNS: ito.<org-domain>     ─┼─► org VM — Caddy :443 ─┤     SPA + /api + /ws
DNS: paste.<org-domain>   ─┘                        ├─► ito container      (Bun :3000)
                                                    └─► pastebin container (Bun :3000)
```

**Every app container listens on 3000.** An earlier version of this document
said `ito:3001`; that was leftover port-publishing thinking. Behind the `edge`
network with no host ports published, container DNS names disambiguate the
services, so no app needs a distinct port and *ito* needs no port change at all.

**A wildcard cert covers exactly one label**, so every vhost must sit at the
same depth: `yawbg.<org-domain>` is covered by `*.<org-domain>`,
`yawbg.cruzhub.<org-domain>` is not. Nesting app hostnames under the hub's was
considered and rejected for this reason — it needs *more* DNS records, not
fewer, plus a second wildcard.

- Each app is one container with its own compose project → **independent
  deploys**; shipping YAWBG never touches *ito*.
- Apps and proxy meet on a shared external Docker network (`edge`). App
  containers publish **no host ports**; only Caddy is exposed.
- Both apps are single-process and near-idle between game nights; a small VM
  carries both. Accepted trade-off: shared blast radius (VM reboot = both
  games down briefly) — fine at org scale.
- If the *ito* VM already runs a different proxy (nginx/traefik), don't add
  Caddy beside it — add a YAWBG vhost to the existing proxy instead. Hard
  requirements for any proxy are in the table below.

## Reverse-proxy requirements (any proxy)

| Requirement | Why | Caddy | nginx equivalent |
|---|---|---|---|
| WebSocket upgrade on `/ws` | The entire game runs over one WS | automatic | `proxy_http_version 1.1;` + `proxy_set_header Upgrade $http_upgrade;` + `proxy_set_header Connection "upgrade";` |
| Idle/read timeout > heartbeat interval | Quiet open-floor sockets must not be severed | no default timeout | `proxy_read_timeout` (default 60 s **will** kill sockets) |
| Single upstream per vhost | Single-origin design: SPA, `/api`, `/ws` from one process | `reverse_proxy` | one `location /` block |

## Caddy configuration

`Caddyfile` — the entire proxy config:

```caddy
(site) {
    tls /certs/server.crt /certs/server.key
    header X-Robots-Tag "noindex, nofollow"
}

cruzhub.example.org {
    import site
    root * /srv/hub
    file_server
}

yawbg.example.org {
    import site
    reverse_proxy yawbg:3000
}

ito.example.org {
    import site
    reverse_proxy ito:3000
}

paste.example.org {
    import site
    reverse_proxy pastebin:3000
}
```

`noindex` is global rather than per-site on purpose: every one of these
hostnames serves URLs containing a live room code, and a search engine holding
one is the cheapest possible leak. It costs users nothing.

### TLS — pick the mode matching what the org provides

| Org situation | Config |
|---|---|
| Public domain, VM reachable on 80/443 | Nothing — Caddy auto-issues Let's Encrypt certs and renews them |
| Org-internal ACME CA (smallstep etc.) | Global option `acme_ca https://ca.<org>/acme/acme/directory` — issuance stays automatic |
| Org hands over certificate files | Per vhost: `tls /certs/server.crt /certs/server.key`; renewal = replace files, `docker compose exec caddy caddy reload` |

**Confirmed mode: file-based.** The org issues a **wildcard** cert, and the
pair already lives on the *ito* VM (mounted into its nginx today). One
wildcard pair covers every vhost, so both site blocks carry the same `tls`
line and YAWBG needs no new certificate — only a DNS record for its hostname
pointing at the same VM.

## Compose layout

One shared network, created once per VM: `docker network create edge`.

**Edge stack** (once per VM, its own directory/repo):

```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - /etc/org-certs:/certs:ro   # only for file-based TLS mode
    networks: [edge]
    restart: unless-stopped
volumes:
  caddy-data:
networks:
  edge:
    external: true
```

**YAWBG stack** (lives in this repo as `deploy/compose.yml` once M0 lands):

```yaml
services:
  yawbg:
    build: ..                      # the multi-stage Dockerfile from 02
    volumes:
      - yawbg-data:/data           # the entire persistence story
    environment:
      DB_PATH: /data/yawbg.sqlite
    networks: [edge]
    restart: unless-stopped
    healthcheck:
      # oven/bun:1 ships no wget/curl; bun itself is the probe
      test: ["CMD", "bun", "-e", "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 30s
volumes:
  yawbg-data:
networks:
  edge:
    external: true
```

*ito* joins the same `edge` network the same way, whenever it migrates to
this VM.

## Migrating the existing *ito* deployment

What *ito* ships today (surveyed from its repo, 2026-07): base compose runs
the app with a **published host port `3000:3000`**, plus a prod overlay
(`docker-compose.prod.yml`) adding an `nginx:alpine` container that owns
80/443, terminates TLS with the org wildcard cert files, and proxies to the
app — with WS upgrade headers and `proxy_read_timeout 3600s` (they hit
exactly the timeout trap in the requirements table above). Deploys run via a
GitHub Actions workflow on a **self-hosted runner on the VM**: push to main →
`git pull` → `docker compose up -d --build`.

**Still true as of 2026-08-04** — confirmed by the developer at the site. Note
that three documents *in ito's own repo* (`STATUS.md`, `CLAUDE.md` and
`docs/directions/README.md`) claim that deployment is shut down and "the old box
is gone". They are stale; ito's brief asks for them to be verified against the
VM and corrected. Resolving this contradiction was the single biggest unknown in
planning the cutover.

One-time cutover to the shared-edge topology (brief downtime is fine):

1. Add the three new DNS records (`cruzhub`, `yawbg`, `paste`), all pointing at
   the existing VM IP. *ito*'s record does not move.
2. `docker network create edge` on the VM.
3. Stand up the edge Caddy stack **alongside the running nginx**, mounting the
   **same wildcard cert pair** nginx uses today, with all four vhosts.
4. In *ito*'s compose: drop the nginx prod overlay, drop the `3000:3000`
   port publish (this also closes today's TLS-bypass hole where the app is
   directly reachable over plain HTTP), join the `edge` network.
5. Down *ito*'s old nginx, up Caddy — 80/443 change hands in one step. This is
   the only user-visible downtime, and it should be seconds.
6. Deploy the YAWBG stack onto `edge`, then Pastebin's.

*ito*'s application code needs zero changes; the proxy swap is invisible to it.
The full ordered plan, including the off-site rehearsal that should precede all
of this, is `12-hub-and-deployment.md` §8.

## Deploy flow

Reuse *ito*'s proven pattern: **GitHub Actions with the org's self-hosted
runner** — push to main → runner does `git pull` + `docker compose up -d
--build` in the deploy directory. Manual fallback:

1. `ssh` to the VM → `git pull` → `docker compose build` →
   `docker compose up -d`.
2. **Deploys drop live games** — live room state is memory-only *by design*
   (`02-architecture.md`). Ship between game nights, or eyeball the admin
   game-log/room activity first. No zero-downtime machinery; a 5-second
   restart is the accepted cost.
3. Verify: `https://yawbg.<org>/healthz` through the vhost, then create a
   room from a phone and check the WS survives ≥ 2 minutes idle (proves the
   proxy timeout is right — the M0 exit test covers this).

## SQLite care

- **The image ships `decks/`** and the server upserts every `decks/*.json`
  (skipping `*.example.json`) into SQLite on boot, keyed by the `id` *inside*
  the file. Seeding is idempotent, so a redeploy refreshes edited seed decks
  without touching anything else. Without the deck copy the server boots fine
  but `lobby.start` rejects with "the selected decks have no topics".
- Live game state is **memory-only** by design (`02-architecture.md`): a
  restart drops in-progress games. Deploy between sessions, not mid-game.
- One file on the `yawbg-data` named volume. That is the whole database.
- Backup: nightly `sqlite3 /data/yawbg.sqlite ".backup /backups/yawbg-$(date +%F).sqlite"`
  (or a plain file copy at idle hours — decks and finished game logs only;
  losing a day is losing nothing critical).
- Restore: put the file back, restart the container.

## Non-goals (mirrors 02)

No Kubernetes/Swarm, no image registry requirement (build on the VM), no
zero-downtime deploys, no horizontal scaling, no managed database. If YAWBG
ever outgrows this page, that's a good problem for a future doc.
