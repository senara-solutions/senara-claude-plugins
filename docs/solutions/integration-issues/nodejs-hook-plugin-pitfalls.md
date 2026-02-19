---
title: "Node.js Claude Code Hook Plugin: Common Pitfalls and Fixes"
date: 2026-02-19
category: integration-issues
tags:
  - node.js
  - claude-code-hooks
  - promise-handling
  - error-handling
  - webhook
  - child-process
  - stdin-streams
module: claude-asked
severity: high
symptoms:
  - "Spurious duplicate warning messages on webhook timeout"
  - "Process hangs indefinitely when stdin encounters an error"
  - "Non-HTTP URLs silently accepted by webhook forwarder"
  - "Signal-killed child processes exit without any warning"
root_cause: "Missing error event handlers, double promise resolution, incomplete spawnSync result checking, and missing URL protocol validation"
---

# Node.js Claude Code Hook Plugin: Common Pitfalls and Fixes

## Context

While building `claude-asked` (a Claude Code hook plugin that forwards Notification and PermissionRequest events to a command/webhook), code review revealed 5 bugs — all related to common Node.js patterns that are easy to get wrong in short CLI/hook scripts.

These patterns apply to any Node.js script that:
- Reads stdin as a stream
- Makes HTTP requests with timeouts
- Spawns child processes with `spawnSync`
- Must always exit 0 (non-blocking contract)

## Bug 1: Double `resolve()` on Webhook Timeout

### Problem

When `req.destroy()` is called in the `"timeout"` handler, Node.js emits an `"error"` event on the request. Both handlers call `resolve()`, producing a spurious second warning like `"Webhook error: socket hang up"` after `"Webhook request timed out"`.

```js
// BUG: resolve() called twice, two misleading warnings printed
req.on("timeout", () => { warn("timed out"); req.destroy(); resolve(); });
req.on("error", (err) => { warn(`error: ${err.message}`); resolve(); });
```

### Fix

Use a `settled` flag to guard against double resolution:

```js
let settled = false;
req.on("timeout", () => {
  if (!settled) { settled = true; warn("Webhook request timed out"); }
  req.destroy();
});
req.on("error", (err) => {
  if (!settled) { settled = true; warn(`Webhook error: ${err.message}`); }
  resolve();
});
```

### Rule

**When calling `req.destroy()`, always expect a subsequent `"error"` event.** Guard all resolve/reject calls with a settlement flag.

## Bug 2: Missing stdin Error Handler

### Problem

`readAllStdin()` only listens for `"data"` and `"end"`. If stdin emits `"error"` (broken pipe, encoding error), the promise never settles and the process hangs until the 30s hook timeout kills it.

```js
// BUG: no error handler — promise can hang forever
function readAllStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.resume();
  });
}
```

### Fix

```js
function readAllStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.on("error", () => resolve(Buffer.concat(chunks)));
    process.stdin.resume();
  });
}
```

### Rule

**Every Node.js stream needs an `"error"` handler before `resume()`.** Streams that emit errors without a handler will leave promises unsettled.

## Bug 3: No Protocol Validation on Webhook URL

### Problem

`new URL("ftp://example.com")` parses successfully. The code uses `url.protocol === "https:" ? https : http`, so any non-HTTPS URL (including `ftp://`, `file://`) silently falls through to the `http` module.

### Fix

```js
if (url.protocol !== "http:" && url.protocol !== "https:") {
  warn(`Unsupported webhook protocol: ${url.protocol}`);
  return;
}
```

### Rule

**Always validate `url.protocol` after `new URL()` succeeds.** URL parsing and protocol validation are separate concerns.

## Bug 4: Missing Signal Check in `spawnSync`

### Problem

When a child process is killed by a signal (timeout, OOM killer), `spawnSync` returns `{ status: null, signal: "SIGTERM" }`. The code only checks `result.error` and `result.status`, missing signal-killed processes entirely.

```js
// BUG: signal kills are silently ignored
if (result.error) {
  warn(`Command error: ${result.error.message}`);
} else if (result.status !== 0) {
  warn(`Command exited with status ${result.status}`);
}
```

### Fix

Check signal **before** status:

```js
if (result.error) {
  warn(`Command error: ${result.error.message}`);
} else if (result.signal) {
  warn(`Command killed by signal ${result.signal}`);
} else if (result.status !== 0) {
  warn(`Command exited with status ${result.status}`);
}
```

### Rule

**Always check `spawnSync` results in order: `error` > `signal` > `status`.** When `signal` is set, `status` is `null`.

## Bug 5: Inconsistent Promise Style

### Problem

`forwardWebhook` returns `Promise.resolve()` in early-exit paths but `new Promise(...)` in the main path. Not a bug per se, but makes the code harder to reason about.

### Fix

Declare the function `async` so early returns automatically produce resolved promises:

```js
async function forwardWebhook(envelope, cfg) {
  if (!cfg.webhookUrl) { warn("..."); return; }  // auto-resolves
  // ... new Promise(...) for the HTTP call
}
```

## Prevention Checklist

When writing Node.js hook/CLI scripts:

- [ ] Every stream has an `"error"` handler attached before `resume()`
- [ ] `req.destroy()` callers expect a subsequent `"error"` event
- [ ] Promise resolve/reject guarded against double calls (settlement flag)
- [ ] `spawnSync` results checked in order: `error` > `signal` > `status`
- [ ] URL protocol validated after `new URL()` succeeds
- [ ] `process.exit(0)` in `.finally()` to guarantee exit
- [ ] No writes to stdout (only stderr for diagnostics)
- [ ] All async functions are `await`-ed or explicitly fire-and-forget

## Related

- Reference spec: `deep-research-report.md` (full claude-monitor specification)
- Brainstorm: `docs/brainstorms/2026-02-19-claude-asked-brainstorm.md`
- Plan: `docs/plans/2026-02-19-feat-claude-asked-plugin-plan.md`
