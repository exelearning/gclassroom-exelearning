import { GOOGLE_API_KEY, GOOGLE_PICKER_APP_ID, ELPX_MIME_TYPES } from '../config';

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
  }
}

interface PickerNamespace {
  // Google Picker has no public TypeScript types; we treat it as opaque.
  // See https://developers.google.com/picker/docs/reference for runtime API.
  [key: string]: unknown;
}

function pickerNamespace(): PickerNamespace {
  const ns = (window as unknown as { google?: { picker?: PickerNamespace } }).google?.picker;
  if (!ns) throw new Error('Google Picker namespace is not available.');
  return ns;
}

function pickerNamespaceOrNull(): PickerNamespace | null {
  return (window as unknown as { google?: { picker?: PickerNamespace } }).google?.picker ?? null;
}

export interface PickedDriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  resourceKey?: string;
  url?: string;
}

export interface OpenDrivePickerOptions {
  accessToken: string;
}

let gapiLoaded: Promise<void> | null = null;
let pickerLoaded: Promise<void> | null = null;

/**
 * Open Google Picker filtered to `.elpx`-shaped files. Requires
 * VITE_GOOGLE_API_KEY and VITE_GOOGLE_PICKER_APP_ID to be configured.
 */
export async function openElpxPicker(options: OpenDrivePickerOptions): Promise<PickedDriveFile | null> {
  if (!GOOGLE_API_KEY) {
    throw new Error('Missing VITE_GOOGLE_API_KEY for Google Picker.');
  }
  await ensureGapi();
  await ensurePicker();

  const picker = pickerNamespace() as any;

  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(ELPX_MIME_TYPES.join(','))
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(options.accessToken)
      .setDeveloperKey(GOOGLE_API_KEY);

    if (GOOGLE_PICKER_APP_ID) builder.setAppId(GOOGLE_PICKER_APP_ID);

    builder.setCallback((data: any) => {
      if (data.action === picker.Action.PICKED) {
        const doc = data.docs?.[0];
        if (!doc) { resolve(null); return; }
        resolve({
          fileId: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          resourceKey: doc.resourceKey,
          url: doc.url,
        });
      } else if (data.action === picker.Action.CANCEL) {
        resolve(null);
      }
    });

    builder.build().setVisible(true);
  });
}

function ensureGapi(): Promise<void> {
  gapiLoaded ??= new Promise((resolve, reject) => {
    if (window.gapi) return resolve();
    const start = Date.now();
    const check = () => {
      if (window.gapi) return resolve();
      if (Date.now() - start > 10_000) return reject(new Error('Google API client (gapi) failed to load.'));
      setTimeout(check, 100);
    };
    check();
  });
  return gapiLoaded;
}

function ensurePicker(): Promise<void> {
  pickerLoaded ??= new Promise<void>((resolve, reject) => {
    if (pickerNamespaceOrNull()) return resolve();
    if (!window.gapi) return reject(new Error('gapi has not loaded yet.'));
    window.gapi.load('picker', () => {
      if (pickerNamespaceOrNull()) resolve();
      else reject(new Error('Google Picker did not initialize.'));
    });
  });
  return pickerLoaded;
}
