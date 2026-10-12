-- Fix the existing database so the role values match the app's current logic.
-- Run this in Supabase after the schema was created.

ALTER TABLE IF EXISTS users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE IF EXISTS users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('student', 'faculty', 'department-head', 'admin-security'));

ALTER TABLE IF EXISTS generated_reports
    DROP CONSTRAINT IF EXISTS generated_reports_access_level_check;

ALTER TABLE IF EXISTS generated_reports
    ADD CONSTRAINT generated_reports_access_level_check
    CHECK (access_level IN ('faculty', 'department-head', 'admin'));

UPDATE users
SET role = 'department-head'
WHERE role = 'department_head';

UPDATE users
SET role = 'admin-security'
WHERE role = 'admin_security';

UPDATE generated_reports
SET access_level = 'department-head'
WHERE access_level = 'department_head';
