---
title: "Fix claude-asked plugin hooks not firing due to stale cache and missing Stop hook coverage"
date: 2026-02-19
module: claude-asked
severity: medium
tags:
  - claude-code-hooks
  - plugin-cache
  - observability
  - logging
summary: |
  Resolved two issues preventing the claude-asked plugin from capturing user questions:
  (1) marketplace cache was stale, missing new hooks and debug logging;
  (2) plain-text questions from skill agents weren't captured because Stop hook wasn't registered.
  Added CLAUDE_ASKED_LOG_FILE env var for opt-in JSONL file logging where stderr isn't visible.
---

# Plugin Cache, Hook Coverage, and Observability

## Problem

Three related issues prevented the claude-asked plugin from reliably capturing events:

### 1. Stale plugin cache

The marketplace system caches plugins at `~/.claude/plugins/cache/` at install time. Updates to the source repo do not propagate to the cache. The cached version (commit `297b607`) was missing the `PreToolUse` hook and `CLAUDE_ASKED_DEBUG` logging added in later commits (`b80cda1`, `7951179`).

**Symptom:** No hook events fired at all — not even `PermissionRequest` which was already configured in the source.

### 2. Missing Stop hook

The plugin only listened to `Notification`, `PermissionRequest`, and `PreToolUse(AskUserQuestion)`. Skill agents like `/compound-engineering:workflows:plan` ask questions via plain text output, not the `AskUserQuestion` tool. These questions were invisible to the plugin.

**Symptom:** Claude asked a plain-text question and waited for input, but no event was captured.

### 3. No local observability in webhook mode

`CLAUDE_ASKED_DEBUG` writes to stderr, which is not reliably visible in async hooks. Webhook mode sends events remotely but leaves no local trace of what fired or whether forwarding succeeded.

**Symptom:** Plugin appeared non-functional — no way to confirm events were being processed.

## Investigation

1. **Compared source vs cache:** `diff` between `plugins/claude-asked/hooks/hooks.json` and `~/.claude/plugins/cache/.../hooks.json` showed the cache was missing the `PreToolUse` hook block entirely.

2. **Tested with debug logging:** Set `CLAUDE_ASKED_DEBUG=1` and checked stderr — no `[claude-asked] Invoked ...` lines appeared, confirming the cached script didn't have the debug code.

3. **Copied source to cache:** After overwriting the cache, hooks started firing. `PermissionRequest`, `PreToolUse(AskUserQuestion)`, and `Notification` events all appeared in the log.

4. **Triggered a skill question:** Ran `/compound-engineering:workflows:plan` which asked a plain-text clarifying question. No `PreToolUse` event fired because the skill didn't use `AskUserQuestion`.

5. **Researched available hook events:** Discovered Claude Code supports 14 hook event types including `Stop` — fires when Claude finishes responding and waits for input.

## Solution

### 1. Manual cache sync

```bash
cp plugins/claude-asked/hooks/hooks.json \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/hooks/hooks.json

cp plugins/claude-asked/scripts/claude-asked.mjs \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/scripts/claude-asked.mjs
```

Restart Claude Code after copying.

### 2. Stop hook registration

Added to `hooks.json`:

```json
"Stop": [
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
]
```

The `Stop` hook captures all "Claude finished and waits for input" moments — including plain-text questions from skills that don't use the `AskUserQuestion` tool.

### 3. Opt-in JSONL file logging

Added `CLAUDE_ASKED_LOG_FILE` env var. When set, appends structured JSONL entries:

```javascript
function logToFile(cfg, level, msg, envelope, detail) {
  if (!cfg.logFile) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event: envelope?.hook_event_name ?? null,
    event_id: envelope?.event_id ?? null,
    msg,
  };
  if (detail !== undefined) entry.detail = detail;
  try { appendFileSync(cfg.logFile, JSON.stringify(entry) + "\n"); }
  catch (err) { warn(`Log write failed: ${err.message}`); }
}
```

Key design decisions:
- **Disabled by default** — no file I/O when env var is unset
- **try/catch** — write failures warn to stderr but never crash (exit-0 contract)
- **appendFileSync** — correct for cold short-lived processes; guarantees writes complete before `process.exit(0)`
- **Minimal data** — only operational metadata logged, never payloads, tokens, or secrets

Log points: invocation, event receipt, command result (ok/error/signal), webhook result (status/timeout/error), parse errors.

## Verification

```bash
# Test logging
export CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="true"

# Trigger events in Claude Code, then:
cat /tmp/claude-asked.jsonl
# Should show: invoked, event received, command: ok entries

# Test with no log file (backward compat)
unset CLAUDE_ASKED_LOG_FILE
# No file created, no behavior change
```

## Prevention

### Stale cache

- After updating plugin source, always sync the cache before restarting Claude Code
- Compare versions: `diff plugins/claude-asked/hooks/hooks.json ~/.claude/plugins/cache/.../hooks.json`
- Consider a cache refresh script or version-check mechanism in future

### Missing hook coverage

- Review all available Claude Code hook events when adding new features
- Current events: `Notification`, `PermissionRequest`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`, `PreCompact`, `PostToolUseFailure`
- Not all "waiting for input" moments use the same mechanism — `Stop` is the catch-all

### Observability

- Use `CLAUDE_ASKED_LOG_FILE` for persistent local audit trail
- `CLAUDE_ASKED_DEBUG` for live terminal debugging (best-effort stderr)
- JSONL format supports `jq`, `grep`, `tail -f` for analysis

## Related

- [nodejs-hook-plugin-pitfalls.md](./nodejs-hook-plugin-pitfalls.md) — Error handling patterns for hook scripts (exit-0, try/catch, settlement guards)
- [2026-02-19-feat-claude-asked-plugin-plan.md](../plans/2026-02-19-feat-claude-asked-plugin-plan.md) — Original plugin implementation plan
- [2026-02-19-feat-file-logging-plan.md](../plans/2026-02-19-feat-file-logging-plan.md) — File logging feature plan
- [2026-02-19-claude-asked-brainstorm.md](../brainstorms/2026-02-19-claude-asked-brainstorm.md) — Original design decisions and scope
