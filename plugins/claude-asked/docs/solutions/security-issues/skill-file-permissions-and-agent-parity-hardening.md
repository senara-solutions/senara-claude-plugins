---
title: "Security hardening and agent-native guidance in SKILL.md instruction files"
date: 2026-02-20
module: plugins/claude-asked/skills/
severity: P2/P3
tags:
  - security
  - file-permissions
  - agent-native
  - code-simplification
  - skill-authoring
  - code-review
problem_type: code_quality
status: resolved
---

# Security Hardening and Agent-Native Guidance in SKILL.md Files

## Problem Statement

Two new SKILL.md instruction files for the claude-asked plugin (`/claude-asked:init` and `/claude-asked:settings`) passed initial implementation but a 5-agent code review identified 3 P2 and 8 P3 issues spanning security, agent-native parity, and unnecessary complexity.

The most critical finding: the init skill created `~/.claude/claude-asked/` and `config.json` without setting restrictive file permissions. With default umask 022, the config file — which stores bearer tokens in plaintext — would be world-readable (644) on shared systems.

## Root Cause Analysis

### 1. Missing File Permissions on Sensitive Configuration

The init skill used `mkdir -p ~/.claude/claude-asked` and the Write tool to create `config.json`, but never set restrictive permissions. The Write tool creates files with whatever the default umask produces. Since `config.json` stores `webhookBearer` tokens in plaintext, any local user could read them.

### 2. Implicit Platform Detection Without Available Tools

The settings skill said "detect the platform" for suggesting desktop notification commands (notify-send vs osascript), but its allowed-tools list (Read, Write, AskUserQuestion) doesn't include Bash. Claude can't run `uname` — it must rely on ambient session context. The instruction didn't acknowledge this dependency, creating ambiguity in how the agent should behave.

### 3. Asymmetric Clear Options

Steps 3 (webhook URL) and 4 (bearer token) offered "No webhook" / "No token" to clear values, but step 2 (command) had no equivalent. A user who set a command and later wanted webhook-only had no way to clear it through the wizard.

### 4. YAGNI: ntfy.sh as First-Class Wizard Option

ntfy.sh had its own interaction flow (ask for topic name, construct curl command) when "Custom command" already covers this and the README documents the exact curl example. Three code paths instead of two, for no additional capability.

### 5. Redundant URL Validation

The wizard checked if URLs start with `http://` or `https://`, but the runtime script (`claude-asked.mjs`) already validates more rigorously via `new URL()`. The wizard validation was weaker and let invalid URLs through anyway with user confirmation.

### 6. Double Config Read

Settings step 5 re-read the config file before writing, guarding against concurrent modification during a single-user wizard session. Nothing else writes to this file during the session — defensive code against an impossible race.

## Solution

### init/SKILL.md — File Permissions (P2)

Before:
```markdown
1. Run via Bash: `mkdir -p ~/.claude/claude-asked`
2. Use the Write tool to create config.json
```

After:
```markdown
1. Run via Bash: `mkdir -p ~/.claude/claude-asked && chmod 700 ~/.claude/claude-asked`
2. Use the Write tool to create config.json
3. Run via Bash: `chmod 600 ~/.claude/claude-asked/config.json`
```

Directory is owner-only (700), config file is owner-only (600). Bearer tokens are no longer world-readable.

Also simplified the "No" response from dumping config to "Keeping current settings."

### settings/SKILL.md — Platform Detection (P2)

Before:
```markdown
If the user picks "Desktop notification", detect the platform:
```

After:
```markdown
If the user picks "Desktop notification", determine the platform from the session's
environment context (e.g., Linux or macOS). If the platform cannot be determined,
ask the user.
```

Explicitly documents the mechanism (ambient session context) and the fallback (ask the user).

### settings/SKILL.md — Clear Option Symmetry (P2)

Added "No command" option to step 2, matching the "No webhook" and "No token" options in steps 3 and 4.

### settings/SKILL.md — Simplifications (P3)

- Removed ntfy.sh as first-class wizard option (covered by "Custom command")
- Removed URL validation paragraph from step 3 (runtime handles it)
- Simplified step 5 from "re-read config, parse, merge, write" to "use config parsed in step 1 as the base"

## Files Changed

- `plugins/claude-asked/skills/init/SKILL.md` — chmod 700/600, simplified "No" path
- `plugins/claude-asked/skills/settings/SKILL.md` — platform detection guidance, "No command" option, removed ntfy.sh/URL validation/double-read

## Prevention Strategies

### SKILL.md Authoring Checklist

1. **File permissions**: When a skill creates files containing sensitive data (tokens, keys), always include explicit `chmod` instructions. Don't rely on umask defaults.
2. **Capability alignment**: Every action in the instructions must be achievable with the skill's `allowed-tools`. If the skill doesn't have Bash, it can't run shell commands — document how the agent should accomplish the task instead.
3. **Option symmetry**: If wizard steps offer a "clear" option, all mutable steps should offer it. Asymmetric options confuse users.
4. **YAGNI in wizards**: Don't add first-class options for use cases already covered by a generic option. If "Custom command" handles ntfy.sh, don't add a dedicated ntfy.sh path.
5. **Validation boundaries**: Validate in instructions only for UX feedback (e.g., required fields). Don't duplicate runtime safety validation — it's more rigorous and always runs.
6. **Trust the execution model**: Skills run single-threaded, one instance at a time. Don't add defensive reads/locks against concurrent modification that can't happen.

## Related Documentation

- [Config file and env var integration](../integration-issues/config-file-env-var-integration.md) — config file design the skills depend on
- [Node.js hook plugin pitfalls](../integration-issues/nodejs-hook-plugin-pitfalls.md) — prior multi-agent code review findings
- [Redundant mode env var simplification](../integration-issues/redundant-mode-env-var-simplification.md) — YAGNI principle applied to config
- [Plugin cache staleness and dev sync](../integration-issues/plugin-cache-staleness-dev-sync.md) — cache sync required after SKILL.md changes

## Review Agents Used

| Agent | Key Finding |
|---|---|
| security-sentinel | P2: File permissions on config dir/file (chmod 700/600) |
| agent-native-reviewer | P2: Platform detection guidance, P2: "No command" option symmetry |
| code-simplicity-reviewer | P3: ntfy.sh YAGNI, URL validation redundant, double-read unnecessary |
| pattern-recognition-specialist | All checks passed — no defects |
| learnings-researcher | 4 relevant solution docs confirmed |
