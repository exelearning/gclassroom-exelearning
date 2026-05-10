# gclassroom-exelearning

A Google Classroom add-on that lets teachers attach eXeLearning `.elpx`
resources to Classroom assignments as **graded activities**. Students complete
the activity in an embedded iframe; SCORM data is captured by an in-browser
runtime adapter, persisted server-side, and the score is passed back to
Classroom as `pointsEarned` — automatically when teacher offline credentials
are stored, or on demand when the teacher opens Student Work Review.

> Sister project to [`gdrive-exelearning`](../gdrive-exelearning).
> Where `gdrive-exelearning` *edits* `.elpx` files in Drive,
> `gclassroom-exelearning` *delivers* them in Classroom and tracks completion.
> The two projects share architectural ideas but stay independent so that
> Classroom-specific concerns (grade passback, add-on attachments, teacher
> credentials) don't bleed into the editor.

## Why a backend is required

The Google Classroom add-on grade passback API requires a `PATCH` to:

```
/v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments/{attachmentId}/studentSubmissions/{submissionId}?updateMask=pointsEarned
```

with **teacher credentials**, against an attachment **created by this add-on**
with **positive `maxPoints`**. Those constraints rule out doing grade passback
from the student's browser. To implement automatic grading the project ships
a small Cloudflare Worker that:

- securely stores the teacher's encrypted OAuth refresh token (AES-GCM at rest);
- recomputes scores from raw SCORM data so a tampered browser cannot inflate
  `pointsEarned`;
- calls the Classroom API on the teacher's behalf when a student submits.

Teachers who don't enable automatic grading can still sync grades manually
from the Student Work Review iframe (Mode B).

## Repository layout

```
gclassroom-exelearning/
├── apps/
│   ├── web/         Vite + TypeScript frontend (the iframe pages + viewer)
│   └── worker/      Cloudflare Worker backend (D1 + grade passback)
├── docs/            Setup, security and grading model
└── .github/
    └── workflows/   GitHub Pages + Cloudflare Workers deploy
```

## How `.elpx` rendering works

`.elpx` is a ZIP archive that contains an `index.html` plus `html/`, `theme/`,
`idevices/`, etc. To render it inside the Classroom iframe with relative URLs
intact, we register a Service Worker scoped to `<base>/elpx-runtime/`. Each
opened activity gets a `sessionId` namespace and is served at
`/elpx-runtime/{sessionId}/<asset>`. The iframe is sandboxed
(`allow-scripts allow-same-origin allow-popups`), and a small SCORM bridge
script is injected into `index.html` so eXeLearning content sees the
adapters as `window.API` (SCORM 1.2) and `window.API_1484_11` (SCORM 2004)
synchronously on first paint. See [`docs/scorm-runtime.md`](docs/scorm-runtime.md).

## How SCORM capture works

Two adapters live in `apps/web/src/scorm/`. They:

- maintain a flat `cmi.*` key/value bag,
- enforce SCORM error-code semantics (Initialize/Terminate, error 122/301, …),
- emit an event log of every `LMSSetValue` / `SetValue` call,
- call back on `Commit` / `Terminate` to persist the attempt.

Score normalization (`normalizeScormScore`) turns the bag into
`pointsEarned`/`maxPoints` via the rules documented in
[`docs/grading-model.md`](docs/grading-model.md): scaled → raw with min/max →
raw on a 0..100 scale → completion-only fallback.

## Quick start

```bash
# Install workspace dependencies
npm install

# Frontend dev server (Vite, http://localhost:5173/gclassroom-exelearning/)
npm --workspace apps/web run dev

# Backend dev (Wrangler, http://localhost:8787)
npm --workspace apps/worker run dev

# Tests
npm test
```

Configure environment values from [`.env.example`](.env.example). For the
backend, set Wrangler secrets:

```bash
wrangler secret put GOOGLE_OAUTH_CLIENT_ID
wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
wrangler secret put TOKEN_VAULT_KEY  # `openssl rand -base64 32`
```

## Deploying

Frontend lands on GitHub Pages at
<https://exelearning.github.io/gclassroom-exelearning/>. The worker deploys via
`wrangler deploy`. See [`.github/workflows/`](.github/workflows/) and
[`docs/google-cloud-setup.md`](docs/google-cloud-setup.md).

## Documentation

- [docs/google-cloud-setup.md](docs/google-cloud-setup.md) — OAuth client, scopes, API enablement
- [docs/marketplace-setup.md](docs/marketplace-setup.md) — Google Workspace Marketplace listing
- [docs/classroom-addon-setup.md](docs/classroom-addon-setup.md) — Iframe URLs, attachment fields, IDs
- [docs/scorm-runtime.md](docs/scorm-runtime.md) — How the SCORM bridge is wired
- [docs/grading-model.md](docs/grading-model.md) — Score normalization & passback modes
- [docs/security.md](docs/security.md) — Threat model, refresh-token handling, sandboxing

## Known limitations

- Google Classroom is not a SCORM LMS. Grade passback is the only score
  surface; a single attachment per assignment should drive `pointsEarned`.
- Not all eXeLearning iDevices emit SCORM data. Activities that only emit
  `lesson_status` get a pass/fail-shaped grade; activities that don't emit
  at all are tracked as "complete" but cannot produce a numeric score.
- Automatic grade passback requires the teacher to grant offline access. Without
  it, grades sync only when the teacher opens Student Work Review.
- Classroom add-ons require Google Workspace Marketplace publication and admin
  allowlisting. Until that is in place teachers can use the link fallback under
  `/publish` (no automatic grading).

## License

[AGPL-3.0-or-later](LICENSE).
