---
title: "Plugin cache sync script for claude-asked development"
date: "2026-02-19"
module: "claude-asked plugin"
severity: "medium"
tags:
  - "developer-experience"
  - "plugin-development"
  - "caching"
  - "tooling"
symptom: "Changes to plugin source files in plugins/claude-asked/ were not reflected when Claude Code ran due to marketplace caching mechanism"
root_cause: "The marketplace caches plugins at ~/.claude/plugins/cache/ at install time, requiring manual file synchronization after every source change"
resolution_type: "automation"
---

# Plugin Cache Staleness: Automated Dev Sync

## Problem

The Claude Code plugin marketplace caches plugins at install time in `~/.claude/plugins/cache/`. During development of the `claude-asked` plugin, every change to source files required manually copying them to the cache directory using hardcoded paths:

```bash
cp plugins/claude-asked/hooks/hooks.json \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/hooks/hooks.json
cp plugins/claude-asked/scripts/claude-asked.mjs \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/scripts/claude-asked.mjs
```

This manual approach was:
- **Error-prone**: Easy to forget individual files or get paths wrong
- **Tedious**: Multiple separate commands required for each change
- **Brittle**: Hardcoded paths break if the plugin version changes

## Investigation

1. **Cache staleness identified**: Hooks were not firing after source updates, indicating the cache was stale and blocking development
2. **Configuration discovery**: Found that `~/.claude/plugins/installed_plugins.json` contains the exact cache path as `.plugins["claude-asked@senara-claude-plugins"][0].installPath`
3. **Tool selection**: Determined that `rsync -av --delete` is ideal for true mirroring (adds new files, updates changed files, removes stale files in one operation)
4. **Security review**: Code analysis identified a potential path traversal risk -- if `installPath` in JSON is tampered, `rsync --delete` could target arbitrary directories

## Root Cause

The plugin cache is a snapshot taken at install time. Claude Code reads hooks and scripts from the cache, not from the repo. There was no automated mechanism to propagate source changes to the cache. The relationship between source directory and cache location was implicit (hardcoded in copy commands) rather than queryable.

## Solution

Created `scripts/sync-cache.sh` at the repo root that automates cache synchronization:

- **Dynamic path resolution**: Reads cache path from `installed_plugins.json` via `jq` (adapts to version changes automatically)
- **Security validation**: Validates the resolved path is within `~/.claude/plugins/cache/` using `realpath` (defense-in-depth)
- **True mirror sync**: Uses `rsync -av --delete` for complete synchronization in a single operation
- **Preflight checks**: Verifies `jq`, `rsync`, git repo, source directory, and plugin installation before executing

### Key code

Dynamic cache path resolution:
```bash
CACHE_DIR="$(jq -r --arg key "$PLUGIN_KEY" '.plugins[$key][0].installPath // empty' "$INSTALLED_PLUGINS")"
```

Security path validation:
```bash
CACHE_DIR="$(realpath -m "$CACHE_DIR")"
EXPECTED_PREFIX="$HOME/.claude/plugins/cache/"
if [[ "$CACHE_DIR" != "$EXPECTED_PREFIX"* ]]; then
  echo "Error: installPath is outside the expected cache directory." >&2
  exit 1
fi
```

Mirror synchronization:
```bash
rsync -av --delete "$SOURCE_DIR/" "$CACHE_DIR/"
```

### Usage

```bash
./scripts/sync-cache.sh
# Syncing plugins/claude-asked/ -> ~/.claude/plugins/cache/.../
# sending incremental file list
# hooks/hooks.json
# scripts/claude-asked.mjs
# Done. Restart Claude Code to pick up changes.
```

## Prevention

**Primary rule**: Cache staleness is invisible -- hooks silently execute old behavior. Always sync after editing source files.

**Development cycle** (mandatory order):
1. **Edit source** in `plugins/claude-asked/`
2. **Run sync**: `./scripts/sync-cache.sh`
3. **Restart Claude Code**
4. **Test** and verify behavior matches expectations

**After git operations**: Always sync after `git pull`, `git checkout`, or branch switching. These change source files but leave cache untouched.

## Verification

Confirm cache matches source:
```bash
diff -r plugins/claude-asked/ ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/
```

A clean diff (no output) confirms the sync succeeded.

**Symptom-based diagnosis** -- if hooks stop firing or behavior doesn't match source:
1. Run `./scripts/sync-cache.sh` and check its output
2. Verify with `diff -r` as above
3. Restart Claude Code

## Related Documentation

- [claude-asked-plugin-cache-hooks-observability.md](claude-asked-plugin-cache-hooks-observability.md) -- Original discovery of cache staleness issues; includes manual sync procedures and observability solutions
- [nodejs-hook-plugin-pitfalls.md](nodejs-hook-plugin-pitfalls.md) -- Error handling patterns for Node.js hook plugins (exit-0 convention, promise handling)
