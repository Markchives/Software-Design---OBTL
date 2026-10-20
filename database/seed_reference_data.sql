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

INSERT INTO programs (department_id, name, code, description)
SELECT departments.id, programs.name, programs.code, programs.name
FROM (
    VALUES
        ('COE', 'Bachelor of Science in Civil Engineering', 'BSCE'),
        ('COE', 'Bachelor of Science in Electrical Engineering', 'BSEE'),
        ('COE', 'Bachelor of Science in Electronics Engineering', 'BSECE'),
        ('COE', 'Bachelor of Science in Mechanical Engineering', 'BSME'),
        ('COE', 'Bachelor of Science in Computer Engineering', 'BSCPE'),
        ('CCS', 'Bachelor of Science in Computer Science', 'BSCS'),
        ('CCS', 'Bachelor of Science in Information Technology', 'BSIT'),
        ('CCS', 'Bachelor of Science in Information Systems', 'BSIS'),
        ('CCS', 'Bachelor of Science in Entertainment and Multimedia Computing', 'BSEMC'),
        ('CCS', 'Bachelor of Science in Data Science', 'BSDS'),
        ('CBA', 'Bachelor of Science in Accountancy', 'BSA'),
        ('CBA', 'Bachelor of Science in Management Accounting', 'BSMA'),
        ('CBA', 'Bachelor of Science in Business Administration major in Marketing Management', 'BSBA-MM'),
        ('CBA', 'Bachelor of Science in Business Administration major in Financial Management', 'BSBA-FM'),
        ('CBA', 'Bachelor of Science in Entrepreneurship', 'BSE'),
        ('CAS', 'Bachelor of Arts in Communication', 'BACOMM'),
        ('CAS', 'Bachelor of Science in Psychology', 'BSP'),
        ('CAS', 'Bachelor of Science in Biology', 'BSBIOL'),
        ('CAS', 'Bachelor of Science in Mathematics', 'BSMATH'),
        ('CAS', 'Bachelor of Science in Economics', 'BSECON'),
        ('CED', 'Bachelor of Elementary Education', 'BEED'),
        ('CED', 'Bachelor of Secondary Education major in English', 'BSED-ENG'),
        ('CED', 'Bachelor of Secondary Education major in Mathematics', 'BSED-MATH'),
        ('CED', 'Bachelor of Secondary Education major in Science', 'BSED-SCI'),
        ('CED', 'Bachelor of Physical Education', 'BPE'),
        ('COA', 'Bachelor of Science in Architecture', 'BSARCH'),
        ('COA', 'Bachelor of Science in Interior Design', 'BSID'),
        ('COA', 'Bachelor of Science in Environmental Planning', 'BSEPLAN'),
        ('COA', 'Bachelor of Landscape Architecture', 'BLA'),
        ('COA', 'Bachelor of Science in Urban Planning', 'BSUP'),
        ('CTHM', 'Bachelor of Science in Tourism Management', 'BSTM'),
        ('CTHM', 'Bachelor of Science in Hospitality Management', 'BSHM'),
        ('CTHM', 'Bachelor of Science in Travel Management', 'BSTRM'),
        ('CTHM', 'Bachelor of Science in Culinary Management', 'BSCM'),
        ('CTHM', 'Bachelor of Science in Events Management', 'BSEVM')
) AS programs(department_code, name, code)
JOIN departments ON departments.code = programs.department_code
ON CONFLICT (code) DO UPDATE
SET department_id = EXCLUDED.department_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO academic_years (id, name, start_date, end_date, is_active)
VALUES
    ('88888888-8888-4888-8888-888888888888', '2024-2025', '2024-06-01', '2025-05-31', TRUE),
    ('99999999-9999-4999-8999-999999999999', '2025-2026', '2025-06-01', '2026-05-31', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_outcomes (id, code, description)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SO1', 'Apply knowledge of computing fundamentals.'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'SO2', 'Design and evaluate solutions to computing problems.'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'SO3', 'Communicate effectively and ethically in the profession.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO student_outcomes (code, description)
VALUES
    ('SO(A)', 'SO(A)'), ('SO(B)', 'SO(B)'), ('SO(C)', 'SO(C)'),
    ('SO(D)', 'SO(D)'), ('SO(E)', 'SO(E)'), ('SO(F)', 'SO(F)'),
    ('SO(G1)', 'SO(G1)'), ('SO(G2)', 'SO(G2)'), ('SO(H)', 'SO(H)'),
    ('SO(I)', 'SO(I)'), ('SO(J)', 'SO(J)'), ('SO(K)', 'SO(K)'),
    ('SO(L)', 'SO(L)')
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
