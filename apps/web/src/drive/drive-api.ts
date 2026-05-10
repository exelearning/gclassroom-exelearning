import type { DriveFileMetadata } from './metadata';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MULTIPART_BOUNDARY = 'gclassroom-exelearning-upload';

export class DriveApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.details = details;
  }
}

export interface DriveAuth {
  accessToken: string;
  resourceKey?: string;
  signal?: AbortSignal;
}

export async function getFileMetadata(fileId: string, auth: DriveAuth, fields?: string): Promise<DriveFileMetadata> {
  const url = buildUrl(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    fields: fields ?? 'id,name,mimeType,modifiedTime,size,md5Checksum,version,parents,resourceKey,webViewLink,capabilities(canDownload,canEdit)',
    supportsAllDrives: 'true',
  });
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(auth, fileId),
    signal: auth.signal,
  });
  return parseJson<DriveFileMetadata>(res);
}

export async function downloadFile(fileId: string, auth: DriveAuth): Promise<Blob> {
  const url = buildUrl(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    alt: 'media',
    supportsAllDrives: 'true',
  });
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(auth, fileId),
    signal: auth.signal,
  });
  await assertOk(res);
  return res.blob();
}

export interface CreateFileOptions extends DriveAuth {
  name: string;
  content: Blob | ArrayBuffer | Uint8Array;
  mimeType: string;
  parents?: string[];
}

export async function createFile(options: CreateFileOptions): Promise<DriveFileMetadata> {
  const url = buildUrl(`${DRIVE_UPLOAD_BASE}/files`, {
    uploadType: 'multipart',
    fields: 'id,name,mimeType,modifiedTime,size,version,parents,resourceKey,webViewLink,capabilities(canDownload,canEdit)',
    supportsAllDrives: 'true',
  });
  const metadata = {
    name: options.name,
    mimeType: options.mimeType,
    ...(options.parents ? { parents: options.parents } : {}),
  };
  const headers = buildHeaders(options);
  headers.set('Content-Type', `multipart/related; boundary=${MULTIPART_BOUNDARY}`);
  const body = await buildMultipart(metadata, options.content, options.mimeType);
  return parseJson<DriveFileMetadata>(
    await fetch(url, { method: 'POST', headers, body, signal: options.signal }),
  );
}

export interface ResumableSessionOptions extends DriveAuth {
  name: string;
  mimeType: string;
  contentLength?: number;
  parents?: string[];
}

export async function startResumableUploadSession(options: ResumableSessionOptions): Promise<string> {
  const url = buildUrl(`${DRIVE_UPLOAD_BASE}/files`, {
    uploadType: 'resumable',
    fields: 'id,name,mimeType,modifiedTime,size,version,parents,resourceKey,webViewLink',
    supportsAllDrives: 'true',
  });
  const headers = buildHeaders(options);
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  headers.set('X-Upload-Content-Type', options.mimeType);
  if (options.contentLength !== undefined) {
    headers.set('X-Upload-Content-Length', String(options.contentLength));
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: options.name,
      mimeType: options.mimeType,
      ...(options.parents ? { parents: options.parents } : {}),
    }),
    signal: options.signal,
  });
  await assertOk(res);
  const location = res.headers.get('Location');
  if (!location) {
    throw new DriveApiError(res.status, 'Drive did not return a resumable upload session URL.', null);
  }
  return location;
}

export interface UploadResumableChunkOptions {
  sessionUrl: string;
  bytes: Blob | ArrayBuffer | Uint8Array;
  signal?: AbortSignal;
}

export async function uploadResumable(options: UploadResumableChunkOptions): Promise<DriveFileMetadata> {
  // Single-shot upload of the whole file via the resumable session URL.
  // Suitable for files > 5 MB up to a few hundred MB; for very large files,
  // chunk this into Content-Range PUTs.
  const body = options.bytes instanceof Blob ? options.bytes : new Blob([options.bytes as BlobPart]);
  const res = await fetch(options.sessionUrl, {
    method: 'PUT',
    body,
    signal: options.signal,
  });
  return parseJson<DriveFileMetadata>(res);
}

export interface FindOrCreateFolderOptions extends DriveAuth {
  name: string;
}

export async function findOrCreateFolder(options: FindOrCreateFolderOptions): Promise<string> {
  const q = `name='${options.name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listUrl = buildUrl(`${DRIVE_API_BASE}/files`, {
    q,
    fields: 'files(id,name)',
    pageSize: '1',
    spaces: 'drive',
  });
  const listed = await parseJson<{ files: Array<{ id: string }> }>(
    await fetch(listUrl, { headers: buildHeaders(options), signal: options.signal }),
  );
  const existing = listed.files[0]?.id;
  if (existing) return existing;

  const created = await createFile({
    accessToken: options.accessToken,
    name: options.name,
    content: new Blob([], { type: 'application/vnd.google-apps.folder' }),
    mimeType: 'application/vnd.google-apps.folder',
    signal: options.signal,
  });
  if (!created.id) throw new DriveApiError(500, 'Drive folder creation did not return an id.', created);
  return created.id;
}

function buildHeaders(auth: DriveAuth, fileId?: string): Headers {
  const headers = new Headers({ Authorization: `Bearer ${auth.accessToken}` });
  if (auth.resourceKey && fileId) {
    headers.set('X-Goog-Drive-Resource-Keys', `${fileId}/${auth.resourceKey}`);
  }
  return headers;
}

function buildUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function buildMultipart(
  metadata: Record<string, unknown>,
  content: Blob | ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<Blob> {
  const part = content instanceof Uint8Array ? content.slice().buffer as ArrayBuffer : content;
  return new Blob(
    [
      `--${MULTIPART_BOUNDARY}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n',
      `--${MULTIPART_BOUNDARY}\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
      part,
      '\r\n',
      `--${MULTIPART_BOUNDARY}--`,
    ],
    { type: `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
  );
}

async function parseJson<T>(res: Response): Promise<T> {
  await assertOk(res);
  return res.json() as Promise<T>;
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const ct = res.headers.get('Content-Type') ?? '';
  const details = ct.includes('application/json') ? await res.json() : await res.text();
  const message = (typeof details === 'object' && details && 'error' in (details as Record<string, unknown>))
    ? (((details as { error: { message?: string } }).error?.message) ?? res.statusText)
    : res.statusText || 'Drive request failed';
  throw new DriveApiError(res.status, message, details);
}
