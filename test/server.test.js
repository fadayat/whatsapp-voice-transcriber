"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp, safeFileName, validateAudioPayload } = require("../server/app");

function config(overrides = {}) {
  return {
    apiKey: "test-secret",
    apiUrl: "https://api.groq.test/audio/transcriptions",
    apiKeyCheckUrl: "https://api.groq.test/models",
    model: "whisper-large-v3",
    language: "az",
    keySource: "environment",
    host: "127.0.0.1",
    port: 0,
    maxAudioBytes: 25 * 1024 * 1024,
    upstreamTimeoutMs: 5_000,
    ...overrides
  };
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("health reports configuration without exposing the key", async (t) => {
  const server = createApp(config());
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.provider, "groq");
  assert.equal(JSON.stringify(body).includes("test-secret"), false);
});

test("rejects requests from unrelated web origins", async (t) => {
  const server = createApp(config());
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: "https://example.com" }
  });
  assert.equal(response.status, 403);
});

test("sends validated WhatsApp audio to Groq", async (t) => {
  let observed = null;
  const fakeFetch = async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify({ text: "Salam, necəsən?" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const server = createApp(config(), { fetchImpl: fakeFetch });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const audio = Buffer.from("fake-ogg-audio");
  const response = await fetch(`${baseUrl}/v1/transcriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://web.whatsapp.com"
    },
    body: JSON.stringify({
      audioBase64: audio.toString("base64"),
      mimeType: "audio/ogg; codecs=opus",
      fileName: "voice.ogg"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.text, "Salam, necəsən?");
  assert.equal(observed.url, "https://api.groq.test/audio/transcriptions");
  assert.equal(observed.options.headers.Authorization, "Bearer test-secret");
  assert.equal(observed.options.body.get("model"), "whisper-large-v3");
  assert.equal(observed.options.body.get("language"), "az");
  assert.equal(observed.options.body.get("file").type, "audio/ogg");
});

test("does not call Groq without an API key", async (t) => {
  const server = createApp(config({ apiKey: "" }), {
    fetchImpl: async () => assert.fail("upstream must not be called")
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/v1/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "MISSING_API_KEY");
});

test("returns clear errors for rejected and rate-limited Groq requests", async (t) => {
  const statuses = [401, 429];
  const server = createApp(config(), {
    fetchImpl: async () => new Response("{}", { status: statuses.shift() })
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const payload = JSON.stringify({
    audioBase64: Buffer.from("fake-ogg-audio").toString("base64"),
    mimeType: "audio/ogg",
    fileName: "voice.ogg"
  });

  const rejected = await fetch(`${baseUrl}/v1/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload
  });
  const rejectedBody = await rejected.json();
  assert.equal(rejected.status, 502);
  assert.equal(rejectedBody.error.code, "UPSTREAM_ERROR");
  assert.match(rejectedBody.error.message, /API key/);

  const limited = await fetch(`${baseUrl}/v1/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload
  });
  const limitedBody = await limited.json();
  assert.equal(limited.status, 502);
  assert.equal(limitedBody.error.code, "RATE_LIMITED");
  assert.match(limitedBody.error.message, /rate limit/);
});

test("rejects a successful Groq response with no transcript", async (t) => {
  const server = createApp(config(), {
    fetchImpl: async () =>
      new Response(JSON.stringify({ text: "   " }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/v1/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: Buffer.from("fake-ogg-audio").toString("base64"),
      mimeType: "audio/ogg"
    })
  });
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "EMPTY_TRANSCRIPT");
});

test("validates audio MIME type and sanitizes filenames", () => {
  assert.throws(
    () =>
      validateAudioPayload(
        { audioBase64: "ZmFrZQ==", mimeType: "text/plain" },
        1024
      ),
    { code: "UNSUPPORTED_AUDIO" }
  );
  assert.equal(safeFileName("../../secret voice.ogg", "audio/ogg"), "secret_voice.ogg");
});

test("serves local setup with strict browser security headers", async (t) => {
  const server = createApp(config());
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/setup`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(html, /Connect Groq once/);
  assert.equal(html.includes("test-secret"), false);
});

test("secure setup verifies and stores a key without returning it", async (t) => {
  let stored = "";
  let deleted = false;
  const secretStore = {
    async set(value) {
      stored = value;
    },
    async delete() {
      deleted = true;
      stored = "";
      return true;
    }
  };
  const checkedUrls = [];
  const server = createApp(config({ apiKey: "", keySource: "none" }), {
    secretStore,
    fetchImpl: async (url) => {
      checkedUrls.push(url);
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const origin = new URL(baseUrl).origin;

  const bootstrapResponse = await fetch(`${baseUrl}/setup/bootstrap`);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrap.configured, false);
  assert.equal(bootstrap.canRemember, true);
  assert.equal(JSON.stringify(bootstrap).includes("gsk_"), false);

  const key = `gsk_${"a".repeat(32)}`;
  const response = await fetch(`${baseUrl}/v1/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Setup-Token": bootstrap.setupToken,
      Origin: origin
    },
    body: JSON.stringify({ apiKey: key, language: "auto", remember: true })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.storage, "keychain");
  assert.equal(JSON.stringify(body).includes(key), false);
  assert.equal(stored, key);
  assert.deepEqual(checkedUrls, ["https://api.groq.test/models"]);

  const health = await (await fetch(`${baseUrl}/health`)).json();
  assert.equal(health.configured, true);
  assert.equal(health.storage, "keychain");
  assert.equal(JSON.stringify(health).includes(key), false);

  const clearResponse = await fetch(`${baseUrl}/v1/setup/clear`, {
    method: "POST",
    headers: { "X-Setup-Token": bootstrap.setupToken, Origin: origin }
  });
  assert.equal(clearResponse.status, 200);
  assert.equal(deleted, true);
  assert.equal(stored, "");
});

test("setup rejects missing CSRF token without checking the key", async (t) => {
  const server = createApp(config({ apiKey: "" }), {
    fetchImpl: async () => assert.fail("Groq must not be called")
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/v1/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(baseUrl).origin },
    body: JSON.stringify({ apiKey: `gsk_${"a".repeat(32)}` })
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "SETUP_TOKEN_INVALID");
});

test("setup API rejects browser-extension origins", async (t) => {
  const server = createApp(config({ apiKey: "" }), {
    fetchImpl: async () => assert.fail("Groq must not be called")
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const bootstrap = await (await fetch(`${baseUrl}/setup/bootstrap`)).json();

  const response = await fetch(`${baseUrl}/v1/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Setup-Token": bootstrap.setupToken,
      Origin: "chrome-extension://malicious-extension"
    },
    body: JSON.stringify({ apiKey: `gsk_${"a".repeat(32)}` })
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "ORIGIN_DENIED");
});

test("setup API rejects matching non-loopback Host and Origin headers", async (t) => {
  const server = createApp(config({ apiKey: "" }), {
    fetchImpl: async () => assert.fail("Groq must not be called")
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/setup/bootstrap`, {
    headers: {
      Host: "attacker.example:4318",
      Origin: "http://attacker.example:4318"
    }
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "ORIGIN_DENIED");
  assert.equal(body.setupToken, undefined);
});
