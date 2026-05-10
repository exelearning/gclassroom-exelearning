# SCORM runtime adapter

This add-on emulates enough of the SCORM 1.2 and SCORM 2004 runtime APIs to
capture grades from eXeLearning activities. It is *not* a full SCORM LMS — for
example, sequencing and navigation are intentionally not implemented.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Student View page                             │
│                                                                  │
│  createScormRuntime() ──► { scorm12, scorm2004 }                 │
│        │                                                         │
│        ▼                                                         │
│  window.__gclassroomScormHost = {                                │
│      sessionId, scorm12, scorm2004                               │
│  }                                                               │
│        │                                                         │
│        ▼                                                         │
│  renderElpx() ──► <iframe src="/elpx-runtime/{sid}/index.html">  │
│                                                                  │
│   ┌─────────────────────────────────────────┐                    │
│   │ Service Worker (public/elpx-runtime/sw.js)                   │
│   │ serves index.html with bridge prepended                      │
│   └─────────────────────────────────────────┘                    │
│        │                                                         │
│        ▼                                                         │
│   <iframe>                                                       │
│     bridge.js sets:                                              │
│       window.API         = parent.__gclassroomScormHost.scorm12  │
│       window.API_1484_11 = parent.__gclassroomScormHost.scorm2004│
│                                                                  │
│     eXeLearning content runs and calls LMSSetValue / SetValue    │
└─────────────────────────────────────────────────────────────────┘
```

The bridge is **same-origin** (the SW serves on the same origin as the parent
page) so the iframe can read `window.parent.__gclassroomScormHost` directly
and synchronous SCORM calls work without postMessage round-trips.

## Why a service worker?

Two reasons:

1. **Relative URLs** inside `index.html` (`<img src="img/foo.png">`,
   `<link href="theme/style.css">`, `window.location.pathname`-based
   navigation) only work if assets are served at real URLs. Blob URLs lose
   the relationship between resources.
2. **Same-origin** for SCORM. A blob URL has an opaque origin; the iframe
   cannot access `window.parent` properties.

## Session lifecycle

- `loadElpx(bytes)` extracts the ZIP into a `Map<path, Uint8Array>` and mints
  a `sessionId` (UUID).
- `registerElpxSession(loaded)` posts `SET_SESSION` to the SW with the file
  map and the bridge-injected `index.html`.
- `clearElpxSession(sessionId)` posts `CLEAR_SESSION`. The renderer's
  `destroy()` callback does this on iframe removal.

The SW keeps sessions in memory only; on refresh, the parent page must
re-register. This is by design — we never persist .elpx contents in the SW.

## SCORM 1.2 keys captured

```
cmi.core.score.raw / .min / .max
cmi.core.lesson_status      (passed | failed | completed | incomplete | browsed | not attempted)
cmi.core.lesson_location
cmi.core.session_time
cmi.suspend_data
cmi.interactions.*
cmi.objectives.*
```

## SCORM 2004 keys captured

```
cmi.score.raw / .min / .max / .scaled
cmi.completion_status        (completed | incomplete | not attempted)
cmi.success_status           (passed | failed | unknown)
cmi.location
cmi.session_time
cmi.suspend_data
cmi.interactions.*
cmi.objectives.*
```

## Error semantics

The adapters mimic the SCORM error codes content scripts inspect:

- 0    — no error
- 101  — general exception
- 103  — already initialized (2004)
- 113  — termination after termination (2004)
- 122  — retrieve before initialization (2004)
- 201  — invalid argument
- 301  — not initialized (1.2 GET/SET/COMMIT before LMSInitialize)

`LMSGetErrorString(code)` and `GetErrorString(code)` return human-readable
strings for these codes.

## What we don't do

- **Sequencing**: no `cmi.exit` enforcement, no resume semantics.
- **Server-side state**: each new render starts a fresh attempt. Resuming a
  prior attempt would need the worker to pre-seed `cmi.suspend_data` /
  `cmi.location` from the latest stored attempt.
- **Time tracking**: we record `cmi.session_time` strings if content sets
  them, but we don't compute them ourselves.

## Testing

`apps/web/src/scorm/*.test.ts` cover both adapters and the score normalizer.
The frontend and backend share the normalization rules; the regression suites
must remain in sync.
