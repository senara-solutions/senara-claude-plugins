---
title: "SKILL.md namespace prefix and disable-model-invocation delegation"
date: 2026-02-20
module: plugins/claude-asked/skills/
severity: high
tags:
  - skill-naming
  - skill-invocation
  - frontmatter-config
  - plugin-namespace
  - disable-model-invocation
problem_type: configuration
status: resolved
---

# SKILL.md Namespace Prefix and Delegation Configuration

## Problem Statement

Two SKILL.md frontmatter configuration issues in the claude-asked plugin:

1. **Skills displayed as `/init` and `/settings`** instead of `/claude-asked:init` and `/claude-asked:settings`. Confusing — bare names don't indicate which plugin they belong to and could collide with other plugins.

2. **Init-to-settings handoff broken**: When `/claude-asked:init` tried to invoke settings via the Skill tool, Claude Code returned: `"Error: Skill claude-asked:settings cannot be used with Skill tool due to disable-model-invocation"`

## Root Cause Analysis

### Problem 1: Missing Plugin Namespace Prefix

The `name` field in SKILL.md YAML frontmatter was set to just the skill name (`init`, `settings`) without the plugin namespace prefix. Claude Code uses the `name` field directly for display and invocation. The convention (confirmed by compound-engineering plugin: `name: workflows:plan`, `name: workflows:review`) is to use the full `<plugin>:<skill>` format.

### Problem 2: disable-model-invocation Blocks All Programmatic Invocation

`disable-model-invocation: true` has a broader effect than its name suggests:

- **Expected**: Prevents Claude from auto-triggering the skill based on conversational context
- **Actual**: Blocks ALL invocation via the Skill tool, including deliberate delegation from another skill

This means any skill that needs to be called by another skill via the Skill tool must NOT have this flag set.

## Solution

### Fix 1: Add Plugin Namespace Prefix

```yaml
# plugins/claude-asked/skills/init/SKILL.md
# Before
name: init
# After
name: claude-asked:init

# plugins/claude-asked/skills/settings/SKILL.md
# Before
name: settings
# After
name: claude-asked:settings
```

### Fix 2: Remove disable-model-invocation from Settings

```yaml
# plugins/claude-asked/skills/settings/SKILL.md
# Before
name: claude-asked:settings
description: >-
  Configure claude-asked notification settings interactively...
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - AskUserQuestion

# After
name: claude-asked:settings
description: >-
  Configure claude-asked notification settings interactively...
allowed-tools:
  - Read
  - Write
  - AskUserQuestion
```

Removing the flag is safe because:
- Settings only uses Read, Write, AskUserQuestion — no dangerous tools
- Auto-triggering when users say "configure notifications" is desirable
- The init-to-settings handoff is a core workflow requirement

## Files Changed

- `plugins/claude-asked/skills/init/SKILL.md` — `name: init` → `name: claude-asked:init`
- `plugins/claude-asked/skills/settings/SKILL.md` — `name: settings` → `name: claude-asked:settings`, removed `disable-model-invocation: true`

## Prevention Strategies

### SKILL.md Name Field

- **Always** use the format `<plugin-name>:<skill-name>` in the `name` field
- **Never** use bare names like `name: init` — they display without plugin context
- **Validate** with regex: `/^[a-z0-9-]+:[a-z0-9-]+$/`
- **Reference**: compound-engineering plugin uses `workflows:plan`, `workflows:review`, `workflows:work`

### disable-model-invocation Flag

- **Understand the scope**: This flag blocks ALL Skill tool invocation, not just auto-triggering
- **Don't use it** on skills that need to be invoked by other skills via the Skill tool
- **Do use it** on skills that should only be invoked by the user typing the slash command directly (e.g., destructive operations)
- **When delegating**: The calling skill needs `Skill` in its `allowed-tools`; the target skill must NOT have `disable-model-invocation: true`

### SKILL.md Authoring Checklist

1. `name` field includes plugin prefix (`plugin:skill`)
2. Every tool referenced in instructions is in `allowed-tools`
3. If skill delegates to another skill: `Skill` is in `allowed-tools` and target skill allows programmatic invocation
4. If `disable-model-invocation: true` is set, document why and confirm no other skill needs to invoke it

## Related Documentation

- [Security hardening and agent-native guidance in SKILL.md files](../security-issues/skill-file-permissions-and-agent-parity-hardening.md) — SKILL.md authoring best practices
- [Plugin cache staleness and dev sync](plugin-cache-staleness-dev-sync.md) — cache sync required after SKILL.md changes
- [Config file and env var integration](config-file-env-var-integration.md) — config file the skills interact with
