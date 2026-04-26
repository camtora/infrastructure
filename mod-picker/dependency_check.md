# Dependency Check

Documents how the mod-picker dependency check works — what it does, what it stores, and its known limitations.

## What it does

`POST /api/deps` takes the current list of selected mod IDs and, for each one, asks CurseForge for the mod's latest compatible file (MC 1.21.1 + NeoForge). It then inspects that file's declared dependencies and filters to `relationType == 3` (required dependency).

Any required dependency that is **not already in the selection** is recorded as a missing dep, annotated with which selected mod(s) require it.

## Step by step

1. For each selected mod, call `GET /v1/mods/{id}/files?gameVersion=1.21.1&modLoaderType=6&pageSize=3`.
2. If that returns no files, retry without the `modLoaderType` filter (catches mods that don't tag their loader).
3. Take the first (latest) file and walk its `dependencies` array.
4. Skip any dep with `relationType != 3` (optional deps, incompatibilities, etc. are ignored).
5. Skip any dep whose ID is already in the selection — it's already present, no action needed.
6. For each remaining dep, look it up in the local mod list. If not found there, call `GET /v1/mods/{dep_id}` to fetch its metadata.
7. Accumulate: `dep_id → { mod metadata, required_by: [mod names], required_by_ids: [mod IDs] }`.

## Storage (`dep_info.json`)

Results are **merged** into `/app/cache/dep_info.json`, keyed by dep mod ID (as a string):

```json
{
  "12345": {
    "mod": { "id": 12345, "name": "Sophisticated Core", ... },
    "required_by": ["Sophisticated Backpacks", "Sophisticated Storage"],
    "required_by_ids": [67890, 99999]
  }
}
```

Merge behaviour:
- New deps are added as new entries.
- Existing entries get new `required_by` names appended (no duplicates).
- Entries are **never removed** — the file is a running record of all dependency relationships identified across all runs.

`GET /api/deps` returns the current contents of this file.

## Limitations

- **One level deep only.** The check finds what your selected mods require, but does not recurse into what *those* deps require. Transitive deps only surface as server startup errors.
- **Latest file only.** The check always uses the most recent compatible file. If a mod's dependency list changed between versions, older relationships won't be reflected.
- **CurseForge only.** Modrinth mods added via packwiz are not checked — only CF mods have the structured dependency metadata this check relies on.
- **No removal.** Unchecking a mod does not remove its deps from `dep_info.json`. The file grows over time and requires manual cleanup if entries become stale.
