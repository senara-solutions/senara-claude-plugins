---
title: "feat: Add opt-in file logging via CLAUDE_ASKED_LOG_FILE"
type: feat
status: completed
date: 2026-02-19
---

# feat: Add opt-in file logging via CLAUDE_ASKED_LOG_FILE

## Overview

Add a new environment variable `CLAUDE_ASKED_LOG_FILE` that, when set to a file path, appends structured JSONL log entries for every event the plugin processes. Disabled by default (no file I/O when unset).

## Problem Statement / Motivation

Currently the only observability is `CLAUDE_ASKED_DEBUG` which writes to stderr. In async hooks, stderr output is not reliably visible to the user. When using webhook mode there is no local record of what events fired or whether forwarding succeeded. A persistent log file solves both problems.

## Proposed Solution

One new env var, one new function, a few log calls at key points.

### New env var

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_ASKED_LOG_FILE` | (unset = off) | Absolute path to a log file. When set, append JSONL entries. |

### Log format

Each line is a self-contained JSON object:

```json
{"ts":"2026-02-19T17:31:31.575Z","level":"info","event":"PermissionRequest","event_id":"924be...","msg":"forwarded via webhook"}
```

Fields:
- `ts` - ISO timestamp
- `level` - `info` or `error`
- `event` - hook event name (from payload)
- `event_id` - envelope UUID
- `msg` - human-readable description
- `detail` - (optional) error message or extra context

### What gets logged

| Point | Level | Message |
|---|---|---|
| Script invoked | info | `invoked (mode=<mode>)` |
| Envelope built | info | `event received` with event name and id |
| Command forwarded | info | `command: ok` |
| Command failed | error | `command: <reason>` |
| Webhook forwarded | info | `webhook: <status>` |
| Webhook failed | error | `webhook: <reason>` |
| Config/parse error | error | `<error description>` |

### Implementation

Changes are limited to `plugins/claude-asked/scripts/claude-asked.mjs`:

1. **Add `logFile` to `readConfig()`** - read `CLAUDE_ASKED_LOG_FILE` from env
2. **Add `logToFile(cfg, entry)` function** - `fs.appendFileSync(cfg.logFile, JSON.stringify(entry) + "\n")` wrapped in try/catch (never throws, just warns to stderr on write failure)
3. **Call `logToFile` at each point** listed above
4. **Keep existing `CLAUDE_ASKED_DEBUG` stderr behavior unchanged** - they serve different purposes (stderr for live terminal debugging, file for persistent audit)

### Files to modify

```
plugins/claude-asked/scripts/claude-asked.mjs   # Add logToFile + calls (~20 lines)
plugins/claude-asked/README.md                   # Add CLAUDE_ASKED_LOG_FILE to env var table, document new hook events
```

## Acceptance Criteria

- [x] `CLAUDE_ASKED_LOG_FILE` unset: zero file I/O, no behavior change
- [x] `CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl`: events appended as JSONL
- [x] Log entries include timestamp, level, event name, event_id, and message
- [x] Write failures warn to stderr but do not crash (exit 0 contract)
- [x] README documents the new env var and all four hook events
- [x] No new dependencies (uses `node:fs` which is already available)

## Dependencies & Risks

- **Low risk**: `fs.appendFileSync` is atomic enough for single-writer JSONL
- **No new dependencies**: `node:fs` is a Node.js built-in
- **No breaking changes**: purely additive, disabled by default
