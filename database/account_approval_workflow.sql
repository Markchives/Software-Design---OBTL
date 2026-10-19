BEGIN;

CREATE TABLE IF NOT EXISTS public.system_bootstrap (
    bootstrap_key TEXT PRIMARY KEY CHECK (bootstrap_key = 'first-admin'),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_security_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    employee_number TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dept_head_profiles
    ADD COLUMN IF NOT EXISTS employee_number TEXT;

ALTER TABLE public.departments
    ADD COLUMN IF NOT EXISTS is_college BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.departments (name, code, is_college, description)
VALUES
    ('College of Engineering', 'COE', TRUE, 'College of Engineering'),
    ('College of Computer Studies', 'CCS', TRUE, 'College of Computer Studies'),
    ('College of Business and Accountancy', 'CBA', TRUE, 'College of Business and Accountancy'),
    ('College of Arts and Sciences', 'CAS', TRUE, 'College of Arts and Sciences'),
    ('College of Education', 'CED', TRUE, 'College of Education'),
    ('College of Architecture', 'COA', TRUE, 'College of Architecture'),
    ('College of Tourism and Hospitality Management', 'CTHM', TRUE, 'College of Tourism and Hospitality Management')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_college = TRUE,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.account_role_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_role TEXT NOT NULL CHECK (
        requested_role IN (
            'student',
            'faculty',
            'department-head',
            'admin-security'
        )
    ),
    requested_department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(profile_data) = 'object'
    ),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected')
    ),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_reason TEXT,
    CHECK (status = 'pending' OR decided_at IS NOT NULL),
    CHECK (
        requested_role NOT IN ('faculty', 'department-head')
        OR requested_department_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_role_requests_one_pending_per_user
    ON public.account_role_requests (auth_user_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_account_role_requests_pending_department
    ON public.account_role_requests (requested_department_id, submitted_at)
    WHERE status = 'pending';

ALTER TABLE public.account_role_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_role_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.account_role_requests TO service_role;

ALTER TABLE public.system_bootstrap ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_bootstrap FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.system_bootstrap TO service_role;

ALTER TABLE public.admin_security_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_security_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_security_profiles TO service_role;

COMMENT ON TABLE public.account_role_requests IS
    'Role and profile requests awaiting approval; access is server-side only.';
COMMENT ON TABLE public.system_bootstrap IS
    'One-time bootstrap claims; the first-admin claim cannot be reassigned.';
COMMENT ON TABLE public.admin_security_profiles IS
    'Required institution identity fields for approved Admin & Security users.';

COMMIT;