# claude-asked

Claude Code plugin that forwards Notification and PermissionRequest hook events to a command and/or webhook.

## Project structure

```
.claude-plugin/plugin.json    Plugin manifest
hooks/hooks.json              Hook registration (Notification + PermissionRequest)
scripts/claude-asked.mjs      Hook handler (single file, ~147 lines)
```

## Constraints

- **Always exit 0** -- never block Claude Code
- **Never write stdout** -- Claude Code interprets hook stdout as control JSON
- **Zero dependencies** -- only `node:` built-in modules
- **Node.js 18+** required (uses `crypto.randomUUID()`)

## Testing

Pipe sample JSON payloads into the script and check exit code + stderr:

```bash
echo '{"hook_event_name":"PermissionRequest","session_id":"s","transcript_path":"/t","cwd":"/","permission_mode":"d","tool_name":"Bash","tool_input":{}}' | \
  CLAUDE_ASKED_MODE=command CLAUDE_ASKED_COMMAND="cat > /dev/null" \
  node scripts/claude-asked.mjs 2>&1; echo "exit: $?"
```

## Key files

- `scripts/claude-asked.mjs` -- all plugin logic lives here
- `docs/solutions/integration-issues/nodejs-hook-plugin-pitfalls.md` -- documented bugs and patterns
