# Classroom add-on iframe wiring

This document explains *what* Classroom expects on each iframe URL and *how*
this app implements it.

## Iframe URLs

| Iframe                      | URL                                                                |
| --------------------------- | ------------------------------------------------------------------ |
| Attachment discovery        | `<base>/addon/discovery?courseId=&itemId=&itemType=&login_hint=&hd=` |
| Teacher view                | `<base>/addon/teacher?courseId=&itemId=&itemType=&attachmentId=`     |
| Student view                | `<base>/addon/student?courseId=&itemId=&itemType=&attachmentId=&submissionId=` |
| Student Work Review         | `<base>/addon/review?courseId=&itemId=&itemType=&attachmentId=&submissionId=`  |

`<base>` is the deployed app root — `https://exelearning.github.io/gclassroom-exelearning/`
in production.

## Attachment payload

When the teacher clicks **Create graded Classroom activity** in the discovery
iframe, the app calls
`POST /v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments` with:

```json
{
  "title": "<title>",
  "teacherViewUri": { "uri": "<base>/addon/teacher?attachmentRef=…" },
  "studentViewUri": { "uri": "<base>/addon/student?attachmentRef=…" },
  "studentWorkReviewUri": { "uri": "<base>/addon/review?attachmentRef=…" },
  "maxPoints": 10
}
```

All four URI fields plus a positive `maxPoints` are mandatory for the
attachment to behave as a *graded activity attachment*. We treat the absence
of `studentWorkReviewUri` as a blocking error; without it Classroom will not
expose the review iframe and we have no UI surface to sync grades.

## Context validation

Each iframe page calls `parseClassroomContext(window.location.href)` and then
`validateContext(ctx, { required: [...] })`. The required fields per role:

- **Discovery** — `courseId`, `itemId`, `itemType`
- **Teacher view** — `attachmentId`
- **Student view** — `attachmentId`, `submissionId`
- **Review** — `attachmentId`, `submissionId`, `courseId`, `itemId`

URL parameters alone are *not* trusted: the backend re-checks the caller's
identity via `getUserInfoFromAccessToken` and confirms the attachment belongs
to them before allowing grade passback.

## attachmentRef

Classroom doesn't always preserve every query param across navigations during
preview. We add our own `attachmentRef` parameter (a teacher-visible string)
that points to a metadata row stored by the backend. When standard params are
missing, the backend can still resolve the activity by `attachmentRef`.

## Login hint

Classroom passes `login_hint=<email>` to discovery and the iframes. We forward
this to GIS so signed-in teachers don't get an account picker.

## itemType

Classroom delivers `itemType` of `COURSE_WORK`, `COURSE_WORK_MATERIAL`, or
`ANNOUNCEMENT`. The grade-passback URL changes accordingly:

```
COURSE_WORK            → /courseWork/{itemId}
COURSE_WORK_MATERIAL   → /courseWorkMaterials/{itemId}
ANNOUNCEMENT           → /announcements/{itemId}
```

`apps/worker/src/classroom/grade-passback.ts:buildUrl` handles the routing.

## Posting messages back to Classroom

Classroom's iframes expect us NOT to call `window.parent.postMessage`. The
recommended completion signal is just navigating away (closing the iframe via
`window.close()` is forbidden because Classroom controls the parent). After a
successful attachment creation the discovery iframe shows a success status
and the teacher closes the dialog manually; Classroom polls the attachment
state and rerenders accordingly.
