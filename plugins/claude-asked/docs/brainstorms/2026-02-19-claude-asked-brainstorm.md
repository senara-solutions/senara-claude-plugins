# Brainstorm: claude-asked

**Date:** 2026-02-19
**Status:** Draft

## What We're Building

A minimal Claude Code plugin called **claude-asked** that fires a command and/or HTTP webhook whenever Claude needs user input. It listens to two hook events:

- **Notification** — when Claude needs attention (idle prompt, permission prompt, elicitation dialog)
- **PermissionRequest** — when Claude requests permission for a tool call

When either event fires, the plugin wraps the raw hook payload in a light envelope and forwards it to a configured command (via stdin) and/or webhook (via HTTP POST). That's it.

## Why This Approach

The reference document (`deep-research-report.md`) describes a fully-featured "claude-monitor" with JSONL logging/rotation, DLQ, admin toggle server, HMAC auth, retry/backoff, redaction, and more. That's appropriate for production observability infrastructure but overkill for the actual need: **"tell me when Claude is waiting for me."**

We're stripping it down to the bare minimum:
- Single `.mjs` file (~100-150 lines)
- Config via environment variables only
- Light envelope (event_id, timestamp, hook_event_name, raw payload)
- Bearer token auth for webhook (no HMAC)
- No logging, no DLQ, no admin server, no retry
- Always exits 0 (non-blocking)
- Never writes to stdout

## Key Decisions

1. **Hook events:** Notification + PermissionRequest only. No SessionStart or Stop.
2. **Forwarding targets:** Both command and webhook, selected by env var (`CLAUDE_ASKED_MODE`: `command`, `webhook`, `both`).
3. **Payload format:** Light envelope — `{ event_id, timestamp, hook_event_name, payload: <raw> }`.
4. **Language:** Node.js ESM (single `.mjs` file).
5. **Auth:** Bearer token only for webhook. No HMAC.
6. **Non-blocking:** Always exit 0, never write stdout — per Claude Code hook contract.
7. **Async hooks:** Both hooks registered with `async: true` to avoid blocking Claude Code.
8. **Failure handling:** On command failure or webhook error, write a one-line message to stderr and move on. No retry, no DLQ.
9. **Notification filtering:** Forward all Notification events regardless of `notification_type`. The receiver is responsible for filtering if needed. This keeps the plugin simple at the cost of some noise.

## Plugin Structure

```
claude-asked/
  .claude-plugin/
    plugin.json
  hooks/
    hooks.json
  scripts/
    claude-asked.mjs
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_ASKED_MODE` | `command` | `command`, `webhook`, or `both` |
| `CLAUDE_ASKED_COMMAND` | (none) | Shell command to execute; receives envelope JSON on stdin |
| `CLAUDE_ASKED_WEBHOOK_URL` | (none) | URL to POST envelope JSON to |
| `CLAUDE_ASKED_WEBHOOK_BEARER` | (none) | Bearer token for webhook Authorization header |
| `CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS` | `3000` | Webhook request timeout |
| `CLAUDE_ASKED_COMMAND_TIMEOUT_MS` | `2000` | Command execution timeout |

## Envelope Format

```json
{
  "event_id": "6b7c278f-fd02-4fe6-9f5c-2a751e2b8b1a",
  "timestamp": "2026-02-19T14:22:11.104Z",
  "hook_event_name": "PermissionRequest",
  "payload": {
    "session_id": "abc123",
    "hook_event_name": "PermissionRequest",
    "tool_name": "Bash",
    "tool_input": { "command": "npm test" },
    "cwd": "/home/user/project",
    "permission_mode": "default",
    "transcript_path": "/home/user/.claude/projects/.../abc123.jsonl"
  }
}
```

## What We're NOT Building (vs. reference doc)

- No JSONL logging or log rotation
- No dead letter queue
- No admin toggle HTTP server
- No HMAC webhook auth
- No retry/backoff logic
- No redaction/sanitization
- No dedupe_key or classification fields
- No SessionStart/Stop hooks
- No `state.json` overrides
- No notification_type filtering (forward all Notification events)

## Open Questions

(none)