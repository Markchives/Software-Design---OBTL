CREATE TABLE IF NOT EXISTS public.course_syllabi (
    section_id UUID PRIMARY KEY
        REFERENCES public.course_sections(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    uploaded_by UUID NOT NULL
        REFERENCES public.users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.course_syllabi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_syllabi FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_syllabi TO service_role;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'course-syllabi',
    'course-syllabi',
    FALSE,
    20971520,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;