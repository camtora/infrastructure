# Mod Picker

Minecraft modpack curator for NeoForge 1.21.1, available at mods.camerontora.ca.

**URL:** https://mods.camerontora.ca  
**Auth:** Google SSO (camerontora.ca account required)

## Overview

A web tool for building a custom Minecraft modpack by browsing and selecting from the full All the Mods 10 (ATM10) mod list. ATM10 is used as the source because every mod in it is known-compatible with NeoForge 1.21.1 — no compatibility checking needed.

Selections persist server-side so you can build the pack incrementally across sessions. When ready, clicking **Build Pack** runs packwiz server-side and exports a `.mrpack` file for download and distribution.

## Features

- **Browse view** — searchable, filterable grid of all ~480 ATM10 mods with logos, summaries, and category chips
- **My Pack view** — clean list of selected mods with hover-to-remove; searchable
- **Persistent selections** — saved to server on every change, restored on any device/browser
- **One-click build** — streams packwiz progress live; produces a downloadable `.mrpack`
- **Build history** — last 10 builds available for re-download

## Architecture

```
mods.camerontora.ca
        │
        ▼
   nginx-proxy (OAuth2 auth)
        │
        ▼ host.docker.internal:3010
   mod-picker container (port 3010)
   ┌──────────────────────────────────────────┐
   │  Frontend (Preact + Vite + Tailwind)     │
   │  └── served as static dist/ by Flask     │
   │                                          │
   │  Backend (Python/Flask)                  │
   │  ├── GET  /api/mods        — ATM10 list  │
   │  ├── POST /api/mods/refresh — clear cache│
   │  ├── GET  /api/selections  — saved IDs   │
   │  ├── POST /api/selections  — save IDs    │
   │  ├── POST /api/build       — SSE stream  │
   │  ├── GET  /api/packs       — build list  │
   │  └── GET  /packs/<file>    — download    │
   └──────────────────────────────────────────┘
        │
        ├──► CurseForge API (mod list, project 925200)
        └──► packwiz (mounted from host)
```

## Data Flow

### First load (mod list)
1. Flask checks `/app/cache/mods.json` — if missing, fetches from CurseForge
2. Downloads ATM10 modpack zip (project ID `925200`, latest file)
3. Extracts `manifest.json` → batch-fetches all ~480 mod details from CurseForge API
4. Caches to `/app/cache/mods.json` (persists across restarts via Docker volume)
5. Subsequent loads serve from cache instantly

### Selections
- Stored at `/app/cache/selections.json` in the persistent volume
- Auto-saved 800ms after each toggle
- Loaded on every page open; works across any browser or device

### Build
1. Creates a temp directory
2. Runs `packwiz init --mc-version 1.21.1 --modloader neoforge --modloader-version 21.1.228`
3. Runs `packwiz curseforge add --addon-id <id> -y` for each selected mod (streams progress via SSE)
4. Runs `packwiz modrinth export` → produces `.mrpack`
5. Moves `.mrpack` to `/app/packs/` (persistent volume), returns download URL
6. Selections are unchanged — add/remove more mods and build again at any time

## Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `mod-picker-cache` | `/app/cache` | ATM10 mod list cache + saved selections |
| `mod-picker-packs` | `/app/packs` | Built `.mrpack` files |

## Environment

| Variable | Source | Purpose |
|----------|--------|---------|
| `CURSEFORGE_API_KEY` | `infrastructure/.env` | CurseForge API access |

The packwiz binary is bind-mounted from the host:
```
/home/camerontora/.local/bin/packwiz → /usr/local/bin/packwiz (read-only)
```

## Operations

```bash
# Start / restart
docker-compose up -d mod-picker

# View logs
docker-compose logs -f mod-picker

# Force refresh the ATM10 mod list (clears cache)
curl -X POST https://mods.camerontora.ca/api/mods/refresh

# Rebuild after code changes
docker-compose build mod-picker && docker-compose up -d mod-picker
```

## Distributing the Pack

The `.mrpack` file produced by Build Pack is a standard Modrinth modpack format. Recipients can import it via:
- **Modrinth App** — File → Add instance → Import from file
- **CurseForge App** — Create Custom Profile → Import
- **Prism Launcher** — Add Instance → Import from .mrpack

## Source Layout

```
infrastructure/mod-picker/
  Dockerfile              — multi-stage: Node (Vite build) → Python runtime
  backend/
    app.py                — Flask API + static file serving
    requirements.txt
  frontend/
    src/
      App.jsx             — main UI (browse + my pack views, build modal)
      index.css           — glassmorphism styles matching site theme
    index.html
    package.json
    vite.config.js
    tailwind.config.js
    postcss.config.js
```
