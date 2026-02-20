---
topic: Keep Stop hook, remove only Notification — notify when Claude needs attention
date: 2026-02-20
status: decided
supersedes: 2026-02-20-focus-on-questions-only-brainstorm.md
---

# Keep Stop, Remove Only Notification

## What We're Building

Narrow the plugin from 4 hook events to 3: keep `PermissionRequest`, `PreToolUse` (AskUserQuestion), and `Stop`. Remove only `Notification`. The plugin fires whenever Claude needs your attention — whether it's asking a question, requesting permission, or finishing its work.

## Why This Approach

The original "focus on questions only" brainstorm removed both Stop and Notification. But the core use case is **working at a distance** — you're away from the terminal and need to know when to come back. There are two reasons to come back:

1. **Claude is blocked** — needs your input (PermissionRequest, AskUserQuestion)
2. **Claude is done** — work is complete, come review the output

Removing Stop kills #2. You'd never know Claude finished a long task unless you're watching. That defeats the remote-work purpose.

`Notification` remains true noise — it's a system notification from Claude Code, not a signal that requires user action.

## Key Decisions

1. **Keep Stop** — signals work completion. The `last_assistant_message` payload field lets the receiving command/webhook suggest what to do next (review output, run tests, etc.)
2. **Remove Notification only** — system notifications don't require user action
3. **Keep PermissionRequest + AskUserQuestion** — both are Claude asking for input
4. **Name stays "claude-asked"** — the tagline and README clarify the broader scope
5. **No event filtering config needed** — 3 events is still simple enough

## What Changes

- `hooks.json`: Remove only `Notification` hook entry, keep `Stop`
- `README.md`: Update "What it captures" section (3 events, not 4; remove Notification row)
- `README.md`: Update tagline to reflect broader "needs attention" scope
- `claude-asked.mjs`: No code changes needed (script processes whatever it receives)

## What Stays the Same

- Config file, env vars, transports (command + webhook)
- Init and settings skills
- Envelope format, logging, error handling
- Stop payload includes `last_assistant_message` for actionable context
