"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function loadDotEnv(filePath = path.join(PROJECT_ROOT, ".env")) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separator + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : fallback;
}

function getConfig(env = process.env) {
  return {
    apiKey: env.GROQ_API_KEY || "",
    apiUrl:
      env.GROQ_API_URL ||
      "https://api.groq.com/openai/v1/audio/transcriptions",
    apiKeyCheckUrl:
      env.GROQ_API_KEY_CHECK_URL ||
      "https://api.groq.com/openai/v1/models",
    model: env.GROQ_MODEL || "whisper-large-v3",
    language: env.TRANSCRIPTION_LANGUAGE || "",
    keySource: env.GROQ_API_KEY ? "environment" : "none",
    host: env.HOST || "127.0.0.1",
    port: parsePort(env.PORT, 4318),
    maxAudioBytes: 25 * 1024 * 1024,
    upstreamTimeoutMs: parsePort(env.UPSTREAM_TIMEOUT_MS, 75_000)
  };
}

module.exports = { getConfig, loadDotEnv, parsePort };
