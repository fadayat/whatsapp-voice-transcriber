"use strict";

const form = document.querySelector("#setup-form");
const apiKey = document.querySelector("#api-key");
const language = document.querySelector("#language");
const remember = document.querySelector("#remember");
const rememberDetail = document.querySelector("#remember-detail");
const reveal = document.querySelector("#reveal-key");
const save = document.querySelector("#save");
const forget = document.querySelector("#forget");
const status = document.querySelector("#status");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");

let setupToken = "";

function showStatus(state, title, detail) {
  status.dataset.state = state;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function setBusy(busy) {
  document.body.dataset.busy = String(busy);
  save.disabled = busy;
  forget.disabled = busy;
  apiKey.disabled = busy;
  language.disabled = busy;
  remember.disabled = busy || remember.dataset.available === "false";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadSetup() {
  try {
    const response = await fetch("/setup/bootstrap", { cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok || !data?.setupToken) throw new Error();
    setupToken = data.setupToken;
    language.value = data.language || "auto";
    remember.dataset.available = String(Boolean(data.canRemember));
    remember.disabled = !data.canRemember;
    if (!data.canRemember) {
      remember.checked = false;
      rememberDetail.textContent = "OS credential storage is unavailable. Session-only mode is still available.";
    }
    forget.hidden = !data.configured || data.storage === "environment";
    if (data.configured) {
      const locations = {
        environment: "environment variable",
        keychain: "OS credential vault",
        session: "current session"
      };
      const location = locations[data.storage] || "local helper";
      showStatus("ready", "Ready to transcribe", `Groq · ${data.model} · ${location}`);
    } else {
      showStatus("warning", "Groq key required", "Enter a key below. It will be verified before use.");
    }
  } catch {
    showStatus("error", "Local setup is unavailable", "Restart the local server and reload this page.");
    setBusy(true);
  }
}

reveal.addEventListener("click", () => {
  const showing = apiKey.type === "text";
  apiKey.type = showing ? "password" : "text";
  reveal.textContent = showing ? "Show" : "Hide";
  reveal.setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!apiKey.value.trim()) {
    showStatus("error", "API key required", "Paste a Groq API key beginning with gsk_.");
    apiKey.focus();
    return;
  }

  setBusy(true);
  showStatus("loading", "Testing the key…", "A credential-only request is being sent to Groq.");
  try {
    const response = await fetch("/v1/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Setup-Token": setupToken
      },
      body: JSON.stringify({
        apiKey: apiKey.value,
        language: language.value,
        remember: remember.checked
      })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error?.message || "The key could not be saved.");
    apiKey.value = "";
    apiKey.type = "password";
    reveal.textContent = "Show";
    forget.hidden = false;
    const location = data.storage === "keychain" ? "Saved in the OS credential vault." : "Available for this server session.";
    showStatus("ready", "Ready to transcribe", location);
  } catch (error) {
    showStatus("error", "Setup failed", error.message);
  } finally {
    setBusy(false);
  }
});

forget.addEventListener("click", async () => {
  setBusy(true);
  showStatus("loading", "Removing the saved key…", "The credential value will not be displayed.");
  try {
    const response = await fetch("/v1/setup/clear", {
      method: "POST",
      headers: { "X-Setup-Token": setupToken }
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error?.message || "The key could not be removed.");
    forget.hidden = true;
    showStatus("warning", "Groq key removed", "Enter another key to continue.");
  } catch (error) {
    showStatus("error", "Could not remove the key", error.message);
  } finally {
    setBusy(false);
  }
});

loadSetup();
