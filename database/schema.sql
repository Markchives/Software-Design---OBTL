CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'department-head', 'admin-security')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired'))
);

CREATE TABLE IF NOT EXISTS student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    student_number TEXT NOT NULL UNIQUE,
    program_id UUID,
    section_id UUID,
    academic_year_id UUID,
    is_enrolled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_number TEXT,
    department_id UUID,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dept_head_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID,
    employee_number TEXT,
    designation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_security_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_number TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    is_college BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 3),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (academic_year_id, term_number),
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    units INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
    section_name TEXT NOT NULL,
    faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    room TEXT,
    schedule TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, academic_term_id, section_name)
);

CREATE TABLE IF NOT EXISTS course_section_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    old_faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    new_faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_year_number
    ON academic_terms (academic_year_id, term_number);
CREATE INDEX IF NOT EXISTS idx_course_sections_term_id
    ON course_sections (academic_term_id);
CREATE INDEX IF NOT EXISTS idx_course_section_assignment_history_section
    ON course_section_assignment_history (section_id, created_at DESC);

CREATE OR REPLACE FUNCTION create_academic_year_with_terms(
    p_name TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_terms JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_year_id UUID;
    term_record JSONB;
    term_number INTEGER;
    term_start DATE;
    term_end DATE;
    previous_term_end DATE;
BEGIN
    IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Academic year name must contain 1 to 80 characters.';
    END IF;
    IF (p_start_date IS NULL) <> (p_end_date IS NULL) THEN
        RAISE EXCEPTION 'Provide both academic year dates or leave both blank.';
    END IF;
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL
       AND p_start_date > p_end_date THEN
        RAISE EXCEPTION 'Academic year start date must be before its end date.';
    END IF;
    IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'array'
       OR jsonb_array_length(p_terms) <> 3 THEN
        RAISE EXCEPTION 'An academic year must contain exactly three terms.';
    END IF;

    INSERT INTO academic_years (name, start_date, end_date, is_active)
    VALUES (btrim(p_name), p_start_date, p_end_date, FALSE)
    RETURNING id INTO new_year_id;

    FOR term_number IN 1..3 LOOP
        term_record := p_terms -> (term_number - 1);
        IF (term_record ->> 'term_number')::INTEGER IS DISTINCT FROM term_number
           OR (term_record ->> 'name') IS DISTINCT FROM ('Term ' || term_number::TEXT) THEN
            RAISE EXCEPTION 'Terms must be supplied in Term 1, Term 2, Term 3 order.';
        END IF;
        IF char_length(btrim(coalesce(term_record ->> 'name', ''))) NOT BETWEEN 1 AND 40 THEN
            RAISE EXCEPTION 'Each term name must contain 1 to 40 characters.';
        END IF;
        term_start := nullif(term_record ->> 'start_date', '')::DATE;
        term_end := nullif(term_record ->> 'end_date', '')::DATE;
        IF (term_start IS NULL) <> (term_end IS NULL) THEN
            RAISE EXCEPTION 'Provide both dates for a term or leave both blank.';
        END IF;
        IF term_start IS NOT NULL AND term_start > term_end THEN
            RAISE EXCEPTION 'A term start date must be before its end date.';
        END IF;
        IF p_start_date IS NOT NULL AND term_start IS NOT NULL
           AND term_start < p_start_date THEN
            RAISE EXCEPTION 'Term dates must fall within the academic year.';
        END IF;
        IF p_end_date IS NOT NULL AND term_end IS NOT NULL
           AND term_end > p_end_date THEN
            RAISE EXCEPTION 'Term dates must fall within the academic year.';
        END IF;
        IF previous_term_end IS NOT NULL AND term_start IS NOT NULL
           AND term_start <= previous_term_end THEN
            RAISE EXCEPTION 'Academic term date ranges must not overlap.';
        END IF;

        INSERT INTO academic_terms (
            academic_year_id, term_number, name, start_date, end_date
        )
        VALUES (
            new_year_id, term_number, btrim(term_record ->> 'name'),
            term_start, term_end
        );
        previous_term_end := term_end;
    END LOOP;

    RETURN new_year_id;
END;
$$;

REVOKE ALL ON FUNCTION create_academic_year_with_terms(TEXT, DATE, DATE, JSONB)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_academic_year_with_terms(TEXT, DATE, DATE, JSONB)
    TO service_role;

CREATE OR REPLACE FUNCTION create_course_section_with_assignment(
    p_course_id UUID,
    p_academic_term_id UUID,
    p_section_name TEXT,
    p_faculty_id UUID,
    p_actor_id UUID,
    p_room TEXT,
    p_schedule TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    section_id UUID;
    year_id UUID;
    department_id UUID;
BEGIN
    SELECT course.department_id, term.academic_year_id
    INTO department_id, year_id
    FROM courses AS course
    JOIN academic_terms AS term ON term.id = p_academic_term_id
    WHERE course.id = p_course_id;
    IF department_id IS NULL OR year_id IS NULL THEN
        RAISE EXCEPTION 'Course or academic term was not found.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM dept_head_profiles AS head
        JOIN users AS actor ON actor.id = head.user_id
        WHERE head.user_id = p_actor_id
          AND head.department_id = department_id
          AND actor.role = 'department-head'
          AND actor.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Department Head is not authorized for this course.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM faculty_profiles AS faculty
        JOIN users AS account ON account.id = faculty.user_id
        WHERE faculty.id = p_faculty_id
          AND faculty.department_id = department_id
          AND account.role = 'faculty'
          AND account.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Faculty member is not active in this department.';
    END IF;

    INSERT INTO course_sections (
        course_id, academic_year_id, academic_term_id, section_name,
        faculty_id, room, schedule
    )
    VALUES (
        p_course_id, year_id, p_academic_term_id, btrim(p_section_name),
        p_faculty_id, nullif(btrim(p_room), ''), nullif(btrim(p_schedule), '')
    )
    RETURNING id INTO section_id;

    INSERT INTO course_section_assignment_history (
        section_id, old_faculty_id, new_faculty_id, changed_by, reason
    )
    VALUES (section_id, NULL, p_faculty_id, p_actor_id, 'Initial assignment');
    RETURN section_id;
END;
$$;

REVOKE ALL ON FUNCTION create_course_section_with_assignment(
    UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_course_section_with_assignment(
    UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION reassign_course_section_faculty(
    p_section_id UUID,
    p_faculty_id UUID,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_faculty_id UUID;
    department_id UUID;
BEGIN
    SELECT course.department_id, section.faculty_id
    INTO department_id, old_faculty_id
    FROM course_sections AS section
    JOIN courses AS course ON course.id = section.course_id
    WHERE section.id = p_section_id
    FOR UPDATE OF section;
    IF department_id IS NULL THEN
        RAISE EXCEPTION 'Course section was not found.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM dept_head_profiles AS head
        JOIN users AS actor ON actor.id = head.user_id
        WHERE head.user_id = p_actor_id
          AND head.department_id = department_id
          AND actor.role = 'department-head'
          AND actor.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Department Head is not authorized for this course.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM faculty_profiles AS faculty
        JOIN users AS account ON account.id = faculty.user_id
        WHERE faculty.id = p_faculty_id
          AND faculty.department_id = department_id
          AND account.role = 'faculty'
          AND account.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Faculty member is not active in this department.';
    END IF;
    IF old_faculty_id = p_faculty_id THEN
        RETURN;
    END IF;

    UPDATE course_sections
    SET faculty_id = p_faculty_id, updated_at = NOW()
    WHERE id = p_section_id;
    INSERT INTO course_section_assignment_history (
        section_id, old_faculty_id, new_faculty_id, changed_by, reason
    )
    VALUES (
        p_section_id, old_faculty_id, p_faculty_id, p_actor_id,
        nullif(btrim(p_reason), '')
    );
END;
$$;

REVOKE ALL ON FUNCTION reassign_course_section_faculty(UUID, UUID, UUID, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reassign_course_section_faculty(UUID, UUID, UUID, TEXT)
    TO service_role;

CREATE TABLE IF NOT EXISTS course_syllabi (
    section_id UUID PRIMARY KEY REFERENCES course_sections(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    enrollment_status TEXT NOT NULL DEFAULT 'active' CHECK (enrollment_status IN ('active', 'dropped', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, student_profile_id)
);

CREATE TABLE IF NOT EXISTS course_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_role TEXT NOT NULL CHECK (author_role IN ('faculty', 'department-head')),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('section', 'department')),
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (audience_type = 'section' AND section_id IS NOT NULL AND department_id IS NULL)
        OR
        (audience_type = 'department' AND section_id IS NULL AND department_id IS NOT NULL)
    ),
    CHECK (
        (author_role = 'faculty' AND audience_type = 'section')
        OR
        (author_role = 'department-head' AND audience_type = 'department')
    )
);

ALTER TABLE course_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS course_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    target_percentage NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, code)
);

CREATE TABLE IF NOT EXISTS student_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    due_date DATE,
    weight_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    max_score NUMERIC(7,2) NOT NULL DEFAULT 100.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assessment_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS raw_assessment_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    assessment_activity_id UUID NOT NULL REFERENCES assessment_activities(id) ON DELETE CASCADE,
    score NUMERIC(7,2),
    max_score NUMERIC(7,2) NOT NULL DEFAULT 100.00,
    percentage NUMERIC(5,2),
    remarks TEXT,
    entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_activity_id, student_profile_id)
);

ALTER TABLE raw_assessment_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS co_attainment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    attainment_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    target_percentage NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    status TEXT NOT NULL DEFAULT 'below_target' CHECK (status IN ('met', 'below_target', 'needs_improvement')),
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, course_outcome_id)
);

CREATE TABLE IF NOT EXISTS student_co_attainment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    attainment_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'not_met' CHECK (status IN ('met', 'not_met')),
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, student_profile_id, course_outcome_id)
);

CREATE TABLE IF NOT EXISTS cqi_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cqi_action_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    problem_statement TEXT NOT NULL,
    proposed_intervention TEXT NOT NULL,
    expected_improvement TEXT,
    target_date DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'returned', 'ongoing', 'completed')),
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cqi_action_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cqi_action_plan_id UUID NOT NULL REFERENCES cqi_action_plans(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    category_id UUID REFERENCES cqi_categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cqi_action_plan_id, course_outcome_id)
);

CREATE TABLE IF NOT EXISTS cqi_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cqi_action_plan_id UUID NOT NULL REFERENCES cqi_action_plans(id) ON DELETE CASCADE,
    reviewed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned')),
    comments TEXT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gradebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL UNIQUE REFERENCES course_sections(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'for_verification', 'verified', 'locked', 'reopened')),
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopen_reason TEXT,
    correction_notes TEXT,
    missing_score_count INTEGER NOT NULL DEFAULT 0,
    invalid_entry_count INTEGER NOT NULL DEFAULT 0,
    unmapped_co_so_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gradebook_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gradebook_id UUID NOT NULL REFERENCES gradebooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gradebook_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gradebook_id UUID NOT NULL REFERENCES gradebooks(id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_path TEXT,
    version TEXT NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    section_id UUID REFERENCES course_sections(id) ON DELETE SET NULL,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    generated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_level TEXT NOT NULL DEFAULT 'faculty' CHECK (access_level IN ('faculty', 'department-head', 'admin'))
);

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    module TEXT,
    table_name TEXT,
    record_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_program_id ON student_profiles (program_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_section_id ON student_profiles (section_id);
CREATE INDEX IF NOT EXISTS idx_faculty_profiles_department_id ON faculty_profiles (department_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_course_id ON course_sections (course_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_faculty_id ON course_sections (faculty_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section_id ON enrollments (section_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_profile_id ON enrollments (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_course_posts_section_created_at ON course_posts (section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_posts_department_created_at ON course_posts (department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_assessment_scores_student_profile_id ON raw_assessment_scores (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_raw_assessment_scores_activity_id ON raw_assessment_scores (assessment_activity_id);
CREATE INDEX IF NOT EXISTS idx_co_attainment_section_id ON co_attainment (section_id);
CREATE INDEX IF NOT EXISTS idx_student_co_attainment_student_id ON student_co_attainment (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_cqi_action_plans_section_id ON cqi_action_plans (section_id);
CREATE INDEX IF NOT EXISTS idx_gradebooks_status ON gradebooks (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
