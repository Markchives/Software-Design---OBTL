BEGIN;

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

DO $$
DECLARE
    legacy_year_id UUID;
BEGIN
    IF EXISTS (
        SELECT 1 FROM course_sections WHERE academic_year_id IS NULL
    ) THEN
        INSERT INTO academic_years (name, is_active)
        VALUES ('Legacy Academic Year', FALSE)
        RETURNING id INTO legacy_year_id;

        UPDATE course_sections
        SET academic_year_id = legacy_year_id
        WHERE academic_year_id IS NULL;
    END IF;
END;
$$;

INSERT INTO academic_terms (academic_year_id, term_number, name)
SELECT years.id, terms.term_number, 'Term ' || terms.term_number
FROM academic_years AS years
CROSS JOIN (VALUES (1::SMALLINT), (2::SMALLINT), (3::SMALLINT)) AS terms(term_number)
ON CONFLICT (academic_year_id, term_number) DO NOTHING;

ALTER TABLE course_sections
    ADD COLUMN IF NOT EXISTS academic_term_id UUID
        REFERENCES academic_terms(id) ON DELETE RESTRICT;

UPDATE course_sections AS sections
SET academic_term_id = terms.id
FROM academic_terms AS terms
WHERE sections.academic_term_id IS NULL
  AND terms.academic_year_id = sections.academic_year_id
  AND terms.term_number = 1;

ALTER TABLE course_sections
    ALTER COLUMN academic_term_id SET NOT NULL;

ALTER TABLE course_sections
    DROP CONSTRAINT IF EXISTS course_sections_course_id_academic_year_id_section_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_sections_course_term_name_unique
    ON course_sections (course_id, academic_term_id, section_name);

CREATE TABLE IF NOT EXISTS course_section_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    old_faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    new_faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE SET NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    v_section_id UUID;
    v_year_id UUID;
    v_department_id UUID;
BEGIN
    SELECT course.department_id, term.academic_year_id
    INTO v_department_id, v_year_id
    FROM courses AS course
    JOIN academic_terms AS term ON term.id = p_academic_term_id
    WHERE course.id = p_course_id;
    IF v_department_id IS NULL OR v_year_id IS NULL THEN
        RAISE EXCEPTION 'Course or academic term was not found.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM dept_head_profiles AS head
        JOIN users AS actor ON actor.id = head.user_id
        WHERE head.user_id = p_actor_id
          AND head.department_id = v_department_id
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
          AND faculty.department_id = v_department_id
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
        p_course_id, v_year_id, p_academic_term_id, btrim(p_section_name),
        p_faculty_id, nullif(btrim(p_room), ''), nullif(btrim(p_schedule), '')
    )
    RETURNING id INTO v_section_id;

    INSERT INTO course_section_assignment_history (
        section_id, old_faculty_id, new_faculty_id, changed_by, reason
    )
    VALUES (v_section_id, NULL, p_faculty_id, p_actor_id, 'Initial assignment');
    RETURN v_section_id;
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
    v_old_faculty_id UUID;
    v_department_id UUID;
BEGIN
    SELECT course.department_id, section.faculty_id
    INTO v_department_id, v_old_faculty_id
    FROM course_sections AS section
    JOIN courses AS course ON course.id = section.course_id
    WHERE section.id = p_section_id
    FOR UPDATE OF section;
    IF v_department_id IS NULL THEN
        RAISE EXCEPTION 'Course section was not found.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM dept_head_profiles AS head
        JOIN users AS actor ON actor.id = head.user_id
        WHERE head.user_id = p_actor_id
          AND head.department_id = v_department_id
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
          AND faculty.department_id = v_department_id
          AND account.role = 'faculty'
          AND account.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Faculty member is not active in this department.';
    END IF;
    IF v_old_faculty_id = p_faculty_id THEN
        RETURN;
    END IF;

    UPDATE course_sections
    SET faculty_id = p_faculty_id, updated_at = NOW()
    WHERE id = p_section_id;
    INSERT INTO course_section_assignment_history (
        section_id, old_faculty_id, new_faculty_id, changed_by, reason
    )
    VALUES (
        p_section_id, v_old_faculty_id, p_faculty_id, p_actor_id,
        nullif(btrim(p_reason), '')
    );
END;
$$;

REVOKE ALL ON FUNCTION reassign_course_section_faculty(UUID, UUID, UUID, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reassign_course_section_faculty(UUID, UUID, UUID, TEXT)
    TO service_role;

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

COMMIT;
