CREATE INDEX IF NOT EXISTS idx_enrollments_student_status
    ON public.enrollments (student_profile_id, enrollment_status);

CREATE TABLE IF NOT EXISTS public.enrollment_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    previous_status TEXT CHECK (previous_status IN ('active', 'dropped', 'completed')),
    new_status TEXT NOT NULL CHECK (new_status IN ('active', 'dropped', 'completed')),
    changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_status_history_enrollment
    ON public.enrollment_status_history (enrollment_id, changed_at DESC);

ALTER TABLE public.enrollment_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.enrollment_status_history
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.enrollment_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.record_enrollment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_previous_status TEXT;
    v_actor_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.enrollment_status IS NOT DISTINCT FROM OLD.enrollment_status THEN
            RETURN NEW;
        END IF;
        v_previous_status := OLD.enrollment_status;
    END IF;

    v_actor_id := NULLIF(current_setting('app.enrollment_actor_id', TRUE), '')::UUID;

    INSERT INTO public.enrollment_status_history (
        enrollment_id, previous_status, new_status, changed_by
    )
    VALUES (
        NEW.id, v_previous_status, NEW.enrollment_status, v_actor_id
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_enrollment_status_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS enrollments_record_status_change ON public.enrollments;
CREATE TRIGGER enrollments_record_status_change
AFTER INSERT OR UPDATE OF enrollment_status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.record_enrollment_status_change();

INSERT INTO public.enrollment_status_history (
    enrollment_id, previous_status, new_status, changed_at
)
SELECT enrollment.id, NULL, enrollment.enrollment_status, enrollment.created_at
  FROM public.enrollments AS enrollment
 WHERE NOT EXISTS (
    SELECT 1
      FROM public.enrollment_status_history AS history
     WHERE history.enrollment_id = enrollment.id
       AND history.previous_status IS NULL
 );

CREATE OR REPLACE FUNCTION public.manage_faculty_section_enrollments(
    p_section_id UUID,
    p_faculty_user_id UUID,
    p_student_profile_ids UUID[],
    p_action TEXT DEFAULT 'enroll'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_section RECORD;
    v_student_id UUID;
    v_valid_student_id UUID;
    v_existing_status TEXT;
    v_result JSONB := '[]'::JSONB;
    v_status TEXT;
    v_message TEXT;
    v_conflict BOOLEAN;
BEGIN
    IF p_action IS NULL OR p_action NOT IN ('enroll', 'drop') THEN
        RAISE EXCEPTION 'Unsupported enrollment action.';
    END IF;

    IF COALESCE(array_length(p_student_profile_ids, 1), 0) > 200 THEN
        RAISE EXCEPTION 'A maximum of 200 students can be processed at once.';
    END IF;

    SELECT section.id, section.course_id, section.academic_term_id
      INTO v_section
      FROM public.course_sections AS section
      JOIN public.faculty_profiles AS faculty
        ON faculty.id = section.faculty_id
     WHERE section.id = p_section_id
       AND faculty.user_id = p_faculty_user_id
     FOR KEY SHARE OF section;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section is not assigned to this Faculty member.';
    END IF;

    PERFORM set_config('app.enrollment_actor_id', p_faculty_user_id::TEXT, TRUE);

    FOREACH v_student_id IN ARRAY COALESCE(p_student_profile_ids, ARRAY[]::UUID[])
    LOOP
        IF v_student_id IS NULL THEN
            v_result := v_result || jsonb_build_array(jsonb_build_object(
                'student_profile_id', NULL,
                'status', 'invalid_student',
                'reason', 'Student profile ID is required.'
            ));
            CONTINUE;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended(
            v_student_id::TEXT || ':' || v_section.course_id::TEXT || ':' ||
            v_section.academic_term_id::TEXT,
            0
        ));

        SELECT profile.id
          INTO v_valid_student_id
          FROM public.student_profiles AS profile
          JOIN public.users AS account ON account.id = profile.user_id
         WHERE profile.id = v_student_id
           AND profile.is_enrolled IS TRUE
           AND account.role = 'student'
           AND account.is_active IS TRUE
         FOR KEY SHARE OF profile, account;

        IF NOT FOUND THEN
            v_result := v_result || jsonb_build_array(jsonb_build_object(
                'student_profile_id', v_student_id,
                'status', 'invalid_student',
                'reason', 'No active student account was found.'
            ));
            CONTINUE;
        END IF;

        SELECT enrollment.enrollment_status
          INTO v_existing_status
          FROM public.enrollments AS enrollment
         WHERE enrollment.section_id = p_section_id
           AND enrollment.student_profile_id = v_student_id
         FOR UPDATE;

        IF p_action = 'drop' THEN
            IF v_existing_status = 'active' THEN
                UPDATE public.enrollments
                   SET enrollment_status = 'dropped',
                       updated_at = NOW()
                 WHERE section_id = p_section_id
                   AND student_profile_id = v_student_id;
                v_status := 'dropped';
                v_message := 'Enrollment marked as dropped.';
            ELSIF v_existing_status IS NULL THEN
                v_status := 'not_enrolled';
                v_message := 'No enrollment exists for this student in the section.';
            ELSE
                v_status := v_existing_status;
                v_message := 'Enrollment is not active.';
            END IF;
        ELSIF v_existing_status = 'active' THEN
            v_status := 'already_active';
            v_message := 'Student is already active in this section.';
        ELSIF v_existing_status = 'completed' THEN
            v_status := 'already_completed';
            v_message := 'Completed enrollment cannot be reactivated.';
        ELSE
            SELECT EXISTS (
                SELECT 1
                  FROM public.enrollments AS other_enrollment
                  JOIN public.course_sections AS other_section
                    ON other_section.id = other_enrollment.section_id
                 WHERE other_enrollment.student_profile_id = v_student_id
                   AND other_enrollment.enrollment_status = 'active'
                   AND other_section.course_id = v_section.course_id
                   AND other_section.academic_term_id = v_section.academic_term_id
                   AND other_section.id <> p_section_id
            )
            INTO v_conflict;

            IF v_conflict THEN
                v_status := 'section_conflict';
                v_message := 'Student is active in another section of this course and term.';
            ELSIF v_existing_status = 'dropped' THEN
                UPDATE public.enrollments
                   SET enrollment_status = 'active',
                       updated_at = NOW()
                 WHERE section_id = p_section_id
                   AND student_profile_id = v_student_id;
                v_status := 'reactivated';
                v_message := 'Dropped enrollment reactivated.';
            ELSE
                INSERT INTO public.enrollments (
                    section_id,
                    student_profile_id,
                    enrollment_status
                )
                VALUES (p_section_id, v_student_id, 'active');
                v_status := 'enrolled';
                v_message := 'Student enrolled successfully.';
            END IF;
        END IF;

        v_result := v_result || jsonb_build_array(jsonb_build_object(
            'student_profile_id', v_student_id,
            'status', v_status,
            'reason', v_message
        ));
    END LOOP;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_faculty_section_enrollments(
    UUID, UUID, UUID[], TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_faculty_section_enrollments(
    UUID, UUID, UUID[], TEXT
) TO service_role;
