---
title: "Add /claude-asked:init and /claude-asked:settings slash commands"
type: feat
status: active
date: 2026-02-20
---

# feat: Add /claude-asked:init and /claude-asked:settings slash commands

## Overview

Add two Claude Code skills (slash commands) for guided plugin configuration:

- `/claude-asked:init` — First-time setup: creates config directory and file, then invokes settings wizard
- `/claude-asked:settings` — Interactive wizard: walks through essential config fields using AskUserQuestion

## Problem Statement

After installing the plugin, users must manually create `~/.claude/claude-asked/config.json` by hand. There's no guided setup, no way to see current settings, and no discoverability of what to configure. The claude-notifications-go plugin solves this with `/init` and `/settings` commands — we should follow the same pattern.

## Proposed Solution

Two SKILL.md files in `plugins/claude-asked/skills/`. Skills are auto-discovered by Claude Code from the `skills/` directory — no changes to `plugin.json`, `hooks.json`, or `marketplace.json` needed.

### `/claude-asked:init`

1. Check if `~/.claude/claude-asked/config.json` exists
2. If exists: warn and ask if user wants to run settings instead
3. If not: create directory (recursive) and write `{}` as initial config
4. Invoke `/claude-asked:settings` via the Skill tool

### `/claude-asked:settings`

1. Read current config from `~/.claude/claude-asked/config.json`
2. If file missing or corrupted: offer to run `/claude-asked:init` first
3. Ask about notification command (AskUserQuestion with current value)
4. Ask about webhook URL (AskUserQuestion with current value)
5. If webhook URL provided: ask about bearer token (masked display)
6. Read-merge-write: load existing config, overlay changed fields, write back (preserves advanced fields)
7. Display summary with effective settings and env var precedence note

### Key design decisions

**Init-to-settings handoff**: Init instructs Claude to use the `Skill` tool to invoke `claude-asked:settings`. The research confirmed skills can invoke other skills this way.

**Read-merge-write**: Settings reads the existing config, overlays only the fields the wizard touched, and writes back. This preserves advanced fields (`webhookTimeoutMs`, `commandTimeoutMs`, `logFile`, `debug`) that users may have set manually.

**Empty config is `{}`**: The wizard and runtime script both handle missing keys gracefully via defaults. No need to scaffold all 7 keys.

**AskUserQuestion with options**: For command and webhook URL, use free-text input with the current value displayed. For bearer token, mask all but last 4 characters when showing current value.

**No env var detection in v1**: The wizard writes to the config file. If env vars override the config, users see a note in the summary but no active detection.

## Files to Create

### `plugins/claude-asked/skills/init/SKILL.md`

```yaml
---
name: init
description: >-
  Initialize claude-asked plugin configuration. Use when setting up the plugin
  for the first time. Creates the config directory and default config file,
  then launches the settings wizard.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - Skill
---
```

Body instructions:
- Check if `~/.claude/claude-asked/config.json` exists using Read tool
- If exists: use AskUserQuestion to ask "Config already exists. Run settings wizard to update it?"
  - Yes → invoke `claude-asked:settings` via Skill tool
  - No → end with "Config file is at ~/.claude/claude-asked/config.json"
- If not exists: create directory with `mkdir -p ~/.claude/claude-asked` via Bash, write `{}` to config.json via Write tool
- Then invoke `claude-asked:settings` via Skill tool

### `plugins/claude-asked/skills/settings/SKILL.md`

```yaml
---
name: settings
description: >-
  Configure claude-asked notification settings interactively. Use when you want
  to set up or change your notification command, webhook URL, or bearer token.
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - AskUserQuestion
---
```

Body instructions:
- Read `~/.claude/claude-asked/config.json`
  - If missing: tell user to run `/claude-asked:init` first, end
  - If parse error: warn that config is corrupted, offer to start fresh with `{}`
- Load current values for command, webhookUrl, webhookBearer
- **Step 1**: Ask about notification command
  - Show current value (or "not set")
  - Provide platform examples: `notify-send` (Linux), `osascript` (macOS), `curl` for ntfy.sh
  - User can type a new command, say "keep" to keep current, or "clear" to remove
- **Step 2**: Ask about webhook URL
  - Show current value (or "not set")
  - User can type a URL, say "keep", or "clear"
  - If user provides a URL, validate format with `new URL()` parse check; warn if invalid but allow saving
- **Step 3** (conditional): Ask about bearer token
  - Only if webhook URL is set after step 2
  - Show masked current value (e.g., `****abcd` — last 4 chars)
  - User can type a new token, say "keep", or "clear"
- **Write config**: Read existing file again, merge only the fields that changed, write back
  - This preserves advanced fields (webhookTimeoutMs, commandTimeoutMs, logFile, debug)
- **Display summary**:
  - Show each field's saved value (bearer token masked)
  - Show which transport mode is active (command/webhook/both/none)
  - Note: "Environment variables override config file values at runtime"

## Files to Modify

### `plugins/claude-asked/README.md`

Add a "Setup" section after "Quick start" with:

```markdown
## Setup

After installing, run the setup wizard:

```
/claude-asked:init
```

To change settings later:

```
/claude-asked:settings
```
```

## Acceptance Criteria

- [x] `/claude-asked:init` creates `~/.claude/claude-asked/config.json` when it doesn't exist
- [x] `/claude-asked:init` warns and offers settings when config already exists
- [x] `/claude-asked:settings` reads and displays current config values
- [x] `/claude-asked:settings` asks about command, webhookUrl, and conditionally webhookBearer
- [x] `/claude-asked:settings` preserves advanced fields on write (read-merge-write)
- [x] `/claude-asked:settings` masks bearer token when displaying current value
- [x] `/claude-asked:settings` shows summary with transport mode and env var note
- [x] Skills auto-discovered by Claude Code (no manifest changes needed)
- [x] README updated with setup instructions
- [x] Cache synced and skills accessible after sync + restart

## Verification

```bash
# 1. Sync cache
./scripts/sync-cache.sh

# 2. Restart Claude Code

# 3. Run /claude-asked:init — should create config and launch wizard

# 4. Run /claude-asked:settings — should show current values and allow changes

# 5. Verify config file
cat ~/.claude/claude-asked/config.json

# 6. Run /claude-asked:init again — should warn config exists
```
