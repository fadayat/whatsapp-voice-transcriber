"use strict";

const { createApp } = require("./app");
const { getConfig, loadDotEnv } = require("./config");
const { createSecretStore } = require("./secret-store");

async function main() {
  loadDotEnv();
  const config = getConfig();
  let secretStore = null;

  try {
    secretStore = await createSecretStore();
    if (!config.apiKey) {
      config.apiKey = (await secretStore.get()) || "";
      if (config.apiKey) config.keySource = "keychain";
    }
  } catch {
    secretStore = null;
  }

  const server = createApp(config, { secretStore });

  server.listen(config.port, config.host, () => {
    const baseUrl = `http://${config.host}:${config.port}`;
    const keyStatus = config.apiKey ? "ready" : `setup required at ${baseUrl}/setup`;
    console.log(`Voice Note Transcriber: ${baseUrl} (${keyStatus})`);
  });

  server.on("error", (error) => {
    console.error(`The local server could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

main().catch(() => {
  console.error("The local server could not start.");
  process.exitCode = 1;
});
