import { CLASSROOM_TEACHER_SCOPES, DRIVE_FILE_SCOPE } from '../config';
import { parseClassroomContext, validateContext, ClassroomContextError } from '../classroom/context';
import { getTokenClient } from '../auth/google-token-client';
import { downloadFile } from '../drive/drive-api';
import { getAttachment } from '../api/backend-client';
import { loadElpx } from '../viewer/elpx-loader';
import { renderElpx } from '../viewer/iframe-renderer';
import { StatusView, formatError, requireElement, escapeHtml } from '../ui/status';

export async function renderTeacher(root: HTMLElement): Promise<void> {
  const ctx = parseClassroomContext(window.location.href);
  try {
    validateContext(ctx, { required: ['attachmentId'] });
  } catch (error) {
    if (error instanceof ClassroomContextError) {
      root.innerHTML = renderError(`Missing required context: ${error.missing.join(', ')}.`);
      return;
    }
    throw error;
  }

  root.innerHTML = `
    <main class="app-shell iframe">
      <h1>Teacher view</h1>
      <p>Read-only preview of the attached eXeLearning resource.</p>
      <section class="diagnostics">
        <h2>Attachment</h2>
        <dl id="meta">
          <div><dt>Attachment id</dt><dd><code>${escapeHtml(ctx.attachmentId ?? '')}</code></dd></div>
        </dl>
      </section>
      <section class="panel">
        <h2>Preview</h2>
        <div id="preview-host"><p>Loading…</p></div>
      </section>
      <section class="panel" id="grade-mode">
        <h2>Grading</h2>
        <p id="grade-mode-text">Determining grading mode…</p>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const previewHost = requireElement(root, '#preview-host');
  const gradeText = requireElement(root, '#grade-mode-text');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, ...CLASSROOM_TEACHER_SCOPES] });

  try {
    const accessToken = await tokenClient.getAccessToken({ hint: ctx.loginHint ?? undefined });
    const attachment = await getAttachment(ctx.attachmentId!, accessToken);

    requireElement(root, '#meta').insertAdjacentHTML('beforeend', `
      <div><dt>Title</dt><dd>${escapeHtml(attachment.title)}</dd></div>
      <div><dt>Drive fileId</dt><dd><code>${escapeHtml(attachment.driveFileId)}</code></dd></div>
      <div><dt>Max points</dt><dd>${attachment.maxPoints}</dd></div>
      <div><dt>Grading mode</dt><dd>${attachment.gradingMode}</dd></div>
    `);

    if (attachment.maxPoints <= 0) {
      gradeText.textContent = 'Warning: maxPoints is 0; Classroom grade passback will not work.';
    } else if (attachment.gradingMode === 'automatic') {
      gradeText.innerHTML = '<strong>Automatic grading enabled.</strong> Scores are written to Classroom right after the student submits.';
    } else {
      gradeText.innerHTML = '<strong>Teacher review required.</strong> Open Student Work Review to sync each student\'s grade.';
    }

    const blob = await downloadFile(attachment.driveFileId, {
      accessToken,
      resourceKey: attachment.driveResourceKey,
    });
    const bytes = await blob.arrayBuffer();
    const loaded = loadElpx(bytes);
    await renderElpx({ container: previewHost, loaded, scorm12: null, scorm2004: null });
    status.set('Preview ready.', 'success');
  } catch (error) {
    status.set(formatError(error), 'error');
  }
}

function renderError(message: string): string {
  return `<main class="app-shell iframe"><h1>Teacher view</h1><p class="status" data-kind="error">${escapeHtml(message)}</p></main>`;
}
