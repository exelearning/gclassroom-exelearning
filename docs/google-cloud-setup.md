# Google Cloud setup

This project needs a Google Cloud project with three APIs enabled and one OAuth
client. Once that is done, copy the client id into `VITE_GOOGLE_CLIENT_ID` and
the client secret into the worker's `GOOGLE_OAUTH_CLIENT_SECRET` secret.

## 1. Create a project

1. <https://console.cloud.google.com/projectcreate>
2. Pick a project id like `gclassroom-exelearning-prod`.

## 2. Enable APIs

Under **APIs & Services → Library** enable:

- **Google Classroom API**
- **Google Drive API**
- **Google Picker API**

## 3. OAuth consent screen

Under **APIs & Services → OAuth consent screen**:

- User type: **Internal** while testing within your own domain;
  **External** for general distribution (requires verification + Marketplace).
- App name: *gclassroom-exelearning*.
- App logo: 120×120 PNG; the eXeLearning lozenge works.
- Support email: a real address you can answer.
- Authorized domains: the GitHub Pages domain (`exelearning.github.io`) and
  any custom domains you serve from.
- Scopes: add the minimal set requested by the app

  ```
  openid
  email
  profile
  https://www.googleapis.com/auth/drive.file
  https://www.googleapis.com/auth/drive.readonly
  https://www.googleapis.com/auth/classroom.addons.teacher
  https://www.googleapis.com/auth/classroom.addons.student
  https://www.googleapis.com/auth/classroom.coursework.students
  https://www.googleapis.com/auth/classroom.courses.readonly
  ```

`drive.readonly` is only needed if you want teachers to attach `.elpx` files
they did not create through the app. Skip it if `drive.file` is enough.

## 4. OAuth 2.0 Client ID

Under **APIs & Services → Credentials → Create Credentials → OAuth client ID**:

- Type: **Web application**
- Name: *gclassroom-exelearning web*
- **Authorized JavaScript origins**:
  - `http://localhost:5173`
  - `https://exelearning.github.io`
  - any custom origin
- **Authorized redirect URIs** (only used if/when you exchange authorization
  codes server-side):
  - `https://<your-worker>.workers.dev/api/auth/callback`

Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID` and the **Client secret**
into the worker via `wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET`.

## 5. Drive Picker API key

Under **Credentials → Create Credentials → API key**, restrict the key to
*HTTP referrers* matching your origins, and to the *Picker API* under
*API restrictions*. Copy into `VITE_GOOGLE_API_KEY`. Take the project number
from the project dashboard and put it in `VITE_GOOGLE_PICKER_APP_ID`.

## 6. Token vault key

The worker encrypts teacher refresh tokens at rest. Generate a 32-byte key:

```bash
openssl rand -base64 32 | tr -d '\n' | wrangler secret put TOKEN_VAULT_KEY
```

Rotate it on a published cadence (quarterly is reasonable). After rotation,
re-encrypt existing rows in a maintenance window.

## 7. Add-on identifiers

Add-ons are identified by:

- **Project number** — from your Cloud project dashboard.
- **Verified domain** — must match the iframe `origin`. GitHub Pages projects
  hosted under `exelearning.github.io` count as the *exelearning.github.io*
  domain.

You'll need both during the Marketplace listing in
[`marketplace-setup.md`](marketplace-setup.md).
