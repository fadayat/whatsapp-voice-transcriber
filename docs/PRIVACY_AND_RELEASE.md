# Privacy and release plan

This document describes the current personal MVP and the minimum changes required
before public distribution. It is an engineering plan, not legal advice.

## Current personal MVP

### Data flow

1. The extension runs only on `https://web.whatsapp.com/`.
2. It adds a visible **Transcript** action to detected voice-message elements.
3. No audio is read until the user selects that action.
4. The selected audio is held in memory and sent to a server bound to
   `127.0.0.1`.
5. The local server sends the audio to Groq Speech-to-Text over HTTPS.
6. The returned text is displayed in the current page.
7. The local server does not write the audio or transcript to disk and does not
   log their content.

The Groq account should have Zero Data Retention enabled under Data Controls.
Groq still retains non-content usage metadata. Its current policy and account
settings must be reviewed again before public release.

### Current access

The extension has no `tabs`, browsing-history, notification, clipboard-read, or
WhatsApp authentication permissions. It receives access only to WhatsApp Web and
the loopback server. Copying a transcript is a direct user action.

## Public browser extension gate

Do not publish the personal build as-is. A store build needs:

- an HTTPS backend with the provider key held only on the server;
- authentication, per-user quotas, abuse prevention, and spend limits;
- explicit disclosure that selected voice recordings are sent to Groq;
- a public privacy policy describing collection, processing, sharing, retention,
  deletion, security, and a privacy contact;
- a Chrome Web Store privacy-practices declaration and Limited Use statement;
- a deletion mechanism for account data and any operational records;
- encrypted transport and a documented no-content-logging rule;
- a security review covering upload validation, rate limiting, authentication,
  dependency risks, and backend isolation;
- store assets and wording that do not imply affiliation with or endorsement by
  WhatsApp or Meta;
- a review of WhatsApp, Groq, Chrome Web Store, and applicable privacy terms at
  the time of release.

The extension should keep a single purpose: user-triggered transcription of a
selected voice message. Analytics, advertising, background chat collection, and
unrelated permissions should remain out of scope.

## Android release gate

The Android app should use the system share sheet:

1. The user selects a voice message in WhatsApp.
2. The user shares it to **Voice Note Transcriber**.
3. The app displays the transcript and optional user-requested actions.

Do not use Accessibility Service, notification scraping, or background file
scanning to collect messages. Those approaches add privacy, reliability, and
Google Play policy risk.

Before Google Play release, complete the Data Safety form for voice recordings,
other audio files, messages where applicable, account identifiers, diagnostics,
and every third-party SDK. Add an in-app privacy policy, consent disclosure,
account deletion flow if accounts exist, and encrypted transport.

## Product durability

WhatsApp may add Azerbaijani transcription. The product should therefore compete
on more than raw speech-to-text. Possible user-requested capabilities include:

- searchable personal transcript history with an opt-in local-only mode;
- summaries for long messages;
- action-item and date extraction;
- multilingual and code-switched transcription;
- custom vocabulary for Azerbaijani names and professional terms;
- reply drafting that runs only after an explicit user action;
- on-device transcription for users who do not want cloud processing.

Each capability must preserve the same user-triggered and minimum-data design.
