-- Persistent system history used by the Admin System Records page.
-- Apply this migration to each Supabase project used by local and Render.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    module TEXT,
    table_name TEXT,
    record_id TEXT,
    details TEXT,
    ip_address TEXT,
    level TEXT NOT NULL DEFAULT 'INFO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'INFO';
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
    ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON public.audit_logs (created_at DESC);
