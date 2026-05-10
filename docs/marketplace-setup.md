# Google Workspace Marketplace setup

Classroom add-ons must be distributed through the Google Workspace Marketplace.
Even private/domain-scoped distribution still goes through a Marketplace
listing — there is no way to bypass it for production.

## 1. Marketplace SDK

In your Cloud project, **APIs & Services → Library → Google Workspace Marketplace SDK**
→ Enable. Then **Configuration**:

- **App name**: *gclassroom-exelearning*.
- **Application URL**: `https://exelearning.github.io/gclassroom-exelearning/`.
- **Setup URL**: same as application URL.
- **Categories**: *Education*, *Productivity*.
- **Icon**: upload PNGs at the required sizes (32×32, 64×64, 96×96, 128×128).
- **Screenshots**: at least 1 image at 1280×800 (the discovery iframe is a
  good candidate).
- **Universal navigation**: not used.

## 2. OAuth scopes

Declare the same scopes as in `google-cloud-setup.md` here. The Marketplace
review process flags any scope mismatch between OAuth consent and Marketplace
listing.

## 3. Classroom add-on configuration

Under **Configuration → Visibility**, choose:

- **Public** — visible in the public Marketplace; requires a third-party
  security assessment for sensitive scopes.
- **Private** — only installable inside your domain; faster, suitable for
  pilots.

Configure the **Classroom add-on**:

- **Add-on URI**: `https://exelearning.github.io/gclassroom-exelearning/addon/discovery`
- **Allowed attachment URI prefix**: `https://exelearning.github.io/gclassroom-exelearning/`
- **Default content URLs**:
  - Teacher view URI prefix: `https://exelearning.github.io/gclassroom-exelearning/addon/teacher`
  - Student view URI prefix: `https://exelearning.github.io/gclassroom-exelearning/addon/student`
  - Student work review URI prefix: `https://exelearning.github.io/gclassroom-exelearning/addon/review`
- **Logo**: same icon as Marketplace listing.
- **Login hint**: enabled — Classroom passes `login_hint` so we can pre-fill
  the GIS sign-in.
- **Hosted domain**: enabled.

## 4. Domain allowlisting

A Workspace admin must allowlist the add-on for their domain before teachers
can use it:

- Admin Console → **Apps → Google Workspace Marketplace apps** → *Add app*
- Find *gclassroom-exelearning* and *Allow users to install*.

Until this is done, attachment creation for that domain returns a permission
error; users fall back to `/publish` link mode.

## 5. Verification

Public visibility plus sensitive scopes (Classroom + Drive) requires:

- A privacy policy URL (host one alongside `docs/security.md`).
- A terms-of-service URL.
- Possibly a third-party CASA security assessment. Plan for this — it can
  take 6–12 weeks.

For the eXeLearning project this is typically done as part of the foundation's
publication workflow.
