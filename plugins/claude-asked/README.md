# claude-asked

Get notified when Claude needs your attention. A Claude Code plugin that fires when Claude asks a question, requests permission, or finishes work — forwarding the event to a shell command, HTTP webhook, or both.

## Quick start

```bash
# 1. Add the marketplace
claude marketplace add https://github.com/senara-solutions/senara-claude-plugins

# 2. Enable the plugin (follow the interactive prompts)
claude plugin install claude-asked

# 3. Restart Claude Code, then run the setup wizard
/claude-asked:init
```

Verify hooks are loaded via the `/hooks` menu.

## Setup

The setup wizard walks you through configuring notifications:

```
/claude-asked:init
```

This creates `~/.claude/claude-asked/config.json` and asks you to choose a notification command and/or webhook.

To change settings later:

```
/claude-asked:settings
```

You can also configure manually via the config file or environment variables (see [Configuration](#configuration) below).

## What it captures

The plugin fires on three hook events — each represents a moment you need to come back:

| Event | When it fires | Key payload fields |
|---|---|---|
| `PermissionRequest` | A tool needs user permission | `tool_name`, `tool_input`, `permission_mode` |
| `PreToolUse` (AskUserQuestion) | Claude asks a structured question | `tool_name`, `tool_input.questions` |
| `Stop` | Claude finishes and waits for input | `last_assistant_message` |

Every event includes `session_id`, `cwd`, and `transcript_path`.

## Real-world examples

### Desktop notifications (Linux)

```bash
export CLAUDE_ASKED_COMMAND="notify-send 'Claude Code' 'Waiting for your input'"
```

### Desktop notifications (macOS)

```bash
export CLAUDE_ASKED_COMMAND="osascript -e 'display notification \"Waiting for your input\" with title \"Claude Code\"'"
```

### Mobile push via ntfy.sh

```bash
export CLAUDE_ASKED_COMMAND="curl -s -d 'Claude needs you' https://ntfy.sh/my-claude-topic"
```

### Slack incoming webhook

```bash
export CLAUDE_ASKED_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

### Log events as JSONL

```bash
export CLAUDE_ASKED_COMMAND="jq -c . >> /tmp/claude-events.jsonl"
```

### Command + webhook together

```bash
export CLAUDE_ASKED_COMMAND="notify-send 'Claude needs you'"
export CLAUDE_ASKED_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

## Configuration

### Config file

Create `~/.claude/claude-asked/config.json` for persistent defaults:

```bash
mkdir -p ~/.claude/claude-asked
cat > ~/.claude/claude-asked/config.json << 'EOF'
{
  "command": "notify-send 'Claude needs you'",
  "webhookUrl": "https://example.com/hook",
  "webhookBearer": "sk-...",
  "webhookTimeoutMs": 3000,
  "commandTimeoutMs": 2000,
  "logFile": "/tmp/claude-asked.jsonl",
  "debug": true
}
EOF
```

All fields are optional. Environment variables override config file values.

### Environment variables

Set environment variables before launching Claude Code to override config file values:

| Variable | Config key | Default | Description |
|---|---|---|---|
| `CLAUDE_ASKED_COMMAND` | `command` | | Shell command (receives JSON envelope on stdin) |
| `CLAUDE_ASKED_WEBHOOK_URL` | `webhookUrl` | | URL to POST JSON to (http or https) |
| `CLAUDE_ASKED_WEBHOOK_BEARER` | `webhookBearer` | | Bearer token for webhook `Authorization` header |
| `CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS` | `webhookTimeoutMs` | `3000` | Webhook request timeout (ms) |
| `CLAUDE_ASKED_COMMAND_TIMEOUT_MS` | `commandTimeoutMs` | `2000` | Command execution timeout (ms) |
| `CLAUDE_ASKED_LOG_FILE` | `logFile` | | Path to a JSONL log file (disabled when unset) |
| `CLAUDE_ASKED_DEBUG` | `debug` | | Set to any value for stderr debug output |

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
./scripts/sync-cache.sh
```

The script reads the cache path from `~/.claude/plugins/installed_plugins.json`, mirrors the source with `rsync`, and prints what changed. Then restart Claude Code.

### General

- **Errors go to stderr** with a `[claude-asked]` prefix.
- **The plugin never blocks Claude Code** -- it runs async, always exits 0, never writes stdout.
- **Missing config** (no `CLAUDE_ASKED_COMMAND` or `CLAUDE_ASKED_WEBHOOK_URL`) warns to stderr and exits.
- **Enable debug logging:** `export CLAUDE_ASKED_DEBUG=1` to see invocation details on stderr.
- **Enable file logging:** `export CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl` for a persistent audit trail.

## Requirements

- Node.js 18+
- Claude Code with plugin support
- Zero external dependencies

## License

MIT
