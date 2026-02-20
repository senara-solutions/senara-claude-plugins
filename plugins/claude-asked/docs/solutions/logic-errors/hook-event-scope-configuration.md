---
title: "Plugin hook event scope: don't let the name dictate the features"
date: 2026-02-20
category: logic-errors
tags:
  - hook-management
  - plugin-refactoring
  - claude-asked
  - event-filtering
  - scope-decision
components:
  - plugins/claude-asked/hooks/hooks.json
  - plugins/claude-asked/README.md
severity: low
problem_type: scope-optimization
---

# Plugin Hook Event Scope Configuration

## Problem

The claude-asked plugin registered 4 hook events (Notification, PermissionRequest, PreToolUse/AskUserQuestion, Stop). A refactor to reduce noise initially removed both Stop and Notification, keeping only 2 "question" events. After implementation, the user realized Stop was essential — when working remotely, you need to know when Claude finishes work, not just when it's blocked.

The plugin went from over-scoped (4 events including noise) to under-scoped (2 events, missing completion signal) before landing on the right scope (3 events).

## Root Cause

The brainstorm framed the decision around the plugin's name: "claude-asked = Claude asked you something." This excluded Stop because it's not a question. But the actual user need is broader: **notify when Claude needs your attention** — which includes work completion.

The name became a cognitive anchor that artificially narrowed scope.

## Solution

Remove only Notification. Keep Stop, PermissionRequest, and PreToolUse (AskUserQuestion).

**hooks.json — before (4 events):**
```json
{
  "hooks": {
    "Notification": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }],
    "PermissionRequest": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }]
  }
}
```

**hooks.json — after (3 events):**
```json
{
  "hooks": {
    "PermissionRequest": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs", "async": true, "timeout": 30 }] }]
  }
}
```

**Why each event is kept or removed:**

| Event | Kept? | Reason |
|-------|-------|--------|
| PermissionRequest | Yes | Claude is blocked waiting for permission — user must act |
| PreToolUse (AskUserQuestion) | Yes | Claude is blocked asking a question — user must respond |
| Stop | Yes | Claude finished work — user should review output. `last_assistant_message` provides context for what to do next |
| Notification | No | System notification from Claude Code — not actionable, no user response needed |

## Prevention

### Decision framework: "Should this event trigger a notification?"

Ask these questions before including or excluding a hook event:

1. **Is it actionable?** Can the user do something in response?
2. **Would the user regret missing it?** If they stepped away, would they want to know?
3. **Is it a discrete state change?** (Not continuous/streaming)

Stop passes all three. Notification fails #1.

### Don't let the name dictate scope

Separate the product name from the mission statement. Document the mission independently:

- Name: "claude-asked"
- Mission: "Notify when Claude needs your attention or finishes work"

When making feature decisions, validate against the mission, not the name.

### Before removing a feature, simulate the absence

For each proposed removal, ask: "If we remove X, what can't the user do?"

- Remove Stop → User cannot know when Claude finishes a long task without watching the terminal. This breaks the remote-work use case.
- Remove Notification → User misses system messages. Low impact — Claude Code handles these natively.

## Related

- [Brainstorm: Keep Stop, remove Notification](../../docs/brainstorms/2026-02-20-keep-stop-remove-notification-brainstorm.md) (decided)
- [Brainstorm: Focus on questions only](../../docs/brainstorms/2026-02-20-focus-on-questions-only-brainstorm.md) (superseded)
- [Plugin cache and hooks observability](../integration-issues/claude-asked-plugin-cache-hooks-observability.md)
- [Node.js hook plugin pitfalls](../integration-issues/nodejs-hook-plugin-pitfalls.md)
- Git: `540e498` feat: add opt-in JSONL file logging and Stop hook
- Git: `b80cda1` fix: add PreToolUse hook to capture AskUserQuestion events
