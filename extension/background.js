"use strict";

const SERVER_BASE_URL = "http://127.0.0.1:4318";

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getHealth() {
  const response = await fetch(`${SERVER_BASE_URL}/health`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(3_000)
  });
  const body = await readJson(response);
  if (!response.ok || !body) throw new Error("The local server did not respond.");
  return body;
}

async function transcribe(payload) {
  const response = await fetch(`${SERVER_BASE_URL}/v1/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000)
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.error?.message || "Transcription failed.");
  }
  return body;
}

async function openSetup() {
  await chrome.tabs.create({ url: `${SERVER_BASE_URL}/setup` });
  return { opened: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  const task =
    message.type === "GET_HEALTH"
      ? getHealth()
      : message.type === "TRANSCRIBE_AUDIO"
        ? transcribe(message.payload)
        : message.type === "OPEN_SETUP"
          ? openSetup()
        : null;

  if (!task) return false;

  task
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      const messageText =
        error?.name === "TimeoutError"
          ? "The local server timed out."
          : error?.message || "Could not connect to the local server.";
      sendResponse({ ok: false, error: messageText });
    });
  return true;
});
