---
name: settings
description: >-
  Configure claude-asked notification settings interactively. Use when the user
  says "configure notifications", "change webhook", "update settings", or runs
  /claude-asked:settings. Walks through essential config fields.
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - AskUserQuestion
---

# Configure claude-asked Settings

Walk the user through configuring their notification settings.

## Steps

### 1. Read current config

Read `~/.claude/claude-asked/config.json` using the Read tool.

- **If the file does not exist**: Tell the user "No config file found. Run `/claude-asked:init` first to create one." Then stop.
- **If the file contains invalid JSON**: Tell the user "Config file exists but contains invalid JSON. Would you like to start fresh?" If yes, treat the config as `{}`. If no, stop.
- **If the file is valid JSON**: Parse the current values for `command`, `webhookUrl`, and `webhookBearer`.

### 2. Ask about notification command

Use AskUserQuestion to ask:

- Question: "What shell command should run when Claude needs your attention?"
- Show the current value if set, or say "not set" if empty/missing.
- Options:
  - "Keep current" (only show this if a value is currently set) - Do not change the value
  - "Desktop notification" - Use platform-appropriate command
  - "No command" - Clear the command (set to empty string)
  - "Custom command" - Let the user type their own command

If the user picks "Desktop notification", determine the platform from the session's environment context (e.g., Linux or macOS). If the platform cannot be determined, ask the user.
- Linux: suggest `notify-send 'Claude Code' 'Waiting for your input'`
- macOS: suggest `osascript -e 'display notification "Waiting for your input" with title "Claude Code"'`

Ask the user to confirm or customize the suggested command.

If the user picks "Custom command", ask them to type the full command.

### 3. Ask about webhook URL

Use AskUserQuestion to ask:

- Question: "Do you want to send notifications to a webhook? (Slack, Discord, custom endpoint)"
- Show the current value if set, or say "not set" if empty/missing.
- Options:
  - "Keep current" (only show this if a value is currently set) - Do not change the value
  - "Set webhook URL" - Let the user type a URL
  - "No webhook" - Clear the webhook URL (set to empty string)

### 4. Ask about bearer token (conditional)

**Only ask this if a webhook URL is configured after step 3** (either kept from existing config or newly set).

Use AskUserQuestion to ask:

- Question: "Does your webhook require a bearer token for authentication?"
- If a token is currently set, show it masked: display only the last 4 characters with the rest as asterisks (e.g., `****abcd`). If the token is shorter than 5 characters, show all asterisks.
- Options:
  - "Keep current" (only show this if a token is currently set) - Do not change the value
  - "Set token" - Let the user type a new bearer token
  - "No token" - Clear the bearer token (set to empty string)

### 5. Write updated config

Use the config parsed in step 1 as the base. Only update the fields that the user changed in steps 2-4. If the user chose "Keep current" for a field, do not modify it. Write the merged config back to `~/.claude/claude-asked/config.json` using the Write tool. Format the JSON with 2-space indentation for readability.

**Important**: Do NOT remove keys that the wizard did not ask about. Fields like `webhookTimeoutMs`, `commandTimeoutMs`, `logFile`, and `debug` may have been set manually by the user. Preserve them.

### 6. Display summary

After saving, display a summary:

```
Settings saved to ~/.claude/claude-asked/config.json

  Command:    <value or "not set">
  Webhook:    <value or "not set">
  Bearer:     <masked value or "not set">
  Transport:  <command / webhook / command + webhook / none>

Note: Environment variables (CLAUDE_ASKED_*) override config file
values at runtime.
```

If the transport is "none" (neither command nor webhook configured), add a warning: "No transports configured. The plugin won't send notifications until you set a command or webhook URL."
