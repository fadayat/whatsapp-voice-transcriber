# Voice Note Transcriber

A privacy-conscious Brave/Chromium extension that adds an on-demand transcript
action to WhatsApp Web voice messages. It supports automatic language detection
and uses Groq's `whisper-large-v3` model through a local-only Node.js helper.

🌐 **Website & Interactive Demo:** [whatsapp-voice-transcriber-website.vercel.app](https://whatsapp-voice-transcriber-website.vercel.app)

> This project is not affiliated with, endorsed by, or sponsored by WhatsApp,
> Meta, Brave, or Groq.

## Why this project exists

Voice messages are inconvenient when listening is not possible. **Voice Note Transcriber**
lets the user request a transcript for one selected message without scanning the
conversation or automatically processing other audio.

## Features

- Adds a **Transcript** action to detected WhatsApp Web voice messages.
- Captures only the voice message explicitly selected by the user.
- Suppresses audible playback while WhatsApp prepares the selected audio.
- Shows the transcript inline with **Refresh** and **Copy** actions.
- Keeps the Groq API key outside the browser extension.
- Holds audio and transcripts in memory; the local server does not save them.
- Supports WhatsApp OGG/Opus, WebM, WAV, MP3, M4A, and FLAC audio.
- Includes light/dark UI, error states, accessibility labels, and regression tests.

## Architecture and data flow

```text
User selects Transcript
        |
WhatsApp prepares that one voice message
        |
Brave extension captures the in-memory audio
        |
Local proxy at 127.0.0.1:4318
        |
Groq Speech-to-Text
        |
Inline transcript in the same message bubble
```

The extension has access only to `https://web.whatsapp.com/*` and the local
helper. With **Remember on this device** enabled, the Groq key is stored in the
native OS credential vault. It never enters WhatsApp Web, extension storage, or
the repository. There is no plaintext storage fallback.

## Privacy model

- No automatic or bulk transcription.
- No chat scraping or text-message collection.
- No audio, transcript, contact, or credential logging.
- No analytics or telemetry.
- Only a user-selected voice message is sent to Groq.

For private messages, enable **Zero Data Retention** in Groq Console before use.
Groq is still a third-party processor: review its current data terms and decide
whether cloud transcription is appropriate for your conversations.

See [Privacy and release plan](docs/PRIVACY_AND_RELEASE.md) for the additional
work required before a browser-store release.

## Requirements

- Brave or another Chromium browser with unpacked-extension support
- Node.js 22 or newer
- A Groq API key from <https://console.groq.com/keys>

## Local installation

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/YOUR_USERNAME/whatsapp-voice-transcriber.git
   cd whatsapp-voice-transcriber
   ```

2. Install the single credential-storage dependency:

   ```bash
   npm install
   ```

3. Start the local helper:

   ```bash
   npm start
   ```

4. Open `brave://extensions`, enable **Developer mode**, select **Load
   unpacked**, and choose the repository's `extension/` directory.

5. Open the extension popup and select **Open secure setup**. Paste your Groq
   key, leave **Remember on this device** enabled, and select **Save and test
   key**. The key is verified with Groq before it is saved to the OS credential
   vault.

6. Open or reload <https://web.whatsapp.com/>.

If Brave is installed through Flatpak and cannot read the extension directory:

```bash
flatpak override --user \
  --filesystem=/absolute/path/to/whatsapp-voice-transcriber/extension:ro \
  com.brave.Browser
```

## Usage

Open a chat containing a voice message and select **Transcript**. WhatsApp may
mark the message as played because it must prepare and decrypt the audio, but
the extension suppresses audible playback. The transcript appears below the
voice message.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | none | Optional environment fallback for headless systems. |
| `GROQ_MODEL` | `whisper-large-v3` | Accuracy-first transcription model. |
| `TRANSCRIPTION_LANGUAGE` | empty | Empty enables automatic language detection. |
| `HOST` | `127.0.0.1` | Local bind address. Do not expose it publicly. |
| `PORT` | `4318` | Must match the URL in `extension/background.js`. |

## Development and verification

```bash
npm test
npm run check
npm run test:ui
```

The test suite covers request validation, origin restrictions, provider error
handling, recycled WhatsApp rows, real-style detached audio capture, silent
playback, dark mode, and message-time layout.

## Security

- Never commit `.env`, `.env.save`, API keys, tokens, private audio, transcripts,
  or real chat screenshots.
- The server intentionally binds to `127.0.0.1` only.
- Remembered keys use macOS Keychain, Windows Credential Manager, or Linux
  Secret Service through `just-secrets`. Storage fails closed when the native
  vault is unavailable; the app does not fall back to a plaintext key file.
- The setup API uses a per-process CSRF token, strict origin checks, no-store
  responses, and a restrictive Content Security Policy.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

### Linux credential vault

Desktop Linux needs `secret-tool` and an unlocked Secret Service provider such
as GNOME Keyring or KWallet:

```bash
# Fedora
sudo dnf install libsecret

# Debian / Ubuntu
sudo apt install libsecret-tools gnome-keyring
```

If the vault is unavailable, uncheck **Remember on this device** to use the key
for the current server session only, or use `GROQ_API_KEY` in a local `.env`
file that remains ignored by Git.

## Current limitations

- WhatsApp Web has no public extension API. A future UI update may require
  selector maintenance.
- Installation currently requires a local Node.js helper and the user's own
  Groq key.
- Language detection is automatic by default; users can pin a language in setup.
- This repository is a developer preview, not a Chrome Web Store release.

## Roadmap

- Optional fully local Whisper transcription mode
- Reliable user-level local proxy startup
- Chrome Web Store-ready authentication, consent, quotas, and privacy policy
- Android share-target application

## License

MIT License. See [LICENSE](LICENSE).

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request.
