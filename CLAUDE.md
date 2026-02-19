# claude-code-plugins

Claude Code plugin marketplace by Senara Solutions.

## Structure

```
.claude-plugin/marketplace.json    Marketplace manifest (lists all plugins)
plugins/<name>/                    Each plugin in its own directory
plugins/<name>/.claude-plugin/     Plugin manifest + hooks registration
plugins/<name>/scripts/            Plugin scripts
plugins/<name>/README.md           Plugin-specific documentation
```

## Conventions

- Each plugin is self-contained in `plugins/<name>/`
- Plugins use `${CLAUDE_PLUGIN_ROOT}` for relative paths in hook commands
- Zero external dependencies -- only Node.js built-in modules
- Node.js 18+ required
- All hook scripts must: always exit 0, never write stdout

## Adding a new plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json` and `hooks/hooks.json`
2. Add an entry to `.claude-plugin/marketplace.json` in the `plugins` array
3. Add a row to the root `README.md` plugins table
