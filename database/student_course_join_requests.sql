-- Student requests to join course sections by course code.
-- Apply to each Supabase project used by local and Render.

CREATE TABLE IF NOT EXISTS public.student_course_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_profile_id UUID NOT NULL
        REFERENCES public.student_profiles(id) ON DELETE CASCADE,
    section_id UUID NOT NULL
        REFERENCES public.course_sections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_course_join_one_pending
    ON public.student_course_join_requests (student_profile_id, section_id)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_student_course_join_section_status
    ON public.student_course_join_requests (section_id, status, requested_at);

ALTER TABLE public.student_course_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_course_join_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_course_join_requests TO service_role;

CREATE OR REPLACE FUNCTION public.review_student_course_join_request(
    p_request_id UUID,
    p_section_id UUID,
    p_faculty_user_id UUID,
    p_decision TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request public.student_course_join_requests%ROWTYPE;
    v_enrollment_result JSONB;
    v_enrollment_status TEXT;
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be accepted or rejected.';
    END IF;

    PERFORM 1
      FROM public.course_sections AS section
      JOIN public.faculty_profiles AS faculty ON faculty.id = section.faculty_id
     WHERE section.id = p_section_id
       AND faculty.user_id = p_faculty_user_id
     FOR KEY SHARE OF section;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section is not assigned to this Faculty member.';
    END IF;

    SELECT * INTO v_request
      FROM public.student_course_join_requests
     WHERE id = p_request_id AND section_id = p_section_id
     FOR UPDATE;
    IF NOT FOUND OR v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'This course join request is no longer pending.';
    END IF;

    IF p_decision = 'accepted' THEN
        v_enrollment_result := public.manage_faculty_section_enrollments(
            p_section_id, p_faculty_user_id,
            ARRAY[v_request.student_profile_id], 'enroll'
        );
        v_enrollment_status := v_enrollment_result->0->>'status';
        IF v_enrollment_status NOT IN ('enrolled', 'reactivated', 'already_active') THEN
            RAISE EXCEPTION '%', COALESCE(
                v_enrollment_result->0->>'reason',
                'Student could not be enrolled in this section.'
            );
        END IF;
    END IF;

    UPDATE public.student_course_join_requests
       SET status = p_decision,
           reviewed_by = p_faculty_user_id,
           reviewed_at = NOW()
     WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', p_decision,
        'enrollment_status', v_enrollment_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_course_join_request(UUID, UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_student_course_join_request(UUID, UUID, UUID, TEXT)
    TO service_role;
