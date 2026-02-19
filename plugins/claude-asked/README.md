# claude-asked

Get notified when Claude is waiting for you. A Claude Code plugin that forwards hook events to a shell command, HTTP webhook, or both.

## Quick start

```bash
# 1. Add the marketplace
claude marketplace add https://github.com/senara-solutions/senara-claude-plugins

# 2. Enable the plugin (follow the interactive prompts)
claude plugin install claude-asked

# 3. Set up notifications (pick one)
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="notify-send 'Claude needs you'"

# 4. Restart Claude Code
```

Verify hooks are loaded via the `/hooks` menu.

## What it captures

The plugin fires on four hook events:

| Event | When it fires | Key payload fields |
|---|---|---|
| `Notification` | Claude Code sends a system notification | `message`, `notification_type` |
| `PermissionRequest` | A tool needs user permission | `tool_name`, `tool_input`, `permission_mode` |
| `PreToolUse` (AskUserQuestion) | Claude asks a structured question | `tool_name`, `tool_input.questions` |
| `Stop` | Claude finishes and waits for input | `last_assistant_message` |

Every event includes `session_id`, `cwd`, and `transcript_path`.

## Real-world examples

### Desktop notifications (Linux)

```bash
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="notify-send 'Claude Code' 'Waiting for your input'"
```

### Desktop notifications (macOS)

```bash
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="osascript -e 'display notification \"Waiting for your input\" with title \"Claude Code\"'"
```

### Mobile push via ntfy.sh

```bash
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="curl -s -d 'Claude needs you' https://ntfy.sh/my-claude-topic"
```

### Slack incoming webhook

```bash
export CLAUDE_ASKED_MODE=webhook
export CLAUDE_ASKED_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

### Log events as JSONL

```bash
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="jq -c . >> /tmp/claude-events.jsonl"
```

### Command + webhook together

```bash
export CLAUDE_ASKED_MODE=both
export CLAUDE_ASKED_COMMAND="notify-send 'Claude needs you'"
export CLAUDE_ASKED_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

## Configuration

Set environment variables before launching Claude Code:

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_ASKED_MODE` | `command` | `command`, `webhook`, or `both` |
| `CLAUDE_ASKED_COMMAND` | | Shell command (receives JSON envelope on stdin) |
| `CLAUDE_ASKED_WEBHOOK_URL` | | URL to POST JSON to (http or https) |
| `CLAUDE_ASKED_WEBHOOK_BEARER` | | Bearer token for webhook `Authorization` header |
| `CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS` | `3000` | Webhook request timeout (ms) |
| `CLAUDE_ASKED_COMMAND_TIMEOUT_MS` | `2000` | Command execution timeout (ms) |
| `CLAUDE_ASKED_LOG_FILE` | | Path to a JSONL log file (disabled when unset) |
| `CLAUDE_ASKED_DEBUG` | | Set to any value for stderr debug output |

## Envelope format

Every command/webhook receives a JSON envelope on stdin (command) or as a POST body (webhook):

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

## File logging

Set `CLAUDE_ASKED_LOG_FILE` to get a local audit trail of all events:

```bash
export CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl
```

Each line is a self-contained JSON object:

```json
{"ts":"2026-02-19T17:31:31.575Z","level":"info","event":"PermissionRequest","event_id":"924be...","msg":"webhook: 200"}
```

Useful for debugging when stderr isn't visible (async hooks) or when using webhook mode with no local trace.

## Troubleshooting

### Hooks not firing after an update

The marketplace caches plugins at install time. After updating the source, sync the cache:

```bash
cp plugins/claude-asked/hooks/hooks.json \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/hooks/hooks.json

cp plugins/claude-asked/scripts/claude-asked.mjs \
  ~/.claude/plugins/cache/senara-claude-plugins/claude-asked/0.1.0/scripts/claude-asked.mjs
```

Then restart Claude Code.

### General

- **Errors go to stderr** with a `[claude-asked]` prefix.
- **The plugin never blocks Claude Code** -- it runs async, always exits 0, never writes stdout.
- **Invalid mode** falls back to `command` with a stderr warning.
- **Missing config** (e.g., `mode=webhook` but no URL) warns to stderr and skips that transport.
- **Enable debug logging:** `export CLAUDE_ASKED_DEBUG=1` to see invocation details on stderr.
- **Enable file logging:** `export CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl` for a persistent audit trail.

## Requirements

- Node.js 18+
- Claude Code with plugin support
- Zero external dependencies

## License

MIT
