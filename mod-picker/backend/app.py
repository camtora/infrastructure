#!/usr/bin/env python3
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import zipfile

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

app = Flask(__name__, static_folder="dist", static_url_path="")

CF_KEY = os.environ.get("CURSEFORGE_API_KEY", "")
CF_BASE = "https://api.curseforge.com/v1"
HDR = {"x-api-key": CF_KEY, "Accept": "application/json"}
CACHE_PATH = "/app/cache/mods.json"
PACKS_DIR = "/app/packs"
PACKWIZ = "/usr/local/bin/packwiz"

MC_VERSION = "1.21.1"
NEOFORGE_VERSION = "21.1.228"

os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
os.makedirs(PACKS_DIR, exist_ok=True)


# ── CurseForge helpers ─────────────────────────────────────────────────────────

def cf_get(path, **params):
    r = requests.get(f"{CF_BASE}{path}", headers=HDR, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


ATM10_PROJECT_ID = 925200


def fetch_atm10_mods():
    # Get latest file
    files = cf_get(f"/mods/{ATM10_PROJECT_ID}/files", pageSize=5)
    latest = files["data"][0]

    # Download URL
    url_data = cf_get(f"/mods/{ATM10_PROJECT_ID}/files/{latest['id']}/download-url")
    download_url = url_data["data"]

    # Download pack zip and parse manifest
    r = requests.get(download_url, allow_redirects=True, timeout=120)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        with z.open("manifest.json") as f:
            manifest = json.load(f)

    project_ids = list({m["projectID"] for m in manifest["files"]})

    # Batch-fetch mod info (50 per request)
    mods_raw = []
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

    mods = [
        {
            "id": m["id"],
            "name": m["name"],
            "slug": m["slug"],
            "summary": m.get("summary", ""),
            "categories": [c["name"] for c in m.get("categories", [])],
            "url": m.get("links", {}).get(
                "websiteUrl",
                f"https://www.curseforge.com/minecraft/mc-mods/{m['slug']}",
            ),
            "logo": (m.get("logo") or {}).get("thumbnailUrl", ""),
        }
        for m in mods_raw
    ]
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


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/api/mods")
def api_mods():
    return jsonify(get_mods())


SELECTIONS_PATH = "/app/cache/selections.json"


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


@app.route("/api/mods/refresh", methods=["POST"])
def api_mods_refresh():
    if os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)
    mods = fetch_atm10_mods()
    with open(CACHE_PATH, "w") as f:
        json.dump(mods, f)
    return jsonify({"count": len(mods)})


@app.route("/api/build", methods=["POST"])
def api_build():
    data = request.json or {}
    selected_ids = set(data.get("ids", []))
    pack_name = (data.get("name") or "camerontora").strip() or "camerontora"

    mods = get_mods()
    selected = [m for m in mods if m["id"] in selected_ids]

    env = {**os.environ, "CURSEFORGE_API_KEY": CF_KEY}

    def generate():
        yield f"data: Starting build — {len(selected)} mods selected\n\n"

        tmpdir = tempfile.mkdtemp(prefix="modpicker-")
        try:
            # Init a fresh pack
            yield "data: Initialising pack...\n\n"
            result = subprocess.run(
                [
                    PACKWIZ, "init",
                    "--name", pack_name,
                    "--mc-version", MC_VERSION,
                    "--modloader", "neoforge",
                    "--modloader-version", NEOFORGE_VERSION,
                    "-y",
                ],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=30,
                env=env,
            )
            if result.returncode != 0:
                yield f"data: ERROR: packwiz init failed — {result.stderr[:200]}\n\n"
                yield "data: DONE:error\n\n"
                return

            # Add each mod
            errors = []
            for i, m in enumerate(selected, 1):
                yield f"data: [{i}/{len(selected)}] {m['name']}\n\n"
                result = subprocess.run(
                    [PACKWIZ, "curseforge", "add", "--addon-id", str(m["id"]), "-y"],
                    cwd=tmpdir,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    env=env,
                )
                if result.returncode != 0:
                    err = (result.stderr or result.stdout or "unknown error").strip()
                    yield f"data: ⚠ Skipped {m['name']}: {err[:100]}\n\n"
                    errors.append(m["name"])

            if errors:
                yield f"data: {len(errors)} mods skipped (may not have NeoForge files)\n\n"

            # Export .mrpack
            yield "data: Exporting .mrpack...\n\n"
            result = subprocess.run(
                [PACKWIZ, "modrinth", "export"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=120,
                env=env,
            )
            if result.returncode != 0:
                yield f"data: ERROR: Export failed — {result.stderr[:200]}\n\n"
                yield "data: DONE:error\n\n"
                return

            mrpack_files = [f for f in os.listdir(tmpdir) if f.endswith(".mrpack")]
            if not mrpack_files:
                yield "data: ERROR: No .mrpack produced\n\n"
                yield "data: DONE:error\n\n"
                return

            ts = int(time.time())
            filename = f"{pack_name}-{ts}.mrpack"
            shutil.move(
                os.path.join(tmpdir, mrpack_files[0]),
                os.path.join(PACKS_DIR, filename),
            )
            yield f"data: Done — {len(selected) - len(errors)} mods added\n\n"
            yield f"data: DONE:{filename}\n\n"

        except Exception as e:
            yield f"data: ERROR: {e}\n\n"
            yield "data: DONE:error\n\n"
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


@app.route("/api/packs")
def api_packs():
    try:
        files = sorted(
            [f for f in os.listdir(PACKS_DIR) if f.endswith(".mrpack")],
            key=lambda f: os.path.getmtime(os.path.join(PACKS_DIR, f)),
            reverse=True,
        )
    except OSError:
        files = []
    return jsonify([{"name": f, "url": f"/packs/{f}"} for f in files[:10]])


@app.route("/packs/<path:filename>")
def serve_pack(filename):
    return send_from_directory(PACKS_DIR, filename, as_attachment=True)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)
