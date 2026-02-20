---
name: claude-asked:init
description: >-
  Initialize claude-asked plugin configuration. Use when the user says
  "set up claude-asked", "initialize notifications", or runs /claude-asked:init.
  Creates the config directory and default config file, then launches the
  settings wizard.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - Skill
---

# Initialize claude-asked

Set up the claude-asked plugin for first-time use.

## Steps

### 1. Check for existing config

Use the Read tool to check if `~/.claude/claude-asked/config.json` exists.

**If the file exists:**

Tell the user: "Config file already exists at `~/.claude/claude-asked/config.json`."

Use AskUserQuestion to ask:

- Question: "Would you like to update your settings?"
- Options:
  - "Yes" - Run the settings wizard
  - "No" - Keep current config

If the user selects "Yes", invoke the settings skill:

```
Skill: claude-asked:settings
```

If the user selects "No", end with "Keeping current settings."

### 2. Create config directory and file

If the config file does not exist:

1. Run via Bash: `mkdir -p ~/.claude/claude-asked && chmod 700 ~/.claude/claude-asked`
2. Use the Write tool to create `~/.claude/claude-asked/config.json` with this content:

```json
{}
```

3. Run via Bash: `chmod 600 ~/.claude/claude-asked/config.json`

Tell the user: "Created config file at `~/.claude/claude-asked/config.json` (owner-only permissions)."

### 3. Launch settings wizard

Invoke the settings skill to walk through configuration:

```
Skill: claude-asked:settings
```
