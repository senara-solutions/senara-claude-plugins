#!/usr/bin/env node
// claude-asked: forwards Claude Code hook events to a command and/or webhook.
// Contract: always exit 0, never write stdout.

import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

const VALID_MODES = new Set(["command", "webhook", "both"]);

function warn(msg) {
  process.stderr.write(`[claude-asked] ${msg}\n`);
}

function readConfig() {
  let mode = (process.env.CLAUDE_ASKED_MODE || "command").toLowerCase();
  if (!VALID_MODES.has(mode)) {
    warn(`Unknown mode "${mode}", falling back to "command"`);
    mode = "command";
  }
  return {
    mode,
    command: process.env.CLAUDE_ASKED_COMMAND || "",
    webhookUrl: process.env.CLAUDE_ASKED_WEBHOOK_URL || "",
    webhookBearer: process.env.CLAUDE_ASKED_WEBHOOK_BEARER || "",
    webhookTimeoutMs: Number(process.env.CLAUDE_ASKED_WEBHOOK_TIMEOUT_MS) || 3000,
    commandTimeoutMs: Number(process.env.CLAUDE_ASKED_COMMAND_TIMEOUT_MS) || 2000,
    logFile: process.env.CLAUDE_ASKED_LOG_FILE || "",
  };
}

function buildEnvelope(payload) {
  return {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    hook_event_name: payload.hook_event_name ?? null,
    payload,
  };
}

function logToFile(cfg, level, msg, envelope, detail) {
  if (!cfg.logFile) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event: envelope?.hook_event_name ?? null,
    event_id: envelope?.event_id ?? null,
    msg,
  };
  if (detail !== undefined) entry.detail = detail;
  try { appendFileSync(cfg.logFile, JSON.stringify(entry) + "\n"); }
  catch (err) { warn(`Log write failed: ${err.message}`); }
}

function forwardCommand(envelope, cfg) {
  if (!cfg.command) {
    warn("CLAUDE_ASKED_COMMAND is not set, skipping command forwarding");
    return;
  }
  const input = Buffer.from(JSON.stringify(envelope), "utf8");
  const result = spawnSync(cfg.command, {
    input,
    shell: true,
    timeout: cfg.commandTimeoutMs,
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (result.error) {
    warn(`Command error: ${result.error.message}`);
    logToFile(cfg, "error", "command: error", envelope, result.error.message);
  } else if (result.signal) {
    warn(`Command killed by signal ${result.signal}`);
    logToFile(cfg, "error", `command: killed by ${result.signal}`, envelope);
  } else if (result.status !== 0) {
    warn(`Command exited with status ${result.status}`);
    logToFile(cfg, "error", `command: exit ${result.status}`, envelope);
  } else {
    logToFile(cfg, "info", "command: ok", envelope);
  }
}

async function forwardWebhook(envelope, cfg) {
  if (!cfg.webhookUrl) {
    warn("CLAUDE_ASKED_WEBHOOK_URL is not set, skipping webhook forwarding");
    return;
  }

  let url;
  try { url = new URL(cfg.webhookUrl); }
  catch { warn("Invalid webhook URL (check CLAUDE_ASKED_WEBHOOK_URL)"); return; }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    warn(`Unsupported webhook protocol: ${url.protocol}`);
    return;
  }

  const body = Buffer.from(JSON.stringify(envelope), "utf8");
  const lib = url.protocol === "https:" ? https : http;
  const headers = { "content-type": "application/json", "content-length": String(body.length) };
  if (cfg.webhookBearer) headers["authorization"] = `Bearer ${cfg.webhookBearer}`;

  return new Promise((resolve) => {
    let settled = false;
    const req = lib.request({
      method: "POST", hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search, headers, timeout: cfg.webhookTimeoutMs,
    }, (res) => {
      res.resume();
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          warn(`Webhook responded with status ${res.statusCode}`);
          logToFile(cfg, "error", `webhook: HTTP ${res.statusCode}`, envelope);
        } else {
          logToFile(cfg, "info", `webhook: ${res.statusCode}`, envelope);
        }
        resolve();
      });
    });
    req.on("timeout", () => {
      if (!settled) { settled = true; warn("Webhook request timed out"); logToFile(cfg, "error", "webhook: timeout", envelope); }
      req.destroy();
    });
    req.on("error", (err) => {
      if (!settled) { settled = true; warn(`Webhook error: ${err.message}`); logToFile(cfg, "error", "webhook: error", envelope, err.message); }
      resolve();
    });
    req.write(body);
    req.end();
  });
}

function readAllStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.on("error", () => resolve(Buffer.concat(chunks)));
    process.stdin.resume();
  });
}

async function main() {
  const cfg = readConfig();

  if (process.env.CLAUDE_ASKED_DEBUG) {
    warn(`Invoked (pid=${process.pid}, mode=${cfg.mode})`);
  }
  logToFile(cfg, "info", `invoked (mode=${cfg.mode})`, null);

  const buf = await readAllStdin();
  if (buf.length === 0) {
    warn("Empty stdin, nothing to process");
    logToFile(cfg, "error", "empty stdin", null);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(buf.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Payload is not a JSON object");
    }
  } catch (err) {
    warn(`Invalid JSON on stdin: ${err.message}`);
    logToFile(cfg, "error", "invalid JSON on stdin", null, err.message);
    return;
  }

  const envelope = buildEnvelope(payload);

  if (process.env.CLAUDE_ASKED_DEBUG) {
    warn(`Event: ${envelope.hook_event_name}, id: ${envelope.event_id}`);
  }
  logToFile(cfg, "info", "event received", envelope);

  if (cfg.mode === "command" || cfg.mode === "both") {
    forwardCommand(envelope, cfg);
  }
  if (cfg.mode === "webhook" || cfg.mode === "both") {
    await forwardWebhook(envelope, cfg);
  }
}

main().catch((err) => warn(`Unexpected error: ${err.message}`)).finally(() => process.exit(0));
