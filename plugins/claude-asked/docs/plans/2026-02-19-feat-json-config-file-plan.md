---
title: "Add JSON config file with env var override"
type: feat
status: active
date: 2026-02-19
---

# feat: Add JSON config file with env var override

## Overview

Add a persistent JSON config file at `~/.claude/claude-asked/config.json` so users don't have to set environment variables every time. Env vars override config file values.

## Problem Statement

Setting `CLAUDE_ASKED_*` env vars in every shell session is tedious and error-prone (wrong bearer token, forgotten exports). A config file provides persistent defaults while env vars remain available for overrides or CI use.

## Proposed Solution

Add a `loadConfigFile()` function that reads `~/.claude/claude-asked/config.json` and merges it with env vars in `readConfig()`. Env vars take precedence.

### Config file format

```json
{
  "command": "notify-send 'Claude needs you'",
  "webhookUrl": "https://example.com/hook",
  "webhookBearer": "sk-...",
  "webhookTimeoutMs": 3000,
  "commandTimeoutMs": 2000,
  "logFile": "/tmp/claude-asked.jsonl",
  "debug": true
}
```

All fields optional. Keys match the camelCase names already used in the `readConfig()` return object. Follows the `claude-notifications-go` precedent of `~/.claude/<plugin-name>/config.json`.

### Merge order (lowest to highest precedence)

1. Hardcoded defaults (`3000`, `2000`, `""`, etc.)
2. Config file values
3. Environment variables

### Key implementation detail: `??` vs `||`

Use nullish coalescing (`??`) for string fields so that an explicitly empty env var (`export CLAUDE_ASKED_COMMAND=""`) means "no command" rather than falling through to the config file. For numeric fields, `Number(envVar)` returns `NaN` when unset, and `NaN || fileValue` correctly falls through.

```javascript
// String fields: env ?? file ?? default
command: (process.env.CLAUDE_ASKED_COMMAND ?? file.command ?? "").trim(),

// Numeric fields: Number(env) || file || default
webhookTimeoutMs: Number(process.env.CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS) || file.webhookTimeoutMs || 3000,
```

### Error handling

- Missing config file: silent (return `{}`, no warning)
- Parse error or unreadable file: warn to stderr, return `{}`
- Malformed JSON object (array, null): return `{}`

This follows the exit-0 contract from `docs/solutions/integration-issues/nodejs-hook-plugin-pitfalls.md`.

## Files to Change

### `plugins/claude-asked/scripts/claude-asked.mjs`

**New imports** (extend existing `node:fs` import, add `node:os` and `node:path`):

```javascript
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
```

**New function `loadConfigFile()`:**

```javascript
function loadConfigFile() {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "claude-asked", "config.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") warn(`Config file error: ${err.message}`);
    return {};
  }
}
```

**Updated `readConfig()`:**

```javascript
function readConfig() {
  const file = loadConfigFile();
  return {
    command:          (process.env.CLAUDE_ASKED_COMMAND          ?? file.command       ?? "").trim(),
    webhookUrl:       (process.env.CLAUDE_ASKED_WEBHOOK_URL      ?? file.webhookUrl    ?? "").trim(),
    webhookBearer:    (process.env.CLAUDE_ASKED_WEBHOOK_BEARER   ?? file.webhookBearer ?? "").trim(),
    webhookTimeoutMs:  Number(process.env.CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS) || file.webhookTimeoutMs || 3000,
    commandTimeoutMs:  Number(process.env.CLAUDE_ASKED_COMMAND_TIMEOUT_MS) || file.commandTimeoutMs || 2000,
    logFile:           process.env.CLAUDE_ASKED_LOG_FILE         ?? file.logFile       ?? "",
    debug:             process.env.CLAUDE_ASKED_DEBUG             ?? file.debug         ?? "",
  };
}
```

Note: `debug` moves into the config object (currently read inline from `process.env`). Update `main()` lines 140 and 172 to use `cfg.debug` instead of `process.env.CLAUDE_ASKED_DEBUG`.

Also: `.trim()` added to `webhookBearer` and header casing fixed (`"Authorization"` instead of `"authorization"` on line 93). These are minor fixes surfaced during review.

### `plugins/claude-asked/README.md`

- Add "Configuration file" section after the existing "Configuration" table
- Document the config file path, format, and merge behavior
- Add example of creating the config file

### `plugins/claude-asked/docs/solutions/integration-issues/plugin-cache-staleness-dev-sync.md`

- Update development workflow to mention config file doesn't need cache sync (it's read from `~/.claude/`, not from the plugin directory)

## Acceptance Criteria

- [x] Plugin reads `~/.claude/claude-asked/config.json` if it exists
- [x] All 7 config fields supported in config file (command, webhookUrl, webhookBearer, webhookTimeoutMs, commandTimeoutMs, logFile, debug)
- [x] Env vars override config file values
- [x] Missing config file is silent (no warning)
- [x] Malformed config file warns to stderr and falls back to defaults
- [x] Exit-0 contract maintained (config read errors never crash)
- [x] README documents the config file
- [x] `webhookBearer` trimmed and `Authorization` header properly cased

## Verification

```bash
# 1. Create config file
mkdir -p ~/.claude/claude-asked
cat > ~/.claude/claude-asked/config.json << 'EOF'
{
  "command": "notify-send 'Claude needs you'",
  "debug": true
}
EOF

# 2. Sync cache and restart Claude Code
./scripts/sync-cache.sh

# 3. Verify config is picked up (no env vars needed)
# Check stderr for debug output or /tmp/claude-asked.jsonl for log entries

# 4. Verify env var override
export CLAUDE_ASKED_COMMAND="echo override"
# Restart — should use "echo override" not "notify-send"
```
