# Publishing and sharing guide

This checklist prepares a public GitHub release without exposing local secrets
or private WhatsApp data.

## Before the first push

1. Revoke every API key that has appeared in chat, screenshots, terminal output,
   or another untrusted place.
2. Confirm that `.env`, `.env.save`, `AGENTS.md`, and `HANDOFF.md` are ignored:

   ```bash
   git check-ignore -v .env .env.save AGENTS.md HANDOFF.md
   ```

3. Run the public-snapshot check and full verification:

   ```bash
   npm run security:check
   npm run verify
   ```

4. Review exactly what will be public:

   ```bash
   git status --short
   git diff --cached --stat
   git ls-files
   ```

## Create the GitHub repository

```bash
gh auth login
gh repo create whatsapp-voice-transcriber \
  --public \
  --source=. \
  --remote=origin \
  --push
```

After the push:

- Add topics: `whatsapp`, `brave-extension`, `chromium-extension`, `groq`,
  `speech-to-text`, `privacy`.
- Enable GitHub private vulnerability reporting.
- Enable secret scanning and push protection when available.
- Keep Actions permissions read-only by default.
- Create a `v0.2.0` release only after CI passes on the public commit.
- Do not upload a ZIP containing `.env`, local logs, browser profiles, or real
  screenshots.

## Safe demo material

Use only the synthetic UI fixture. A real WhatsApp screenshot can expose names,
avatars, message text, timestamps, and social relationships even when the voice
content seems harmless.

## Repository description

> Privacy-conscious WhatsApp Web voice-note transcription with silent playback,
> a local Node.js helper, and OS-native credential storage.

## Short global launch post

> I built Voice Note Transcriber, an open-source Brave/Chromium extension for
> reading selected WhatsApp Web voice notes when listening is inconvenient.
> It processes only the message the user selects, suppresses audible playback,
> keeps the Groq key in the OS credential vault, and does not save audio or
> transcripts locally. The project includes automated privacy, UI, and security
> regression tests. Feedback and contributions are welcome.

Add the repository link only after the public commit and CI run are verified.
