BEGIN;

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
    VALUES (
        v_section_id, NULL, p_faculty_id, p_actor_id, 'Initial assignment'
    );
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

COMMIT;
