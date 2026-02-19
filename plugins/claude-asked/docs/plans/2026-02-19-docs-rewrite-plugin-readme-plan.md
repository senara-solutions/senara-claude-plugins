---
title: "docs: Rewrite claude-asked README with proper install and usage guide"
type: docs
status: completed
date: 2026-02-19
---

# docs: Rewrite claude-asked README

## Problem

The current README doesn't explain how to actually use the plugin:

1. **Install command is wrong** — says `claude --plugin-dir` which is a dev shortcut, not the marketplace flow
2. **No "why"** — never states the core use case: "get notified when Claude is waiting for you"
3. **No quick start** — a new user can't go from zero to working in 5 minutes
4. **No real-world examples** — shows env vars but not what to actually DO with them (ntfy.sh, Slack, desktop notifications)
5. **No cache update instructions** — the #1 operational gotcha is undocumented
6. **No per-event payload docs** — consumers don't know what each event type delivers

## Proposed Solution

Complete rewrite of `plugins/claude-asked/README.md`. Structure:

1. **One-liner + "why"** — "Get notified when Claude is waiting for you."
2. **Quick start** — marketplace add, enable, set one env var, restart, done
3. **Hook events** — table of what fires when, with payload examples per event
4. **Configuration** — env var table (already exists, keep it)
5. **Real-world examples** — ntfy.sh push notifications, desktop notify-send, Slack webhook, jq logging
6. **Envelope format** — JSON shape (already exists, keep it)
7. **File logging** — CLAUDE_ASKED_LOG_FILE usage (already exists, keep it)
8. **Troubleshooting** — stale cache fix, common mistakes
9. **Requirements** — Node.js 18+

Also update the **root README.md** to have a better description of the plugin.

## Files to modify

```
plugins/claude-asked/README.md   # Complete rewrite
README.md                        # Update plugin description in table
```

## Acceptance Criteria

- [x] README starts with a clear one-sentence value proposition
- [x] Quick start section gets a user from zero to working in under 2 minutes
- [x] Real-world examples show at least 3 practical integrations (desktop, mobile push, webhook)
- [x] Each hook event has its payload shape documented
- [x] Cache update/sync instructions are in troubleshooting
- [x] Root README plugin table has an accurate description
