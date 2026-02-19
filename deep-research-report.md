# claude-monitor SPEC FILE  
Date: 2026-02-19

## Executive summary

`claude-monitor` is a minimal **Claude Code plugin** that registers a small set of **command hooks** and forwards **question/permission/input-needed signals** to either (A) an **OpenClaw CLI** command (via stdin JSON) or (B) an **HTTP(S) webhook** (with Bearer and/or HMAC auth), while remaining **non-blocking** (always exits `0`) and safe under concurrent hook invocations. Claude Code hooks deliver event context as JSON on stdin to your command and are explicitly intended for deterministic automation and notifications (including “notify when Claude needs input”). citeturn2view0turn7search10

The plugin registers exactly these Claude Code hook events: **`SessionStart`, `Notification`, `PermissionRequest`, `Stop`**. `PermissionRequest` is the canonical “permission dialog appears” signal and includes `tool_name` + `tool_input`. `Notification` is the canonical “needs attention” signal and includes `message`, optional `title`, and documented `notification_type` values like `permission_prompt`, `idle_prompt`, and `elicitation_dialog`. `SessionStart` and `Stop` provide correlation and lifecycle markers. citeturn3view2turn3view1turn3view3turn3view4

Because Claude Code hooks can run **as async background processes** and “each execution creates a separate background process” with “no deduplication” across multiple firings, `claude-monitor` MUST tolerate concurrent invocations and implement idempotency and safe log append/rotation itself. citeturn3view6

## Assumptions

The following items are ambiguous or not guaranteed by official docs; the spec treats them as explicit assumptions instead of inventing behavior.

- **Runtime/language assumption:** Claude Code is distributed via a **native installer** and does **not require Node.js** unless using the deprecated npm install. Therefore, Claude Code’s implementation language/runtime is not a reliable basis for choosing plugin language. This spec chooses **Node.js** solely because you requested a single-file runnable Node script and because command hooks can run any shell command. citeturn2view4turn2view0  
- **Types/package reuse assumption:** There is no official “Claude Code CLI hook payload types” package documented. The TypeScript Agent SDK exists but its hook types do not exactly match the Claude Code CLI hook payload fields (e.g., mismatches have been observed/raised). Therefore, **this spec defines its own minimal schemas** based on Claude Code hook reference documentation. citeturn2view0turn8search3turn7search7  
- **Notification field reliability assumption:** Claude Code docs state `Notification` input includes `notification_type`, but a first-party bug report states permission prompt notifications can omit `notification_type`. The plugin MUST treat `notification_type` as **optional** at validation and MUST fall back to message-based inference only when needed. citeturn3view1turn7search7  
- **Exit-code expectation assumption:** Claude Code defines exit-code effects; to avoid blocking or affecting behavior, the plugin MUST always exit `0` (even on forward failures) and must not emit stdout (especially because `SessionStart` stdout is added as model-visible context). citeturn4view0turn3view5  
- **Webhook response contract assumption:** The webhook receiver is assumed to treat **2xx** as success, **409** as “already processed” (idempotent success), and to use **429** and/or **503** with optional `Retry-After` to request backoff. This aligns with HTTP semantics and is implemented accordingly. citeturn9view3turn9view2  

### Language choice comparison

| Choice | Fit for command-hook plugin | Pros | Cons |
|---|---|---|---|
| Node.js (this spec) | Works if Node is installed on the host | Single-file, strong stdlib crypto + HTTP + process execution | Node is not required for native Claude Code installs; extra dependency to manage citeturn2view4 |
| Python (alternative) | Works if Python is installed on the host | Strong stdlib, common on Linux | Not requested here; introduces parallel spec surface |

## Hook registration

### Hook list and rationale

`claude-monitor` MUST register exactly these Claude Code hook events:

- **SessionStart**: logs correlation metadata early (`source`, `model`, optional `agent_type`) to tie subsequent attention events to a session and model selection. citeturn3view3turn4view0  
- **Notification**: detects “needs attention / input” states; docs define `notification_type` values that map naturally to “permission prompt”, “idle prompt”, and “elicitation dialog”. Because matchers operate on `notification_type`, but `notification_type` can be missing in practice, the plugin MUST register Notification broadly and filter internally. citeturn3view1turn4view4turn7search7  
- **PermissionRequest**: canonical “permission dialog appears” event with structured `tool_name`, `tool_input`, and optional `permission_suggestions`. This is the plugin’s primary permission signal. citeturn3view2  
- **Stop**: logs completion marker with `last_assistant_message` without parsing transcripts; helps correlate when an “attention” event was followed by a completion turn. citeturn3view4  

### Hook payload catalog

All hook events receive the **common input fields** via stdin JSON: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`. citeturn4view0

| Hook event | Documented additional fields | Field status | Notes |
|---|---|---|---|
| `SessionStart` | `source`, `model`, optional `agent_type` citeturn3view3 | `source` required; `model` required; `agent_type` optional | `source` values documented: `startup`, `resume`, `clear`, `compact`. citeturn3view3turn4view4 |
| `Notification` | `message`, optional `title`, `notification_type` citeturn3view1 | `message` required; `title` optional; `notification_type` **assumed optional** | Assumption due to reported missing `notification_type` for permission prompts. citeturn7search7 |
| `PermissionRequest` | `tool_name`, `tool_input`, optional `permission_suggestions` citeturn3view2 | `tool_name` required; `tool_input` required; `permission_suggestions` optional | Fires when a permission dialog is about to be shown; no `tool_use_id`. citeturn3view2 |
| `Stop` | `stop_hook_active`, `last_assistant_message` citeturn3view4 | both required | Stop can block if exit code 2, but plugin must never do that. citeturn3view5 |

## Normalized event envelope and forwarding rules

### Envelope schema

The plugin MUST convert each incoming hook payload into a normalized envelope before logging/forwarding.

**Required fields**
- `event_id` (string): generated UUID (or random hex fallback)
- `observed_at` (RFC3339/ISO timestamp)
- `hook_event_name` (string): one of `SessionStart|Notification|PermissionRequest|Stop`
- `session_id` (string)
- `cwd` (string)
- `transcript_path` (string)
- `permission_mode` (string)
- `classification` (string): `session_start|attention|permission|stop|unknown`
- `dedupe_key` (string): `sha256:<hex>` of the raw incoming payload (pre-sanitization)
- `payload` (object): sanitized incoming payload (redacted + truncated)

**Optional fields**
- `attention` (object): present for `Notification` and `PermissionRequest`
- `session` (object): present for `SessionStart`
- `stop` (object): present for `Stop`

**Example envelope**
```json
{
  "event_id": "6b7c278f-fd02-4fe6-9f5c-2a751e2b8b1a",
  "observed_at": "2026-02-19T14:22:11.104Z",
  "hook_event_name": "PermissionRequest",
  "classification": "permission",
  "session_id": "abc123",
  "cwd": "/home/user/project",
  "transcript_path": "/home/user/.claude/projects/.../abc123.jsonl",
  "permission_mode": "default",
  "dedupe_key": "sha256:1f3b...d9c",
  "attention": {
    "type": "permission_request",
    "tool_name": "Bash",
    "tool_input": { "command": "rm -rf node_modules", "description": "Remove node_modules directory" }
  },
  "payload": { "session_id": "abc123", "hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": { "command": "rm -rf node_modules" } }
}
```

### Forwarding eligibility rules

The plugin MUST forward only “question/permission/input-needed” events by default:
- Forward **all** `PermissionRequest` envelopes.
- Forward `Notification` envelopes if:
  - `notification_type` ∈ `{permission_prompt, idle_prompt, elicitation_dialog}`, OR
  - `notification_type` is missing AND the plugin infers “permission or input needed” from `message` (heuristic, best-effort; see assumptions). citeturn3view1turn7search7

`SessionStart` and `Stop` MUST be logged but SHOULD NOT be forwarded by default (configurable via `CLAUDE_MONITOR_FORWARD_EVENTS`). This keeps OpenClaw traffic focused on “needs attention” while preserving correlation in logs. citeturn3view3turn3view4

### Mapping table: hook → transport → payload → example

Claude Code hooks run **local commands**, so “forward action” is implemented inside `claude-monitor` rather than by Claude Code. citeturn2view0turn3view5

| Hook | Forward action (CLI mode) | Forward action (webhook mode) | Payload mapping | Example forwarded body |
|---|---|---|---|---|
| `PermissionRequest` | Execute `OPENCLAW_CMD` and pass **envelope JSON** on stdin | `POST WEBHOOK_URL` with **envelope JSON** body | `attention.tool_name`, `attention.tool_input`, plus common fields | Envelope example above citeturn3view2 |
| `Notification` | Same | Same | `attention.message`, optional `attention.title`, `attention.notification_type?` | See below citeturn3view1 |
| `SessionStart` | Default: not forwarded | Default: not forwarded | `session.source`, `session.model`, optional `session.agent_type` | Configurable (for observability) citeturn3view3 |
| `Stop` | Default: not forwarded | Default: not forwarded | `stop.last_assistant_message` (truncated) | Configurable (for observability) citeturn3view4 |

Notification example (forwarded body) aligns with documented Notification input fields. citeturn3view1

```json
{
  "event_id": "a2c4b524-3d9b-4d8a-9bb7-2c42fd245e19",
  "observed_at": "2026-02-19T14:22:22.222Z",
  "hook_event_name": "Notification",
  "classification": "attention",
  "session_id": "abc123",
  "cwd": "/home/user/project",
  "transcript_path": "/home/user/.claude/projects/.../abc123.jsonl",
  "permission_mode": "default",
  "dedupe_key": "sha256:...",
  "attention": {
    "type": "notification",
    "notification_type": "idle_prompt",
    "message": "Claude is waiting for your input",
    "title": "Input needed"
  },
  "payload": { "...": "sanitized original payload" }
}
```

## Plugin package layout and enable/disable controls

### Directory layout (required)

Claude Code plugin structure MUST place `.claude-plugin/plugin.json` under `.claude-plugin/`, while `hooks/` and `scripts/` must be at the plugin root (not inside `.claude-plugin/`). citeturn5view4turn2view3

```
claude-monitor/
  .claude-plugin/
    plugin.json
  hooks/
    hooks.json
  scripts/
    claude-monitor.mjs
```

### Plugin manifest: `.claude-plugin/plugin.json` (runnable)

Claude Code plugin manifest is optional, but this spec includes it for metadata and versioning. citeturn5view5turn2view3

```json
{
  "name": "claude-monitor",
  "version": "0.1.0",
  "description": "Forwards Claude Code attention hooks (permission/input) to OpenClaw via CLI or webhook; logs JSONL.",
  "author": { "name": "Your Org" }
}
```

### Hook configuration: `hooks/hooks.json` (runnable)

- Uses `${CLAUDE_PLUGIN_ROOT}` to reference bundled scripts. citeturn3view0turn5view3  
- Runs as `type: "command"` and receives stdin JSON. citeturn2view0turn3view5  
- Uses `async: true` to avoid blocking Claude Code; async hooks create separate processes with no dedupe, which the implementation accounts for. citeturn3view6  
- Omits `matcher` for `Notification` to avoid missing events when `notification_type` is absent in practice. citeturn7search7turn4view4  

```json
{
  "description": "claude-monitor hooks",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-monitor.mjs hook",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-monitor.mjs hook",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-monitor.mjs hook",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/claude-monitor.mjs hook",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Notes:
- `Stop` has no matcher support; adding matchers is ignored per docs. citeturn4view4  
- `timeout` defaults differ by hook type; explicit setting makes behavior predictable. citeturn3view0  

### Enable, disable, uninstall

Production enable/disable MUST be driven by Claude Code plugin controls:

- Enable/disable via CLI: `claude plugin enable claude-monitor` / `claude plugin disable claude-monitor` (scope: user/project/local). citeturn5view0turn5view1  
- Uninstall: `claude plugin uninstall claude-monitor` (aliases `remove`, `rm`). citeturn5view2  
- Settings-based enablement: `enabledPlugins` map can toggle whether a marketplace-installed plugin is enabled. citeturn6view0  
- Emergency disable: set `"disableAllHooks": true` or flip the `/hooks` menu toggle (disables all hooks globally). There is no per-hook disable without removing the configuration. citeturn4view0turn6view1  

Local development testing MUST use `--plugin-dir` and restart Claude Code to pick up plugin changes. citeturn2view3turn5view3

## Hook runner script specification

### Requirements

The Node script MUST:

- Read stdin fully and parse JSON object (payload).
- Validate minimal schema for common fields + event-specific fields.
- Redact secrets and truncate risky fields before logging/forwarding.
- Generate `event_id` and `dedupe_key`.
- Log JSONL with rotation (size-based) and retention.
- Support modes: `off`, `log`, `cli`, `webhook`, `both`, `dry-run`.
- Forward to OpenClaw CLI and/or webhook with:
  - Bearer auth and/or HMAC auth (HMAC-SHA256) for webhook
  - Retry/backoff with `Retry-After` parsing for webhook
- Write a DLQ record for permanent failures.
- Exit `0` always (non-blocking). Claude Code’s exit-code semantics make this essential to avoid blocking tool calls or flow. citeturn3view5turn4view0  
- Be safe for concurrent invocations (multiple processes), consistent with async hook execution model. citeturn3view6  

The script MUST NOT write stdout (to avoid Claude Code interpreting stdout as hook control JSON or injecting content at SessionStart). citeturn4view0turn3view5

### Webhook auth and headers

If `CLAUDE_MONITOR_WEBHOOK_BEARER` is set, send:
- `Authorization: Bearer <token>`

If `CLAUDE_MONITOR_WEBHOOK_HMAC_SECRET` is set, send:
- `X-Signature-Timestamp: <unix-seconds>`
- `X-Signature-256: sha256=<hex>` where `<hex>` is `HMAC_SHA256(secret, request_body_bytes)` using `node:crypto` HMAC support. citeturn9view0  

Always send:
- `X-Event-Id: <event_id>`
- `X-Session-Id: <session_id>`
- `Content-Type: application/json`

### Retry/backoff and expected response codes

Retry rules:
- Treat **2xx** as success.
- Treat **409** as idempotent success (duplicate already processed).
- Retry on **429** and **503**, respecting `Retry-After` when present:
  - RFC 6585 defines 429 and allows `Retry-After`. citeturn9view3  
  - RFC 9110 defines `Retry-After` header value formats and permits it with 503 to indicate how long service is expected to be unavailable. citeturn9view2  
- Retry on network errors/timeouts with exponential backoff + jitter.
- After exhausting retries, write DLQ and return success exit code (`0`).

### Logging and file permissions

- Base directory MUST default outside plugin root (because marketplace plugins are copied into a cache directory), e.g. `~/.claude/claude-monitor/…`. citeturn5view3turn5view4  
- Directories: `0700`; files: `0600` (best-effort `chmod`).
- JSONL file rotation: size-based with `N` backups retained.
- Atomic append strategy: single `fs.writeSync()` on an fd opened with append mode; rotation guarded by a lockfile created with `wx` (best-effort). Concurrency model acknowledges multiple hook processes. citeturn3view6  

### Admin toggle and env toggles

- Env toggles (read each invocation):
  - `CLAUDE_MONITOR_ENABLED` (default `1`)
  - `CLAUDE_MONITOR_MODE` (`off|log|cli|webhook|both|dry-run`)
- Admin toggle: local HTTP server binding to `127.0.0.1` by default. Requires `Authorization: Bearer <admin-token>` and writes `state.json` atomically. Hook runner reads `state.json` each invocation (state overrides env).  
- Security: admin endpoint MUST NOT bind to non-loopback unless explicitly configured; admin token is required.

### Complete runnable Node.js script: `scripts/claude-monitor.mjs`

```js
#!/usr/bin/env node
/**
 * claude-monitor.mjs (SPEC IMPLEMENTATION)
 *
 * Subcommands:
 *   - hook  (default): read hook JSON from stdin, validate, redact, envelope, log, forward
 *   - admin: run local HTTP toggle server to write state.json
 *
 * Non-blocking contract:
 *   - NEVER exit 2. Always exit 0 so Claude Code behavior is not blocked.
 *   - NEVER write to stdout. Log to files. Use stderr only for admin startup line.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

// ---------- Constants / defaults ----------
const PLUGIN = { name: "claude-monitor", version: "0.1.0" };

const BASE_DIR = process.env.CLAUDE_MONITOR_BASE_DIR || path.join(os.homedir(), ".claude", "claude-monitor");
const LOG_DIR = process.env.CLAUDE_MONITOR_LOG_DIR || path.join(BASE_DIR, "logs");
const LOG_FILE = process.env.CLAUDE_MONITOR_LOG_FILE || path.join(LOG_DIR, "events.jsonl");
const DLQ_FILE = process.env.CLAUDE_MONITOR_DLQ_FILE || path.join(LOG_DIR, "dlq.jsonl");
const STATE_FILE = process.env.CLAUDE_MONITOR_STATE_FILE || path.join(BASE_DIR, "state.json");

const ENABLED_ENV = (process.env.CLAUDE_MONITOR_ENABLED ?? "1") !== "0";
const MODE_ENV = (process.env.CLAUDE_MONITOR_MODE || "log").toLowerCase(); // off|log|cli|webhook|both|dry-run
const REDACT_ENV = (process.env.CLAUDE_MONITOR_REDACT ?? "1") !== "0";

const MAX_STR = Number(process.env.CLAUDE_MONITOR_MAX_STR || "4096");
const MAX_BYTES = Number(process.env.CLAUDE_MONITOR_MAX_BYTES || String(5 * 1024 * 1024));
const BACKUPS = Number(process.env.CLAUDE_MONITOR_BACKUPS || "5");

const FORWARD_EVENTS_ENV = (process.env.CLAUDE_MONITOR_FORWARD_EVENTS || "Notification,PermissionRequest")
  .split(",").map(s => s.trim()).filter(Boolean);

const OPENCLAW_CMD = process.env.CLAUDE_MONITOR_OPENCLAW_CMD || ""; // e.g. "openclaw notify"
const OPENCLAW_TIMEOUT_MS = Number(process.env.CLAUDE_MONITOR_OPENCLAW_TIMEOUT_MS || "2000");

const WEBHOOK_URL = process.env.CLAUDE_MONITOR_WEBHOOK_URL || "";
const WEBHOOK_BEARER = process.env.CLAUDE_MONITOR_WEBHOOK_BEARER || "";
const WEBHOOK_HMAC_SECRET = process.env.CLAUDE_MONITOR_WEBHOOK_HMAC_SECRET || "";
const WEBHOOK_TIMEOUT_MS = Number(process.env.CLAUDE_MONITOR_WEBHOOK_TIMEOUT_MS || "2500");
const WEBHOOK_MAX_RETRIES = Number(process.env.CLAUDE_MONITOR_WEBHOOK_MAX_RETRIES || "5");
const WEBHOOK_BACKOFF_MS = Number(process.env.CLAUDE_MONITOR_WEBHOOK_BACKOFF_MS || "250");
const WEBHOOK_MAX_BACKOFF_MS = Number(process.env.CLAUDE_MONITOR_WEBHOOK_MAX_BACKOFF_MS || "8000");

const ADMIN_HOST = process.env.CLAUDE_MONITOR_ADMIN_HOST || "127.0.0.1";
const ADMIN_PORT = Number(process.env.CLAUDE_MONITOR_ADMIN_PORT || "9923");
const ADMIN_TOKEN = process.env.CLAUDE_MONITOR_ADMIN_TOKEN || "";

const SENSITIVE_KEYS = new Set([
  "api_key","apikey","token","secret","password","authorization","cookie","set-cookie",
  "anthropic_api_key","anthropic_auth_token"
]);

// ---------- Helpers ----------
function nowIso() { return new Date().toISOString(); }

function randomId() {
  return (crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex"));
}

function sha256Hex(data) { return crypto.createHash("sha256").update(data).digest("hex"); }

function computeHmac(secret, bodyBuf) {
  return crypto.createHmac("sha256", secret).update(bodyBuf).digest("hex");
}

function parseRetryAfter(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const dt = Date.parse(s);
  if (!Number.isNaN(dt)) return Math.max(0, dt - Date.now());
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(p, 0o700); } catch {}
}

function atomicWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj) + "\n", { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch {}
  fs.renameSync(tmp, filePath);
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch { return {}; }
}

function effectiveConfig() {
  const st = loadState();
  const enabled = ENABLED_ENV && (st.enabled !== false);
  const mode = String(st.mode || MODE_ENV).toLowerCase();
  const redact = ("redact" in st) ? !!st.redact : REDACT_ENV;
  const forwardEvents = Array.isArray(st.forward_events) ? st.forward_events : FORWARD_EVENTS_ENV;
  return { enabled, mode, redact, forwardEvents };
}

function truncateString(s, maxLen) {
  if (s.length <= maxLen) return { v: s };
  return { v: s.slice(0, maxLen), truncated: true, len: s.length, sha256: sha256Hex(s) };
}

function sanitize(val, maxStr, redact) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(v => sanitize(v, maxStr, redact));
  if (typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      const lk = String(k).toLowerCase();
      if (redact && SENSITIVE_KEYS.has(lk)) out[k] = "<redacted>";
      else out[k] = sanitize(v, maxStr, redact);
    }
    return out;
  }
  if (typeof val === "string") return truncateString(val, maxStr);
  return val;
}

function acquireLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, "wx", 0o600);
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}
function releaseLock(lockPath) { try { fs.unlinkSync(lockPath); } catch {} }

function rotateIfNeeded(filePath) {
  if (MAX_BYTES <= 0 || BACKUPS <= 0) return;
  let st;
  try { st = fs.statSync(filePath); } catch { return; }
  if (st.size < MAX_BYTES) return;

  for (let i = BACKUPS - 1; i >= 1; i--) {
    const src = `${filePath}.${i}`;
    const dst = `${filePath}.${i + 1}`;
    if (fs.existsSync(src)) fs.renameSync(src, dst);
  }
  fs.renameSync(filePath, `${filePath}.1`);
}

function appendJsonl(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const lockPath = `${filePath}.lock`;
  const gotLock = acquireLock(lockPath);
  try {
    if (gotLock) rotateIfNeeded(filePath);
    const line = JSON.stringify(obj) + "\n";
    const fd = fs.openSync(filePath, "a", 0o600);
    try { fs.writeSync(fd, line, null, "utf8"); }
    finally { fs.closeSync(fd); }
  } finally {
    if (gotLock) releaseLock(lockPath);
  }
}

function readAllStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", c => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.resume();
  });
}

// ---------- Hook payload validation ----------
function validateHookPayload(p) {
  const errors = [];
  const common = ["session_id","transcript_path","cwd","permission_mode","hook_event_name"];
  for (const k of common) if (!(k in p)) errors.push(`missing ${k}`);

  const ev = p.hook_event_name;
  if (!["SessionStart","Notification","PermissionRequest","Stop"].includes(ev)) {
    errors.push(`unexpected hook_event_name=${String(ev)}`);
    return { ok: false, errors };
  }

  if (ev === "SessionStart") {
    if (!("source" in p)) errors.push("missing source");
    if (!("model" in p)) errors.push("missing model");
  } else if (ev === "Notification") {
    if (!("message" in p)) errors.push("missing message");
    // notification_type treated as optional due to known field-missing bug
  } else if (ev === "PermissionRequest") {
    if (!("tool_name" in p)) errors.push("missing tool_name");
    if (!("tool_input" in p)) errors.push("missing tool_input");
  } else if (ev === "Stop") {
    if (!("stop_hook_active" in p)) errors.push("missing stop_hook_active");
    if (!("last_assistant_message" in p)) errors.push("missing last_assistant_message");
  }

  return { ok: errors.length === 0, errors };
}

function classify(p) {
  switch (p.hook_event_name) {
    case "SessionStart": return "session_start";
    case "Stop": return "stop";
    case "PermissionRequest": return "permission";
    case "Notification": return "attention";
    default: return "unknown";
  }
}

function computeAttention(p) {
  if (p.hook_event_name === "PermissionRequest") {
    return {
      type: "permission_request",
      tool_name: p.tool_name,
      tool_input: p.tool_input,
      permission_suggestions: p.permission_suggestions ?? null
    };
  }
  if (p.hook_event_name === "Notification") {
    const notification_type = p.notification_type ?? null;
    const msg = typeof p.message === "string" ? p.message : "";
    let inferred = null;

    if (!notification_type) {
      const m = msg.toLowerCase();
      if (m.includes("permission")) inferred = "permission_prompt (inferred)";
      else if (m.includes("input") || m.includes("waiting")) inferred = "idle_prompt (inferred)";
      else if (m.includes("?")) inferred = "elicitation_dialog (inferred)";
    }

    return {
      type: "notification",
      notification_type: notification_type ?? inferred,
      message: p.message,
      title: p.title ?? null
    };
  }
  return null;
}

function forwardEligible(envelope) {
  // Default: forward only Notification + PermissionRequest; configurable by CLAUDE_MONITOR_FORWARD_EVENTS
  return true; // eligibility by event name handled in hookMain() using forwardEvents list
}

// ---------- Forwarders ----------
async function postWebhook(envelope) {
  const url = new URL(WEBHOOK_URL);
  const body = Buffer.from(JSON.stringify(envelope), "utf8");

  const headers = {
    "content-type": "application/json",
    "content-length": String(body.length),
    "user-agent": `${PLUGIN.name}/${PLUGIN.version}`,
    "x-event-id": envelope.event_id,
    "x-session-id": String(envelope.session_id ?? "")
  };

  if (WEBHOOK_BEARER) headers["authorization"] = `Bearer ${WEBHOOK_BEARER}`;
  if (WEBHOOK_HMAC_SECRET) {
    const ts = String(Math.floor(Date.now() / 1000));
    headers["x-signature-timestamp"] = ts;
    headers["x-signature-256"] = `sha256=${computeHmac(WEBHOOK_HMAC_SECRET, body)}`;
  }

  const lib = url.protocol === "https:" ? https : http;

  const doOnce = () => new Promise((resolve, reject) => {
    const req = lib.request({
      method: "POST",
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      headers,
      timeout: WEBHOOK_TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("webhook timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  for (let attempt = 0; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
    try {
      const resp = await doOnce();
      const s = resp.status;

      if ((s >= 200 && s < 300) || s === 409) return { ok: true, status: s };

      const retryAfterMs = parseRetryAfter(resp.headers["retry-after"]);
      const exp = Math.min(WEBHOOK_MAX_BACKOFF_MS, WEBHOOK_BACKOFF_MS * (2 ** attempt));
      const jitter = Math.floor(Math.random() * exp);

      if (s === 429 || s === 503) {
        await sleep(retryAfterMs ?? jitter);
        continue;
      }

      // Permanent-ish failure: non-retry 4xx
      if (s >= 400 && s < 500) return { ok: false, status: s, permanent: true, body: resp.body.toString("utf8") };

      // Retry other 5xx with backoff
      if (attempt === WEBHOOK_MAX_RETRIES) return { ok: false, status: s, body: resp.body.toString("utf8") };
      await sleep(jitter);
    } catch (e) {
      if (attempt === WEBHOOK_MAX_RETRIES) return { ok: false, error: String(e) };
      const exp = Math.min(WEBHOOK_MAX_BACKOFF_MS, WEBHOOK_BACKOFF_MS * (2 ** attempt));
      await sleep(Math.floor(Math.random() * exp));
    }
  }
  return { ok: false, error: "unreachable" };
}

function runOpenClaw(envelope) {
  if (!OPENCLAW_CMD) return { ok: false, permanent: true, error: "OPENCLAW_CMD not set" };
  const input = Buffer.from(JSON.stringify(envelope), "utf8");
  const r = spawnSync(OPENCLAW_CMD, {
    input,
    shell: true,
    timeout: OPENCLAW_TIMEOUT_MS,
    maxBuffer: 1024 * 1024
  });
  return {
    ok: r.status === 0,
    status: r.status,
    signal: r.signal ?? null,
    error: r.error ? String(r.error.message || r.error) : null
  };
}

// ---------- Main hook handler ----------
async function hookMain() {
  const cfg = effectiveConfig();
  if (!cfg.enabled) return 0;

  const rawBuf = await readAllStdin();
  let raw;
  try {
    raw = JSON.parse(rawBuf.toString("utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("payload is not object");
  } catch (e) {
    appendJsonl(DLQ_FILE, { ts: nowIso(), plugin: PLUGIN, kind: "invalid_json", error: String(e), raw: rawBuf.toString("utf8") });
    return 0;
  }

  const validation = validateHookPayload(raw);
  const envelope = {
    event_id: randomId(),
    observed_at: nowIso(),
    hook_event_name: raw.hook_event_name ?? null,
    classification: classify(raw),
    session_id: raw.session_id ?? null,
    cwd: raw.cwd ?? null,
    transcript_path: raw.transcript_path ?? null,
    permission_mode: raw.permission_mode ?? null,
    dedupe_key: "sha256:" + sha256Hex(JSON.stringify(raw)),
    attention: computeAttention(raw),
    payload: sanitize(raw, MAX_STR, cfg.redact)
  };

  // Always log unless mode=off
  if (cfg.mode !== "off") {
    appendJsonl(LOG_FILE, { ts: nowIso(), plugin: PLUGIN, pid: process.pid, validation, envelope });
  }

  if (cfg.mode === "dry-run" || cfg.mode === "log" || cfg.mode === "off") return 0;

  // Check per-event forwarding control
  const shouldForward = cfg.forwardEvents.includes(String(raw.hook_event_name || ""));
  if (!shouldForward) return 0;

  // Default attention filtering (avoid forwarding irrelevant Notification)
  if (raw.hook_event_name === "Notification") {
    const nt = raw.notification_type ?? envelope.attention?.notification_type ?? "";
    const allow = ["permission_prompt", "idle_prompt", "elicitation_dialog"];
    const ok = allow.some(a => String(nt).startsWith(a));
    if (!ok && !String(raw.message || "").toLowerCase().includes("permission") && !String(raw.message || "").toLowerCase().includes("input")) {
      return 0;
    }
  }

  // Perform forwards
  if (cfg.mode === "cli" || cfg.mode === "both") {
    const r = runOpenClaw(envelope);
    if (!r.ok) appendJsonl(DLQ_FILE, { ts: nowIso(), plugin: PLUGIN, kind: "cli_failed", result: r, envelope });
  }

  if ((cfg.mode === "webhook" || cfg.mode === "both") && WEBHOOK_URL) {
    const r = await postWebhook(envelope);
    if (!r.ok) appendJsonl(DLQ_FILE, { ts: nowIso(), plugin: PLUGIN, kind: "webhook_failed", result: r, envelope });
  }

  return 0;
}

// ---------- Admin toggle server ----------
function adminMain() {
  if (!ADMIN_TOKEN) return 0; // silent in spec; configure token to actually use

  const server = http.createServer((req, res) => {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${ADMIN_TOKEN}`) { res.writeHead(401); res.end(); return; }

    if (req.method === "GET" && req.url === "/state") {
      const st = loadState();
      const body = Buffer.from(JSON.stringify(st), "utf8");
      res.writeHead(200, { "content-type":"application/json","content-length":String(body.length) });
      res.end(body);
      return;
    }

    if (req.method === "POST" && req.url === "/state") {
      const chunks = [];
      req.on("data", c => chunks.push(c));
      req.on("end", () => {
        try {
          const obj = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if ("enabled" in obj && typeof obj.enabled !== "boolean") throw new Error("enabled must be boolean");
          if ("mode" in obj && !["off","log","cli","webhook","both","dry-run"].includes(String(obj.mode))) throw new Error("bad mode");
          if ("forward_events" in obj && !Array.isArray(obj.forward_events)) throw new Error("forward_events must be array");
          atomicWriteJson(STATE_FILE, obj);
          res.writeHead(204); res.end();
        } catch {
          res.writeHead(400); res.end();
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(ADMIN_PORT, ADMIN_HOST, () => {
    // stderr only
    process.stderr.write(`claude-monitor admin on http://${ADMIN_HOST}:${ADMIN_PORT}\n`);
  });

  return 0;
}

// ---------- Entrypoint ----------
(async () => {
  const cmd = process.argv[2] || "hook";
  try {
    if (cmd === "hook") await hookMain();
    else if (cmd === "admin") adminMain();
  } catch (e) {
    appendJsonl(DLQ_FILE, { ts: nowIso(), plugin: PLUGIN, kind: "fatal", error: String(e) });
  } finally {
    process.exit(0);
  }
})();
```

## Security considerations

Hooks run with your system user’s full permissions; the plugin MUST be treated as trusted local code and should be reviewed like any privileged automation. Claude Code recommends validating/sanitizing inputs, using absolute paths (via project/plugin root variables), and avoiding sensitive files like `.env` and keys. citeturn3view7turn3view0turn4view4

Specific to `claude-monitor`:

- **Secret leakage risk:** Notification `message` and Stop `last_assistant_message` can contain sensitive material; default redaction + truncation MUST be enabled. citeturn3view1turn3view4  
- **File permissions:** logs/state MUST be 0600 and directories 0700 (best effort).  
- **Admin endpoint:** MUST bind to loopback by default and require bearer token; should emit audit events into JSONL (out of scope in code above but SHOULD be implemented by logging state changes into LOG_FILE).  
- **Enterprise policy compatibility:** `allowManagedHooksOnly` can block plugin hooks; deployment MUST account for this in managed environments (plugin may not execute). citeturn6view2turn4view4  

## Testing plan and verification checklist

### Unit tests (script-level)

Use fixture stdin payloads taken from the official hooks reference examples:
- SessionStart example fields (`source`, `model`) citeturn3view3  
- Notification example fields (`message`, `title`, `notification_type`) citeturn3view1  
- PermissionRequest example fields (`tool_name`, `tool_input`, optional `permission_suggestions`) citeturn3view2  
- Stop example fields (`stop_hook_active`, `last_assistant_message`) citeturn3view4  

Assertions:
- exits 0 for all inputs
- creates one JSONL log record per invocation (unless mode=off)
- redaction/truncation behave as configured
- forwarding eligibility triggers only for PermissionRequest and the allowed Notification types (plus message inference case)

### Integration tests (Claude Code)

- Run Claude Code with plugin loaded using `--plugin-dir` and enable debug logging to verify hooks fire and see hook execution. citeturn2view3turn3view5  
- Trigger:
  - Permission dialog (fires `PermissionRequest`) citeturn3view2  
  - An “idle/input needed” situation (fires `Notification` where available) citeturn3view1  
  - End of turn (fires `Stop`) citeturn3view4  
- Confirm plugin hooks appear as `[Plugin]` in `/hooks` manager (read-only), and that toggling `"disableAllHooks": true` disables execution. citeturn4view0turn6view1  

### End-to-end tests (OpenClaw CLI / Webhook)

Webhook path:
- Stand up a test server that returns:
  - `204` success
  - `429` with `Retry-After: 1` → verify backoff respects `Retry-After` (RFC 6585) citeturn9view3  
  - `503` with `Retry-After` (RFC 9110) citeturn9view2  
- Verify DLQ captures permanent failures (e.g., `400`, `401`, `403`) without blocking Claude Code.

CLI path:
- Use a stub `openclaw` script that records stdin to a file and exits 0/1 to exercise success and DLQ behavior.

### Deployment checklist

- Place plugin directories correctly (hooks/ at root, plugin.json under `.claude-plugin/`). citeturn5view4turn2view3  
- Start in log-only mode and validate JSONL output.
- Enable forwarding:
  - CLI: set `CLAUDE_MONITOR_MODE=cli` and `CLAUDE_MONITOR_OPENCLAW_CMD="openclaw …"`
  - Webhook: set `CLAUDE_MONITOR_MODE=webhook`, `CLAUDE_MONITOR_WEBHOOK_URL=…`, plus auth as needed
- Confirm disable mechanisms:
  - `claude plugin disable claude-monitor` citeturn5view1  
  - or `"disableAllHooks": true` (global) citeturn6view1turn4view0  

