---
title: "Remove redundant CLAUDE_ASKED_MODE transport suppression gate"
date: "2026-02-19"
module: "claude-asked plugin"
severity: "low"
tags:
  - "configuration"
  - "refactor"
  - "silent-failure-prevention"
symptom: "Setting both CLAUDE_ASKED_COMMAND and CLAUDE_ASKED_WEBHOOK_URL with MODE at default 'command' silently disables webhook without feedback"
root_cause: "CLAUDE_ASKED_MODE was a redundant suppression gate -- each transport already validated its own config independently"
resolution_type: "config-simplification"
---

# Redundant MODE Env Var Simplification

## Problem

The `CLAUDE_ASKED_MODE` env var controlled transport dispatch (`command`, `webhook`, or `both`). It was redundant because each transport (`forwardCommand`, `forwardWebhook`) already checked its own config independently. MODE's only functional contribution was *suppressing* a configured transport -- a footgun:

- If both `COMMAND` and `WEBHOOK_URL` were set but `MODE=command` (the default), the webhook was silently dropped with zero feedback
- MODE never enabled anything that the corresponding variable wouldn't
- Config surface was 3 vars instead of 2, with MODE derivable from the other two

## Investigation

1. **Code path analysis**: Confirmed MODE never enables a transport the corresponding variable wouldn't
2. **Suppression verification**: MODE's only behavioral function was explicitly suppressing configured transports
3. **Reference mapping**: Found MODE referenced in script, README (6 examples + config table), and solution docs
4. **Non-suppression equivalence**: Removing MODE produces identical behavior in all normal cases

## Root Cause

`CLAUDE_ASKED_MODE` was an explicit intent signal that added no information beyond what variable presence already conveyed. It increased config surface and created a silent misconfiguration vector.

## Solution

Replaced mode-gated dispatch with presence-based dispatch in `scripts/claude-asked.mjs`:

```javascript
// Before: mode-gated dispatch (3 config vars)
if (cfg.mode === "command" || cfg.mode === "both") forwardCommand(envelope, cfg);
if (cfg.mode === "webhook" || cfg.mode === "both") await forwardWebhook(envelope, cfg);

// After: presence-based dispatch (2 config vars)
if (cfg.command) forwardCommand(envelope, cfg);
if (cfg.webhookUrl) await forwardWebhook(envelope, cfg);
```

Config reading simplified with whitespace trimming:

```javascript
// Before
let mode = (process.env.CLAUDE_ASKED_MODE || "command").toLowerCase();
return { mode, command: process.env.CLAUDE_ASKED_COMMAND || "", ... };

// After
return { command: (process.env.CLAUDE_ASKED_COMMAND || "").trim(), ... };
```

Added early exit when neither transport is configured:

```javascript
if (!cfg.command && !cfg.webhookUrl) {
  warn("No transports configured (set CLAUDE_ASKED_COMMAND and/or CLAUDE_ASKED_WEBHOOK_URL)");
  return;
}
```

Updated debug/file logs from `mode=command` to `transports=command,webhook`.

Removed MODE from all README examples, config table, and troubleshooting section.

## Prevention

- **Prefer inference over explicit mode selectors** -- if a feature can be inferred from existing config, don't add a separate control knob
- **Config surface area** -- fewer env vars = fewer misconfiguration vectors
- **Silent suppression is a footgun** -- if config A is set but config B silently ignores it, that's a latent bug
- **Trim user input at the boundary** -- `.trim()` on env vars catches whitespace-only values that are truthy but meaningless
- **Test the "neither configured" path** -- always have a clear diagnostic when a plugin has nothing to do

## Design Principle

When each component already validates its own prerequisites, a top-level mode selector is redundant. Let the components speak for themselves. Configuration should describe *what* you have, not *which mode* you're in.

## Related Documentation

- [claude-asked-plugin-cache-hooks-observability.md](claude-asked-plugin-cache-hooks-observability.md) -- Plugin cache and observability patterns; updated to remove MODE from verification example
- [nodejs-hook-plugin-pitfalls.md](nodejs-hook-plugin-pitfalls.md) -- Error handling patterns for transport dispatch (settlement flags, signal checks, URL validation)
- [plugin-cache-staleness-dev-sync.md](plugin-cache-staleness-dev-sync.md) -- Cache sync workflow for testing config changes
