---
title: "Add persistent JSON config file with env var override"
date: "2026-02-20"
module: "claude-asked plugin"
severity: "low"
tags:
  - "configuration"
  - "developer-experience"
  - "env-var-merging"
  - "json-config"
symptom: "Setting CLAUDE_ASKED_* env vars in every shell session was tedious and error-prone (wrong bearer tokens, forgotten exports)"
root_cause: "No persistent configuration mechanism existed -- every config value required an env var set in the current shell session"
resolution_type: "feature"
---

# Persistent JSON Config File with Env Var Override

## Problem

The claude-asked plugin required users to set `CLAUDE_ASKED_*` environment variables in every shell session. With up to 7 variables (command, webhookUrl, webhookBearer, webhookTimeoutMs, commandTimeoutMs, logFile, debug), this was:

- **Tedious**: 2-7 `export` commands before every Claude Code session
- **Error-prone**: Wrong bearer tokens from copy-paste, forgotten exports, trailing whitespace
- **Not persistent**: Closing the terminal lost all configuration

## Investigation

1. **Reviewed plugin ecosystem precedent**: Other Claude plugins use `~/.claude/<plugin-name>/config.json` for persistent config
2. **Analyzed existing `readConfig()`**: Was purely env-var-based using `||` (falsy coercion)
3. **Identified `||` vs `??` semantic issue**: `||` treats empty string as falsy, so `export CLAUDE_ASKED_COMMAND=""` would fall through to a config file default instead of meaning "no command". Nullish coalescing (`??`) preserves the intent of an explicitly empty value.
4. **Surfaced during 401 webhook investigation**: `webhookBearer` wasn't trimmed and `authorization` header used non-canonical casing -- both contributed to auth failures

## Root Cause

No persistent configuration mechanism existed. Every config value required an env var set in the current shell session. The env-var-only approach was appropriate for quick testing but not sustainable for daily use.

## Solution

### New `loadConfigFile()` function

Reads `~/.claude/claude-asked/config.json`, returns `{}` on missing file (silent), warns on other errors:

```javascript
function loadConfigFile() {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "claude-asked", "config.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") warn(`Config file error: ${err.message}`);
    return {};
  }
}
```

### Updated `readConfig()` with three-tier merge

Precedence: hardcoded defaults < config file < env vars.

```javascript
function readConfig() {
  const file = loadConfigFile();
  return {
    command:          (process.env.CLAUDE_ASKED_COMMAND          ?? file.command       ?? "").trim(),
    webhookUrl:       (process.env.CLAUDE_ASKED_WEBHOOK_URL      ?? file.webhookUrl    ?? "").trim(),
    webhookBearer:    (process.env.CLAUDE_ASKED_WEBHOOK_BEARER   ?? file.webhookBearer ?? "").trim(),
    webhookTimeoutMs:  Number(process.env.CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS) || file.webhookTimeoutMs || 3000,
    commandTimeoutMs:  Number(process.env.CLAUDE_ASKED_COMMAND_TIMEOUT_MS) || file.commandTimeoutMs || 2000,
    logFile:           process.env.CLAUDE_ASKED_LOG_FILE         ?? file.logFile       ?? "",
    debug:             process.env.CLAUDE_ASKED_DEBUG             ?? file.debug         ?? "",
  };
}
```

### Key implementation detail: `??` vs `||`

- **String fields use `??`** (nullish coalescing): An explicitly empty env var (`export CLAUDE_ASKED_COMMAND=""`) means "no command" rather than falling through to the config file. `??` only skips `undefined` and `null`.
- **Numeric fields use `Number() ||`**: `Number(undefined)` returns `NaN`, which is falsy, so `NaN || fileValue` correctly falls through. `Number("0") || fileValue` also falls through, which is desirable since a timeout of 0 is nonsensical.

### Additional fixes in the same changeset

- **`Authorization` header casing**: Changed from `"authorization"` to `"Authorization"` for conventional casing (Node.js lowercases outgoing headers internally, but canonical casing improves readability)
- **`.trim()` on `webhookBearer`**: Prevents trailing whitespace from causing auth failures
- **`debug` centralized**: Moved from inline `process.env.CLAUDE_ASKED_DEBUG` checks to `cfg.debug`, so debug can be set from config file

### Error handling

Follows the exit-0 contract:
- Missing config file: silent (return `{}`, no warning)
- Parse error or unreadable file: warn to stderr, return `{}`
- Malformed JSON object (array, null): return `{}`
- Config read errors never crash the plugin

## Prevention

- **Persistent config over session-scoped env vars**: When a plugin has more than 2-3 config values, a config file is worth the implementation cost. Env vars remain available for CI/automation overrides.
- **Use `??` for string fields, `||` for numeric fields**: The nullish coalescing operator preserves the semantic difference between "not set" (`undefined`) and "explicitly empty" (`""`). This is critical when env vars override file-based defaults.
- **Trim at the boundary**: Call `.trim()` on all string config values to catch whitespace from copy-paste errors.
- **Config file path from `homedir()` + literals**: Never construct config file paths from user input. The hardcoded path prevents path traversal.
- **Silent on missing file, loud on parse errors**: Users who haven't created a config file shouldn't see warnings. Users with a broken config file need to know.
- **Config file doesn't need cache sync**: Unlike hook scripts, the config file is read directly from `~/.claude/` on every invocation. Changes take effect immediately without `sync-cache.sh`.

## Verification

```bash
# 1. Create config file
mkdir -p ~/.claude/claude-asked
cat > ~/.claude/claude-asked/config.json << 'EOF'
{
  "command": "notify-send 'Claude needs you'",
  "debug": true
}
EOF

# 2. Sync cache (for the script changes, not the config file)
./scripts/sync-cache.sh

# 3. Restart Claude Code -- config is picked up with no env vars needed

# 4. Verify env var override
export CLAUDE_ASKED_COMMAND="echo override"
# Restart -- should use "echo override" not "notify-send"
```

## Related Documentation

- [redundant-mode-env-var-simplification.md](redundant-mode-env-var-simplification.md) -- Config surface area design principles; presence-based dispatch that this feature builds on
- [nodejs-hook-plugin-pitfalls.md](nodejs-hook-plugin-pitfalls.md) -- Error handling patterns for Node.js hook plugins (exit-0 convention, try/catch, synchronous I/O)
- [claude-asked-plugin-cache-hooks-observability.md](claude-asked-plugin-cache-hooks-observability.md) -- Plugin cache architecture and JSONL logging pattern
- [plugin-cache-staleness-dev-sync.md](plugin-cache-staleness-dev-sync.md) -- Cache sync workflow; updated to note config file doesn't need sync
