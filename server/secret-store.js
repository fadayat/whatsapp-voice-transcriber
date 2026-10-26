"use strict";

const SERVICE = "com.voice-note-transcriber.local";
const ACCOUNT = "groq-api-key";

async function createSecretStore() {
  const { secrets } = await import("just-secrets");
  return Object.freeze({
    get: () => secrets.get(SERVICE, ACCOUNT),
    set: (value) => secrets.set(SERVICE, ACCOUNT, value),
    delete: () => secrets.delete(SERVICE, ACCOUNT)
  });
}

module.exports = { createSecretStore };
