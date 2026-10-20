-- Account settings data and private profile photo storage.
-- Apply this migration in each Supabase project used by local and Render.

CREATE TABLE IF NOT EXISTS public.account_settings (
    user_id UUID PRIMARY KEY
        REFERENCES public.users(id) ON DELETE CASCADE,
    profile_photo_path TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_settings TO service_role;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'profile-photos',
    'profile-photos',
    FALSE,
    1048576,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
