export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
  parents?: string[];
  resourceKey?: string;
  webViewLink?: string;
  capabilities?: {
    canDownload?: boolean;
    canEdit?: boolean;
  };
}

export interface ElpxFileSummary {
  fileId: string;
  name: string;
  mimeType: string;
  size?: number;
  version?: string;
  modifiedTime?: string;
  resourceKey?: string;
  canDownload: boolean;
  isLikelyElpx: boolean;
  rejectionReason?: string;
}

const ELPX_LIKE_MIME = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]);

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Decide whether a Drive file looks like a `.elpx` package, without yet
 * downloading the bytes. Drive does not have a canonical MIME type for
 * `.elpx`, so we rely on extension + a permissive MIME allowlist.
 */
export function summarizeElpxFile(metadata: DriveFileMetadata): ElpxFileSummary {
  const name = metadata.name ?? '';
  const lowerName = name.toLowerCase();
  const hasElpxExtension = lowerName.endsWith('.elpx');
  const mimeOk = ELPX_LIKE_MIME.has(metadata.mimeType);
  const canDownload = metadata.capabilities?.canDownload !== false;

  const isFolder = metadata.mimeType === GOOGLE_FOLDER_MIME;
  const isGoogleNative = metadata.mimeType?.startsWith('application/vnd.google-apps.') ?? false;
  const isLikelyElpx = !isFolder && !isGoogleNative && hasElpxExtension && mimeOk && canDownload;
  let rejectionReason: string | undefined;
  if (isFolder) rejectionReason = 'This is a folder, not a file. Open the folder and pick an .elpx inside.';
  else if (isGoogleNative) rejectionReason = `This is a native Google file (${metadata.mimeType}); .elpx files are ZIP-based and cannot be Google Docs/Sheets/Slides.`;
  else if (!hasElpxExtension) rejectionReason = 'File name does not end in .elpx';
  else if (!mimeOk) rejectionReason = `Unsupported MIME type: ${metadata.mimeType}`;
  else if (!canDownload) rejectionReason = 'Drive denies download for this file';

  return {
    fileId: metadata.id,
    name,
    mimeType: metadata.mimeType,
    size: metadata.size ? Number(metadata.size) : undefined,
    version: metadata.version,
    modifiedTime: metadata.modifiedTime,
    resourceKey: metadata.resourceKey,
    canDownload,
    isLikelyElpx,
    rejectionReason: isLikelyElpx ? undefined : rejectionReason,
  };
}

const DRIVE_FILE_ID_RE = /[-\w]{10,}/;

/**
 * Extract a Drive fileId from a variety of URL/string inputs the teacher might
 * paste:
 *   https://drive.google.com/file/d/{ID}/view
 *   https://drive.google.com/open?id={ID}
 *   https://docs.google.com/file/d/{ID}/edit?resourcekey=...
 *   {ID} (raw)
 * Returns null if no fileId can be extracted.
 */
export function extractDriveFileId(input: string): { fileId: string; resourceKey?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Plain fileId
  if (/^[-\w]{20,}$/.test(trimmed)) {
    return { fileId: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const resourceKey = url.searchParams.get('resourcekey') ?? undefined;
  const idParam = url.searchParams.get('id');
  if (idParam && DRIVE_FILE_ID_RE.test(idParam)) {
    return { fileId: idParam, resourceKey };
  }

  // Path forms: /file/d/{ID}/, /document/d/{ID}/, etc.
  const segments = url.pathname.split('/').filter(Boolean);
  const dIdx = segments.indexOf('d');
  if (dIdx >= 0 && dIdx + 1 < segments.length) {
    const id = segments[dIdx + 1];
    if (id && DRIVE_FILE_ID_RE.test(id)) {
      return { fileId: id, resourceKey };
    }
  }

  return null;
}
