import { APP_NAME, GOOGLE_CLIENT_ID, BACKEND_BASE_URL, APP_BASE_URL } from '../config';
import { StatusView, formatError, requireElement } from '../ui/status';
import { getHealth } from '../api/backend-client';

export function renderHome(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <section class="toolbar">
        <div>
          <h1>${APP_NAME}</h1>
          <p>Attach eXeLearning <code>.elpx</code> resources to Google Classroom assignments as graded activities.</p>
        </div>
      </section>

      <section class="diagnostics" aria-label="Environment diagnostics">
        <h2>Diagnostics</h2>
        <dl>
          <div><dt>Google client id</dt><dd>${GOOGLE_CLIENT_ID ? 'Configured' : 'Missing <code>VITE_GOOGLE_CLIENT_ID</code>'}</dd></div>
          <div><dt>Backend URL</dt><dd>${BACKEND_BASE_URL ? `<code>${BACKEND_BASE_URL}</code>` : 'Missing <code>VITE_BACKEND_BASE_URL</code>'}</dd></div>
          <div><dt>Backend health</dt><dd id="backend-health">Checking…</dd></div>
          <div><dt>Service-worker scope</dt><dd><code>${APP_BASE_URL}elpx-runtime/</code></dd></div>
        </dl>
      </section>

      <section class="panel">
        <h2>Routes</h2>
        <ul>
          <li><a href="${APP_BASE_URL}addon/discovery">/addon/discovery</a> — Classroom Attachment Discovery iframe</li>
          <li><a href="${APP_BASE_URL}addon/teacher">/addon/teacher</a> — Teacher View iframe</li>
          <li><a href="${APP_BASE_URL}addon/student">/addon/student</a> — Student View iframe</li>
          <li><a href="${APP_BASE_URL}addon/review">/addon/review</a> — Student Work Review iframe</li>
          <li><a href="${APP_BASE_URL}view">/view</a> — Standalone viewer (debug)</li>
          <li><a href="${APP_BASE_URL}picker">/picker</a> — Drive Picker test</li>
          <li><a href="${APP_BASE_URL}publish">/publish</a> — Create Classroom assignment from outside</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Documentation</h2>
        <p>See the <a href="https://github.com/exelearning/gclassroom-exelearning/tree/main/docs" target="_blank" rel="noopener noreferrer">docs/</a> folder for setup, security and grading model details.</p>
      </section>

      <p id="status" class="status" role="status"></p>
    </main>
  `;

  const status = new StatusView(requireElement(root, '#status'));
  const healthEl = requireElement(root, '#backend-health');

  if (!BACKEND_BASE_URL) {
    healthEl.textContent = 'Skipped — no backend configured';
    return;
  }
  void (async () => {
    try {
      const health = await getHealth();
      healthEl.innerHTML = `OK — <code>v${health.version}</code> at <time datetime="${health.time}">${health.time}</time>`;
      status.set('Environment looks healthy.', 'success');
    } catch (error) {
      healthEl.textContent = `Error: ${formatError(error)}`;
      status.set('Backend is not reachable. Configure VITE_BACKEND_BASE_URL or start the worker locally.', 'warn');
    }
  })();
}
