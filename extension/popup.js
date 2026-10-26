"use strict";

const section = document.querySelector(".status");
const title = document.querySelector("#status-title");
const detail = document.querySelector("#status-detail");
const refresh = document.querySelector("#refresh");
const setup = document.querySelector("#setup");

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

async function checkHealth() {
  section.dataset.state = "loading";
  title.textContent = "Checking local helper…";
  detail.textContent = "Nothing has been sent.";
  refresh.disabled = true;

  try {
    const response = await sendMessage({ type: "GET_HEALTH" });
    if (!response?.ok) throw new Error(response?.error);

    if (!response.data.configured) {
      section.dataset.state = "warning";
      title.textContent = "Groq key required";
      detail.textContent = "Open secure setup to connect your key.";
      setup.textContent = "Open secure setup";
      return;
    }

    section.dataset.state = "ready";
    title.textContent = "Ready to transcribe";
    const language = response.data.language === "auto" ? "Auto-detect" : response.data.language.toUpperCase();
    detail.textContent = `Groq · ${response.data.model} · ${language}`;
    setup.textContent = "Open settings";
  } catch {
    section.dataset.state = "error";
    title.textContent = "Local helper is not running";
    detail.textContent = "Run npm start, then check again.";
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", checkHealth);
setup.addEventListener("click", async () => {
  setup.disabled = true;
  try {
    const response = await sendMessage({ type: "OPEN_SETUP" });
    if (!response?.ok) throw new Error();
  } finally {
    setup.disabled = false;
  }
});
checkHealth();
