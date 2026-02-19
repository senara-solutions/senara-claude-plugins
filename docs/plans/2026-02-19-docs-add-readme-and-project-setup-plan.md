---
title: "docs: Add README, CLAUDE.md, and package.json"
type: docs
status: completed
date: 2026-02-19
---

# docs: Add README, CLAUDE.md, and package.json

## Overview

The plugin works but has zero user-facing documentation. Nobody can install or configure it without reading the source code. Add the minimum documentation needed for someone to use the plugin.

## Proposed Solution

Create 3 files and clean up 1 directory:

### Step 1: Create `README.md`

Concise README covering:

- **What it does** (1-2 sentences)
- **Install** — how to add the plugin to Claude Code (`--plugin-dir`)
- **Configure** — environment variables table with examples
- **Modes** — command, webhook, both (with one-liner examples for each)
- **Envelope format** — what the command/webhook receives (JSON example)
- **Troubleshooting** — where errors go (stderr), common mistakes

Keep it under 100 lines. No fluff.

### Step 2: Create `CLAUDE.md`

Project-level instructions for Claude Code when working on this repo:

- Project description and structure
- Node.js 18+ requirement, zero dependencies
- Key constraints: always exit 0, never write stdout
- How to test: pipe JSON to the script, check stderr/exit code
- File locations

### Step 3: Create `package.json`

Minimal package.json for:

- Project metadata (name, version, description)
- `"type": "module"` (ESM)
- `"engines": { "node": ">=18" }`
- No dependencies

### Step 4: Clean up

- Remove empty `src/` directory (plugin uses `scripts/`, not `src/`)
- Remove `claude-asked.iml` and `.idea/` (IDE artifacts, not part of plugin)
- Update `.gitignore` to include `.env`, `.env.*`, and IDE files

## Acceptance Criteria

- [x] README.md exists and explains install + configure + use
- [x] CLAUDE.md exists with project conventions
- [x] package.json exists with correct metadata and engine requirement
- [x] Empty `src/` directory removed
- [x] `.gitignore` includes `.env` and IDE patterns

## Files to Create/Modify

```
README.md            # New
CLAUDE.md            # New
package.json         # New
.gitignore           # Modified (add .env)
src/                 # Deleted
claude-asked.iml     # Deleted
.idea/               # Deleted (or gitignored)
```
