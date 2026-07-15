# 08 — Deployment & shipping

How YAWBG gets to production. Extends the deployment section of
`02-architecture.md` (multi-stage Dockerfile, single origin, SQLite volume)
into a concrete ship recipe. Friends/org scale throughout — minimal moving
parts beats clever infrastructure.

## Topology decision

**One org VM hosts both *ito* and YAWBG behind a single edge proxy (Caddy),
using name-based virtual hosts.** A dedicated fresh VM is the same recipe
minus the *ito* vhost.

```
DNS: yawbg.<org-domain>  ─┐                        ┌─► yawbg container (Bun :3000)
                          ├─► org VM — Caddy :443 ─┤     SPA + /api + /ws
DNS: ito.<org-domain>    ─┘                        └─► ito container (Bun :3001)
```

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
yawbg.example.org {
    reverse_proxy yawbg:3000
}

ito.example.org {
    reverse_proxy ito:3001
}
```

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
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
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

One-time cutover to the shared-edge topology (brief downtime is fine):

1. `docker network create edge` on the VM.
2. Stand up the edge Caddy stack, mounting the **same wildcard cert pair**
   nginx uses today, with vhosts for both apps.
3. In *ito*'s compose: drop the nginx prod overlay, drop the `3000:3000`
   port publish (this also closes today's TLS-bypass hole where the app is
   directly reachable over plain HTTP), join the `edge` network.
4. Down *ito*'s old nginx, up Caddy — 80/443 change hands in one step.
5. Add the YAWBG DNS record → deploy the YAWBG stack onto `edge`.

*ito*'s application code needs zero changes; the proxy swap is invisible to it.

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

- One file on the `yawbg-data` named volume. That is the whole database.
- Backup: nightly `sqlite3 /data/yawbg.sqlite ".backup /backups/yawbg-$(date +%F).sqlite"`
  (or a plain file copy at idle hours — decks and finished game logs only;
  losing a day is losing nothing critical).
- Restore: put the file back, restart the container.

## Non-goals (mirrors 02)

No Kubernetes/Swarm, no image registry requirement (build on the VM), no
zero-downtime deploys, no horizontal scaling, no managed database. If YAWBG
ever outgrows this page, that's a good problem for a future doc.
