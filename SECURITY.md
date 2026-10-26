# Security policy

## Supported version

Security fixes currently target the latest commit on the default branch.

## Reporting a vulnerability

Do not open a public issue containing an API key, private audio, a transcript,
chat content, contact details, or exploit instructions that expose user data.

Use GitHub's private vulnerability reporting feature when it is enabled for the
repository. If it is unavailable, open a public issue containing only a request
for a private contact channel and no sensitive technical details.

## Credential exposure

If a credential is exposed, revoke it at the provider immediately. Removing a
secret from the latest commit is not sufficient because Git history and forks
may retain it.

The project never needs a contributor's real `.env` file, Groq key, WhatsApp
session, private voice message, or real-chat screenshot for bug reports.
