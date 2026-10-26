"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, timingSafeEqual } = require("node:crypto");

const SETUP_DIR = path.join(__dirname, "setup");
const SETUP_ASSETS = new Map([
  ["/setup", ["index.html", "text/html; charset=utf-8"]],
  ["/setup/", ["index.html", "text/html; charset=utf-8"]],
  ["/setup/setup.css", ["setup.css", "text/css; charset=utf-8"]],
  ["/setup/setup.js", ["setup.js", "text/javascript; charset=utf-8"]]
]);

const SUPPORTED_MIME_TYPES = new Set([
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "application/ogg"
]);

const EXTENSION_BY_MIME = {
  "audio/flac": "flac",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mpga",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "application/ogg": "ogg"
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isLocalSetupOrigin(origin, host) {
  return Boolean(origin && host && origin === `http://${host}`);
}

function isAllowedSetupOrigin(origin, host) {
  return !origin || isLocalSetupOrigin(origin, host);
}

function isAllowedOrigin(origin, host = "") {
  return (
    !origin ||
    origin === "https://web.whatsapp.com" ||
    origin.startsWith("chrome-extension://") ||
    isLocalSetupOrigin(origin, host)
  );
}

function corsHeaders(origin, host = "") {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin"
  };
  if (origin && isAllowedOrigin(origin, host)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function securityHeaders() {
  return {
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; script-src 'self'; style-src 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

function sendFile(response, fileName, contentType) {
  const payload = fs.readFileSync(path.join(SETUP_DIR, fileName));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...securityHeaders()
  });
  response.end(payload);
}

function sendJson(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(payload);
}

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers["content-length"] || 0);
    if (declaredLength > maxBytes) {
      reject(new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large."));
      request.resume();
      return;
    }

    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "INVALID_JSON", "The request body is not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function decodeBase64(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new HttpError(400, "INVALID_AUDIO", "The audio data is invalid.");
  }
  return Buffer.from(value, "base64");
}

function normalizeMimeType(value) {
  return String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function safeFileName(value, mimeType) {
  const fallback = `voice-message.${EXTENSION_BY_MIME[mimeType] || "ogg"}`;
  if (typeof value !== "string" || !value.trim()) return fallback;

  const base = path.basename(value.trim()).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!base || base === "." || base === "..") return fallback;
  if (!path.extname(base)) return `${base}.${EXTENSION_BY_MIME[mimeType] || "ogg"}`;
  return base.slice(0, 120);
}

function validateAudioPayload(payload, maxAudioBytes) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "INVALID_REQUEST", "The request format is invalid.");
  }

  const mimeType = normalizeMimeType(payload.mimeType);
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, "UNSUPPORTED_AUDIO", "This audio format is not supported.");
  }

  const bytes = decodeBase64(payload.audioBase64);
  if (bytes.length === 0) {
    throw new HttpError(400, "EMPTY_AUDIO", "The audio file is empty.");
  }
  if (bytes.length > maxAudioBytes) {
    throw new HttpError(413, "AUDIO_TOO_LARGE", "The audio exceeds the 25 MB limit.");
  }

  return {
    bytes,
    mimeType,
    fileName: safeFileName(payload.fileName, mimeType)
  };
}

async function callGroq({ audio, config, fetchImpl }) {
  const form = new FormData();
  form.append("file", new Blob([audio.bytes], { type: audio.mimeType }), audio.fileName);
  form.append("model", config.model);
  if (config.language) form.append("language", config.language);
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Transcribe the speech accurately. Preserve names, technical terms, punctuation, and the speaker's language."
  );
  form.append("temperature", "0");

  let upstream;
  try {
    upstream = await fetchImpl(config.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(config.upstreamTimeoutMs)
    });
  } catch (error) {
    const isTimeout = error && error.name === "TimeoutError";
    throw new HttpError(
      502,
      isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      isTimeout ? "Transcription timed out." : "Could not connect to Groq."
    );
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    body = null;
  }

  if (!upstream.ok) {
    const code = upstream.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR";
    const message =
      upstream.status === 401
        ? "Groq rejected the API key. Open local setup and enter a valid key."
        : upstream.status === 429
          ? "The Groq rate limit was reached. Try again later."
          : "Groq could not complete the transcription.";
    throw new HttpError(502, code, message);
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    throw new HttpError(502, "EMPTY_TRANSCRIPT", "Groq returned an empty transcript.");
  }

  return { text, provider: "groq", model: config.model };
}

function validateLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  if (language && !/^[a-z]{2}$/.test(language)) {
    throw new HttpError(400, "INVALID_LANGUAGE", "Choose Auto-detect or a supported language.");
  }
  return language;
}

function validateApiKey(value) {
  const apiKey = String(value || "").trim();
  if (!/^gsk_[A-Za-z0-9_-]{20,252}$/.test(apiKey)) {
    throw new HttpError(400, "INVALID_API_KEY", "Enter a valid Groq API key beginning with gsk_.");
  }
  return apiKey;
}

async function verifyGroqKey(apiKey, config, fetchImpl) {
  let upstream;
  try {
    upstream = await fetchImpl(config.apiKeyCheckUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(Math.min(config.upstreamTimeoutMs, 15_000))
    });
  } catch (error) {
    const isTimeout = error && error.name === "TimeoutError";
    throw new HttpError(
      502,
      isTimeout ? "KEY_CHECK_TIMEOUT" : "KEY_CHECK_UNAVAILABLE",
      isTimeout ? "Groq key verification timed out." : "Could not reach Groq to verify the key."
    );
  }

  if (upstream.status === 401 || upstream.status === 403) {
    throw new HttpError(400, "INVALID_API_KEY", "Groq rejected this API key.");
  }
  if (!upstream.ok) {
    throw new HttpError(502, "KEY_CHECK_FAILED", "Groq could not verify the key. Try again later.");
  }
}

function tokenMatches(expected, candidate) {
  if (typeof candidate !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  return (
    expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}

function createApp(config, { fetchImpl = globalThis.fetch, secretStore = null } = {}) {
  const maxRequestBytes = Math.ceil(config.maxAudioBytes * 1.38) + 64 * 1024;
  const setupToken = randomBytes(32).toString("base64url");
  const runtime = {
    apiKey: config.apiKey,
    language: validateLanguage(config.language),
    storage: config.apiKey ? config.keySource || "environment" : "none"
  };

  return http.createServer(async (request, response) => {
    const origin = request.headers.origin || "";
    const host = request.headers.host || "";
    const cors = corsHeaders(origin, host);

    if (!isAllowedOrigin(origin, host)) {
      sendJson(response, 403, { error: { code: "ORIGIN_DENIED", message: "This origin is not allowed." } });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    const asset = SETUP_ASSETS.get(request.url);
    if (request.method === "GET" && asset) {
      try {
        sendFile(response, asset[0], asset[1]);
      } catch {
        sendJson(response, 500, {
          error: { code: "SETUP_UNAVAILABLE", message: "The local setup page is unavailable." }
        });
      }
      return;
    }

    if (request.method === "GET" && request.url === "/setup/bootstrap") {
      if (!isAllowedSetupOrigin(origin, host)) {
        sendJson(response, 403, {
          error: { code: "ORIGIN_DENIED", message: "Open setup directly from the local helper." }
        });
        return;
      }
      sendJson(response, 200, {
        setupToken,
        configured: Boolean(runtime.apiKey),
        language: runtime.language || "auto",
        model: config.model,
        storage: runtime.storage,
        canRemember: Boolean(secretStore)
      });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/setup") {
      try {
        if (!isLocalSetupOrigin(origin, host)) {
          throw new HttpError(403, "ORIGIN_DENIED", "Open setup directly from the local helper.");
        }
        if (!tokenMatches(setupToken, request.headers["x-setup-token"])) {
          throw new HttpError(403, "SETUP_TOKEN_INVALID", "Reload the setup page and try again.");
        }
        const payload = await readJson(request, 8 * 1024);
        const apiKey = validateApiKey(payload?.apiKey);
        const language = validateLanguage(payload?.language === "auto" ? "" : payload?.language);
        await verifyGroqKey(apiKey, config, fetchImpl);
        if (payload?.remember) {
          if (!secretStore) {
            throw new HttpError(
              503,
              "KEYCHAIN_UNAVAILABLE",
              "The OS credential store is unavailable. Unlock it or use session-only mode."
            );
          }
          try {
            await secretStore.set(apiKey);
          } catch {
            throw new HttpError(
              503,
              "KEYCHAIN_UNAVAILABLE",
              "The key could not be saved in the OS credential store."
            );
          }
        }
        runtime.apiKey = apiKey;
        runtime.language = language;
        runtime.storage = payload?.remember ? "keychain" : "session";
        sendJson(response, 200, {
          configured: true,
          language: runtime.language || "auto",
          model: config.model,
          storage: runtime.storage
        });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
        const message = error instanceof HttpError ? error.message : "Local setup failed.";
        sendJson(response, status, { error: { code, message } });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/v1/setup/clear") {
      if (!isLocalSetupOrigin(origin, host)) {
        sendJson(response, 403, {
          error: { code: "ORIGIN_DENIED", message: "Open setup directly from the local helper." }
        });
        return;
      }
      if (!tokenMatches(setupToken, request.headers["x-setup-token"])) {
        sendJson(response, 403, {
          error: { code: "SETUP_TOKEN_INVALID", message: "Reload the setup page and try again." }
        });
        return;
      }
      if (secretStore) {
        try {
          await secretStore.delete();
        } catch {
          sendJson(response, 503, {
            error: {
              code: "KEYCHAIN_UNAVAILABLE",
              message: "The saved key could not be removed from the OS credential store."
            }
          });
          return;
        }
      }
      runtime.apiKey = "";
      runtime.storage = "none";
      sendJson(response, 200, { configured: false, storage: "none" });
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(
        response,
        200,
        {
          status: "ok",
          configured: Boolean(runtime.apiKey),
          provider: "groq",
          model: config.model,
          language: runtime.language || "auto",
          storage: runtime.storage,
          canRemember: Boolean(secretStore),
          maxAudioMb: config.maxAudioBytes / 1024 / 1024
        },
        cors
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/transcriptions") {
      try {
        if (!runtime.apiKey) {
          throw new HttpError(
            503,
            "MISSING_API_KEY",
            "No Groq API key is configured. Open local setup to continue."
          );
        }
        const payload = await readJson(request, maxRequestBytes);
        const audio = validateAudioPayload(payload, config.maxAudioBytes);
        const result = await callGroq({
          audio,
          config: { ...config, apiKey: runtime.apiKey, language: runtime.language },
          fetchImpl
        });
        sendJson(response, 200, result, cors);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
        const message =
          error instanceof HttpError ? error.message : "The local server encountered an error.";
        sendJson(response, status, { error: { code, message } }, cors);
      }
      return;
    }

    sendJson(
      response,
      404,
      { error: { code: "NOT_FOUND", message: "Endpoint not found." } },
      cors
    );
  });
}

module.exports = {
  HttpError,
  callGroq,
  corsHeaders,
  createApp,
  normalizeMimeType,
  safeFileName,
  validateApiKey,
  validateAudioPayload
};
