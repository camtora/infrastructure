# Mod Picker

Minecraft modpack curator for NeoForge 1.21.1, available at mods.camerontora.ca.

**URL:** https://mods.camerontora.ca  
**Auth:** Google SSO (camerontora.ca account required)

## Overview

A web tool for building and managing a custom Minecraft modpack by browsing and selecting from the full All the Mods 10 (ATM10) mod list. ATM10 is used as the source because every mod in it is known-compatible with NeoForge 1.21.1.

Selections persist server-side across sessions and devices. Build Pack runs packwiz, saves a versioned snapshot, and wires directly into the Minecraft server — clicking Apply to Server does a graceful RCON-warned restart that downloads all mods fresh from CurseForge.

## Features

- **Browse view** — searchable, filterable grid of ~480 ATM10 mods with logos, download counts, category chips, and CurseForge info links
- **My Pack view** — tile grid of selected mods; click to deselect
- **Custom mods** — add any CurseForge mod by URL via the `+` button (stored separately from ATM10 cache)
- **Persistent selections** — auto-saved server-side 800ms after each change; works from any browser or device
- **Build Pack** — full-page build view with live per-mod status badges (pending / adding / ok / skipped / error), progress bar, and build log
- **Snapshot history** — every build is saved as a timestamped packwiz project under `/GAMES/mc-picker/snapshots/`; revert to any previous build via the UI
- **Apply to Server** — RCON 30-second countdown with in-game warnings, graceful `save-all` + `stop`, itzg auto-restarts and downloads mods fresh via `PACKWIZ_URL`
- **Download .mrpack** — standard Modrinth modpack format for client distribution

## Architecture

```
mods.camerontora.ca
        │
        ▼
   nginx-proxy (OAuth2 auth — port 3010)
        │
        ▼ via infra-net (container name: mod-picker:8000)
   mod-picker container
   ┌────────────────────────────────────────────────┐
   │  Frontend (Preact + Vite + Tailwind)           │
   │  └── served as static dist/ by Flask           │
   │                                                │
   │  Backend (Python/Flask)                        │
   │  ├── GET  /api/mods              — ATM10 list  │
   │  ├── POST /api/mods/refresh      — clear cache │
   │  ├── POST /api/mods/custom       — add by URL  │
   │  ├── DEL  /api/mods/custom/<id> — remove       │
   │  ├── GET  /api/selections        — saved IDs   │
   │  ├── POST /api/selections        — save IDs    │
   │  ├── POST /api/build             — SSE stream  │
   │  ├── GET  /api/snapshots         — list builds │
   │  ├── POST /api/snapshots/<n>/activate — revert │
   │  ├── GET  /workspace/<path>      — serve pack  │
   │  ├── POST /api/server/apply      — RCON restart│
   │  ├── GET  /api/packs             — .mrpack list│
   │  └── GET  /packs/<file>          — download    │
   └────────────────────────────────────────────────┘
        │                        │
        ├──► CurseForge API      ├──► packwiz binary (host mount)
        ├──► /GAMES/mc-picker/   └──► Docker socket (for RCON restart)
        └──► minecraft container (via Docker SDK + RCON)
```

**Network:** minecraft container joins `infrastructure_default` so it can reach mod-picker by container name at `http://mod-picker:8000`.

## Directory layout — /GAMES/mc-picker/

```
/GAMES/mc-picker/
  snapshots/
    2026-04-26_160633/    ← packwiz project (pack.toml, index.toml, mods/*.pw.toml)
    2026-04-26_163100/    ← each Build Pack creates one
  current -> snapshots/2026-04-26_163100/   ← symlink to active snapshot
  builds/
    camerontora-1745681193.mrpack            ← exported .mrpack files
```

The `current` symlink is what the Minecraft server reads via `PACKWIZ_URL`. Reverting changes the symlink atomically and restarts the server.

## Data Flow

### Mod list
1. Flask checks `/app/cache/mods.json` — fetches from CurseForge if missing
2. Downloads ATM10 zip (project ID `925200`), extracts `manifest.json`
3. Batch-fetches ~480 mod details from CurseForge API (50 per request)
4. Caches to volume; subsequent loads are instant
5. Custom mods stored in `/app/cache/custom_mods.json` — merged into list at runtime

### Build Pack
1. Creates `/GAMES/mc-picker/snapshots/<timestamp>/`
2. Runs `packwiz init --name <name> --mc-version 1.21.1 --modloader neoforge --neoforge-version 21.1.228 -y`
3. Runs `packwiz curseforge add --addon-id <id> -y` for each selected mod — streams `{"type":"mod", "status":"adding"|"ok"|"skipped"|"error"}` JSON via SSE
4. Runs `packwiz modrinth export` → `.mrpack` moved to `/GAMES/mc-picker/builds/`
5. Updates `current` symlink atomically
6. Selections unchanged — keep adding/removing and rebuild anytime

### Apply to Server
1. Checks container is running; if not, starts it
2. Broadcasts RCON: *"Server restarting in 30 seconds to load new mods"*
3. Counts down with RCON messages at 10s, 5s, 3, 2, 1 — streams live countdown to UI
4. RCON `save-all` → wait 3s → RCON `stop`
5. itzg auto-restarts (`restart: unless-stopped`), reads `PACKWIZ_URL=http://mod-picker:8000/workspace/pack.toml`
6. packwiz-installer downloads all mods from CurseForge into `/data/mods/`

## Volumes & Mounts

| Source | Container mount | Purpose |
|--------|----------------|---------|
| `mod-picker-cache` (Docker volume) | `/app/cache` | Mod list cache, selections, custom mods |
| `/GAMES/mc-picker` (host bind) | `/mc-picker` | Snapshots, builds, current symlink |
| `/home/camerontora/.local/bin/packwiz` | `/usr/local/bin/packwiz` (ro) | packwiz binary |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker SDK for RCON restart |

## Environment

| Variable | Source | Purpose |
|----------|--------|---------|
| `CURSEFORGE_API_KEY` | `infrastructure/.env` | CurseForge API access for mod picker |

The Minecraft container also needs this key (in `minecraft/.env`) so itzg can download CurseForge mods via packwiz-installer.

## Key IDs

| Thing | ID / value |
|-------|-----------|
| ATM10 CurseForge project | `925200` |
| Simple Voice Chat CurseForge project | `416089` (NOT 498303 which is a Bukkit plugin) |
| Placebo (required by FastWorkbench) | `283644` |

## Operations

```bash
# Start / restart mod picker
cd ~/infrastructure && docker-compose up -d mod-picker

# View logs
docker-compose logs -f mod-picker

# Rebuild after code changes
docker-compose build mod-picker && docker-compose up -d mod-picker

# Force refresh the ATM10 mod list (clears cache — takes ~60s)
curl -X POST https://mods.camerontora.ca/api/mods/refresh

# Inspect current packwiz snapshot
ls /GAMES/mc-picker/snapshots/$(readlink /GAMES/mc-picker/current | xargs basename)/mods/

# Manually revert to a previous snapshot (then restart server)
docker exec mod-picker python3 -c "
import os, subprocess
name = '2026-04-26_160633'  # snapshot to revert to
target = f'/mc-picker/snapshots/{name}'
tmp = '/mc-picker/current.tmp'
os.symlink(target, tmp)
os.replace(tmp, '/mc-picker/current')
"
cd ~/minecraft && docker-compose restart minecraft
```

## Client Pack Distribution

The `.mrpack` from Build Pack is importable in any modern launcher:
- **Prism Launcher** — Add Instance → Import from .mrpack
- **Modrinth App** — File → Add instance → Import from file
- **CurseForge App** — Create Custom Profile → Import

Currently requires auth to download from `mods.camerontora.ca/packs/`. Public hosting is Phase 2.

## Known Issues / Phase 2 Backlog

- **Dependency tree** — packwiz doesn't auto-resolve CurseForge mod dependencies. Missing deps only surface as server crash on startup. Phase 2: when a mod is selected, fetch its required dependencies from the CurseForge API and auto-select them (greyed out, non-removable).
- **Delete custom mods via UI** — custom mods added via `+` can only be removed via SSH currently.
- **Public .mrpack download URL** — `/packs/` is behind OAuth. Phase 2: add a public nginx location for pack downloads so friends can download without a camerontora.ca login, and set `PACK_URL` in the server env for clean distribution.
- **Apply to Server 404 retries** — when the server restarts via RCON, packwiz-installer sometimes gets a brief 404 on pack.toml before succeeding (mod-picker SSE stream may temporarily block requests). Self-heals within a few retries. Phase 2: add a startup delay or health check before packwiz-installer runs.

## Source Layout

```
infrastructure/mod-picker/
  Dockerfile              — multi-stage: Node (Vite build) → Python runtime
  backend/
    app.py                — Flask API + static file serving
    requirements.txt      — flask, requests, docker
  frontend/
    public/
      favicon.svg         — violet cube favicon
    src/
      App.jsx             — Browse, My Pack, and Build views
      index.css           — glassmorphism styles (violet accent)
      main.jsx
    index.html
    package.json
    vite.config.js
    tailwind.config.js
    postcss.config.js
```
