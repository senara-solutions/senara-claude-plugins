---
title: "Remove CLAUDE_ASKED_MODE env var"
type: refactor
status: active
date: 2026-02-19
---

# refactor: Remove CLAUDE_ASKED_MODE env var

## Overview

Remove the redundant `CLAUDE_ASKED_MODE` environment variable and infer transport selection from which config vars are set. Each transport already guards itself — MODE only adds a suppression footgun.

**Brainstorm:** `docs/brainstorms/2026-02-19-remove-mode-env-var-brainstorm.md`

## Design Decisions

These were resolved during brainstorming + spec-flow analysis:

| Decision | Choice | Rationale |
|---|---|---|
| Deprecation warning for legacy MODE | No | Sole user, no migration story needed |
| Whitespace-only values | Trim in `readConfig()` | `"  "` is truthy in JS — trimming avoids silent no-op commands |
| Debug/file log format | `transports=command,webhook` | Replaces `mode=command` with what actually runs |
| "Neither configured" timing | Early exit, before reading stdin | No point parsing an event we can't forward |
| "Neither configured" file log | Yes, log at `warn` level | Audit trail that plugin was invoked but unconfigured |
| Internal guard clauses | Keep as-is | Defensive programming for future callers |
| Historical docs (brainstorms, plans) | Don't update | Historical records; only update reference docs |

## Files to Change

### 1. `plugins/claude-asked/scripts/claude-asked.mjs` (primary)

**Remove:**
- Line 11: `VALID_MODES` constant
- Lines 18-22: mode read + validation in `readConfig()`
- Line 24: `mode` property in config return object

**Add to `readConfig()`:**
- `.trim()` on `command` and `webhookUrl` values

**Replace dispatch logic (lines 178-183):**

```javascript
// Before: mode-gated dispatch
if (cfg.mode === "command" || cfg.mode === "both") {
  forwardCommand(envelope, cfg);
}
if (cfg.mode === "webhook" || cfg.mode === "both") {
  await forwardWebhook(envelope, cfg);
}

// After: presence-based dispatch
if (cfg.command) forwardCommand(envelope, cfg);
if (cfg.webhookUrl) await forwardWebhook(envelope, cfg);
```

**Add "neither configured" early exit in `main()`**, before stdin reading:

```javascript
if (!cfg.command && !cfg.webhookUrl) {
  warn("No transports configured (set CLAUDE_ASKED_COMMAND and/or CLAUDE_ASKED_WEBHOOK_URL)");
  logToFile(cfg, "warn", "no transports configured", null);
  return;
}
```

**Update debug log (line 148):**
```javascript
// Before
warn(`Invoked (pid=${process.pid}, mode=${cfg.mode})`);
// After
const transports = [cfg.command && "command", cfg.webhookUrl && "webhook"].filter(Boolean).join(",");
warn(`Invoked (pid=${process.pid}, transports=${transports})`);
```

**Update file log (line 150):**
```javascript
// Before
logToFile(cfg, "info", `invoked (mode=${cfg.mode})`, null);
// After
logToFile(cfg, "info", `invoked (transports=${transports})`, null);
```

### 2. `plugins/claude-asked/README.md`

- Remove `export CLAUDE_ASKED_MODE=...` from all 6 examples (lines 15, 41, 48, 55, 62, 69, 76)
- Remove MODE row from config table (line 87)
- Delete "Invalid mode falls back to command" troubleshooting bullet (line 149)
- Rewrite "Missing config" bullet to remove mode reference (line 150)

### 3. `plugins/claude-asked/docs/solutions/integration-issues/claude-asked-plugin-cache-hooks-observability.md`

- Remove `export CLAUDE_ASKED_MODE=command` from verification example (line 122)

## Acceptance Criteria

- [ ] `CLAUDE_ASKED_MODE` is not read anywhere in the codebase
- [ ] `VALID_MODES` constant is deleted
- [ ] Setting only `CLAUDE_ASKED_COMMAND` runs command transport
- [ ] Setting only `CLAUDE_ASKED_WEBHOOK_URL` runs webhook transport
- [ ] Setting both runs both transports
- [ ] Setting neither warns to stderr and exits 0
- [ ] Debug log shows `transports=command,webhook` instead of `mode=...`
- [ ] File log shows `transports=...` instead of `mode=...`
- [ ] Whitespace-only COMMAND/WEBHOOK_URL treated as unset
- [ ] README has no references to CLAUDE_ASKED_MODE
- [ ] Cache synced and Claude Code restarted to verify

## Verification

```bash
# 1. Sync cache after changes
./scripts/sync-cache.sh

# 2. Test command-only (restart Claude Code between tests)
export CLAUDE_ASKED_COMMAND="echo got-event"
export CLAUDE_ASKED_DEBUG=1

# 3. Test neither configured
unset CLAUDE_ASKED_COMMAND CLAUDE_ASKED_WEBHOOK_URL
# Expect: [claude-asked] No transports configured ...

# 4. Grep for any remaining MODE references
grep -r "CLAUDE_ASKED_MODE\|VALID_MODES" plugins/claude-asked/scripts/
```
