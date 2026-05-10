/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_TOKEN_URL: string;
  GOOGLE_OAUTH_REVOKE_URL: string;
  CLASSROOM_API_BASE: string;
  TOKEN_VAULT_KEY: string;
  ALLOWED_FRONTEND_ORIGINS: string;
}

export type GradingMode = 'automatic' | 'review';

export type GradeSyncState = 'pending' | 'synced' | 'error' | 'manual_required';

export interface AttachmentRow {
  attachment_id: string;
  course_id: string;
  item_id: string;
  item_type: string;
  teacher_user_id: string;
  drive_file_id: string;
  drive_resource_key: string | null;
  title: string;
  max_points: number;
  grading_mode: GradingMode;
  created_at: string;
  updated_at: string;
}

export interface AttemptRow {
  attempt_id: string;
  attachment_id: string;
  submission_id: string;
  student_user_id: string;
  scorm_version: string | null;
  scorm_data_json: string;
  normalized_score_json: string | null;
  points_earned: number | null;
  submitted_at: string | null;
  grade_sync_state: GradeSyncState;
  grade_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  google_user_id: string;
  email: string | null;
  display_name: string | null;
  encrypted_refresh_token: string | null;
  created_at: string;
  updated_at: string;
}
