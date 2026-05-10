import { DRIVE_FILE_SCOPE } from '../config';
import { getTokenClient } from '../auth/google-token-client';
import { openElpxPicker } from '../drive/picker';
import { StatusView, formatError, requireElement } from '../ui/status';

export async function renderPicker(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <main class="app-shell">
      <h1>Drive Picker test</h1>
      <p>Standalone test for the Google Picker filtered to .elpx-shaped files.</p>
      <section class="actions">
        <button id="signin" type="button">Sign in</button>
        <button id="pick" type="button" class="secondary" disabled>Open picker</button>
      </section>
      <section class="panel">
        <h2>Last selection</h2>
        <pre id="result" class="scorm-data">No selection yet.</pre>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>`;

  const status = new StatusView(requireElement(root, '#status'));
  const result = requireElement(root, '#result');
  const pickBtn = requireElement<HTMLButtonElement>(root, '#pick');
  const tokenClient = getTokenClient({ scopes: [DRIVE_FILE_SCOPE] });

  requireElement<HTMLButtonElement>(root, '#signin').addEventListener('click', async () => {
    try {
      await tokenClient.getAccessToken({ interactive: true });
      pickBtn.disabled = false;
      status.set('Signed in.', 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });

  pickBtn.addEventListener('click', async () => {
    try {
      const accessToken = await tokenClient.getAccessToken();
      const picked = await openElpxPicker({ accessToken });
      if (!picked) { status.set('Cancelled.', 'info'); return; }
      result.textContent = JSON.stringify(picked, null, 2);
      status.set(`Picked ${picked.name}.`, 'success');
    } catch (error) {
      status.set(formatError(error), 'error');
    }
  });
}
