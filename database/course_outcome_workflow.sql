-- CO/SO links and Department Head mapping verification.
-- Run in the Supabase SQL editor for both local and Render environments.

CREATE TABLE IF NOT EXISTS public.course_outcome_student_outcomes (
    course_outcome_id UUID NOT NULL
        REFERENCES public.course_outcomes(id) ON DELETE CASCADE,
    student_outcome_id UUID NOT NULL
        REFERENCES public.student_outcomes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (course_outcome_id, student_outcome_id)
);

CREATE TABLE IF NOT EXISTS public.course_mapping_reviews (
    section_id UUID PRIMARY KEY
        REFERENCES public.course_sections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'submitted', 'verified')),
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.course_outcome_student_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_mapping_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.course_outcome_student_outcomes FROM anon, authenticated;
REVOKE ALL ON TABLE public.course_mapping_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_outcome_student_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_mapping_reviews TO service_role;

CREATE INDEX IF NOT EXISTS idx_course_outcome_student_outcomes_so
    ON public.course_outcome_student_outcomes (student_outcome_id);
CREATE INDEX IF NOT EXISTS idx_course_mapping_reviews_status
    ON public.course_mapping_reviews (status);
