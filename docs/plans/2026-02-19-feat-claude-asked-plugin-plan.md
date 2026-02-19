---
title: "feat: Claude Code plugin that forwards question/permission events"
type: feat
status: completed
date: 2026-02-19
brainstorm: docs/brainstorms/2026-02-19-claude-asked-brainstorm.md
---

# feat: Build claude-asked plugin

## Overview

A minimal Claude Code plugin that forwards Notification and PermissionRequest hook events to a shell command (via stdin) and/or HTTP webhook (via POST). Single Node.js ESM file, zero dependencies, bare minimum features.

## Implementation Steps

### Step 1: Create plugin manifest

**File:** `.claude-plugin/plugin.json`

```json
{
  "name": "claude-asked",
  "version": "0.1.0",
  "description": "Forwards Claude Code question/permission events to a command or webhook."
}
```

### Step 2: Create hooks configuration

**File:** `hooks/hooks.json`

Register Notification (no matcher — catch all) and PermissionRequest (matcher `*` — all tools). Both async, 30s timeout.

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Step 3: Implement the hook script

**File:** `scripts/claude-asked.mjs`

Target: Node.js 18+ (current LTS). ~100-120 lines. Zero npm dependencies — only `node:` built-in modules.

**Control flow:**

```
read stdin → parse JSON → validate mode → validate config → build envelope → forward → exit 0
```

**Detailed logic:**

1. **Read all stdin** and parse as JSON. On empty stdin or parse error: stderr warning, exit 0.

2. **Read config from env vars:**
   - `CLAUDE_ASKED_MODE` — `command` | `webhook` | `both` (default: `command`). Unrecognized value: fall back to `command` with stderr warning.
   - `CLAUDE_ASKED_COMMAND` — shell command string.
   - `CLAUDE_ASKED_WEBHOOK_URL` — URL string.
   - `CLAUDE_ASKED_WEBHOOK_BEARER` — Bearer token (optional).
   - `CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS` — default `3000`.
   - `CLAUDE_ASKED_COMMAND_TIMEOUT_MS` — default `2000`.

3. **Validate config for active mode.** If mode requires a transport that's not configured (e.g., `mode=command` but `CLAUDE_ASKED_COMMAND` is empty): stderr warning, skip that transport. In `both` mode, proceed with whichever is configured.

4. **Build envelope:**
   ```json
   {
     "event_id": "<crypto.randomUUID()>",
     "timestamp": "<ISO 8601>",
     "hook_event_name": "<from payload>",
     "payload": { "...raw stdin object" }
   }
   ```

5. **Forward (sequentially if both):**
   - **Command:** `child_process.spawnSync(command, { input: envelopeJson, shell: true, timeout, stdio: ['pipe', 'ignore', 'pipe'] })`. On non-zero exit or error: stderr warning.
   - **Webhook:** `http`/`https` POST with `Content-Type: application/json` and optional `Authorization: Bearer <token>`. Read and discard response body. Non-2xx: stderr warning. URL parse error: stderr warning.

6. **Exit 0 always.** Wrap entire main in try/catch. Never write stdout.

**Error handling strategy:** Every error path writes a one-line message to `process.stderr` and continues to exit 0. Format: `[claude-asked] <error description>`.

### Step 4: Manual verification

Test the plugin with Claude Code using `--plugin-dir`:

```bash
claude --plugin-dir /path/to/claude-asked
```

Verify:
- Plugin appears in `/hooks` menu
- PermissionRequest events trigger the script (ask Claude to run a Bash command)
- Notification events trigger the script (let Claude idle or ask a question)
- Webhook and command modes both work
- The script never blocks Claude Code

## Edge Cases Addressed

| Case | Behavior |
|---|---|
| Empty stdin | stderr warning, exit 0 |
| Malformed JSON stdin | stderr warning, exit 0 |
| Unrecognized `CLAUDE_ASKED_MODE` | Fall back to `command`, stderr warning |
| Missing command/URL for active mode | stderr warning, skip that transport |
| `both` mode with only one transport configured | Use the configured one, stderr for the missing one |
| Malformed webhook URL | stderr warning, skip webhook |
| Webhook timeout / network error | stderr warning, exit 0 |
| Command timeout / non-zero exit | stderr warning, exit 0 |
| Very large stdin payload | Read all (no limit); OS-level 30s hook timeout is the backstop |
| Concurrent hook invocations | No shared state — each is an independent process |

## Acceptance Criteria

- [ ] Plugin loads in Claude Code via `--plugin-dir`
- [x] PermissionRequest events produce a forwarded envelope
- [x] Notification events produce a forwarded envelope
- [x] Command mode pipes envelope JSON to stdin of configured command
- [x] Webhook mode POSTs envelope JSON to configured URL with Bearer auth
- [x] `both` mode does both
- [x] Script always exits 0, never writes stdout
- [x] Misconfiguration produces stderr warnings, not crashes
- [x] Total script is a single `.mjs` file under 150 lines

## Out of Scope

- Logging, log rotation, DLQ
- Retry/backoff for webhook
- HMAC webhook auth
- Admin toggle server
- Notification filtering by `notification_type`
- SessionStart/Stop hooks
- Redaction/sanitization
- Test/dry-run subcommand (nice-to-have for later)
- `CLAUDE_ASKED_ENABLED` toggle (nice-to-have for later)

## Files to Create

```
claude-asked/
  .claude-plugin/
    plugin.json                  # Plugin manifest
  hooks/
    hooks.json                   # Hook registration
  scripts/
    claude-asked.mjs             # Hook handler (~100-120 lines)
```
