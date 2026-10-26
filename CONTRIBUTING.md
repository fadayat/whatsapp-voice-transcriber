# Contributing

Thanks for helping improve Voice Note Transcriber.

## Safety first

Never include API keys, `.env` files, WhatsApp sessions, contact details, real
voice notes, transcripts, or real-chat screenshots in an issue, commit, test,
or pull request. Use the synthetic fixture in `test/ui_fixture.html` when visual
evidence is needed.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public technical report.

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-voice-transcriber.git
cd whatsapp-voice-transcriber
npm install
npm test
npm run check
npm run test:ui
```

The automated tests do not need a real Groq key or WhatsApp account.

## Pull requests

1. Keep the extension's purpose limited to user-triggered voice-note
   transcription.
2. Preserve the local-only helper and minimum-data privacy model.
3. Add or update tests for behavior changes.
4. Run `npm run verify` before committing.
5. Explain user-visible behavior, privacy impact, and verification in the pull
   request description.

Avoid new permissions and dependencies unless the pull request explains why
they are necessary and documents their security impact.
