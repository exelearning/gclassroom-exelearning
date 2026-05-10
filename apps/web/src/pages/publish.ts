import { APP_BASE_URL, CLASSROOM_TEACHER_SCOPES, DRIVE_FILE_SCOPE } from '../config';
import { getTokenClient } from '../auth/google-token-client';
import { extractDriveFileId, summarizeElpxFile } from '../drive/metadata';
import { getFileMetadata } from '../drive/drive-api';
import { listMyCourses, createCourseWork, createAddOnAttachment } from '../classroom/api';
import { postAttachment } from '../api/backend-client';
import { StatusView, formatError, requireElement, escapeHtml } from '../ui/status';

export async function renderPublish(root: HTMLElement): Promise<void> {
  const params = new URL(window.location.href).searchParams;
  const initialFileId = params.get('fileId') ?? '';

  root.innerHTML = `
    <main class="app-shell">
      <h1>Create Classroom assignment</h1>
      <p>Create a Google Classroom assignment from outside the Classroom UI. Used when you start from your Drive or this app.</p>
      <section class="actions">
        <button id="signin" type="button">Sign in</button>
      </section>
      <section class="panel">
        <h2>Source .elpx</h2>
        <label class="field">Drive fileId or URL <input id="file-input" type="text" value="${escapeHtml(initialFileId)}"></label>
        <button id="resolve" type="button" class="secondary" disabled>Resolve</button>
        <div id="file-info"></div>
      </section>
      <section class="panel">
        <h2>Course</h2>
        <label class="field">Class <select id="course-select" disabled></select></label>
        <label class="field">Title <input id="title" type="text" placeholder="Activity title"></label>
        <label class="field">Maximum points <input id="max-points" type="number" min="1" step="0.5" value="10"></label>
        <div class="actions" style="margin-top:0.5rem;">
          <button id="create-addon" type="button" disabled>Create as add-on activity</button>
          <button id="create-link" type="button" class="secondary" disabled>Create as link fallback</button>
        </div>
        <p style="font-size:0.85rem;color:var(--muted);margin-top:0.5rem;">
          Add-on attachments require the add-on to be installed for your domain. Use the link fallback if your domain has not allowlisted gclassroom-exelearning yet.
        </p>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const fileInput = requireElement<HTMLInputElement>(root, '#file-input');
  const fileInfo = requireElement(root, '#file-info');
  const courseSelect = requireElement<HTMLSelectElement>(root, '#course-select');
  const titleInput = requireElement<HTMLInputElement>(root, '#title');
  const maxPointsInput = requireElement<HTMLInputElement>(root, '#max-points');
  const resolveBtn = requireElement<HTMLButtonElement>(root, '#resolve');
  const createAddOnBtn = requireElement<HTMLButtonElement>(root, '#create-addon');
  const createLinkBtn = requireElement<HTMLButtonElement>(root, '#create-link');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, ...CLASSROOM_TEACHER_SCOPES] });

  let resolvedFile: { fileId: string; resourceKey?: string; name: string } | null = null;

  requireElement<HTMLButtonElement>(root, '#signin').addEventListener('click', async () => {
    try {
      const accessToken = await tokenClient.getAccessToken({ interactive: true });
      const courses = await listMyCourses({ accessToken });
      courseSelect.innerHTML = courses.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.section ? ` (${escapeHtml(c.section)})` : ''}</option>`).join('');
      courseSelect.disabled = courses.length === 0;
      resolveBtn.disabled = false;
      status.set(`Signed in. ${courses.length} class${courses.length === 1 ? '' : 'es'} loaded.`, 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  resolveBtn.addEventListener('click', async () => {
    try {
      const ref = extractDriveFileId(fileInput.value);
      if (!ref) { status.set('Could not extract a Drive fileId.', 'error'); return; }
      const accessToken = await tokenClient.getAccessToken();
      const meta = await getFileMetadata(ref.fileId, { accessToken, resourceKey: ref.resourceKey });
      const summary = summarizeElpxFile(meta);
      if (!summary.isLikelyElpx) {
        status.set(`Not a usable .elpx: ${summary.rejectionReason}`, 'error');
        return;
      }
      resolvedFile = { fileId: ref.fileId, resourceKey: ref.resourceKey, name: meta.name };
      titleInput.value = titleInput.value || stripExtension(meta.name);
      fileInfo.innerHTML = `<dl class="diagnostics"><div><dt>Name</dt><dd>${escapeHtml(meta.name)}</dd></div><div><dt>Size</dt><dd>${meta.size ?? '?'} B</dd></div></dl>`;
      createAddOnBtn.disabled = false;
      createLinkBtn.disabled = false;
      status.set('File resolved.', 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  createAddOnBtn.addEventListener('click', async () => {
    if (!resolvedFile) return;
    const courseId = courseSelect.value;
    const maxPoints = Number(maxPointsInput.value);
    if (!courseId || !Number.isFinite(maxPoints) || maxPoints <= 0) return;
    try {
      const accessToken = await tokenClient.getAccessToken();
      // Step 1: create the courseWork (placeholder), so we have an itemId.
      const work = await createCourseWork({ courseId, title: titleInput.value, maxPoints, state: 'PUBLISHED' }, { accessToken });
      // Step 2: create the add-on attachment for that courseWork.
      const refParam = encodeURIComponent(`${courseId}:${work.id}:${resolvedFile.fileId}`);
      const baseOrigin = `${window.location.origin}${APP_BASE_URL}`;
      const attachment = await createAddOnAttachment(
        {
          courseId,
          itemId: work.id,
          itemType: 'COURSE_WORK',
          body: {
            title: titleInput.value,
            teacherViewUri: { uri: `${baseOrigin}addon/teacher?attachmentRef=${refParam}` },
            studentViewUri: { uri: `${baseOrigin}addon/student?attachmentRef=${refParam}` },
            studentWorkReviewUri: { uri: `${baseOrigin}addon/review?attachmentRef=${refParam}` },
            maxPoints,
          },
        },
        { accessToken },
      );
      await postAttachment(
        {
          attachmentId: attachment.id,
          courseId,
          itemId: work.id,
          itemType: 'COURSE_WORK',
          driveFileId: resolvedFile.fileId,
          driveResourceKey: resolvedFile.resourceKey,
          title: titleInput.value,
          maxPoints,
          gradingMode: 'review',
        },
        accessToken,
      );
      status.set(`Created add-on activity. Open Classroom and grade as needed.`, 'success');
    } catch (error) {
      status.set(`Add-on creation failed (you may not be eligible): ${formatError(error)}. Try the link fallback.`, 'warn');
    }
  });

  createLinkBtn.addEventListener('click', async () => {
    if (!resolvedFile) return;
    const courseId = courseSelect.value;
    const maxPoints = Number(maxPointsInput.value);
    if (!courseId || !Number.isFinite(maxPoints) || maxPoints <= 0) return;
    try {
      const accessToken = await tokenClient.getAccessToken();
      const linkUrl = `${window.location.origin}${APP_BASE_URL}view?fileId=${encodeURIComponent(resolvedFile.fileId)}`;
      await createCourseWork(
        {
          courseId,
          title: titleInput.value,
          description: 'Opens the activity in gclassroom-exelearning. Automatic grading is NOT available in this fallback mode.',
          maxPoints,
          state: 'PUBLISHED',
          link: { url: linkUrl, title: titleInput.value },
        },
        { accessToken },
      );
      status.set('Assignment created with link fallback. Automatic grade passback will not work in this mode.', 'warn');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}
