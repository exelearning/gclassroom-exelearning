export const APP_NAME = 'gclassroom-exelearning';

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
export const GOOGLE_API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) ?? '';
export const GOOGLE_PICKER_APP_ID = (import.meta.env.VITE_GOOGLE_PICKER_APP_ID as string | undefined) ?? '';
export const BACKEND_BASE_URL = ((import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');

export const APP_BASE_URL: string = import.meta.env.BASE_URL;

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const CLASSROOM_TEACHER_SCOPES = [
  'https://www.googleapis.com/auth/classroom.addons.teacher',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
];
export const CLASSROOM_STUDENT_SCOPES = [
  'https://www.googleapis.com/auth/classroom.addons.student',
];

// Folder name created in the teacher's Drive when uploading new .elpx files.
export const DRIVE_UPLOAD_FOLDER_NAME = 'eXeLearning Classroom';

// MIME types the Picker should accept. Drive does not have a canonical .elpx
// type — files arrive most often as octet-stream or zip.
export const ELPX_MIME_TYPES = [
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
];

export function requireGoogleClientId(): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID. Configure it before signing in to Google.');
  }
  return GOOGLE_CLIENT_ID;
}

export function requireBackendBaseUrl(): string {
  if (!BACKEND_BASE_URL) {
    throw new Error('Missing VITE_BACKEND_BASE_URL. Configure the backend URL before performing operations that require server state.');
  }
  return BACKEND_BASE_URL;
}
