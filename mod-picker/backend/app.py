#!/usr/bin/env python3
import io
import json
import os
import re
import shutil
import subprocess
import threading
import time
import zipfile
from datetime import datetime

import anthropic
import requests
from flask import Flask, Response, abort, jsonify, request, send_from_directory, stream_with_context

app = Flask(__name__, static_folder="dist", static_url_path="")

CF_KEY  = os.environ.get("CURSEFORGE_API_KEY", "")
CF_BASE = "https://api.curseforge.com/v1"
HDR     = {"x-api-key": CF_KEY, "Accept": "application/json"}

# ── Paths ──────────────────────────────────────────────────────────────────────
CACHE_PATH        = "/app/cache/mods.json"
CUSTOM_PATH       = "/app/cache/custom_mods.json"
HIDDEN_PATH       = "/app/cache/hidden_mods.json"
SELECTIONS_PATH   = "/app/cache/selections.json"
DEP_INFO_PATH     = "/app/cache/dep_info.json"
ATM10_VERSION_PATH = "/app/cache/atm10_version.json"
SNAPSHOTS_DIR   = "/mc-picker/snapshots"
BUILDS_DIR      = "/mc-picker/builds"
CURRENT_LINK    = "/mc-picker/current"          # symlink → active snapshot dir
CURRENT_PACK    = "/mc-picker/current.mrpack"   # what the MC server reads

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODWIKI_PATH      = "/modwiki"

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


def notify_discord(msg):
    url = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not url:
        return
    try:
        requests.post(url, json={"content": msg}, timeout=10)
    except Exception:
        pass


def fetch_atm10_mods():
    files        = cf_get(f"/mods/{ATM10_PROJECT_ID}/files", pageSize=5)
    latest       = files["data"][0]
    url_data     = cf_get(f"/mods/{ATM10_PROJECT_ID}/files/{latest['id']}/download-url")
    download_url = url_data["data"]

    with open(ATM10_VERSION_PATH, "w") as f:
        json.dump({"file_id": latest["id"], "display_name": latest.get("displayName", "")}, f)

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


def get_hidden_ids():
    if os.path.exists(HIDDEN_PATH):
        with open(HIDDEN_PATH) as f:
            return set(json.load(f))
    return set()


def save_hidden_ids(ids):
    with open(HIDDEN_PATH, "w") as f:
        json.dump(list(ids), f)


def all_mods():
    hidden = get_hidden_ids()
    atm = [m for m in get_mods() if m["id"] not in hidden]
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


@app.route("/api/mods/hidden")
def api_get_hidden():
    return jsonify(list(get_hidden_ids()))


@app.route("/api/mods/hidden/<int:mod_id>", methods=["POST"])
def api_hide_mod(mod_id):
    ids = get_hidden_ids()
    ids.add(mod_id)
    save_hidden_ids(ids)
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


# ── Dependency resolution ──────────────────────────────────────────────────────

@app.route("/api/deps", methods=["GET"])
def api_get_deps():
    if os.path.exists(DEP_INFO_PATH):
        with open(DEP_INFO_PATH) as f:
            return jsonify(json.load(f))
    return jsonify({})


@app.route("/api/deps/<int:mod_id>", methods=["DELETE"])
def api_delete_dep(mod_id):
    if os.path.exists(DEP_INFO_PATH):
        with open(DEP_INFO_PATH) as f:
            dep_info = json.load(f)
        dep_info.pop(str(mod_id), None)
        with open(DEP_INFO_PATH, "w") as f:
            json.dump(dep_info, f)
    return jsonify({"ok": True})


@app.route("/api/deps", methods=["POST"])
def api_check_deps():
    sel_ids  = set(request.json.get("ids", []))
    known    = {m["id"]: m for m in all_mods()}
    deps     = {}

    for mod_id in sel_ids:
        mod_name = (known.get(mod_id) or {}).get("name", str(mod_id))
        try:
            files = cf_get(f"/mods/{mod_id}/files",
                           gameVersion="1.21.1", modLoaderType=6, pageSize=3)
            if not files["data"]:
                files = cf_get(f"/mods/{mod_id}/files", gameVersion="1.21.1", pageSize=3)
            if not files["data"]:
                continue
            for file_dep in files["data"][0].get("dependencies", []):
                if file_dep["relationType"] != 3:
                    continue
                dep_id = file_dep["modId"]
                if dep_id in sel_ids:
                    continue
                if dep_id not in deps:
                    dep_mod = known.get(dep_id)
                    if not dep_mod:
                        try:
                            raw = cf_get(f"/mods/{dep_id}")
                            dep_mod = mod_from_raw(raw["data"])
                        except Exception:
                            dep_mod = {"id": dep_id, "name": f"Mod {dep_id}", "slug": "",
                                       "summary": "", "categories": [], "url": "",
                                       "infoUrl": "", "logo": "", "downloads": 0}
                    deps[dep_id] = {**dep_mod, "required_by": [], "required_by_ids": []}
                if mod_name not in deps[dep_id]["required_by"]:
                    deps[dep_id]["required_by"].append(mod_name)
                    deps[dep_id]["required_by_ids"].append(mod_id)
        except Exception:
            pass
        time.sleep(0.05)

    if os.path.exists(DEP_INFO_PATH):
        with open(DEP_INFO_PATH) as f:
            dep_info = json.load(f)
    else:
        dep_info = {}

    for d in deps.values():
        key = str(d["id"])
        if key not in dep_info:
            dep_info[key] = {
                "required_by":     d["required_by"],
                "required_by_ids": d["required_by_ids"],
                "mod":             {k: v for k, v in d.items() if k not in ("required_by", "required_by_ids")},
            }
        else:
            for name, mid in zip(d["required_by"], d["required_by_ids"]):
                if name not in dep_info[key]["required_by"]:
                    dep_info[key]["required_by"].append(name)
                    dep_info[key]["required_by_ids"].append(mid)

    with open(DEP_INFO_PATH, "w") as f:
        json.dump(dep_info, f)

    return jsonify(list(deps.values()))


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

        with open(os.path.join(snapshot_path, "build.json"), "w") as f:
            json.dump({"mrpack": filename, "cf_zip": cf_filename, "mod_ids": list(sel_ids)}, f)

        set_current(snapshot_name)
        yield sse({"type": "done", "snapshot": snapshot_name, "file": filename, "cf_file": cf_filename})

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


# ── Snapshots ──────────────────────────────────────────────────────────────────

def parse_pack_name(filename):
    if not filename:
        return None
    m = re.match(r'^(.+)-\d{10}(?:-cf)?\.(?:mrpack|zip)$', filename)
    return m.group(1) if m else None


def match_builds_by_mtime(snapshot_path, window=300):
    """Fallback: find build files whose mtime is within `window` seconds of the snapshot dir."""
    try:
        snap_mtime = os.path.getmtime(snapshot_path)
        by_delta = {}
        for f in os.listdir(BUILDS_DIR):
            delta = abs(os.path.getmtime(os.path.join(BUILDS_DIR, f)) - snap_mtime)
            if delta < window:
                by_delta[f] = delta
        mrpack = next((f for f in sorted(by_delta, key=by_delta.get) if f.endswith(".mrpack")), None)
        cf_zip = next((f for f in sorted(by_delta, key=by_delta.get) if f.endswith("-cf.zip")), None)
        return mrpack, cf_zip
    except OSError:
        return None, None


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
        build_json = os.path.join(path, "build.json")
        if os.path.exists(build_json):
            with open(build_json) as f:
                info = json.load(f)
            mrpack = info.get("mrpack")
            cf_zip = info.get("cf_zip")
        else:
            mrpack, cf_zip = match_builds_by_mtime(path)
        result.append({
            "name":       name,
            "mod_count":  snapshot_mod_count(path),
            "is_current": name == current,
            "mrpack":     mrpack,
            "cf_zip":     cf_zip,
            "pack_name":  parse_pack_name(mrpack or cf_zip),
        })
    return jsonify(result)


@app.route("/api/snapshots/<name>/activate", methods=["POST"])
def api_activate_snapshot(name):
    path = os.path.join(SNAPSHOTS_DIR, name)
    if not os.path.isdir(path):
        return jsonify({"error": "Snapshot not found"}), 404
    set_current(name)
    return jsonify({"ok": True})


@app.route("/api/snapshots/<name>/mod-ids")
def api_snapshot_mod_ids(name):
    build_json = os.path.join(SNAPSHOTS_DIR, name, "build.json")
    if os.path.exists(build_json):
        with open(build_json) as f:
            data = json.load(f)
        return jsonify({"mod_ids": data.get("mod_ids", [])})
    return jsonify({"mod_ids": []})


# ── ATM10 update check ─────────────────────────────────────────────────────────

@app.route("/api/atm10/status")
def api_atm10_status():
    try:
        latest_file = cf_get(f"/mods/{ATM10_PROJECT_ID}/files", pageSize=1)["data"][0]
        latest = {"file_id": latest_file["id"], "display_name": latest_file.get("displayName", "")}
    except Exception:
        return jsonify({"has_update": False, "error": "CF API unavailable"})

    if not os.path.exists(ATM10_VERSION_PATH):
        return jsonify({"has_update": False, "latest": latest, "stored": None})

    with open(ATM10_VERSION_PATH) as f:
        stored = json.load(f)

    has_update = latest["file_id"] != stored.get("file_id")
    return jsonify({"has_update": has_update, "latest": latest, "stored": stored})


@app.route("/api/atm10/check", methods=["POST"])
def api_atm10_check():
    try:
        latest_file = cf_get(f"/mods/{ATM10_PROJECT_ID}/files", pageSize=1)["data"][0]
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    latest_id   = latest_file["id"]
    display     = latest_file.get("displayName", f"file {latest_id}")

    stored_id = None
    if os.path.exists(ATM10_VERSION_PATH):
        with open(ATM10_VERSION_PATH) as f:
            stored_id = json.load(f).get("file_id")

    if latest_id != stored_id:
        notify_discord(
            f"🎮 ATM10 update available: **{display}**\n"
            f"A new pack version is on CurseForge. Go to mods.camerontora.ca → History to rebuild."
        )
        return jsonify({"updated": True, "display_name": display})

    return jsonify({"updated": False})


@app.route("/api/atm10/rebuild-latest", methods=["POST"])
def api_atm10_rebuild_latest():
    if os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)
    fetch_atm10_mods()
    ids = []
    if os.path.exists(SELECTIONS_PATH):
        with open(SELECTIONS_PATH) as f:
            ids = json.load(f)
    return jsonify({"mod_ids": ids})


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


# ── Wiki context loader ────────────────────────────────────────────────────────

_wiki_context      = ""
_wiki_context_ts   = 0.0
_wiki_context_lock = threading.Lock()
_WIKI_CACHE_TTL    = 3600  # seconds


def _load_wiki_context() -> str:
    wiki_dir = os.path.join(MODWIKI_PATH, "wiki")
    if not os.path.isdir(wiki_dir):
        return ""
    parts = []
    for root, dirs, files in os.walk(wiki_dir):
        dirs[:] = sorted(d for d in dirs if d != "assets")
        for fname in sorted(files):
            if not fname.endswith(".md"):
                continue
            if fname.startswith("._"):
                continue
            fpath = os.path.join(root, fname)
            rel   = os.path.relpath(fpath, MODWIKI_PATH)
            try:
                with open(fpath, encoding="utf-8") as f:
                    content = f.read()
                parts.append(f"=== FILE: {rel} ===\n{content}")
            except Exception as e:
                print(f"Warning: could not read {fpath}: {e}")
    return "\n\n".join(parts)


def get_wiki_context() -> str:
    global _wiki_context, _wiki_context_ts
    now = time.time()
    with _wiki_context_lock:
        if now - _wiki_context_ts > _WIKI_CACHE_TTL:
            _wiki_context    = _load_wiki_context()
            _wiki_context_ts = now
            print(f"Wiki context loaded: {len(_wiki_context):,} chars")
        return _wiki_context


# ── Wiki chat routes ───────────────────────────────────────────────────────────

@app.route("/wiki/chat")
def wiki_chat_page():
    return send_from_directory(app.static_folder, "wiki-chat.html")


@app.route("/api/wiki-chat", methods=["POST"])
def api_wiki_chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages")

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "messages must be a non-empty list"}), 400
    if messages[-1].get("role") != "user":
        return jsonify({"error": "last message must be from user"}), 400
    for m in messages:
        if m.get("role") not in ("user", "assistant") or not isinstance(m.get("content"), str):
            return jsonify({"error": "invalid message format"}), 400

    # Truncate to last 20 messages (oldest pairs dropped)
    if len(messages) > 20:
        messages = messages[-20:]
        # Ensure we still start with a user message after truncation
        while messages and messages[0].get("role") != "user":
            messages = messages[1:]

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not configured"}), 500

    wiki_ctx = get_wiki_context()
    system_prompt = (
        "You are the modwiki assistant for the camerontora Minecraft server. "
        "Answer questions using only the knowledge base below. "
        "Always state whether a mod is in the current server pack (in-pack), "
        "in the ATM10 catalogue but not installed (atm10-only), or unavailable "
        "for this loader/version (not-available). Be specific and practical — "
        "players asking you are in-game or planning their next session. "
        "If the answer isn't in the knowledge base, say so and offer to look it up."
        "\n\n" + wiki_ctx
    )

    try:
        client   = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model      = "claude-sonnet-4-6",
            max_tokens = 1024,
            system     = system_prompt,
            messages   = messages,
        )
        return jsonify({"reply": response.content[0].text})
    except Exception as e:
        print(f"Claude API error: {e}")
        return jsonify({"error": "Failed to get response from Claude"}), 500


# ── Frontend ───────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)
