# Wiki Q&A Feature — Status Dashboard

A natural-language Q&A panel backed by the camwiki knowledge base and the
Claude API. Appears in the status dashboard between System Metrics and DNS
Configuration. Visible to authenticated users only.

---

## Architecture

```
Home server (cron, hourly)
  └── upload_wiki_context.py
        reads /home/camerontora/camwiki/wiki/**/*.md
        uploads → GCS bucket: camwiki-context / wiki_context.txt

GCP Cloud Run (status-dashboard backend)
  └── on startup: fetch wiki_context.txt from GCS → WIKI_CONTEXT in memory
  └── background thread: re-fetch every 3600s (picks up wiki changes)
  └── POST /api/wiki-qa
        auth check → call Claude API with WIKI_CONTEXT as system prompt
        return { answer }

Status dashboard frontend
  └── WikiQAPanel.jsx
        only renders when adminAuth is truthy
        input + submit → POST /api/wiki-qa → render answer as paragraphs
```

**Key property:** wiki content is decoupled from the Docker image. The image
never needs to be rebuilt to pick up wiki changes — the cron keeps GCS
current and the running Cloud Run instance re-fetches hourly.

---

## Step 1 — GCP setup

Create the GCS bucket (one-time):

```bash
gsutil mb -p YOUR_GCP_PROJECT -l northamerica-northeast1 gs://camwiki-context
gsutil uniformbucketlevelaccess set on gs://camwiki-context
```

Grant the Cloud Run service account read access:

```bash
# Find the service account Cloud Run uses (check GCP Console → Cloud Run → service → Permissions,
# or use the project default: PROJECT_NUMBER-compute@developer.gserviceaccount.com)
gsutil iam ch serviceAccount:YOUR_SERVICE_ACCOUNT:objectViewer gs://camwiki-context
```

---

## Step 2 — Home server uploader script

Create `/home/camerontora/camwiki/scripts/upload_wiki_context.py`:

```python
#!/usr/bin/env python3
"""Upload camwiki content to GCS for the status dashboard Q&A panel."""

import os
from pathlib import Path
from google.cloud import storage

WIKI_DIR = Path("/home/camerontora/camwiki/wiki")
BUCKET_NAME = "camwiki-context"
OBJECT_NAME = "wiki_context.txt"
SKIP_DIRS = {"sources"}  # source summaries add noise without value


def build_context() -> str:
    parts = []
    for md_file in sorted(WIKI_DIR.rglob("*.md")):
        # Skip sources/ subdirectory
        if any(part in SKIP_DIRS for part in md_file.parts):
            continue
        rel = md_file.relative_to(WIKI_DIR)
        try:
            content = md_file.read_text(encoding="utf-8")
            parts.append(f"=== FILE: wiki/{rel} ===\n{content}")
        except Exception as e:
            print(f"Warning: could not read {md_file}: {e}")
    return "\n\n".join(parts)


def upload(context: str) -> None:
    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(OBJECT_NAME)
    blob.upload_from_string(context, content_type="text/plain; charset=utf-8")
    kb = len(context.encode()) // 1024
    print(f"Uploaded {kb}KB to gs://{BUCKET_NAME}/{OBJECT_NAME}")


if __name__ == "__main__":
    print("Building wiki context...")
    ctx = build_context()
    print(f"Built context: {len(ctx):,} chars from {ctx.count('=== FILE:')} files")
    upload(ctx)
    print("Done.")
```

Install dependency if not present:

```bash
pip3 install google-cloud-storage
```

Test it manually first:

```bash
python3 /home/camerontora/camwiki/scripts/upload_wiki_context.py
```

Add hourly cron on the home server:

```bash
crontab -e
# Add:
0 * * * * /usr/bin/python3 /home/camerontora/camwiki/scripts/upload_wiki_context.py >> /var/log/wiki-context-upload.log 2>&1
```

---

## Step 3 — Backend changes

### requirements.txt

Add:
```
anthropic
google-cloud-storage
```

### config.py

Add `ANTHROPIC_API_KEY` alongside existing secrets:

```python
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
```

### backend/main.py

Add at the top of the file (with other imports):

```python
import threading
import anthropic
from google.cloud import storage as gcs
from config import ANTHROPIC_API_KEY

# --- Wiki context (fetched from GCS, refreshed hourly) ---

WIKI_CONTEXT = ""
_wiki_lock = threading.Lock()

def _fetch_wiki_context() -> str:
    try:
        client = gcs.Client()
        bucket = client.bucket("camwiki-context")
        blob = bucket.blob("wiki_context.txt")
        return blob.download_as_text(encoding="utf-8")
    except Exception as e:
        print(f"Warning: could not fetch wiki context from GCS: {e}")
        return ""

def _refresh_wiki_loop():
    global WIKI_CONTEXT
    import time
    while True:
        time.sleep(3600)
        ctx = _fetch_wiki_context()
        if ctx:
            with _wiki_lock:
                WIKI_CONTEXT = ctx
            print("Wiki context refreshed from GCS")

# Fetch on startup
WIKI_CONTEXT = _fetch_wiki_context()
if WIKI_CONTEXT:
    print(f"Wiki context loaded: {len(WIKI_CONTEXT):,} chars")
else:
    print("Warning: wiki context empty — Q&A will have no knowledge base")

# Start background refresh thread
threading.Thread(target=_refresh_wiki_loop, daemon=True).start()
```

Add the endpoint (alongside other admin-only routes):

```python
@app.route("/api/wiki-qa", methods=["POST"])
def wiki_qa():
    # Require admin auth (same pattern as other admin endpoints)
    if not check_admin_auth(request):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not configured"}), 500

    with _wiki_lock:
        ctx = WIKI_CONTEXT

    system_prompt = (
        "You are an assistant with full knowledge of Cameron's home server "
        "infrastructure and personal projects. Answer questions using only the "
        "knowledge base below. Be concise — aim for one or two paragraphs. "
        "If the answer isn't in the knowledge base, say so briefly.\n\n"
        + ctx
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=system_prompt,
            messages=[{"role": "user", "content": question}],
        )
        answer = message.content[0].text
        return jsonify({"answer": answer})
    except Exception as e:
        print(f"Claude API error: {e}")
        return jsonify({"error": "Failed to get answer"}), 500
```

---

## Step 4 — Frontend component

Create `frontend/src/components/WikiQAPanel.jsx`:

```jsx
import { useState } from 'preact/hooks'

export function WikiQAPanel({ adminAuth }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!adminAuth) return null

  const submit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setAnswer(null)
    setError(null)
    try {
      const res = await fetch('/api/wiki-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setAnswer(data.answer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="glass-card p-6 mb-8">
      <h2 class="text-lg font-semibold text-white mb-4">Ask about your infrastructure</h2>
      <form onSubmit={submit} class="flex gap-3 mb-4">
        <input
          type="text"
          value={question}
          onInput={(e) => setQuestion(e.target.value)}
          placeholder="How does the VPN failover work?"
          class="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          class="px-5 py-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-lg hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '...' : 'Ask'}
        </button>
      </form>

      {loading && (
        <div class="flex items-center gap-2 text-white/40 text-sm">
          <div class="w-4 h-4 border border-white/20 border-t-emerald-400 rounded-full animate-spin" />
          Thinking...
        </div>
      )}

      {error && (
        <p class="text-red-400/80 text-sm">{error}</p>
      )}

      {answer && !loading && (
        <div class="text-white/80 text-sm leading-relaxed space-y-3">
          {answer.split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  )
}
```

### App.jsx — add import and render

```jsx
// Add with other imports at the top
import { WikiQAPanel } from './components/WikiQAPanel'

// In the JSX, between the MetricsPanel/ServiceGrid div and the DNSPanel div:
<WikiQAPanel adminAuth={adminAuth} />
```

---

## Step 5 — Secrets

Add `ANTHROPIC_API_KEY` to the Cloud Run service environment variables:

```bash
gcloud run services update status-dashboard \
  --region northamerica-northeast1 \
  --set-env-vars ANTHROPIC_API_KEY=sk-ant-...
```

Or set it in GCP Console → Cloud Run → status-dashboard → Edit & Deploy →
Variables & Secrets.

---

## Step 6 — Deploy

```bash
cd /home/camerontora/infrastructure/status-dashboard
./deploy.sh
```

No wiki-related changes needed in deploy.sh — context lives in GCS and is
fetched at runtime.

---

## Keeping the wiki current

| Trigger | Method |
|---------|--------|
| Automatic | Hourly cron on home server uploads latest wiki to GCS |
| Manual (after a big ingest) | `python3 /home/camerontora/camwiki/scripts/upload_wiki_context.py` |
| Running instance picks it up | Within 1 hour via background refresh thread |

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| "wiki context empty" in Cloud Run logs | Run uploader manually; check GCS bucket exists and service account has objectViewer |
| 401 from /api/wiki-qa | adminAuth not being passed correctly in frontend |
| Claude API error | Check ANTHROPIC_API_KEY env var is set in Cloud Run |
| Stale answers | Check cron is running: `grep wiki-context /var/log/syslog` or check upload log |
