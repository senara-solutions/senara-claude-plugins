---
title: "Add /init and /settings slash commands for guided configuration"
date: 2026-02-20
topic: init-settings-skills
status: complete
---

# Init and Settings Slash Commands

## What We're Building

Two Claude Code skills (slash commands) for the claude-asked plugin:

1. **`/claude-asked:init`** — First-time setup. Creates `~/.claude/claude-asked/` directory and `config.json` with empty/default values, then runs the settings wizard.

2. **`/claude-asked:settings`** — Interactive configuration wizard. Uses `AskUserQuestion` to walk through the essential config fields (command, webhookUrl, webhookBearer). Reads current values and writes updated config to `~/.claude/claude-asked/config.json`.

Both are Claude Code skills invoked inside conversations, not standalone CLI commands.

## Why This Approach

- **Guided first-time experience**: New users don't have to figure out the JSON config format or remember the file path
- **Follows plugin ecosystem pattern**: claude-notifications-go uses the same `/plugin:init` and `/plugin:settings` convention
- **Essential fields only**: The wizard asks about 3 fields (command, webhookUrl, webhookBearer) — timeouts, logFile, and debug use sensible defaults and can be edited manually in JSON if needed
- **init delegates to settings**: `init` creates the file scaffold, then runs the same wizard as `settings`. No duplicated logic.

## Key Decisions

1. **Skills, not CLI commands** — Invoked as `/claude-asked:init` and `/claude-asked:settings` inside Claude Code conversations. Uses AskUserQuestion for interactive input and Write tool to save config.

2. **Essential fields only** — Wizard covers command, webhookUrl, webhookBearer. Advanced fields (webhookTimeoutMs, commandTimeoutMs, logFile, debug) keep defaults and are documented for manual JSON editing.

3. **init = scaffold + settings** — `init` creates the directory and empty config file, then immediately launches the settings wizard. Running `init` on an existing config should warn but not overwrite.

4. **settings reads current values** — When running `/claude-asked:settings`, display current values as defaults so users can keep what they have and only change what they want.

5. **Config file is the source of truth** — Skills read and write `~/.claude/claude-asked/config.json`. Env vars still override at runtime but aren't managed by these skills.

## Resolved Questions

- **How to invoke?** → Claude Code skills (slash commands), not standalone CLI
- **How many fields in the wizard?** → 3 essential fields only (command, webhookUrl, webhookBearer)
- **What does init do if config exists?** → Warn and offer to run settings instead (don't overwrite)
- **Where do skills live in the plugin structure?** → Need to determine during planning (likely `skills/` directory with SKILL.md files)
