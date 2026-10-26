"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const forbiddenPaths = new Set([".env", ".env.save", "AGENTS.md", "HANDOFF.md"]);
const patterns = [
  ["Groq API key", /gsk_[A-Za-z0-9_-]{20,}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/g],
  ["GitHub token", /gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}/g],
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["non-empty Groq env value", /^GROQ_API_KEY\s*=\s*[^\s#].+$/gm]
];

function listPublicFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8"
    }).split("\0").filter(Boolean);
  } catch {
    throw new Error("Initialize the Git repository before running the public snapshot check.");
  }
}

const files = listPublicFiles();
const findings = [];

for (const relative of files) {
  const normalized = relative.replaceAll("\\", "/");
  if (forbiddenPaths.has(normalized)) {
    findings.push(`${normalized}: forbidden private path`);
    continue;
  }
  if (/\.(?:png|jpe?g|webp)$/i.test(normalized) && !normalized.startsWith("docs/assets/")) {
    findings.push(`${normalized}: image outside reviewed docs/assets`);
    continue;
  }

  const absolute = path.join(root, relative);
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
  const bytes = fs.readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${normalized}: ${name}`);
  }
}

if (findings.length) {
  console.error("Public snapshot check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Public snapshot check passed (${files.length} files).`);
}
