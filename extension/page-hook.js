(function installWhatsAppAudioHook() {
  "use strict";

  const REQUEST_MARKER = "__wat_audio_request";
  const RESPONSE_MARKER = "__wat_audio_response";
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

  let capture = null;
  let suppressUntil = 0;
  const suppressedMedia = new Set();
  const mediaState = new WeakMap();

  function respond(id, payload) {
    window.postMessage({ [RESPONSE_MARKER]: true, id, ...payload }, "*");
  }

  function suppressionActive() {
    return Boolean(capture) && Date.now() < suppressUntil;
  }

  function silenceMedia(media) {
    if (!(media instanceof HTMLMediaElement)) return;
    if (!mediaState.has(media)) {
      mediaState.set(media, { muted: media.muted, volume: media.volume });
    }
    suppressedMedia.add(media);
    try {
      media.muted = true;
      media.volume = 0;
      originalPause.call(media);
    } catch {
      // Detached media elements can disappear while WhatsApp changes chats.
    }
  }

  function stopSuppressedMedia() {
    for (const media of suppressedMedia) {
      try {
        originalPause.call(media);
        media.currentTime = 0;
      } catch {
        // The source can be released before capture finishes.
      }
      try {
        const previous = mediaState.get(media);
        media.muted = previous?.muted ?? false;
        media.volume = previous?.volume ?? 1;
      } catch {
        // Detached media elements can disappear while WhatsApp changes chats.
      }
      mediaState.delete(media);
    }
    suppressedMedia.clear();
  }

  function isUsableAudio(blob) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_AUDIO_BYTES) {
      return false;
    }
    const type = String(blob.type || "").toLowerCase();
    return type.startsWith("audio/") || type === "" || type === "application/octet-stream";
  }

  async function captureUrl(url) {
    if (
      !capture ||
      capture.done ||
      capture.running ||
      typeof url !== "string" ||
      !url.startsWith("blob:")
    ) {
      return;
    }

    capture.running = true;
    try {
      const response = await fetch(url);
      const blob = response.ok ? await response.blob() : null;
      if (!isUsableAudio(blob)) {
        capture.running = false;
        return;
      }
      capture.done = true;
      respond(capture.id, { ok: true, blob, mimeType: blob.type, size: blob.size });
    } catch {
      capture.running = false;
    }
  }

  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;

  HTMLMediaElement.prototype.play = function patchedPlay() {
    captureUrl(this.currentSrc || this.src);

    if (suppressionActive()) {
      silenceMedia(this);
      return Promise.resolve();
    }
    return originalPlay.apply(this, arguments);
  };

  try {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (descriptor?.get && descriptor?.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          if (suppressionActive()) silenceMedia(this);
          captureUrl(value);
          return descriptor.set.call(this, value);
        }
      });
    }
  } catch {
    // play() remains the primary capture point.
  }

  try {
    const OriginalAudio = window.Audio;
    function PatchedAudio(source) {
      const media = new OriginalAudio();
      if (suppressionActive()) silenceMedia(media);
      if (arguments.length) media.src = source;
      captureUrl(media.currentSrc || media.src || source);
      return media;
    }
    PatchedAudio.prototype = OriginalAudio.prototype;
    Object.setPrototypeOf(PatchedAudio, OriginalAudio);
    window.Audio = PatchedAudio;
  } catch {
    // play() remains the primary capture point.
  }

  document.addEventListener(
    "play",
    (event) => {
      if (suppressionActive()) silenceMedia(event.target);
    },
    true
  );

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data?.[REQUEST_MARKER]) return;

    const { id, action } = event.data;
    if (action === "ping") {
      respond(id, { ok: true });
      return;
    }
    if (action === "arm") {
      stopSuppressedMedia();
      capture = { id, done: false, running: false };
      suppressUntil = Date.now() + Math.min(Number(event.data.ms) || 30000, 40000);
      return;
    }
    if (action === "disarm") {
      suppressUntil = 0;
      capture = null;
      stopSuppressedMedia();
      respond(id, { ok: true });
    }
  });
})();
