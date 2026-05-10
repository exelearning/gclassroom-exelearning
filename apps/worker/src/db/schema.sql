-- gclassroom-exelearning — D1 schema
-- Apply with: wrangler d1 execute gclassroom_exelearning --file=src/db/schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
    google_user_id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    encrypted_refresh_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    attachment_id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    teacher_user_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    drive_resource_key TEXT,
    title TEXT NOT NULL,
    max_points REAL NOT NULL,
    grading_mode TEXT NOT NULL CHECK (grading_mode IN ('automatic', 'review')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_course_item
    ON attachments(course_id, item_id);
CREATE INDEX IF NOT EXISTS idx_attachments_teacher
    ON attachments(teacher_user_id);

CREATE TABLE IF NOT EXISTS attempts (
    attempt_id TEXT PRIMARY KEY,
    attachment_id TEXT NOT NULL REFERENCES attachments(attachment_id) ON DELETE CASCADE,
    submission_id TEXT NOT NULL,
    student_user_id TEXT NOT NULL,
    scorm_version TEXT,
    scorm_data_json TEXT NOT NULL,
    normalized_score_json TEXT,
    points_earned REAL,
    submitted_at TEXT,
    grade_sync_state TEXT NOT NULL CHECK (grade_sync_state IN ('pending', 'synced', 'error', 'manual_required')),
    grade_sync_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_submission
    ON attempts(attachment_id, submission_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student
    ON attempts(student_user_id);
