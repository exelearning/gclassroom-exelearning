import { APP_BASE_URL, CLASSROOM_TEACHER_SCOPES, DRIVE_FILE_SCOPE, DRIVE_UPLOAD_FOLDER_NAME } from '../config';
import { parseClassroomContext, validateContext, ClassroomContextError } from '../classroom/context';
import { getTokenClient } from '../auth/google-token-client';
import { openElpxPicker } from '../drive/picker';
import { uploadElpxToDrive } from '../drive/upload';
import { extractDriveFileId, summarizeElpxFile } from '../drive/metadata';
import { getFileMetadata, downloadFile } from '../drive/drive-api';
import { createAddOnAttachment } from '../classroom/api';
import { postAttachment } from '../api/backend-client';
import { loadElpx } from '../viewer/elpx-loader';
import { renderElpx } from '../viewer/iframe-renderer';
import { StatusView, formatError, requireElement } from '../ui/status';

export async function renderDiscovery(root: HTMLElement): Promise<void> {
  const ctx = parseClassroomContext(window.location.href);
  let validatedCtx;
  try {
    validatedCtx = validateContext(ctx, { required: ['courseId', 'itemId', 'itemType'] });
  } catch (error) {
    if (error instanceof ClassroomContextError) {
      root.innerHTML = `
        <main class="app-shell iframe">
          <h1>Discovery</h1>
          <p class="status" data-kind="error">Missing Classroom context: ${error.missing.join(', ')}.</p>
          <p>This page must be loaded inside Classroom's Attachment Discovery iframe.</p>
        </main>`;
      return;
    }
    throw error;
  }

  root.innerHTML = `
    <main class="app-shell iframe">
      <section class="toolbar">
        <div>
          <h1>Attach eXeLearning resource</h1>
          <p>Course <code>${validatedCtx.courseId}</code> · Item <code>${validatedCtx.itemId}</code> · ${validatedCtx.itemType}</p>
        </div>
      </section>

      <section class="actions">
        <button id="signin" type="button">Sign in with Google</button>
        <button id="pick" type="button" class="secondary" disabled>Select from Drive</button>
        <label class="actions" style="margin:0;">
          <input id="upload" type="file" accept=".elpx" hidden>
          <button id="upload-btn" type="button" class="secondary" disabled>Upload .elpx</button>
        </label>
        <input id="paste-url" type="url" placeholder="Paste Drive file URL or fileId" disabled>
        <button id="paste-btn" type="button" class="secondary" disabled>Use URL</button>
      </section>

      <section class="panel">
        <h2>Selected resource</h2>
        <div id="summary">No file selected.</div>
        <label class="field">Title <input id="title" type="text" placeholder="Activity title"></label>
        <label class="field">Maximum points <input id="max-points" type="number" min="1" step="0.5" value="10"></label>
        <div class="actions" style="margin-top:0.5rem;">
          <button id="create" type="button" disabled>Create graded Classroom activity</button>
        </div>
      </section>

      <section class="panel">
        <h2>Preview</h2>
        <div id="preview-host"><p>Sign in and select a file to preview.</p></div>
      </section>

      <p id="status" class="status" role="status"></p>
    </main>
  `;

  const status = new StatusView(requireElement(root, '#status'));
  const summary = requireElement(root, '#summary');
  const titleInput = requireElement<HTMLInputElement>(root, '#title');
  const maxPointsInput = requireElement<HTMLInputElement>(root, '#max-points');
  const createBtn = requireElement<HTMLButtonElement>(root, '#create');
  const pickBtn = requireElement<HTMLButtonElement>(root, '#pick');
  const uploadInput = requireElement<HTMLInputElement>(root, '#upload');
  const uploadBtn = requireElement<HTMLButtonElement>(root, '#upload-btn');
  const pasteUrl = requireElement<HTMLInputElement>(root, '#paste-url');
  const pasteBtn = requireElement<HTMLButtonElement>(root, '#paste-btn');
  const previewHost = requireElement(root, '#preview-host');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, ...CLASSROOM_TEACHER_SCOPES] });
  let selected: { fileId: string; name: string; mimeType: string; resourceKey?: string; bytes?: ArrayBuffer } | null = null;
  let lastRendered: Awaited<ReturnType<typeof renderElpx>> | null = null;

  requireElement<HTMLButtonElement>(root, '#signin').addEventListener('click', async () => {
    try {
      await tokenClient.getAccessToken({ interactive: true, hint: validatedCtx.loginHint ?? undefined });
      [pickBtn, uploadBtn, pasteUrl, pasteBtn].forEach((b) => (b.disabled = false));
      status.set('Signed in. Select or upload an .elpx file.', 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  pickBtn.addEventListener('click', async () => {
    try {
      const accessToken = await tokenClient.getAccessToken();
      const picked = await openElpxPicker({ accessToken });
      if (!picked) { status.set('No file selected.', 'info'); return; }
      await onPicked(picked.fileId, picked.resourceKey);
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    try {
      const accessToken = await tokenClient.getAccessToken();
      status.set(`Uploading ${file.name} to Drive…`, 'info');
      const meta = await uploadElpxToDrive({
        accessToken,
        file,
        parentFolderName: DRIVE_UPLOAD_FOLDER_NAME,
      });
      await onPicked(meta.id, meta.resourceKey);
      status.set(`Uploaded "${meta.name}" to your Drive.`, 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  pasteBtn.addEventListener('click', async () => {
    const value = pasteUrl.value.trim();
    if (!value) { status.set('Paste a Drive URL or fileId first.', 'warn'); return; }
    const ref = extractDriveFileId(value);
    if (!ref) { status.set('Could not extract a Drive fileId from that input.', 'error'); return; }
    await onPicked(ref.fileId, ref.resourceKey);
  });

  createBtn.addEventListener('click', async () => {
    if (!selected) return;
    const title = titleInput.value.trim() || selected.name;
    const maxPoints = Number(maxPointsInput.value);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      status.set('Maximum points must be a positive number.', 'error');
      return;
    }
    try {
      status.set('Creating Classroom add-on attachment…', 'info');
      const accessToken = await tokenClient.getAccessToken();

      const refParam = encodeURIComponent(`${validatedCtx.courseId}:${validatedCtx.itemId}:${selected.fileId}`);
      const baseOrigin = `${window.location.origin}${APP_BASE_URL}`;
      const attachment = await createAddOnAttachment(
        {
          courseId: validatedCtx.courseId!,
          itemId: validatedCtx.itemId!,
          itemType: validatedCtx.itemType as 'COURSE_WORK' | 'COURSE_WORK_MATERIAL' | 'ANNOUNCEMENT',
          body: {
            title,
            teacherViewUri: { uri: `${baseOrigin}addon/teacher?attachmentRef=${refParam}` },
            studentViewUri: { uri: `${baseOrigin}addon/student?attachmentRef=${refParam}` },
            studentWorkReviewUri: { uri: `${baseOrigin}addon/review?attachmentRef=${refParam}` },
            maxPoints,
          },
        },
        { accessToken },
      );

      // Persist metadata in our backend so the student/teacher views can resolve the
      // attachmentRef → driveFileId mapping without going back to Classroom.
      await postAttachment(
        {
          attachmentId: attachment.id,
          courseId: validatedCtx.courseId!,
          itemId: validatedCtx.itemId!,
          itemType: validatedCtx.itemType,
          driveFileId: selected.fileId,
          driveResourceKey: selected.resourceKey,
          title,
          maxPoints,
          gradingMode: 'review', // default; teacher can upgrade to 'automatic' later
        },
        accessToken,
      );

      status.set(`Attachment created (${attachment.id}). Close this dialog to return to Classroom.`, 'success');
      createBtn.disabled = true;
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  async function onPicked(fileId: string, resourceKey?: string): Promise<void> {
    try {
      status.set('Fetching Drive metadata…', 'info');
      const accessToken = await tokenClient.getAccessToken();
      const meta = await getFileMetadata(fileId, { accessToken, resourceKey });
      const elpx = summarizeElpxFile(meta);
      if (!elpx.isLikelyElpx) {
        status.set(`Selected file is not a usable .elpx: ${elpx.rejectionReason}`, 'error');
        return;
      }
      const blob = await downloadFile(fileId, { accessToken, resourceKey });
      const bytes = await blob.arrayBuffer();
      selected = { fileId, name: meta.name, mimeType: meta.mimeType, resourceKey, bytes };
      titleInput.value = titleInput.value || stripExtension(meta.name);

      summary.innerHTML = `
        <dl class="diagnostics">
          <div><dt>Name</dt><dd>${escapeHtml(meta.name)}</dd></div>
          <div><dt>File id</dt><dd><code>${escapeHtml(meta.id)}</code></dd></div>
          <div><dt>Size</dt><dd>${formatSize(elpx.size)}</dd></div>
          <div><dt>Modified</dt><dd>${meta.modifiedTime ?? '—'}</dd></div>
        </dl>`;

      // Render preview using the SW-backed viewer (no SCORM adapters in discovery).
      const loaded = loadElpx(bytes);
      lastRendered?.destroy();
      lastRendered = await renderElpx({ container: previewHost, loaded, scorm12: null, scorm2004: null });
      createBtn.disabled = false;
      status.set('Preview ready.', 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  }
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function formatSize(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}
