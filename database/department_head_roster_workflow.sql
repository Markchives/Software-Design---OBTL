-- Department Head roster enrollment actions, scoped to the user's department.
-- Apply to each Supabase project used by local and Render.

CREATE OR REPLACE FUNCTION public.manage_department_head_section_enrollment(
    p_section_id UUID,
    p_actor_user_id UUID,
    p_student_profile_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_actor_department_id UUID;
    v_course_department_id UUID;
    v_course_id UUID;
    v_term_id UUID;
    v_existing_status TEXT;
    v_student_valid BOOLEAN;
    v_conflict BOOLEAN;
    v_status TEXT;
BEGIN
    IF p_action IS NULL OR p_action NOT IN ('enroll', 'drop') THEN
        RAISE EXCEPTION 'Unsupported roster action.';
    END IF;

    SELECT role INTO v_role
      FROM public.users
     WHERE id = p_actor_user_id AND is_active IS TRUE;
    IF NOT FOUND OR v_role NOT IN ('department-head', 'admin-security') THEN
        RAISE EXCEPTION 'Only an active Department Head or Admin may manage this roster.';
    END IF;

    IF v_role = 'department-head' THEN
        SELECT department_id INTO v_actor_department_id
          FROM public.dept_head_profiles
         WHERE user_id = p_actor_user_id;
        IF v_actor_department_id IS NULL THEN
            RAISE EXCEPTION 'Department Head department is not configured.';
        END IF;
    END IF;

    SELECT course.department_id, section.course_id, section.academic_term_id
      INTO v_course_department_id, v_course_id, v_term_id
      FROM public.course_sections AS section
      JOIN public.courses AS course ON course.id = section.course_id
     WHERE section.id = p_section_id
     FOR KEY SHARE OF section;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course section was not found.';
    END IF;
    IF v_role = 'department-head'
       AND v_course_department_id IS DISTINCT FROM v_actor_department_id THEN
        RAISE EXCEPTION 'Section is outside this Department Head department.';
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.student_profiles AS profile
          JOIN public.users AS student ON student.id = profile.user_id
         WHERE profile.id = p_student_profile_id
           AND student.role = 'student'
           AND student.is_active IS TRUE
    ) INTO v_student_valid;
    IF NOT v_student_valid THEN
        RAISE EXCEPTION 'An active student account is required.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_student_profile_id::TEXT || ':' || v_course_id::TEXT || ':' || v_term_id::TEXT, 0
    ));
    PERFORM set_config('app.enrollment_actor_id', p_actor_user_id::TEXT, TRUE);

    SELECT enrollment_status INTO v_existing_status
      FROM public.enrollments
     WHERE section_id = p_section_id
       AND student_profile_id = p_student_profile_id
     FOR UPDATE;

    IF p_action = 'drop' THEN
        IF v_existing_status <> 'active' OR v_existing_status IS NULL THEN
            RAISE EXCEPTION 'Only an active enrollment can be removed from the roster.';
        END IF;
        UPDATE public.enrollments
           SET enrollment_status = 'dropped', updated_at = NOW()
         WHERE section_id = p_section_id
           AND student_profile_id = p_student_profile_id;
        v_status := 'dropped';
    ELSIF v_existing_status = 'active' THEN
        v_status := 'already_active';
    ELSIF v_existing_status = 'completed' THEN
        RAISE EXCEPTION 'Completed enrollment cannot be reactivated.';
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.enrollments AS enrollment
              JOIN public.course_sections AS other_section
                ON other_section.id = enrollment.section_id
             WHERE enrollment.student_profile_id = p_student_profile_id
               AND enrollment.enrollment_status = 'active'
               AND other_section.course_id = v_course_id
               AND other_section.academic_term_id = v_term_id
               AND other_section.id <> p_section_id
        ) INTO v_conflict;
        IF v_conflict THEN
            RAISE EXCEPTION 'Student is already enrolled in another section of this course and term.';
        END IF;

        IF v_existing_status = 'dropped' THEN
            UPDATE public.enrollments
               SET enrollment_status = 'active', updated_at = NOW()
             WHERE section_id = p_section_id
               AND student_profile_id = p_student_profile_id;
            v_status := 'reactivated';
        ELSE
            INSERT INTO public.enrollments (section_id, student_profile_id, enrollment_status)
            VALUES (p_section_id, p_student_profile_id, 'active');
            v_status := 'enrolled';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'section_id', p_section_id,
        'student_profile_id', p_student_profile_id,
        'status', v_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_department_head_section_enrollment(UUID, UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_department_head_section_enrollment(UUID, UUID, UUID, TEXT)
    TO service_role;
