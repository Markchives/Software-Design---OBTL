-- CQI action plans, their linked Course Outcomes, and Department Head reviews.
-- Run once in the Supabase SQL editor for each existing project.
CREATE TABLE IF NOT EXISTS public.cqi_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cqi_action_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculty_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    problem_statement TEXT NOT NULL,
    proposed_intervention TEXT NOT NULL,
    expected_improvement TEXT,
    target_date DATE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'returned', 'ongoing', 'completed')),
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cqi_action_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cqi_action_plan_id UUID NOT NULL
        REFERENCES public.cqi_action_plans(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL
        REFERENCES public.course_outcomes(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.cqi_categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cqi_action_plan_id, course_outcome_id)
);

CREATE TABLE IF NOT EXISTS public.cqi_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cqi_action_plan_id UUID NOT NULL
        REFERENCES public.cqi_action_plans(id) ON DELETE CASCADE,
    reviewed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned')),
    comments TEXT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cqi_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqi_action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqi_action_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqi_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cqi_categories, public.cqi_action_plans,
    public.cqi_action_targets, public.cqi_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cqi_categories,
    public.cqi_action_plans, public.cqi_action_targets, public.cqi_reviews
    TO service_role;

CREATE INDEX IF NOT EXISTS idx_cqi_action_plans_section_status
    ON public.cqi_action_plans (section_id, status);
CREATE INDEX IF NOT EXISTS idx_cqi_action_plans_faculty
    ON public.cqi_action_plans (faculty_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cqi_action_targets_outcome
    ON public.cqi_action_targets (course_outcome_id);
CREATE INDEX IF NOT EXISTS idx_cqi_reviews_plan_latest
    ON public.cqi_reviews (cqi_action_plan_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION public.review_cqi_action_plan(
    p_plan_id UUID,
    p_reviewed_by UUID,
    p_decision TEXT,
    p_comments TEXT
)
RETURNS public.cqi_action_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.cqi_action_plans;
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('approved', 'returned') THEN
        RAISE EXCEPTION 'Choose Approve or Return for Revision.';
    END IF;
    IF p_decision = 'returned' AND NULLIF(BTRIM(p_comments), '') IS NULL THEN
        RAISE EXCEPTION 'Feedback is required when returning a plan.';
    END IF;

    SELECT * INTO v_plan
    FROM public.cqi_action_plans
    WHERE id = p_plan_id
    FOR UPDATE;
    IF NOT FOUND OR v_plan.status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted CQI plans can be reviewed.';
    END IF;

    INSERT INTO public.cqi_reviews (
        cqi_action_plan_id, reviewed_by, decision, comments
    )
    VALUES (
        p_plan_id, p_reviewed_by, p_decision, NULLIF(BTRIM(p_comments), '')
    );

    UPDATE public.cqi_action_plans
    SET status = p_decision, updated_at = NOW()
    WHERE id = p_plan_id
    RETURNING * INTO v_plan;
    RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cqi_action_plan(UUID, UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_cqi_action_plan(UUID, UUID, TEXT, TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.update_cqi_action_plan_with_target(
    p_plan_id UUID,
    p_faculty_id UUID,
    p_section_id UUID,
    p_title TEXT,
    p_problem_statement TEXT,
    p_proposed_intervention TEXT,
    p_expected_improvement TEXT,
    p_target_date DATE,
    p_status TEXT,
    p_submitted_at TIMESTAMPTZ,
    p_course_outcome_id UUID,
    p_category_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan_id UUID;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'CQI plan status must be Draft or Submitted.';
    END IF;

    UPDATE public.cqi_action_plans
    SET section_id = p_section_id,
        title = p_title,
        problem_statement = p_problem_statement,
        proposed_intervention = p_proposed_intervention,
        expected_improvement = p_expected_improvement,
        target_date = p_target_date,
        status = p_status,
        submitted_at = p_submitted_at,
        updated_at = NOW()
    WHERE id = p_plan_id
      AND faculty_id = p_faculty_id
      AND status IN ('draft', 'returned')
      AND EXISTS (
          SELECT 1 FROM public.course_sections section
          WHERE section.id = p_section_id
            AND section.faculty_id = p_faculty_id
      )
      AND EXISTS (
          SELECT 1 FROM public.course_mapping_reviews mapping
          WHERE mapping.section_id = p_section_id
            AND mapping.status = 'verified'
      )
      AND EXISTS (
          SELECT 1
          FROM public.course_sections section
          JOIN public.course_outcomes outcome
            ON outcome.course_id = section.course_id
          WHERE section.id = p_section_id
            AND outcome.id = p_course_outcome_id
      )
      AND (
          p_category_id IS NULL
          OR EXISTS (
              SELECT 1 FROM public.cqi_categories category
              WHERE category.id = p_category_id
                AND category.is_active = TRUE
          )
      )
    RETURNING id INTO v_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CQI plan is no longer editable or its section, mapping, outcome, or category is invalid.';
    END IF;

    DELETE FROM public.cqi_action_targets
    WHERE cqi_action_plan_id = v_plan_id;

    INSERT INTO public.cqi_action_targets (
        cqi_action_plan_id, course_outcome_id, category_id
    )
    VALUES (v_plan_id, p_course_outcome_id, p_category_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_cqi_action_plan_with_target(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TIMESTAMPTZ, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cqi_action_plan_with_target(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TIMESTAMPTZ, UUID, UUID
) TO service_role;

INSERT INTO public.cqi_categories (name, description)
VALUES
    ('Assessment Redesign', 'Revise assessment methods or alignment to outcomes.'),
    ('Additional Practice', 'Provide guided practice or targeted learning activities.'),
    ('Instructional Support', 'Adjust teaching strategies, feedback, or student support.')
ON CONFLICT (name) DO NOTHING;
