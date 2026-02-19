---
title: "refactor: Restructure repo into claude-code-plugins marketplace"
type: refactor
status: active
date: 2026-02-19
---

# refactor: Restructure repo into claude-code-plugins marketplace

## Overview

Rename the `claude-asked` repo to `claude-code-plugins` and restructure it as a Claude Code plugin marketplace. `claude-asked` becomes the first plugin in the marketplace, with the structure ready to host future plugins.

## Problem Statement

The current repo is a single plugin (`claude-asked`). The user wants a marketplace repo (`claude-code-plugins`) that can host multiple plugins under the Senara Solutions org.

## Proposed Solution

Restructure in-place: move plugin files into `plugins/claude-asked/`, add `marketplace.json`, rename the GitHub repo.

### Step 1: Create marketplace directory structure

Move plugin files into `plugins/claude-asked/`:

```
plugins/claude-asked/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   └── claude-asked.mjs
├── package.json
└── README.md
```

### Step 2: Update plugin.json for marketplace compatibility

Add missing fields:

```json
{
  "name": "claude-asked",
  "version": "0.1.0",
  "description": "Forwards Claude Code question/permission events to a command or webhook.",
  "author": {
    "name": "Senara Solutions"
  },
  "repository": "https://github.com/senara-solutions/claude-code-plugins",
  "license": "MIT",
  "keywords": ["hooks", "notifications", "webhooks"],
  "hooks": "./hooks/hooks.json"
}
```

### Step 3: Create `.claude-plugin/marketplace.json`

At repo root:

```json
{
  "name": "claude-code-plugins",
  "description": "Claude Code plugins by Senara Solutions",
  "owner": {
    "name": "Senara Solutions"
  },
  "metadata": {
    "version": "0.1.0",
    "pluginRoot": "./plugins"
  },
  "plugins": [
    {
      "name": "claude-asked",
      "source": "./plugins/claude-asked",
      "description": "Forwards Claude Code question/permission events to a command or webhook.",
      "version": "0.1.0",
      "category": "notifications",
      "tags": ["hooks", "notifications", "webhooks"],
      "license": "MIT"
    }
  ]
}
```

### Step 4: Update root-level files

- **README.md**: Replace with marketplace README listing available plugins
- **CLAUDE.md**: Update to describe marketplace structure and conventions
- **package.json**: Remove (each plugin has its own, marketplace root doesn't need one)
- **LICENSE**: Create MIT license file at repo root

### Step 5: Move docs

Move `docs/` into `plugins/claude-asked/docs/` since the brainstorms, plans, and solutions are specific to that plugin.

Alternatively, keep `docs/` at root as marketplace-level documentation. Either way works, but since the docs are claude-asked-specific, moving them with the plugin is cleaner.

### Step 6: Update .gitignore

Keep at repo root. No changes needed to patterns.

### Step 7: Rename GitHub repo

```bash
gh repo rename claude-code-plugins
```

This updates the remote URL. GitHub auto-redirects the old URL.

### Step 8: Clean up

- Remove `deep-research-report.md` from root (reference material, not part of marketplace)
- Remove `.idea/` if still present

## Final Directory Structure

```
claude-code-plugins/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── claude-asked/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── hooks/
│       │   └── hooks.json
│       ├── scripts/
│       │   └── claude-asked.mjs
│       ├── docs/
│       │   ├── brainstorms/
│       │   ├── plans/
│       │   └── solutions/
│       ├── package.json
│       └── README.md
├── .gitignore
├── CLAUDE.md
├── LICENSE
└── README.md
```

## Acceptance Criteria

- [x] `plugins/claude-asked/` contains all plugin files
- [x] `.claude-plugin/marketplace.json` exists at repo root with correct schema
- [x] `plugins/claude-asked/.claude-plugin/plugin.json` has marketplace-compatible fields
- [x] Root `README.md` describes the marketplace and lists plugins
- [x] Root `CLAUDE.md` describes marketplace conventions
- [x] `LICENSE` file exists at repo root
- [ ] GitHub repo renamed to `claude-code-plugins`
- [x] `deep-research-report.md` removed from root
- [ ] Plugin still works after restructure (`${CLAUDE_PLUGIN_ROOT}` paths are relative to plugin root)

## Files to Create/Modify

```
.claude-plugin/marketplace.json              # New (replaces plugin.json at root level)
plugins/claude-asked/.claude-plugin/plugin.json  # Moved + updated
plugins/claude-asked/hooks/hooks.json        # Moved (unchanged)
plugins/claude-asked/scripts/claude-asked.mjs # Moved (unchanged)
plugins/claude-asked/package.json            # Moved (unchanged)
plugins/claude-asked/README.md               # Moved (unchanged)
plugins/claude-asked/docs/                   # Moved
README.md                                    # Rewritten for marketplace
CLAUDE.md                                    # Rewritten for marketplace
LICENSE                                      # New
.gitignore                                   # Stays at root (unchanged)
deep-research-report.md                      # Deleted
.claude-plugin/plugin.json                   # Deleted (replaced by marketplace.json)
```

## Risks

- **`${CLAUDE_PLUGIN_ROOT}`** resolves to the plugin directory when installed via marketplace, so hook commands (`node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-asked.mjs`) will still work correctly.
- **GitHub redirect**: Old `claude-asked` URLs auto-redirect after rename. No broken links.
- **Git history preserved**: Moving files with `git mv` preserves history tracking.
