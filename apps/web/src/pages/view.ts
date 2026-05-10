import { DRIVE_FILE_SCOPE, DRIVE_READONLY_SCOPE } from '../config';
import { getTokenClient } from '../auth/google-token-client';
import { downloadFile, getFileMetadata } from '../drive/drive-api';
import { extractDriveFileId, summarizeElpxFile } from '../drive/metadata';
import { loadElpx } from '../viewer/elpx-loader';
import { renderElpx } from '../viewer/iframe-renderer';
import { StatusView, formatError, requireElement } from '../ui/status';

export async function renderView(root: HTMLElement): Promise<void> {
  const params = new URL(window.location.href).searchParams;
  const fileIdParam = params.get('fileId');
  const urlParam = params.get('url');

  root.innerHTML = `
    <main class="app-shell">
      <h1>Standalone viewer</h1>
      <p>Render an .elpx package outside Classroom for debugging or fallback access.</p>
      <section class="actions">
        <button id="signin" type="button">Sign in with Google</button>
      </section>
      <section class="panel">
        <h2>Source</h2>
        <div id="source-info">${fileIdParam || urlParam ? 'Will load on sign-in.' : 'Provide ?fileId= or ?url= in the URL.'}</div>
      </section>
      <section class="panel">
        <h2>Preview</h2>
        <div id="preview-host"></div>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const previewHost = requireElement(root, '#preview-host');
  const sourceInfo = requireElement(root, '#source-info');

  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE, DRIVE_READONLY_SCOPE] });

  requireElement<HTMLButtonElement>(root, '#signin').addEventListener('click', async () => {
    try {
      const accessToken = await tokenClient.getAccessToken({ interactive: true });
      let target: { fileId: string; resourceKey?: string } | null = fileIdParam ? { fileId: fileIdParam } : null;
      if (!target && urlParam) {
        const ref = extractDriveFileId(urlParam);
        if (!ref) throw new Error('Could not extract a Drive fileId from ?url=.');
        target = ref;
      }
      if (!target) {
        status.set('Provide ?fileId= or ?url= in the URL.', 'warn');
        return;
      }
      sourceInfo.innerHTML = `Loading <code>${target.fileId}</code>…`;
      const meta = await getFileMetadata(target.fileId, { accessToken, resourceKey: target.resourceKey });
      const summary = summarizeElpxFile(meta);
      if (!summary.isLikelyElpx) {
        status.set(`Cannot open this file: ${summary.rejectionReason}`, 'error');
        sourceInfo.innerHTML = `<code>${target.fileId}</code> — ${summary.rejectionReason}`;
        return;
      }
      const blob = await downloadFile(target.fileId, { accessToken, resourceKey: target.resourceKey });
      const bytes = await blob.arrayBuffer();
      const loaded = loadElpx(bytes);
      await renderElpx({ container: previewHost, loaded, scorm12: null, scorm2004: null, title: 'Standalone viewer' });
      status.set('Loaded.', 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });
}
