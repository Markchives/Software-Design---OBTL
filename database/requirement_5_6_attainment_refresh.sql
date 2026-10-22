-- Apply after requirement_2_4_multi_co_assessment_mappings.sql and
-- requirement_5_attainment_algorithm.sql, before deploying the matching app.py.
BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_section_attainment(p_section_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_course_id UUID;
    v_verified BOOLEAN;
    v_output JSONB;
BEGIN
    -- Serialize refreshes with each other and with guarded assessment writes.
    SELECT section.course_id INTO v_course_id
    FROM public.course_sections section
    WHERE section.id = p_section_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course section not found.';
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.course_mapping_reviews review
        WHERE review.section_id = p_section_id AND review.status = 'verified'
    ) INTO v_verified;

    -- Deletes and replacements commit together. Any error rolls back both.
    DELETE FROM public.student_co_attainment WHERE section_id = p_section_id;
    DELETE FROM public.co_attainment WHERE section_id = p_section_id;

    WITH activity_mappings AS (
        SELECT mapping.assessment_activity_id, mapping.course_outcome_id
        FROM public.assessment_activity_course_outcomes mapping
        JOIN public.assessment_activities mapped_activity
          ON mapped_activity.id = mapping.assessment_activity_id
        WHERE mapped_activity.section_id = p_section_id
        UNION
        SELECT activity.id, activity.course_outcome_id
        FROM public.assessment_activities activity
        WHERE activity.section_id = p_section_id AND activity.course_outcome_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.assessment_activity_course_outcomes mapping
              WHERE mapping.assessment_activity_id = activity.id
          )
    ), personal AS (
        SELECT score.student_profile_id, outcome.id AS course_outcome_id,
               COALESCE(NULLIF(outcome.target_percentage, 0), 70) AS target,
               ROUND(AVG(score.percentage), 2) AS percentage
        FROM public.raw_assessment_scores score
        JOIN public.assessment_activities activity
          ON activity.id = score.assessment_activity_id
        JOIN activity_mappings mapping ON mapping.assessment_activity_id = activity.id
        JOIN public.course_outcomes outcome ON outcome.id = mapping.course_outcome_id
        JOIN public.enrollments enrollment
          ON enrollment.section_id = p_section_id
         AND enrollment.student_profile_id = score.student_profile_id
         AND enrollment.enrollment_status = 'active'
        WHERE activity.section_id = p_section_id AND activity.released_at IS NOT NULL
          AND outcome.course_id = v_course_id AND score.percentage IS NOT NULL
        GROUP BY score.student_profile_id, outcome.id, outcome.target_percentage
    )
    INSERT INTO public.student_co_attainment (
        section_id, student_profile_id, course_outcome_id,
        attainment_percentage, status, can_view, calculated_at
    )
    SELECT p_section_id, student_profile_id, course_outcome_id, percentage,
           CASE WHEN percentage >= target THEN 'met' ELSE 'not_met' END,
           v_verified, NOW()
    FROM personal;

    WITH totals AS (
        SELECT outcome.id, COALESCE(NULLIF(outcome.target_percentage, 0), 70) AS target,
               ROUND(100.0 * COUNT(personal.id) FILTER (WHERE personal.status = 'met')
                     / NULLIF(COUNT(personal.id), 0), 2) AS percentage
        FROM public.course_outcomes outcome
        LEFT JOIN public.student_co_attainment personal
          ON personal.course_outcome_id = outcome.id AND personal.section_id = p_section_id
        WHERE outcome.course_id = v_course_id
        GROUP BY outcome.id, outcome.target_percentage
    )
    INSERT INTO public.co_attainment (
        section_id, course_outcome_id, attainment_percentage, target_percentage,
        status, flagged, version, calculated_at
    )
    SELECT p_section_id, id, percentage, target,
           CASE WHEN percentage IS NULL THEN 'awaiting_results'
                WHEN percentage >= target THEN 'met'
                WHEN percentage < target * 0.85 THEN 'needs_improvement'
                ELSE 'below_target' END,
           COALESCE(percentage < target, FALSE), 'co-threshold-rate-v1', NOW()
    FROM totals;

    SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
        'course_outcome_id', outcome.id, 'code', outcome.code,
        'description', outcome.description,
        'attainment_percentage', result.attainment_percentage,
        'target_percentage', result.target_percentage,
        'status', result.status, 'flagged', result.flagged,
        'student_count', (SELECT COUNT(*) FROM public.student_co_attainment personal
                          WHERE personal.section_id = p_section_id
                            AND personal.course_outcome_id = outcome.id),
        'met_student_count', (SELECT COUNT(*) FROM public.student_co_attainment personal
                              WHERE personal.section_id = p_section_id
                                AND personal.course_outcome_id = outcome.id
                                AND personal.status = 'met'),
        'activities', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', activity.id, 'title', activity.title,
                'activity_type', activity.activity_type,
                'released_at', activity.released_at,
                'released', activity.released_at IS NOT NULL
            ) ORDER BY activity.id)
            FROM public.assessment_activities activity
            WHERE activity.section_id = p_section_id AND (
                EXISTS (SELECT 1 FROM public.assessment_activity_course_outcomes mapping
                        WHERE mapping.assessment_activity_id = activity.id
                          AND mapping.course_outcome_id = outcome.id)
                OR (activity.course_outcome_id = outcome.id AND NOT EXISTS (
                    SELECT 1 FROM public.assessment_activity_course_outcomes mapping
                    WHERE mapping.assessment_activity_id = activity.id
                ))
            )
        ), '[]'::JSONB)
    ) ORDER BY outcome.code), '[]'::JSONB) INTO v_output
    FROM public.course_outcomes outcome
    JOIN public.co_attainment result ON result.course_outcome_id = outcome.id
                                    AND result.section_id = p_section_id
    WHERE outcome.course_id = v_course_id;
    RETURN v_output;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_section_attainment(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_section_attainment(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.invalidate_enrollment_attainment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_section_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.section_id IS NOT DISTINCT FROM OLD.section_id
       AND NEW.student_profile_id IS NOT DISTINCT FROM OLD.student_profile_id
       AND NEW.enrollment_status IS NOT DISTINCT FROM OLD.enrollment_status THEN
        RETURN NEW;
    END IF;
    -- Lock old/new sections in a stable order, including section transfers.
    FOR v_section_id IN
        SELECT DISTINCT section.id FROM public.course_sections section
        WHERE section.id = CASE WHEN TG_OP <> 'INSERT' THEN OLD.section_id END
           OR section.id = CASE WHEN TG_OP <> 'DELETE' THEN NEW.section_id END
        ORDER BY section.id
    LOOP
        PERFORM 1 FROM public.course_sections WHERE id = v_section_id FOR UPDATE;
        UPDATE public.co_attainment SET version = NULL WHERE section_id = v_section_id;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_enrollment_attainment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enrollments_invalidate_attainment ON public.enrollments;
CREATE TRIGGER enrollments_invalidate_attainment
AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.invalidate_enrollment_attainment();

-- Existing saved results may predate roster changes. Refresh them on next read.
UPDATE public.co_attainment SET version = NULL;
COMMIT;
