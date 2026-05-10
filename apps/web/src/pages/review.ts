import { CLASSROOM_TEACHER_SCOPES, DRIVE_FILE_SCOPE } from '../config';
import { parseClassroomContext, validateContext, ClassroomContextError } from '../classroom/context';
import { getTokenClient } from '../auth/google-token-client';
import { getAttachment, listAttempts, pushGradeToClassroom } from '../api/backend-client';
import { StatusView, formatError, requireElement, escapeHtml } from '../ui/status';

export async function renderReview(root: HTMLElement): Promise<void> {
  const ctx = parseClassroomContext(window.location.href);
  try {
    validateContext(ctx, { required: ['attachmentId', 'submissionId', 'courseId', 'itemId'] });
  } catch (error) {
    if (error instanceof ClassroomContextError) {
      root.innerHTML = errorShell(`Missing required context: ${error.missing.join(', ')}.`);
      return;
    }
    throw error;
  }

  root.innerHTML = `
    <main class="app-shell iframe">
      <h1>Student work review</h1>
      <section class="diagnostics">
        <dl>
          <div><dt>Attachment</dt><dd><code>${escapeHtml(ctx.attachmentId!)}</code></dd></div>
          <div><dt>Submission</dt><dd><code>${escapeHtml(ctx.submissionId!)}</code></dd></div>
        </dl>
      </section>
      <section class="panel" id="attempt-section">
        <h2>Attempt</h2>
        <div id="attempt-summary">Loading…</div>
      </section>
      <section class="panel">
        <h2>Grade</h2>
        <label class="field">Override pointsEarned (optional)
          <input id="override" type="number" min="0" step="0.5">
        </label>
        <div class="actions" style="margin-top:0.5rem;">
          <button id="resync" type="button" disabled>Sync grade to Classroom</button>
        </div>
      </section>
      <section class="panel">
        <h2>Raw SCORM data</h2>
        <pre id="scorm-data" class="scorm-data">No attempt loaded.</pre>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const attemptSummary = requireElement(root, '#attempt-summary');
  const scormDataEl = requireElement(root, '#scorm-data');
  const resyncBtn = requireElement<HTMLButtonElement>(root, '#resync');
  const overrideInput = requireElement<HTMLInputElement>(root, '#override');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, ...CLASSROOM_TEACHER_SCOPES] });

  try {
    const accessToken = await tokenClient.getAccessToken({ hint: ctx.loginHint ?? undefined });
    const attachment = await getAttachment(ctx.attachmentId!, accessToken);
    const { attempts } = await listAttempts(ctx.attachmentId!, accessToken, ctx.submissionId!);
    const latest = attempts[attempts.length - 1] ?? null;

    if (!latest) {
      attemptSummary.innerHTML = '<p>No attempt yet for this student.</p>';
      return;
    }

    const sync = (state: string) => {
      switch (state) {
        case 'synced': return '<span style="color:var(--success)">synced</span>';
        case 'pending': return 'pending';
        case 'manual_required': return '<span style="color:var(--warn)">manual required</span>';
        case 'error': return '<span style="color:var(--error)">error</span>';
        default: return state;
      }
    };

    attemptSummary.innerHTML = `
      <dl class="diagnostics">
        <div><dt>Attempt id</dt><dd><code>${escapeHtml(latest.attemptId)}</code></dd></div>
        <div><dt>Score</dt><dd>${latest.pointsEarned ?? '—'} / ${latest.maxPoints}</dd></div>
        <div><dt>Complete</dt><dd>${latest.isComplete ? 'yes' : 'no'}</dd></div>
        <div><dt>Passed</dt><dd>${latest.isPassed === true ? 'yes' : latest.isPassed === false ? 'no' : '—'}</dd></div>
        <div><dt>Submitted at</dt><dd>${latest.submittedAt ?? '—'}</dd></div>
        <div><dt>Sync state</dt><dd>${sync(latest.gradeSyncState)}</dd></div>
        ${latest.gradeSyncError ? `<div><dt>Sync error</dt><dd>${escapeHtml(latest.gradeSyncError)}</dd></div>` : ''}
      </dl>`;

    scormDataEl.textContent = JSON.stringify(latest.scormData, null, 2);
    overrideInput.value = String(latest.pointsEarned ?? 0);
    resyncBtn.disabled = false;

    resyncBtn.addEventListener('click', async () => {
      resyncBtn.disabled = true;
      try {
        const override = Number(overrideInput.value);
        const points = Number.isFinite(override) ? override : (latest.pointsEarned ?? 0);
        await pushGradeToClassroom(
          {
            courseId: attachment.courseId,
            itemId: attachment.itemId,
            attachmentId: attachment.attachmentId,
            submissionId: ctx.submissionId!,
            pointsEarned: points,
          },
          accessToken,
        );
        status.set(`Grade synced (${points}/${attachment.maxPoints}).`, 'success');
      } catch (error) {
        status.set(formatError(error), 'error');
      } finally {
        resyncBtn.disabled = false;
      }
    });
  } catch (error) {
    status.set(formatError(error), 'error');
  }
}

function errorShell(message: string): string {
  return `<main class="app-shell iframe"><h1>Review</h1><p class="status" data-kind="error">${escapeHtml(message)}</p></main>`;
}
