#!/usr/bin/env node
// claude-asked: forwards Claude Code hook events to a command and/or webhook.
// Contract: always exit 0, never write stdout.

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
  } else if (result.status !== 0) {
    warn(`Command exited with status ${result.status}`);
  }
}

function forwardWebhook(envelope, cfg) {
  if (!cfg.webhookUrl) {
    warn("CLAUDE_ASKED_WEBHOOK_URL is not set, skipping webhook forwarding");
    return Promise.resolve();
  }

  let url;
  try { url = new URL(cfg.webhookUrl); }
  catch { warn(`Invalid webhook URL: ${cfg.webhookUrl}`); return Promise.resolve(); }

  const body = Buffer.from(JSON.stringify(envelope), "utf8");
  const lib = url.protocol === "https:" ? https : http;
  const headers = { "content-type": "application/json", "content-length": String(body.length) };
  if (cfg.webhookBearer) headers["authorization"] = `Bearer ${cfg.webhookBearer}`;

  return new Promise((resolve) => {
    const req = lib.request({
      method: "POST", hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search, headers, timeout: cfg.webhookTimeoutMs,
    }, (res) => {
      res.resume();
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) warn(`Webhook responded with status ${res.statusCode}`);
        resolve();
      });
    });
    req.on("timeout", () => { warn("Webhook request timed out"); req.destroy(); resolve(); });
    req.on("error", (err) => { warn(`Webhook error: ${err.message}`); resolve(); });
    req.write(body);
    req.end();
  });
}

function readAllStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.resume();
  });
}

async function main() {
  const buf = await readAllStdin();
  if (buf.length === 0) {
    warn("Empty stdin, nothing to process");
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
    return;
  }

  const cfg = readConfig();
  const envelope = buildEnvelope(payload);

  if (cfg.mode === "command" || cfg.mode === "both") {
    forwardCommand(envelope, cfg);
  }
  if (cfg.mode === "webhook" || cfg.mode === "both") {
    await forwardWebhook(envelope, cfg);
  }
}

main().catch((err) => warn(`Unexpected error: ${err.message}`)).finally(() => process.exit(0));
