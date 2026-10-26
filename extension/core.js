(function exposeCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WATranscriberCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIME_TO_EXTENSION = {
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

  function normalizeMimeType(value) {
    return String(value || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
  }

  function extensionForMime(value) {
    return MIME_TO_EXTENSION[normalizeMimeType(value)] || "ogg";
  }

  function isSupportedAudio(value) {
    return Boolean(MIME_TO_EXTENSION[normalizeMimeType(value)]);
  }

  function makeFileName(mimeType, now = Date.now()) {
    return `whatsapp-voice-${now}.${extensionForMime(mimeType)}`;
  }

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return {
    MAX_AUDIO_BYTES,
    extensionForMime,
    humanBytes,
    isSupportedAudio,
    makeFileName,
    normalizeMimeType
  };
});
