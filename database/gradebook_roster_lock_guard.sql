-- Prevent roster membership changes after a section gradebook is locked.
-- Apply after gradebook_locking_workflow.sql and the enrollment workflow migrations.

CREATE OR REPLACE FUNCTION public.prevent_locked_gradebook_roster_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_section_ids UUID[];
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.section_id IS NOT DISTINCT FROM OLD.section_id
         AND NEW.student_profile_id IS NOT DISTINCT FROM OLD.student_profile_id
       AND NEW.enrollment_status IS NOT DISTINCT FROM OLD.enrollment_status THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_section_ids := ARRAY[OLD.section_id];
    ELSIF TG_OP = 'UPDATE' THEN
        v_section_ids := ARRAY[OLD.section_id, NEW.section_id];
    ELSE
        v_section_ids := ARRAY[NEW.section_id];
    END IF;

    PERFORM section.id
    FROM public.course_sections AS section
    WHERE section.id = ANY(v_section_ids)
    ORDER BY section.id
    FOR KEY SHARE;

    IF TG_OP = 'DELETE' AND NOT FOUND THEN
        RETURN OLD;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.gradebooks AS gradebook
        WHERE gradebook.section_id = ANY(v_section_ids)
          AND gradebook.status = 'locked'
    ) THEN
        RAISE EXCEPTION
            'Gradebook is locked; reopen it before changing roster membership.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_locked_gradebook_roster_changes()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_locked_gradebook_roster_changes()
    TO service_role;

DROP TRIGGER IF EXISTS enrollments_locked_gradebook_guard
    ON public.enrollments;
CREATE TRIGGER enrollments_locked_gradebook_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_gradebook_roster_changes();