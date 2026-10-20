-- Persistent Student Outcome self-assessments and student responses.
-- Apply this migration to each Supabase project used by local and Render.

CREATE TABLE IF NOT EXISTS public.so_self_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
    student_outcome_id UUID NOT NULL REFERENCES public.student_outcomes(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    due_date DATE,
    performance_indicators JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(performance_indicators) = 'array'),
    rating_scale JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(rating_scale) = 'array'),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed')),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, student_outcome_id)
);

CREATE TABLE IF NOT EXISTS public.so_self_assessment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.so_self_assessments(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(answers) = 'object'),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, student_profile_id)
);

ALTER TABLE public.so_self_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.so_self_assessment_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.so_self_assessments FROM anon, authenticated;
REVOKE ALL ON TABLE public.so_self_assessment_responses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.so_self_assessments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.so_self_assessment_responses TO service_role;

CREATE INDEX IF NOT EXISTS idx_so_self_assessments_section_status_due
    ON public.so_self_assessments (section_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_so_self_responses_assessment
    ON public.so_self_assessment_responses (assessment_id, submitted_at DESC);
