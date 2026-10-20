CREATE TABLE IF NOT EXISTS public.assessment_activity_course_outcomes (
    assessment_activity_id UUID NOT NULL
        REFERENCES public.assessment_activities(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL
        REFERENCES public.course_outcomes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assessment_activity_id, course_outcome_id)
);

INSERT INTO public.assessment_activity_course_outcomes (
    assessment_activity_id,
    course_outcome_id
)
SELECT id, course_outcome_id
FROM public.assessment_activities
ON CONFLICT DO NOTHING;

ALTER TABLE public.co_attainment
    ALTER COLUMN attainment_percentage DROP NOT NULL;
ALTER TABLE public.co_attainment
    DROP CONSTRAINT IF EXISTS co_attainment_status_check;
ALTER TABLE public.co_attainment
    ADD CONSTRAINT co_attainment_status_check
    CHECK (status IN ('met', 'below_target', 'needs_improvement', 'awaiting_results'));

ALTER TABLE public.assessment_activity_course_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assessment_activity_course_outcomes
    FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.assessment_activity_course_outcomes TO service_role;

CREATE INDEX IF NOT EXISTS idx_assessment_activity_course_outcomes_co
    ON public.assessment_activity_course_outcomes (course_outcome_id);

CREATE OR REPLACE FUNCTION public.create_assessment_activity_with_outcomes(
    p_section_id UUID,
    p_title TEXT,
    p_activity_type TEXT,
    p_due_date DATE,
    p_max_score NUMERIC,
    p_course_outcome_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_course_id UUID;
    v_activity_id UUID;
BEGIN
    IF p_course_outcome_ids IS NULL
       OR cardinality(p_course_outcome_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one Course Outcome.';
    END IF;

    SELECT course_id
    INTO v_course_id
    FROM course_sections
    WHERE id = p_section_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Course section does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(p_course_outcome_ids) AS selected(course_outcome_id)
        LEFT JOIN course_outcomes co
            ON co.id = selected.course_outcome_id
           AND co.course_id = v_course_id
        WHERE co.id IS NULL
    ) THEN
        RAISE EXCEPTION 'A Course Outcome does not belong to this course.';
    END IF;

    INSERT INTO assessment_activities (
        section_id, course_outcome_id, title, activity_type, due_date, max_score
    )
    VALUES (
        p_section_id, p_course_outcome_ids[1], p_title, p_activity_type,
        p_due_date, p_max_score
    )
    RETURNING id INTO v_activity_id;

    INSERT INTO assessment_activity_course_outcomes (
        assessment_activity_id,
        course_outcome_id
    )
    SELECT v_activity_id, selected.course_outcome_id
    FROM (
        SELECT DISTINCT course_outcome_id
        FROM unnest(p_course_outcome_ids) AS selected(course_outcome_id)
    ) selected;

    RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_assessment_activity_with_outcomes(
    p_assessment_activity_id UUID,
    p_title TEXT,
    p_activity_type TEXT,
    p_due_date DATE,
    p_max_score NUMERIC,
    p_course_outcome_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_course_id UUID;
    v_activity_id UUID;
BEGIN
    IF p_course_outcome_ids IS NULL
       OR cardinality(p_course_outcome_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one Course Outcome.';
    END IF;

    SELECT aa.id, cs.course_id
    INTO v_activity_id, v_course_id
    FROM assessment_activities aa
    JOIN course_sections cs ON cs.id = aa.section_id
    WHERE aa.id = p_assessment_activity_id
    FOR UPDATE OF aa;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment activity does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(p_course_outcome_ids) AS selected(course_outcome_id)
        LEFT JOIN course_outcomes co
            ON co.id = selected.course_outcome_id
           AND co.course_id = v_course_id
        WHERE co.id IS NULL
    ) THEN
        RAISE EXCEPTION 'A Course Outcome does not belong to this course.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM raw_assessment_scores
        WHERE assessment_activity_id = p_assessment_activity_id
          AND score > p_max_score
    ) THEN
        RAISE EXCEPTION 'Maximum score cannot be lower than a score already entered.';
    END IF;

    UPDATE assessment_activities
    SET course_outcome_id = p_course_outcome_ids[1],
        title = p_title,
        activity_type = p_activity_type,
        due_date = p_due_date,
        max_score = p_max_score,
        updated_at = NOW()
    WHERE id = p_assessment_activity_id;

    UPDATE raw_assessment_scores
    SET max_score = p_max_score,
        percentage = CASE WHEN score IS NULL THEN NULL
            ELSE ROUND(score / p_max_score * 100, 2) END,
        updated_at = NOW()
    WHERE assessment_activity_id = p_assessment_activity_id;

    DELETE FROM assessment_activity_course_outcomes
    WHERE assessment_activity_id = p_assessment_activity_id;

    INSERT INTO assessment_activity_course_outcomes (
        assessment_activity_id,
        course_outcome_id
    )
    SELECT p_assessment_activity_id, selected.course_outcome_id
    FROM (
        SELECT DISTINCT course_outcome_id
        FROM unnest(p_course_outcome_ids) AS selected(course_outcome_id)
    ) selected;

    RETURN v_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_assessment_activity_with_outcomes(
    UUID, TEXT, TEXT, DATE, NUMERIC, UUID[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_assessment_activity_with_outcomes(
    UUID, TEXT, TEXT, DATE, NUMERIC, UUID[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_assessment_activity_with_outcomes(
    UUID, TEXT, TEXT, DATE, NUMERIC, UUID[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_assessment_activity_with_outcomes(
    UUID, TEXT, TEXT, DATE, NUMERIC, UUID[]
) TO service_role;
