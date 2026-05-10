import {
  createFile,
  startResumableUploadSession,
  uploadResumable,
  findOrCreateFolder,
} from './drive-api';
import type { DriveFileMetadata } from './metadata';

const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

export interface UploadElpxToDriveOptions {
  accessToken: string;
  file: File;
  parentFolderName?: string;
  signal?: AbortSignal;
}

/**
 * Upload a local `.elpx` to Drive. Uses multipart for files <5 MB and a
 * resumable session URL for larger files. Returns the Drive metadata of the
 * created file.
 */
export async function uploadElpxToDrive(options: UploadElpxToDriveOptions): Promise<DriveFileMetadata> {
  const { file } = options;
  let parents: string[] | undefined;
  if (options.parentFolderName) {
    const folderId = await findOrCreateFolder({
      accessToken: options.accessToken,
      name: options.parentFolderName,
      signal: options.signal,
    });
    parents = [folderId];
  }

  const mimeType = file.type || 'application/octet-stream';

  if (file.size < RESUMABLE_THRESHOLD) {
    return createFile({
      accessToken: options.accessToken,
      name: file.name,
      mimeType,
      content: file,
      parents,
      signal: options.signal,
    });
  }

  const sessionUrl = await startResumableUploadSession({
    accessToken: options.accessToken,
    name: file.name,
    mimeType,
    contentLength: file.size,
    parents,
    signal: options.signal,
  });
  return uploadResumable({ sessionUrl, bytes: file, signal: options.signal });
}
