-- EXT-154: Add role column to attendances for coordinator/participant routing
CREATE TYPE attendance_role AS ENUM ('participant', 'coordinator');
ALTER TABLE attendances ADD COLUMN role attendance_role NOT NULL DEFAULT 'participant';
