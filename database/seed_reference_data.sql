-- Seed reference data for the academic system
-- Run this after the main schema has been created.

INSERT INTO users (id, email, full_name, role, is_active)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'admin@school.edu', 'System Administrator', 'admin-security', TRUE),
    ('22222222-2222-4222-8222-222222222222', 'faculty@school.edu', 'Sample Faculty', 'faculty', TRUE),
    ('33333333-3333-4333-8333-333333333333', 'student@school.edu', 'Sample Student', 'student', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO departments (id, name, code, description)
VALUES
    ('44444444-4444-4444-8444-444444444444', 'Computer Science', 'CS', 'Computer Science Department'),
    ('55555555-5555-4555-8555-555555555555', 'Information Technology', 'IT', 'Information Technology Department')
ON CONFLICT (code) DO NOTHING;

INSERT INTO departments (name, code, is_college, description)
VALUES
    ('College of Engineering', 'COE', TRUE, 'College of Engineering'),
    ('College of Computer Studies', 'CCS', TRUE, 'College of Computer Studies'),
    ('College of Business and Accountancy', 'CBA', TRUE, 'College of Business and Accountancy'),
    ('College of Arts and Sciences', 'CAS', TRUE, 'College of Arts and Sciences'),
    ('College of Education', 'CED', TRUE, 'College of Education'),
    ('College of Architecture', 'COA', TRUE, 'College of Architecture'),
    ('College of Tourism and Hospitality Management', 'CTHM', TRUE, 'College of Tourism and Hospitality Management')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_college = TRUE,
    description = EXCLUDED.description;

INSERT INTO programs (id, department_id, name, code, description)
VALUES
    ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 'BS Computer Science', 'BSCS', 'Bachelor of Science in Computer Science'),
    ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 'BS Information Technology', 'BSIT', 'Bachelor of Science in Information Technology')
ON CONFLICT (code) DO NOTHING;

INSERT INTO academic_years (id, name, start_date, end_date, is_active)
VALUES
    ('88888888-8888-4888-8888-888888888888', '2024-2025', '2024-06-01', '2025-05-31', TRUE),
    ('99999999-9999-4999-8999-999999999999', '2025-2026', '2025-06-01', '2026-05-31', FALSE);

INSERT INTO student_outcomes (id, code, description)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SO1', 'Apply knowledge of computing fundamentals.'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'SO2', 'Design and evaluate solutions to computing problems.'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'SO3', 'Communicate effectively and ethically in the profession.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO cqi_categories (id, name, description, is_active)
VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Curriculum Improvement', 'Improvement in curriculum design and delivery.', TRUE),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Assessment Quality', 'Improvement in assessment design and grading quality.', TRUE),
    ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Student Support', 'Improvement in support services and student outcomes.', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO courses (id, department_id, code, title, description, units)
VALUES
    ('12121212-1212-4121-8121-121212121212', '44444444-4444-4444-8444-444444444444', 'CS101', 'Introduction to Programming', 'Introductory programming concepts', 3),
    ('13131313-1313-4131-8131-131313131313', '44444444-4444-4444-8444-444444444444', 'CS201', 'Data Structures', 'Core data structures and algorithms', 3),
    ('14141414-1414-4141-8141-141414141414', '55555555-5555-4555-8555-555555555555', 'IT101', 'IT Fundamentals', 'Foundations of information technology', 3)
ON CONFLICT (code) DO NOTHING;
