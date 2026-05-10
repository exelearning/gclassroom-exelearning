import { describe, it, expect } from 'vitest';
import { summarizeElpxFile, extractDriveFileId } from './metadata';

describe('summarizeElpxFile', () => {
  it('accepts .elpx with octet-stream and download capability', () => {
    const summary = summarizeElpxFile({
      id: 'abc',
      name: 'lesson.elpx',
      mimeType: 'application/octet-stream',
      size: '12345',
      capabilities: { canDownload: true },
    });
    expect(summary.isLikelyElpx).toBe(true);
    expect(summary.size).toBe(12345);
    expect(summary.canDownload).toBe(true);
  });

  it('rejects when extension does not match', () => {
    const summary = summarizeElpxFile({
      id: 'abc',
      name: 'lesson.zip',
      mimeType: 'application/zip',
    });
    expect(summary.isLikelyElpx).toBe(false);
    expect(summary.rejectionReason).toMatch(/does not end in \.elpx/);
  });

  it('rejects when MIME type is foreign', () => {
    const summary = summarizeElpxFile({
      id: 'abc',
      name: 'lesson.elpx',
      mimeType: 'application/pdf',
    });
    expect(summary.isLikelyElpx).toBe(false);
    expect(summary.rejectionReason).toMatch(/Unsupported MIME/);
  });

  it('rejects when canDownload=false', () => {
    const summary = summarizeElpxFile({
      id: 'abc',
      name: 'lesson.elpx',
      mimeType: 'application/zip',
      capabilities: { canDownload: false },
    });
    expect(summary.isLikelyElpx).toBe(false);
    expect(summary.canDownload).toBe(false);
    expect(summary.rejectionReason).toMatch(/denies download/);
  });

  it('case-insensitive on extension', () => {
    expect(summarizeElpxFile({
      id: 'a', name: 'L.ELPX', mimeType: 'application/zip',
    }).isLikelyElpx).toBe(true);
  });
});

describe('extractDriveFileId', () => {
  it('parses /file/d/{id}/view URLs', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1ABC_def-2GHIjklmnOP/view'))
      .toEqual({ fileId: '1ABC_def-2GHIjklmnOP', resourceKey: undefined });
  });

  it('parses ?id= URLs and resourcekey', () => {
    expect(extractDriveFileId('https://drive.google.com/open?id=1ABC_def-2GHIjklmnOP&resourcekey=xyz123'))
      .toEqual({ fileId: '1ABC_def-2GHIjklmnOP', resourceKey: 'xyz123' });
  });

  it('parses raw fileIds', () => {
    expect(extractDriveFileId('1ABC_def-2GHIjklmnOPxxx'))
      .toEqual({ fileId: '1ABC_def-2GHIjklmnOPxxx' });
  });

  it('returns null on garbage input', () => {
    expect(extractDriveFileId('')).toBeNull();
    expect(extractDriveFileId('not a url at all')).toBeNull();
  });

  it('handles docs.google.com edit links', () => {
    expect(extractDriveFileId('https://docs.google.com/file/d/1file_id_here_xx_xxx/edit?resourcekey=k'))
      .toEqual({ fileId: '1file_id_here_xx_xxx', resourceKey: 'k' });
  });
});
