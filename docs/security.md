# Security model

## Threat model

- **Score tampering** — A student could modify the SCORM data their browser
  submits. The backend recomputes `pointsEarned` from the raw `scormData`
  before any Classroom write, so the worst a tampered client can do is push
  a higher *raw* SCORM value that *the worker* then accepts (e.g. fake
  `cmi.score.raw=100`). We accept this trade-off — defending against it would
  require a closed SCORM runtime and is incompatible with eXeLearning content.
  Teachers can review raw SCORM data and override scores in the review iframe.
- **Token exfiltration** — Refresh tokens never leave the worker. Access
  tokens live in memory in the browser and are passed via `Authorization`
  header — never `localStorage`.
- **Cross-origin attachment injection** — The Classroom add-on iframes only
  load URLs whose prefix matches what we register in the Marketplace SDK.
  We additionally restrict the SW scope to `/elpx-runtime/`.
- **`.elpx` content executing privileged code** — Activity HTML runs in a
  sandboxed iframe (`allow-scripts allow-same-origin allow-popups`). We do
  not pass cookies or storage. The bridge script gives content access only
  to the SCORM adapter; it cannot reach the rest of the parent page.

## Refresh token handling

- Stored encrypted with AES-GCM (256-bit) using `TOKEN_VAULT_KEY`.
- Generated key entropy: 32 bytes from a CSPRNG (`openssl rand -base64 32`).
- IV is fresh per encryption (12 bytes), prepended to the ciphertext.
- The worker never returns refresh tokens to the frontend (no API surface
  exposes them; the only writer is `/api/auth/exchange`).
- Rotation: replace the secret and re-encrypt rows during a maintenance
  window. The vault module is a thin wrapper, so rotation is a script away.

## Access token handling

- Frontend obtains access tokens via Google Identity Services in memory only.
- Tokens are not stored to `localStorage`/`sessionStorage`.
- Backend validates incoming Bearer tokens via Google's `userinfo` endpoint
  and binds the resulting `sub` to the request user.
- Tokens have ~1 hour TTL; on expiry, the frontend re-prompts (silently if
  scopes already granted, or interactively if revoked).

## CORS

The worker accepts only origins listed in `ALLOWED_FRONTEND_ORIGINS`
(comma-separated). Default config:

```
http://localhost:5173,https://exelearning.github.io
```

Add custom domains as needed; never use `*` for CORS in production.

## CSP

`apps/web/index.html` sets a Content-Security-Policy that restricts:

- `default-src` to `self` plus Google's identity / API hosts;
- `frame-src` to Google's docs/drive/accounts hosts;
- `script-src` to `self` plus GIS + the Picker;
- `worker-src` to `self` + `blob:` (for the elpx-runtime SW + content blobs).

Inline `<script>` tags inside the .elpx are isolated by the iframe sandbox;
they do not break the parent CSP because the iframe loads at the same
origin but is sandboxed.

## Data retention

- `users` rows persist until the teacher revokes the app via Google
  Account → Permissions or via the `/api/auth/revoke` endpoint (TBD).
- `attempts` rows persist until the attachment is deleted (cascade).
- `attachments` rows are kept for the life of the Classroom item.

A future `DELETE /api/users/me` endpoint should remove all rows owned by the
caller and revoke their refresh token. Track that as a privacy follow-up.

## Audit logging

Each attempt stores its full SCORM event log (capped at 5000 events) and the
raw CMI bag. Teachers can inspect both from the review iframe; admins can
query D1 directly with `wrangler d1 execute`.

## Reporting vulnerabilities

Open a private security advisory at
<https://github.com/exelearning/gclassroom-exelearning/security/advisories>
or email `security@exelearning.net`. Do not file issues for vulnerabilities
in the public tracker.
