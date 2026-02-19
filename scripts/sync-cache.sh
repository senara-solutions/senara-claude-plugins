#!/usr/bin/env bash
#
# Sync the claude-asked plugin source to the Claude Code plugin cache.
# Run from anywhere inside the repo after making changes, then restart Claude Code.
#
set -euo pipefail

PLUGIN_KEY="claude-asked@senara-claude-plugins"
INSTALLED_PLUGINS="$HOME/.claude/plugins/installed_plugins.json"

# --- Pre-flight checks ---

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not found. Install it first." >&2
  exit 1
fi

if ! command -v rsync &>/dev/null; then
  echo "Error: rsync is required but not found. Install it first." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: not inside a git repository." >&2
  exit 1
}

SOURCE_DIR="$REPO_ROOT/plugins/claude-asked"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -f "$INSTALLED_PLUGINS" ]]; then
  echo "Error: $INSTALLED_PLUGINS not found. Is the plugin installed?" >&2
  exit 1
fi

# --- Resolve cache path from installed_plugins.json ---

CACHE_DIR="$(jq -r --arg key "$PLUGIN_KEY" '.plugins[$key][0].installPath // empty' "$INSTALLED_PLUGINS")"
if [[ -z "$CACHE_DIR" ]]; then
  echo "Error: plugin '$PLUGIN_KEY' not found in $INSTALLED_PLUGINS." >&2
  echo "Install it first: claude plugin install claude-asked" >&2
  exit 1
fi

if [[ ! -d "$CACHE_DIR" ]]; then
  echo "Error: cache directory does not exist: $CACHE_DIR" >&2
  echo "Try reinstalling the plugin: claude plugin install claude-asked" >&2
  exit 1
fi

# --- Sync ---

echo "Syncing $SOURCE_DIR/ → $CACHE_DIR/"
rsync -av --delete "$SOURCE_DIR/" "$CACHE_DIR/"
echo "Done. Restart Claude Code to pick up changes."
