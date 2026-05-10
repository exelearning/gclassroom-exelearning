# Grading model

Two grading modes are supported. Pick one per attachment when the teacher
creates it. Mode B is the default; Mode A unlocks once the teacher has granted
offline access.

## Mode A — Automatic grade passback

```
[Student] submits ─►[Worker] recompute score from raw SCORM data
                              │
                              ├─► load encrypted refresh token
                              ├─► refresh access token
                              └─► PATCH addOnAttachments/.../studentSubmissions/...
                                    ?updateMask=pointsEarned
```

Requirements:

- Teacher has signed into the add-on with `access_type=offline` so we obtained
  a refresh token.
- The refresh token is encrypted with `TOKEN_VAULT_KEY` and stored in
  `users.encrypted_refresh_token` in D1.
- The attachment's `grading_mode` is `automatic`.

## Mode B — Review-triggered grade passback

```
[Student] submits ─► [Worker] stores attempt with grade_sync_state='manual_required'
[Teacher] opens Student Work Review
              │
              └─► sees attempt + raw SCORM data + override input
                  │
                  └─► clicks "Sync grade to Classroom"
                          │
                          └─► [Worker] PATCH addOnAttachments/.../studentSubmissions/...
                                using teacher's *live* access token
```

This mode does not require offline access. The teacher's access token is
passed via the `Authorization: Bearer …` header on the worker call; the worker
re-checks attachment ownership before forwarding.

## Score normalization rules

```
Rule 1: SCORM 2004 cmi.score.scaled         → pointsEarned = clamp(scaled, 0, 1) * maxPoints
Rule 2: raw with declared min/max           → pointsEarned = clamp((raw - min) / (max - min), 0, 1) * maxPoints
Rule 3: raw without min/max                 → pointsEarned = clamp(raw / 100, 0, 1) * maxPoints
Rule 4: completion-only fallback            →
        successStatus / lesson_status = passed → maxPoints
        successStatus / lesson_status = failed → 0
        completion only                        → 0 (manual review)
```

`pointsEarned` is rounded to 2 decimal places and always clamped to
`[0, maxPoints]`. The backend recomputes this from raw `scormData` on every
write — client submitted scores are logged but never trusted.

## Status mapping (read by the review UI)

```
SCORM 1.2 lesson_status
  passed     → completionStatus=completed, successStatus=passed
  failed     → completionStatus=completed, successStatus=failed
  completed  → completionStatus=completed
  incomplete → completionStatus=incomplete
  browsed    → completionStatus=incomplete
  not attempted / notattempted → completionStatus=not_attempted

SCORM 2004 cmi.completion_status & cmi.success_status are used directly.
```

## Edge cases

- **maxPoints = 0**: Classroom rejects grade passback. The teacher view shows
  a warning when this is the case.
- **Negative scaled**: clamp to 0; do not pass negative values to Classroom.
- **NaN raw**: ignore; fall through to next rule.
- **Multiple attempts per submission**: the latest attempt is the one used by
  grade passback. Previous attempts remain in the audit log.
- **Teacher edits the override**: the review UI calls
  `POST /api/classroom/grade-passback` with the override value. The backend
  still validates `pointsEarned ≥ 0` and `≤ maxPoints` (clamped client-side
  for clarity).

## Audit trail

Every attempt row stores:

- raw `scormData` (full CMI bag),
- normalized score JSON (with the rule that fired),
- `grade_sync_state` (`pending`, `synced`, `error`, `manual_required`),
- `grade_sync_error` if Classroom rejected the call.

A teacher can re-sync any attempt at any time from the review iframe.
