#!/usr/bin/env python3
import io
import json
import os
import re
import shutil
import subprocess
import time
import zipfile
from datetime import datetime

import requests
from flask import Flask, Response, abort, jsonify, request, send_from_directory, stream_with_context

app = Flask(__name__, static_folder="dist", static_url_path="")

CF_KEY  = os.environ.get("CURSEFORGE_API_KEY", "")
CF_BASE = "https://api.curseforge.com/v1"
HDR     = {"x-api-key": CF_KEY, "Accept": "application/json"}

# ── Paths ──────────────────────────────────────────────────────────────────────
CACHE_PATH      = "/app/cache/mods.json"
CUSTOM_PATH     = "/app/cache/custom_mods.json"
SELECTIONS_PATH = "/app/cache/selections.json"
SNAPSHOTS_DIR   = "/mc-picker/snapshots"
BUILDS_DIR      = "/mc-picker/builds"
CURRENT_LINK    = "/mc-picker/current"          # symlink → active snapshot dir
CURRENT_PACK    = "/mc-picker/current.mrpack"   # what the MC server reads

PACKWIZ              = "/usr/local/bin/packwiz"
MINECRAFT_CONTAINER  = "minecraft"
MC_VERSION           = "1.21.1"
NEOFORGE_VERSION     = "21.1.228"

ATM10_PROJECT_ID = 925200

for _d in ("/app/cache", SNAPSHOTS_DIR, BUILDS_DIR):
    os.makedirs(_d, exist_ok=True)


# ── CurseForge helpers ─────────────────────────────────────────────────────────

def cf_get(path, **params):
    r = requests.get(f"{CF_BASE}{path}", headers=HDR, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def mod_from_raw(m, custom=False):
    links  = m.get("links") or {}
    cf_url = links.get("websiteUrl") or f"https://www.curseforge.com/minecraft/mc-mods/{m['slug']}"
    return {
        "id":         m["id"],
        "name":       m["name"],
        "slug":       m["slug"],
        "summary":    m.get("summary", ""),
        "categories": [c["name"] for c in m.get("categories", [])],
        "url":        cf_url,
        "infoUrl":    cf_url,
        "logo":       (m.get("logo") or {}).get("thumbnailUrl", ""),
        "downloads":  m.get("downloadCount", 0),
        **({"custom": True} if custom else {}),
    }


def fetch_atm10_mods():
    files       = cf_get(f"/mods/{ATM10_PROJECT_ID}/files", pageSize=5)
    latest      = files["data"][0]
    url_data    = cf_get(f"/mods/{ATM10_PROJECT_ID}/files/{latest['id']}/download-url")
    download_url = url_data["data"]

    r = requests.get(download_url, allow_redirects=True, timeout=120)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        with z.open("manifest.json") as f:
            manifest = json.load(f)

    project_ids = list({m["projectID"] for m in manifest["files"]})
    mods_raw    = []
    for i in range(0, len(project_ids), 50):
        batch = project_ids[i : i + 50]
        r = requests.post(
            f"{CF_BASE}/mods",
            headers={**HDR, "Content-Type": "application/json"},
            json={"modIds": batch},
            timeout=30,
        )
        r.raise_for_status()
        mods_raw.extend(r.json()["data"])
        time.sleep(0.05)

    mods = [mod_from_raw(m) for m in mods_raw]
    mods.sort(key=lambda x: x["name"].lower())
    return mods


def get_mods():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)
    mods = fetch_atm10_mods()
    with open(CACHE_PATH, "w") as f:
        json.dump(mods, f)
    return mods


def get_custom_mods():
    if os.path.exists(CUSTOM_PATH):
        with open(CUSTOM_PATH) as f:
            return json.load(f)
    return []


def save_custom_mods(mods):
    with open(CUSTOM_PATH, "w") as f:
        json.dump(mods, f)


def all_mods():
    atm = get_mods()
    atm_ids = {m["id"] for m in atm}
    custom = [m for m in get_custom_mods() if m["id"] not in atm_ids]
    return atm + custom


# ── Snapshot helpers ───────────────────────────────────────────────────────────

def new_snapshot_dir():
    name = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    path = os.path.join(SNAPSHOTS_DIR, name)
    os.makedirs(path, exist_ok=True)
    return name, path


def set_current(snapshot_name):
    target = os.path.join(SNAPSHOTS_DIR, snapshot_name)
    tmp    = CURRENT_LINK + ".tmp"
    if os.path.islink(tmp):
        os.remove(tmp)
    os.symlink(target, tmp)
    os.replace(tmp, CURRENT_LINK)


def current_snapshot_name():
    if os.path.islink(CURRENT_LINK):
        return os.path.basename(os.path.realpath(CURRENT_LINK))
    return None


def snapshot_mod_count(snapshot_path):
    mods_dir = os.path.join(snapshot_path, "mods")
    if not os.path.isdir(mods_dir):
        return 0
    return len([f for f in os.listdir(mods_dir) if f.endswith(".pw.toml")])


def parse_packwiz_result(result):
    if result.returncode == 0:
        return "ok", None
    combined = (result.stderr + result.stdout).lower()
    if any(x in combined for x in ("no files", "no results", "not found", "no mod")):
        msg = (result.stderr or result.stdout or "no compatible file").strip().split("\n")[0][:100]
        return "skipped", msg
    msg = (result.stderr or result.stdout or "unknown error").strip().split("\n")[0][:100]
    return "error", msg


def sse(obj):
    return f"data: {json.dumps(obj)}\n\n"


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/api/mods")
def api_mods():
    return jsonify(all_mods())


@app.route("/api/mods/refresh", methods=["POST"])
def api_mods_refresh():
    if os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)
    mods = fetch_atm10_mods()
    with open(CACHE_PATH, "w") as f:
        json.dump(mods, f)
    return jsonify({"count": len(mods)})


@app.route("/api/mods/custom", methods=["POST"])
def api_add_custom_mod():
    url   = (request.json or {}).get("url", "").strip()
    match = re.search(r'curseforge\.com/minecraft/[^/]+/([^/?#]+)', url)
    if not match:
        return jsonify({"error": "Paste a CurseForge mod page URL"}), 400
    slug   = match.group(1)
    search = cf_get("/mods/search", gameId=432, slug=slug, pageSize=1)
    if not search["data"]:
        return jsonify({"error": f"Mod '{slug}' not found"}), 404
    mod    = mod_from_raw(search["data"][0], custom=True)
    custom = get_custom_mods()
    if any(c["id"] == mod["id"] for c in custom):
        return jsonify({"error": "Already in your list", "mod": mod}), 409
    custom.append(mod)
    save_custom_mods(custom)
    return jsonify(mod)


@app.route("/api/mods/custom/<int:mod_id>", methods=["DELETE"])
def api_remove_custom_mod(mod_id):
    save_custom_mods([m for m in get_custom_mods() if m["id"] != mod_id])
    return jsonify({"ok": True})


@app.route("/api/selections")
def api_get_selections():
    if os.path.exists(SELECTIONS_PATH):
        with open(SELECTIONS_PATH) as f:
            return jsonify(json.load(f))
    return jsonify([])


@app.route("/api/selections", methods=["POST"])
def api_save_selections():
    ids = request.json.get("ids", [])
    with open(SELECTIONS_PATH, "w") as f:
        json.dump(ids, f)
    return jsonify({"saved": len(ids)})


# ── Build ──────────────────────────────────────────────────────────────────────

@app.route("/api/build", methods=["POST"])
def api_build():
    data       = request.json or {}
    sel_ids    = set(data.get("ids", []))
    pack_name  = (data.get("name") or "camerontora").strip() or "camerontora"
    selected   = [m for m in all_mods() if m["id"] in sel_ids]
    env        = {**os.environ, "CURSEFORGE_API_KEY": CF_KEY}

    def generate():
        yield sse({"type": "start", "total": len(selected)})

        snapshot_name, snapshot_path = new_snapshot_dir()

        # Init pack
        yield sse({"type": "log", "msg": "Initialising pack..."})
        result = subprocess.run(
            [PACKWIZ, "init", "--name", pack_name,
             "--mc-version", MC_VERSION,
             "--modloader", "neoforge",
             "--neoforge-version", NEOFORGE_VERSION, "-y"],
            cwd=snapshot_path, capture_output=True, text=True, timeout=30, env=env,
        )
        if result.returncode != 0:
            yield sse({"type": "error", "msg": f"packwiz init failed: {result.stderr[:200]}"})
            return

        # Add mods
        for i, m in enumerate(selected, 1):
            yield sse({"type": "mod", "id": m["id"], "name": m["name"], "status": "adding", "index": i})
            result = subprocess.run(
                [PACKWIZ, "curseforge", "add", "--addon-id", str(m["id"]), "-y"],
                cwd=snapshot_path, capture_output=True, text=True, timeout=60, env=env,
            )
            status, msg = parse_packwiz_result(result)
            yield sse({"type": "mod", "id": m["id"], "name": m["name"], "status": status, "msg": msg, "index": i})

        # Export .mrpack
        yield sse({"type": "log", "msg": "Exporting .mrpack..."})
        result = subprocess.run(
            [PACKWIZ, "modrinth", "export"],
            cwd=snapshot_path, capture_output=True, text=True, timeout=120, env=env,
        )
        if result.returncode != 0:
            yield sse({"type": "error", "msg": f"Export failed: {result.stderr[:200]}"})
            return

        mrpack_files = [f for f in os.listdir(snapshot_path) if f.endswith(".mrpack")]
        if not mrpack_files:
            yield sse({"type": "error", "msg": "No .mrpack produced"})
            return

        ts       = int(time.time())
        filename = f"{pack_name}-{ts}.mrpack"
        shutil.copy2(
            os.path.join(snapshot_path, mrpack_files[0]),
            os.path.join(BUILDS_DIR, filename),
        )
        os.remove(os.path.join(snapshot_path, mrpack_files[0]))

        # Export CurseForge zip
        yield sse({"type": "log", "msg": "Exporting CurseForge zip..."})
        cf_result = subprocess.run(
            [PACKWIZ, "curseforge", "export"],
            cwd=snapshot_path, capture_output=True, text=True, timeout=120, env=env,
        )
        cf_filename = None
        if cf_result.returncode == 0:
            cf_files = [f for f in os.listdir(snapshot_path) if f.endswith(".zip")]
            if cf_files:
                cf_filename = f"{pack_name}-{ts}-cf.zip"
                shutil.copy2(
                    os.path.join(snapshot_path, cf_files[0]),
                    os.path.join(BUILDS_DIR, cf_filename),
                )
                os.remove(os.path.join(snapshot_path, cf_files[0]))
        else:
            yield sse({"type": "log", "msg": f"CurseForge export failed: {cf_result.stderr[:100]}"})

        set_current(snapshot_name)
        yield sse({"type": "done", "snapshot": snapshot_name, "file": filename, "cf_file": cf_filename})

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


# ── Snapshots ──────────────────────────────────────────────────────────────────

@app.route("/api/snapshots")
def api_snapshots():
    if not os.path.isdir(SNAPSHOTS_DIR):
        return jsonify([])
    current = current_snapshot_name()
    result  = []
    for name in sorted(os.listdir(SNAPSHOTS_DIR), reverse=True)[:20]:
        path = os.path.join(SNAPSHOTS_DIR, name)
        if not os.path.isdir(path):
            continue
        result.append({
            "name":       name,
            "mod_count":  snapshot_mod_count(path),
            "is_current": name == current,
        })
    return jsonify(result)


@app.route("/api/snapshots/<name>/activate", methods=["POST"])
def api_activate_snapshot(name):
    path = os.path.join(SNAPSHOTS_DIR, name)
    if not os.path.isdir(path):
        return jsonify({"error": "Snapshot not found"}), 404
    set_current(name)
    return jsonify({"ok": True})


# ── Server control ─────────────────────────────────────────────────────────────

RESTART_COUNTDOWN = 30  # seconds


def rcon(container, cmd):
    try:
        container.exec_run(["/bin/sh", "-c", f"rcon-cli {cmd}"], detach=False)
    except Exception:
        pass


@app.route("/api/server/apply", methods=["POST"])
def api_server_apply():
    if not os.path.islink(CURRENT_LINK):
        return jsonify({"error": "No pack built yet — run a build first"}), 400

    def generate():
        import docker as docker_lib
        try:
            client    = docker_lib.from_env()
            container = client.containers.get(MINECRAFT_CONTAINER)
        except Exception as e:
            yield sse({"type": "error", "msg": f"Docker error: {e}"})
            return

        yield sse({"type": "log", "msg": "Connecting to server..."})

        if container.status != "running":
            yield sse({"type": "log", "msg": "Server is not running — starting..."})
            container.start()
            yield sse({"type": "done"})
            return

        # Warn players and count down
        rcon(container, f"say §eServer restarting in {RESTART_COUNTDOWN} seconds to load new mods.")
        yield sse({"type": "log", "msg": f"Players warned — restarting in {RESTART_COUNTDOWN}s"})

        for tick in range(RESTART_COUNTDOWN, 0, -1):
            yield sse({"type": "countdown", "seconds": tick})
            if tick == 10:
                rcon(container, "say §eServer restarting in 10 seconds.")
            elif tick == 5:
                rcon(container, "say §eServer restarting in 5 seconds.")
            elif tick == 3:
                rcon(container, "say §c3...")
            elif tick == 2:
                rcon(container, "say §c2...")
            elif tick == 1:
                rcon(container, "say §c1...")
            time.sleep(1)

        yield sse({"type": "log", "msg": "Saving world..."})
        rcon(container, "save-all")
        time.sleep(3)

        yield sse({"type": "log", "msg": "Stopping server gracefully..."})
        rcon(container, "stop")

        # Wait for itzg to restart and download mods
        yield sse({"type": "log", "msg": "Waiting for server to restart and download mods..."})
        for i in range(60, 0, -1):
            yield sse({"type": "waiting", "seconds": i})
            time.sleep(1)

        yield sse({"type": "done"})

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


# ── Pack workspace (served so PACKWIZ_URL could work if needed) ────────────────

@app.route("/workspace/<path:filename>")
def serve_workspace(filename):
    if not os.path.islink(CURRENT_LINK):
        abort(404)
    return send_from_directory(os.path.realpath(CURRENT_LINK), filename)


# ── Pack downloads ─────────────────────────────────────────────────────────────

@app.route("/api/packs")
def api_packs():
    try:
        files = sorted(
            [f for f in os.listdir(BUILDS_DIR) if f.endswith(".mrpack")],
            key=lambda f: os.path.getmtime(os.path.join(BUILDS_DIR, f)),
            reverse=True,
        )
    except OSError:
        files = []
    return jsonify([{"name": f, "url": f"/packs/{f}"} for f in files[:10]])


@app.route("/packs/latest-cf")
def serve_pack_latest_cf():
    try:
        files = sorted(
            [f for f in os.listdir(BUILDS_DIR) if f.endswith("-cf.zip")],
            key=lambda f: os.path.getmtime(os.path.join(BUILDS_DIR, f)),
            reverse=True,
        )
    except OSError:
        files = []
    if not files:
        abort(404)
    from flask import redirect
    return redirect(f"/packs/{files[0]}")

@app.route("/packs/latest")
def serve_pack_latest():
    try:
        files = sorted(
            [f for f in os.listdir(BUILDS_DIR) if f.endswith(".mrpack")],
            key=lambda f: os.path.getmtime(os.path.join(BUILDS_DIR, f)),
            reverse=True,
        )
    except OSError:
        files = []
    if not files:
        abort(404)
    from flask import redirect
    return redirect(f"/packs/{files[0]}")

@app.route("/packs/<path:filename>")
def serve_pack(filename):
    return send_from_directory(BUILDS_DIR, filename, as_attachment=True)


# ── Frontend ───────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)
