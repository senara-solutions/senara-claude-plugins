---
topic: Focus plugin on questions only — remove Stop and Notification hooks
date: 2026-02-20
status: decided
---

# Focus claude-asked on Questions Only

## What We're Building

Strip the plugin down to its name: "claude-asked" = Claude asked you something. Remove the `Stop` and `Notification` hook registrations so the plugin only fires on `AskUserQuestion` and `PermissionRequest`.

## Why This Approach

The plugin was originally built to proxy Claude's questions to the user's openclaw agent. It currently forwards all 4 hook events (Stop, Notification, PermissionRequest, AskUserQuestion) indiscriminately. The `Stop` ("idle") and `Notification` events are noise for the core use case and confuse the purpose.

The name "claude-asked" naturally scopes it: fire when Claude asks for input.

## Key Decisions

1. **Keep AskUserQuestion + PermissionRequest** — both are Claude asking for user input (structured question vs tool permission)
2. **Remove Stop and Notification hooks** — these are not "Claude asking" the user something
3. **Plugin approach remains valid** — single toggle to enable/disable all hooks, easier than managing scattered hooks in settings.json
4. **No event filtering config needed** — with only 2 events, there's nothing to filter. Simpler.

## What Changes

- `hooks.json`: Remove `Stop` and `Notification` hook entries
- `README.md`: Update "What it captures" section (2 events, not 4)
- `claude-asked.mjs`: No code changes needed (script processes whatever it receives)

## What Stays the Same

- Config file, env vars, transports (command + webhook)
- Init and settings skills
- Envelope format, logging, error handling
