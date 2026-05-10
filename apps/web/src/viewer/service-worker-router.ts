import { APP_BASE_URL } from '../config';
import { injectScormBridge } from './safe-html';
import type { LoadedElpx } from './elpx-loader';

const SW_PATH = `${APP_BASE_URL}elpx-runtime/sw.js`;
const SW_SCOPE = `${APP_BASE_URL}elpx-runtime/`;

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export async function ensureElpxServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser; the .elpx viewer cannot run.');
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
  }
  const registration = await registrationPromise;
  await waitUntilActivated(registration);
  return registration;
}

export interface RegisterSessionResult {
  url: string;
  sessionId: string;
}

/**
 * Push a loaded .elpx into the service worker so it can serve assets at
 * `<base>/elpx-runtime/{sessionId}/...`. Returns the URL that should be set
 * as the iframe `src`.
 *
 * NOTE: We talk to `registration.active` directly. We do NOT wait for the SW
 * to "control" the current page — the page that hosts this code lives outside
 * `/elpx-runtime/` and will never be controlled. Only the iframe will be
 * controlled (via fetch interception in scope), which is what we need.
 */
export async function registerElpxSession(loaded: LoadedElpx): Promise<RegisterSessionResult> {
  const registration = await ensureElpxServiceWorker();
  const target = registration.active ?? registration.waiting ?? registration.installing;
  if (!target) {
    throw new Error('Service worker registration has no worker; reload the page and retry.');
  }

  // Inject the SCORM bridge into index.html so eXeLearning content sees it
  // before any of its own scripts execute.
  const indexBytes = loaded.entries.files.get(loaded.indexPath);
  if (!indexBytes) {
    throw new Error(`index.html missing from extracted package: ${loaded.indexPath}`);
  }
  const html = new TextDecoder('utf-8').decode(indexBytes);
  const injected = injectScormBridge(html, loaded.sessionId);
  loaded.entries.files.set(loaded.indexPath, new TextEncoder().encode(injected));

  // Build a transferable record. We pass ArrayBuffers (transferable) instead of
  // Uint8Arrays to avoid copies for large packages.
  const filesPayload: Record<string, ArrayBuffer> = {};
  const transfer: ArrayBuffer[] = [];
  for (const [path, bytes] of loaded.entries.files) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    filesPayload[path] = buf;
    transfer.push(buf);
  }

  await postWithReply(target, { type: 'SET_SESSION', sessionId: loaded.sessionId, files: filesPayload }, transfer);

  const indexUrl = new URL(`${SW_SCOPE}${loaded.sessionId}/${loaded.indexPath}`, window.location.origin);
  return { url: indexUrl.toString(), sessionId: loaded.sessionId };
}

export async function clearElpxSession(sessionId: string): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration(SW_SCOPE);
  const target = registration?.active ?? registration?.waiting ?? null;
  if (!target) return;
  await postWithReply(target, { type: 'CLEAR_SESSION', sessionId }, []);
}

function postWithReply(
  target: ServiceWorker,
  message: unknown,
  transfer: Transferable[],
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error('Service worker did not reply within 10s.')), 10_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      const data = event.data ?? {};
      if (data.ok === false) reject(new Error(data.error ?? 'Service worker rejected the request.'));
      else resolve(data);
    };
    target.postMessage(message, [channel.port2, ...transfer]);
  });
}

function waitUntilActivated(registration: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve, reject) => {
    if (registration.active) return resolve();
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return resolve();
    const timer = window.setTimeout(() => {
      reject(new Error('Service worker activation timed out after 10s.'));
    }, 10_000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timer);
        resolve();
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timer);
        reject(new Error('Service worker became redundant during activation.'));
      }
    });
  });
}
