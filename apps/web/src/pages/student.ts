import { CLASSROOM_STUDENT_SCOPES, DRIVE_FILE_SCOPE } from '../config';
import { parseClassroomContext, validateContext, ClassroomContextError } from '../classroom/context';
import { getTokenClient } from '../auth/google-token-client';
import { downloadFile } from '../drive/drive-api';
import { getAttachment, postAttempt, submitAttempt } from '../api/backend-client';
import { loadElpx } from '../viewer/elpx-loader';
import { renderElpx } from '../viewer/iframe-renderer';
import { createScormRuntime } from '../scorm/runtime-bridge';
import { initAttempt, applyScormUpdate, markSubmitted } from '../attempts/attempt-state';
import { StatusView, formatError, requireElement, escapeHtml } from '../ui/status';

const AUTOSAVE_INTERVAL_MS = 30_000;

export async function renderStudent(root: HTMLElement): Promise<void> {
  const ctx = parseClassroomContext(window.location.href);
  try {
    validateContext(ctx, { required: ['attachmentId', 'submissionId'] });
  } catch (error) {
    if (error instanceof ClassroomContextError) {
      root.innerHTML = errorShell(`Missing required context: ${error.missing.join(', ')}.`);
      return;
    }
    throw error;
  }

  root.innerHTML = `
    <main class="app-shell iframe">
      <h1>Student activity</h1>
      <section id="meta" class="diagnostics">
        <dl>
          <div><dt>Attachment</dt><dd><code>${escapeHtml(ctx.attachmentId ?? '')}</code></dd></div>
          <div><dt>Submission</dt><dd><code>${escapeHtml(ctx.submissionId ?? '')}</code></dd></div>
        </dl>
      </section>
      <section class="panel">
        <h2>Activity</h2>
        <div id="preview-host"><p>Loading the activity…</p></div>
      </section>
      <section class="panel">
        <h2>Progress</h2>
        <p id="progress">Waiting for activity to load…</p>
        <div class="actions">
          <button id="submit" type="button" disabled>Submit activity</button>
        </div>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const previewHost = requireElement(root, '#preview-host');
  const submitBtn = requireElement<HTMLButtonElement>(root, '#submit');
  const progress = requireElement(root, '#progress');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, ...CLASSROOM_STUDENT_SCOPES] });

  try {
    const accessToken = await tokenClient.getAccessToken({ hint: ctx.loginHint ?? undefined });
    const attachment = await getAttachment(ctx.attachmentId!, accessToken);

    const blob = await downloadFile(attachment.driveFileId, {
      accessToken,
      resourceKey: attachment.driveResourceKey,
    });
    const bytes = await blob.arrayBuffer();
    const loaded = loadElpx(bytes);

    let attempt = initAttempt({
      attachmentId: attachment.attachmentId,
      submissionId: ctx.submissionId!,
      courseId: attachment.courseId,
      itemId: attachment.itemId,
      userId: ctx.loginHint,
      fileId: attachment.driveFileId,
    });

    let dirty = false;

    const runtime = createScormRuntime({
      onChange: () => {
        const snap = runtime.snapshot();
        const score = runtime.computeScore(attachment.maxPoints);
        attempt = applyScormUpdate(attempt, {
          version: snap.version,
          data: snap.data,
          events: [],
          normalizedScore: score,
        });
        dirty = true;
        progress.innerHTML = `
          ${score.isComplete ? '<strong>Completed.</strong>' : 'In progress.'}
          Score: ${score.pointsEarned}/${score.maxPoints}.
          ${score.isPassed === true ? 'Passed.' : score.isPassed === false ? 'Failed.' : ''}
        `;
        submitBtn.disabled = !score.isComplete;
      },
    });

    await renderElpx({
      container: previewHost,
      loaded,
      scorm12: runtime.scorm12,
      scorm2004: runtime.scorm2004,
      title: 'eXeLearning student activity',
    });
    status.set('Activity ready. Your progress is saved automatically.', 'info');

    const flush = async () => {
      if (!dirty) return;
      dirty = false;
      try {
        const saved = await postAttempt(
          {
            attemptId: attempt.attemptId,
            attachmentId: attempt.attachmentId,
            submissionId: attempt.submissionId,
            scormVersion: attempt.scormVersion ?? 'unknown',
            scormData: attempt.scormData,
            clientNormalizedScore: attempt.normalizedScore && {
              pointsEarned: attempt.normalizedScore.pointsEarned,
              maxPoints: attempt.normalizedScore.maxPoints,
            },
          },
          accessToken,
        );
        attempt = { ...attempt, attemptId: saved.attemptId };
      } catch (error) {
        status.set(`Autosave failed: ${formatError(error)}`, 'warn');
      }
    };

    const autosave = window.setInterval(flush, AUTOSAVE_INTERVAL_MS);
    window.addEventListener('beforeunload', () => { clearInterval(autosave); void flush(); });

    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      try {
        await flush();
        attempt = markSubmitted(attempt);
        const result = await submitAttempt(attempt.attemptId, accessToken);
        const stateText = result.gradeSyncState === 'synced'
          ? 'Grade synced to Classroom.'
          : result.gradeSyncState === 'manual_required'
            ? 'Submitted. Your teacher will review and sync the grade.'
            : 'Submitted, but grade sync did not complete; teacher review required.';
        status.set(stateText, result.gradeSyncState === 'synced' ? 'success' : 'info');
      } catch (error) {
        submitBtn.disabled = false;
        status.set(formatError(error), 'error');
      }
    });
  } catch (error) {
    status.set(formatError(error), 'error');
  }
}

function errorShell(message: string): string {
  return `<main class="app-shell iframe"><h1>Student activity</h1><p class="status" data-kind="error">${escapeHtml(message)}</p></main>`;
}
