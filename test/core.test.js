"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../extension/core");

test("normalizes WhatsApp Opus MIME types", () => {
  assert.equal(Core.normalizeMimeType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(Core.extensionForMime("audio/ogg; codecs=opus"), "ogg");
  assert.equal(Core.isSupportedAudio("audio/ogg; codecs=opus"), true);
});

test("creates stable audio filenames", () => {
  assert.equal(Core.makeFileName("audio/webm", 123), "whatsapp-voice-123.webm");
  assert.equal(Core.makeFileName("unknown/type", 456), "whatsapp-voice-456.ogg");
});

test("formats byte sizes for UI errors", () => {
  assert.equal(Core.humanBytes(1024), "1.0 KB");
  assert.equal(Core.humanBytes(2.5 * 1024 * 1024), "2.5 MB");
});
