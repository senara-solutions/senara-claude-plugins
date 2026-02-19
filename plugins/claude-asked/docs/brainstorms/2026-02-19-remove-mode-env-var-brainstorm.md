# Remove CLAUDE_ASKED_MODE env var

**Date:** 2026-02-19
**Status:** Ready for planning

## What We're Building

Remove the `CLAUDE_ASKED_MODE` environment variable and infer the transport mode from which configuration variables are set:

- `CLAUDE_ASKED_COMMAND` set → run command
- `CLAUDE_ASKED_WEBHOOK_URL` set → fire webhook
- Both set → do both
- Neither set → warn to stderr, exit 0

## Why This Approach

`CLAUDE_ASKED_MODE` is redundant. Each transport (`forwardCommand`, `forwardWebhook`) already independently checks whether its config is present before executing. MODE's only functional contribution is *suppressing* a configured transport — which is a footgun, not a feature:

- If someone sets both `COMMAND` and `WEBHOOK_URL` but leaves MODE at the default `"command"`, the webhook is silently dropped with zero feedback.
- MODE never *enables* anything that the corresponding variable wouldn't.
- Auto-detection from variable presence produces identical behavior in all non-suppression cases.

Removing MODE reduces the config surface from 3 variables (MODE + COMMAND + WEBHOOK_URL) to 2. One less thing to document, one less thing to misconfigure.

## Key Decisions

1. **Remove MODE entirely** — no optional override, no backward compat shim
2. **No deprecation warning** — only one user (the author), no migration story needed
3. **Warn when unconfigured** — if neither COMMAND nor WEBHOOK_URL is set, emit a single stderr warning and exit 0

## Scope

### Files to change

- `plugins/claude-asked/scripts/claude-asked.mjs` — remove MODE from `readConfig()`, change dispatch logic to check `cfg.command` / `cfg.webhookUrl` directly
- `plugins/claude-asked/README.md` — remove MODE from config table and examples
- `plugins/claude-asked/docs/solutions/integration-issues/nodejs-hook-plugin-pitfalls.md` — update if MODE is referenced

### What stays the same

- `forwardCommand()` and `forwardWebhook()` internal guard clauses (they already check their own config)
- All other env vars (`CLAUDE_ASKED_COMMAND`, `CLAUDE_ASKED_WEBHOOK_URL`, `CLAUDE_ASKED_WEBHOOK_BEARER`, timeouts, debug, log file)
- Envelope format, hook registrations, exit-0 contract
