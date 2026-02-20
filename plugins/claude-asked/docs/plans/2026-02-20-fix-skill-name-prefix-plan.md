---
title: "Fix skill display names to show /claude-asked: prefix"
type: fix
status: completed
date: 2026-02-20
---

# fix: Skill display names missing /claude-asked: prefix

## Problem

Skills show as `/init` and `/settings` instead of `/claude-asked:init` and `/claude-asked:settings`. This is confusing because bare names collide with other plugins and don't indicate which plugin they belong to.

## Root Cause

The `name` field in SKILL.md frontmatter must include the plugin namespace prefix. Currently set to `init` and `settings` — should be `claude-asked:init` and `claude-asked:settings`.

Confirmed by the compound-engineering plugin pattern: `name: workflows:plan`, `name: workflows:review`, etc.

## Proposed Solution

Change the `name` field in both SKILL.md files:

### `plugins/claude-asked/skills/init/SKILL.md`

```yaml
# Before
name: init

# After
name: claude-asked:init
```

### `plugins/claude-asked/skills/settings/SKILL.md`

```yaml
# Before
name: settings

# After
name: claude-asked:settings
```

## Acceptance Criteria

- [x] `/claude-asked:init` shows with full prefix in Claude Code skill list
- [x] `/claude-asked:settings` shows with full prefix in Claude Code skill list
- [x] Cache synced and skills accessible after sync + restart
