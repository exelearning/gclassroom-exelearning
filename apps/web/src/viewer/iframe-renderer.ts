import type { Scorm12Api } from '../scorm/scorm12';
import type { Scorm2004Api } from '../scorm/scorm2004';
import { registerElpxSession, clearElpxSession } from './service-worker-router';
import type { LoadedElpx } from './elpx-loader';

export interface ScormHostExposed {
  sessionId: string;
  scorm12: Scorm12Api | null;
  scorm2004: Scorm2004Api | null;
}

declare global {
  interface Window {
    __gclassroomScormHost?: ScormHostExposed;
  }
}

export interface RenderElpxOptions {
  /** Root element where the iframe will be inserted. */
  container: HTMLElement;
  /** Loaded package; must have a sessionId. */
  loaded: LoadedElpx;
  /** SCORM 1.2 adapter to expose to the iframe (or null for read-only preview). */
  scorm12?: Scorm12Api | null;
  /** SCORM 2004 adapter to expose to the iframe (or null). */
  scorm2004?: Scorm2004Api | null;
  /** Optional id to set on the iframe (defaults to elpx-frame-{sessionId}). */
  iframeId?: string;
  /** Iframe sandbox allowlist; defaults to a tight set that still permits SCORM JS. */
  sandbox?: string;
  /** Title for the iframe (a11y). */
  title?: string;
}

export interface RenderedElpx {
  iframe: HTMLIFrameElement;
  sessionId: string;
  destroy: () => Promise<void>;
}

const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/**
 * Mount an .elpx package inside a sandboxed iframe served by the elpx-runtime
 * service worker. SCORM adapters are exposed on `window.__gclassroomScormHost`
 * so the bridge script injected into index.html can wire `window.API` /
 * `window.API_1484_11` synchronously when content loads.
 */
export async function renderElpx(options: RenderElpxOptions): Promise<RenderedElpx> {
  const { loaded, container } = options;

  // Expose the SCORM host BEFORE we set iframe.src so the bridge script
  // running inside the iframe finds it on first paint.
  window.__gclassroomScormHost = {
    sessionId: loaded.sessionId,
    scorm12: options.scorm12 ?? null,
    scorm2004: options.scorm2004 ?? null,
  };

  const { url } = await registerElpxSession(loaded);

  const iframe = document.createElement('iframe');
  iframe.id = options.iframeId ?? `elpx-frame-${loaded.sessionId}`;
  iframe.className = 'preview-frame';
  iframe.title = options.title ?? 'eXeLearning activity';
  iframe.setAttribute('sandbox', options.sandbox ?? DEFAULT_SANDBOX);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.src = url;

  container.replaceChildren(iframe);

  return {
    iframe,
    sessionId: loaded.sessionId,
    destroy: async () => {
      iframe.remove();
      if (window.__gclassroomScormHost?.sessionId === loaded.sessionId) {
        window.__gclassroomScormHost = undefined;
      }
      await clearElpxSession(loaded.sessionId);
    },
  };
}
