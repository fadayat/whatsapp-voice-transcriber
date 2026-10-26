(function bootstrapTranscriber() {
  "use strict";

  const Core = globalThis.WATranscriberCore;
  const MOUNT_ATTRIBUTE = "data-wa-transcriber";
  const VOICE_SELECTOR = [
    "audio",
    '[data-icon="audio-play"]',
    '[data-icon="audio-pause"]',
    '[data-testid="audio-play"]',
    '[data-testid="audio-pause"]',
    'button[aria-label*="voice" i]',
    'button[aria-label*="audio" i]',
    'button[aria-label*="səsli mesaj" i]',
    'button[aria-label*="sesli mesaj" i]'
  ].join(",");

  let scanTimer = null;
  let pageRequestId = 0;
  const pageRequests = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data?.__wat_audio_response) return;
    const resolve = pageRequests.get(event.data.id);
    if (!resolve) return;
    pageRequests.delete(event.data.id);
    resolve(event.data);
  });

  function requestPageAudio(action, extra = {}, timeout = 5000) {
    return new Promise((resolve) => {
      const id = ++pageRequestId;
      pageRequests.set(id, resolve);
      window.postMessage({ __wat_audio_request: true, id, action, ...extra }, "*");
      window.setTimeout(() => {
        if (!pageRequests.has(id)) return;
        pageRequests.delete(id);
        resolve({ ok: false, error: "timeout" });
      }, timeout);
    });
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function findMessageRoot(marker) {
    const byTestId = marker.closest('[data-testid="msg-container"]');
    if (byTestId) {
      let current = marker.parentElement;
      let surface = null;
      while (current && current !== byTestId) {
        const background = getComputedStyle(current).backgroundColor;
        const width = current.getBoundingClientRect().width;
        if (background !== "rgba(0, 0, 0, 0)" && width >= 180) {
          surface = current;
        }
        current = current.parentElement;
      }
      return surface || byTestId;
    }

    const byId = marker.closest("[data-id]");
    if (byId) return byId;

    let current = marker.parentElement;
    for (let depth = 0; current && depth < 9; depth += 1) {
      if (
        current.matches('[role="row"]') ||
        current.querySelector("[data-pre-plain-text]")
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function hasVoiceMarker(message) {
    if (message.querySelector("video")) return false;
    return [...message.querySelectorAll(VOICE_SELECTOR)].some(
      (marker) => !marker.closest(".wat-mount")
    );
  }

  function createWaveIcon() {
    const icon = document.createElement("span");
    icon.className = "wat-wave";
    icon.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 3; index += 1) {
      icon.appendChild(document.createElement("i"));
    }
    return icon;
  }

  function setButtonState(mount, state, label) {
    const button = mount.querySelector(".wat-action");
    button.dataset.state = state;
    button.disabled = state === "loading";
    button.querySelector(".wat-action-label").textContent = label;
  }

  function showMessage(mount, kind, text) {
    let panel = mount.querySelector(".wat-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "wat-panel";
      mount.appendChild(panel);
    }
    panel.className = `wat-panel wat-panel--${kind}`;
    panel.setAttribute("role", kind === "error" ? "alert" : "status");
    panel.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    panel.removeAttribute("aria-label");
    panel.textContent = text;
  }

  function renderTranscript(message, mount, text) {
    let panel = mount.querySelector(".wat-panel");
    if (!panel) {
      panel = document.createElement("div");
      mount.appendChild(panel);
    }
    panel.className = "wat-panel wat-panel--transcript";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Transcript");
    panel.removeAttribute("aria-live");
    panel.replaceChildren();

    const tools = document.createElement("div");
    tools.className = "wat-panel-tools";

    const label = document.createElement("span");
    label.className = "wat-panel-label";
    label.textContent = "Transcript";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "wat-copy";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", "Copy transcript");

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "wat-refresh";
    refresh.textContent = "Refresh";
    refresh.setAttribute("aria-label", "Refresh transcript");

    const transcript = document.createElement("p");
    transcript.className = "wat-transcript";
    transcript.textContent = text;

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
        copy.setAttribute("aria-label", "Transcript copied");
        window.setTimeout(() => {
          copy.textContent = "Copy";
          copy.setAttribute("aria-label", "Copy transcript");
        }, 1600);
      } catch {
        copy.textContent = "Copy failed";
        copy.setAttribute("aria-label", "Copy failed. Try again");
        window.setTimeout(() => {
          copy.textContent = "Copy";
          copy.setAttribute("aria-label", "Copy transcript");
        }, 2200);
      }
    });

    refresh.addEventListener("click", () => handleTranscribe(message, mount));

    const actions = document.createElement("div");
    actions.className = "wat-panel-actions";
    actions.append(refresh, copy);

    tools.append(label, actions);
    panel.append(tools, transcript);
  }

  function findAudioUrl(message) {
    const audio = message.querySelector("audio");
    if (audio) {
      const source = audio.currentSrc || audio.src || audio.querySelector("source")?.src;
      if (source) return source;
    }
    return "";
  }

  function press(element) {
    const options = { bubbles: true, cancelable: true, composed: true };
    try {
      element.dispatchEvent(new PointerEvent("pointerdown", options));
      element.dispatchEvent(new MouseEvent("mousedown", options));
      element.dispatchEvent(new PointerEvent("pointerup", options));
      element.dispatchEvent(new MouseEvent("mouseup", options));
    } catch {
      // click() remains as a fallback for simpler WhatsApp builds.
    }
    element.click();
  }

  function findTransportButton(message) {
    const buttons = [...message.querySelectorAll("button")].filter(
      (button) => !button.closest(".wat-mount")
    );
    const labeled = buttons.find((button) =>
      /(voice|audio|səsli mesaj|sesli mesaj)/i.test(button.getAttribute("aria-label") || "")
    );
    if (labeled) return labeled;

    const slider = message.querySelector('[role="slider"]');
    if (slider) {
      const beforeSlider = buttons.filter(
        (button) =>
          button.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      if (beforeSlider.length) return beforeSlider.at(-1);
    }

    return buttons.find(
      (button) => !/\d\s*[.,]?\d*\s*[x×]/i.test(button.textContent || "")
    );
  }

  async function captureAudio(message) {
    const hook = await requestPageAudio("ping", {}, 2000);
    if (!hook.ok) {
      throw new Error("Audio capture is not active. Reload WhatsApp Web.");
    }

    const transport = findTransportButton(message);
    if (!transport) throw new Error("The voice note play control was not found.");

    const capture = requestPageAudio("arm", { ms: 35000 }, 30000);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    press(transport);

    try {
      const result = await capture;
      if (!result.ok || !(result.blob instanceof Blob)) {
        throw new Error("WhatsApp did not provide the audio. Try again in a moment.");
      }
      return result.blob;
    } finally {
      await requestPageAudio("disarm", {}, 2000);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The audio could not be read."));
      reader.onload = () => {
        const value = String(reader.result || "");
        const separator = value.indexOf(",");
        if (separator < 0) {
          reject(new Error("The audio format could not be read."));
          return;
        }
        resolve(value.slice(separator + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAudio(message) {
    const url = findAudioUrl(message);
    let blob;
    if (url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error("The audio could not be read from WhatsApp.");
      blob = await response.blob();
    } else {
      blob = await captureAudio(message);
    }
    if (!blob.size) throw new Error("The audio file is empty.");
    if (blob.size > Core.MAX_AUDIO_BYTES) {
      throw new Error(`The audio exceeds the 25 MB limit (${Core.humanBytes(blob.size)}).`);
    }

    const rawType = blob.type || "audio/ogg";
    const mimeType = Core.normalizeMimeType(rawType) || "audio/ogg";
    if (!Core.isSupportedAudio(mimeType)) {
      throw new Error(`Unsupported audio format: ${mimeType}`);
    }

    return { blob, mimeType };
  }

  async function handleTranscribe(message, mount) {
    setButtonState(mount, "loading", "Preparing…");
    showMessage(mount, "progress", "Reading audio…");

    try {
      const { blob, mimeType } = await fetchAudio(message);
      showMessage(mount, "progress", "Transcribing…");
      const audioBase64 = await blobToBase64(blob);
      const response = await sendMessage({
        type: "TRANSCRIBE_AUDIO",
        payload: {
          audioBase64,
          mimeType,
          fileName: Core.makeFileName(mimeType)
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Transcription failed.");
      }
      renderTranscript(message, mount, response.data.text);
      setButtonState(mount, "ready", "Transcript");
    } catch (error) {
      showMessage(mount, "error", error?.message || "Transcription failed.");
      setButtonState(mount, "idle", "Try again");
    }
  }

  function attach(message) {
    if (message.hasAttribute(MOUNT_ATTRIBUTE) || !hasVoiceMarker(message)) return;
    message.setAttribute(MOUNT_ATTRIBUTE, "");

    const mount = document.createElement("div");
    mount.className = "wat-mount";

    const action = document.createElement("button");
    action.type = "button";
    action.className = "wat-action";
    action.dataset.state = "idle";
    action.setAttribute("aria-label", "Transcribe voice note");
    action.appendChild(createWaveIcon());

    const label = document.createElement("span");
    label.className = "wat-action-label";
    label.textContent = "Transcript";
    action.appendChild(label);

    action.addEventListener("click", () => handleTranscribe(message, mount));
    mount.appendChild(action);
    message.appendChild(mount);
  }

  function scan() {
    document.querySelectorAll(`[${MOUNT_ATTRIBUTE}]`).forEach((message) => {
      if (hasVoiceMarker(message)) return;
      message.querySelector(":scope > .wat-mount")?.remove();
      message.removeAttribute(MOUNT_ATTRIBUTE);
    });

    document.querySelectorAll(VOICE_SELECTOR).forEach((marker) => {
      if (marker.closest(".wat-mount")) return;
      const message = findMessageRoot(marker);
      if (message) attach(message);
    });
  }

  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scan();
    }, 180);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
