# claude-asked

A Claude Code plugin that forwards hook events to a shell command and/or HTTP webhook when Claude needs your input.

Listens to **Notification**, **PermissionRequest**, **PreToolUse** (AskUserQuestion), and **Stop** events. Zero dependencies.

## Install

```bash
claude --plugin-dir /path/to/claude-asked
```

Restart Claude Code after installing. Verify the plugin is loaded via the `/hooks` menu.

## Configure

Set environment variables before launching Claude Code:

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_ASKED_MODE` | `command` | `command`, `webhook`, or `both` |
| `CLAUDE_ASKED_COMMAND` | | Shell command to run (receives JSON on stdin) |
| `CLAUDE_ASKED_WEBHOOK_URL` | | URL to POST JSON to (http or https) |
| `CLAUDE_ASKED_WEBHOOK_BEARER` | | Bearer token for webhook `Authorization` header |
| `CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS` | `3000` | Webhook request timeout |
| `CLAUDE_ASKED_COMMAND_TIMEOUT_MS` | `2000` | Command execution timeout |
| `CLAUDE_ASKED_LOG_FILE` | | Path to a JSONL log file (disabled when unset) |
| `CLAUDE_ASKED_DEBUG` | | Set to any value to enable stderr debug output |

## Usage

### Command mode

Forward events to a local script:

```bash
export CLAUDE_ASKED_MODE=command
export CLAUDE_ASKED_COMMAND="jq . >> /tmp/claude-events.jsonl"
```

### Webhook mode

POST events to an HTTP endpoint:

```bash
export CLAUDE_ASKED_MODE=webhook
export CLAUDE_ASKED_WEBHOOK_URL=https://example.com/hook
export CLAUDE_ASKED_WEBHOOK_BEARER=my-secret-token
```

### Both

```bash
export CLAUDE_ASKED_MODE=both
export CLAUDE_ASKED_COMMAND="notify-send 'Claude needs input'"
export CLAUDE_ASKED_WEBHOOK_URL=https://example.com/hook
```

## Hook events

| Event | Fires when |
|---|---|
| `Notification` | Claude Code sends a system notification |
| `PermissionRequest` | A tool needs user permission to run |
| `PreToolUse` (AskUserQuestion) | Claude asks a structured question with options |
| `Stop` | Claude finishes responding and waits for input |

## File logging

Set `CLAUDE_ASKED_LOG_FILE` to append JSONL entries for every event:

```bash
export CLAUDE_ASKED_LOG_FILE=/tmp/claude-asked.jsonl
```

Each line is a self-contained JSON object:

```json
{"ts":"2026-02-19T17:31:31.575Z","level":"info","event":"PermissionRequest","event_id":"924be...","msg":"webhook: 200"}
```

Log entries track invocations, event receipt, and forwarding results (success or failure) for both command and webhook transports. Write failures warn to stderr but never crash the plugin.

## Envelope format

The command/webhook receives a JSON envelope:

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

## Troubleshooting

- **Errors go to stderr** with a `[claude-asked]` prefix. Check your terminal or process manager logs.
- **The plugin never blocks Claude Code** -- it always exits 0 and never writes to stdout.
- **Invalid mode** falls back to `command` with a stderr warning.
- **Missing config** (e.g., `mode=webhook` but no URL) produces a stderr warning and skips that transport.

## Requirements

- Node.js 18+
- Claude Code with plugin support

## License

MIT
