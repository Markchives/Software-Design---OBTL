BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $reconcile$
DECLARE
    pending_request_id UUID := 'REPLACE_WITH_PENDING_REQUEST_UUID';
    request_row public.account_role_requests%ROWTYPE;
    target_auth auth.users%ROWTYPE;
    old_user public.users%ROWTYPE;
    old_profile public.dept_head_profiles%ROWTYPE;
    matching_user_ids UUID[];
    old_user_id UUID;
    temporary_email TEXT;
    foreign_key RECORD;
BEGIN
    SELECT *
    INTO request_row
    FROM public.account_role_requests
    WHERE id = pending_request_id
      AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND OR request_row.requested_role <> 'department-head' THEN
        RAISE EXCEPTION 'The specified pending Department Head request was not found.';
    END IF;

    SELECT *
    INTO target_auth
    FROM auth.users
    WHERE id = request_row.auth_user_id
    FOR UPDATE;

    IF NOT FOUND
       OR target_auth.email_confirmed_at IS NULL
       OR NULLIF(BTRIM(target_auth.email), '') IS NULL
       OR LOWER(BTRIM(target_auth.email))
          <> LOWER(BTRIM(COALESCE(request_row.profile_data->>'email', ''))) THEN
        RAISE EXCEPTION 'The pending request does not match a confirmed Auth account.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(target_auth.raw_app_meta_data->>'role', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'The Auth account already has a trusted role; manual review is required.';
    END IF;

    SELECT ARRAY_AGG(id)
    INTO matching_user_ids
    FROM public.users
    WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(target_auth.email));

    IF COALESCE(CARDINALITY(matching_user_ids), 0) <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one existing application account for this email.';
    END IF;

    old_user_id := matching_user_ids[1];

    IF old_user_id = request_row.auth_user_id THEN
        RAISE EXCEPTION 'The application account already uses the Auth account ID.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id = old_user_id
    ) THEN
        RAISE EXCEPTION 'The existing application account still has an Auth identity; manual review is required.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = request_row.auth_user_id
    ) THEN
        RAISE EXCEPTION 'The new Auth ID is already assigned to another application account.';
    END IF;

    SELECT *
    INTO old_user
    FROM public.users
    WHERE id = old_user_id
    FOR UPDATE;

    IF NOT FOUND
       OR old_user.role <> 'department-head'
       OR old_user.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'The existing application account is not an active Department Head.';
    END IF;

    SELECT *
    INTO old_profile
    FROM public.dept_head_profiles
    WHERE user_id = old_user_id
    FOR UPDATE;

    IF NOT FOUND OR old_profile.department_id IS NULL THEN
        RAISE EXCEPTION 'The existing Department Head profile is missing its department.';
    END IF;

    IF request_row.requested_department_id IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.departments
           WHERE id = request_row.requested_department_id
       ) THEN
        RAISE EXCEPTION 'The requested department is missing.';
    END IF;

    temporary_email := FORMAT('reconciled+%s@invalid.local', old_user_id);

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE email = temporary_email
    ) THEN
        RAISE EXCEPTION 'A temporary reconciliation email is already in use.';
    END IF;

    UPDATE public.users
    SET email = temporary_email
    WHERE id = old_user_id;

    INSERT INTO public.users (
        id,
        email,
        password_hash,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        request_row.auth_user_id,
        LOWER(BTRIM(target_auth.email)),
        old_user.password_hash,
        old_user.full_name,
        old_user.role,
        old_user.is_active,
        old_user.created_at,
        NOW()
    );

    FOR foreign_key IN
        SELECT
            child_namespace.nspname AS schema_name,
            child_table.relname AS table_name,
            child_column.attname AS column_name
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS child_table
          ON child_table.oid = constraint_row.conrelid
        JOIN pg_namespace AS child_namespace
          ON child_namespace.oid = child_table.relnamespace
        JOIN LATERAL UNNEST(constraint_row.conkey)
            WITH ORDINALITY AS child_key(attnum, position)
          ON TRUE
        JOIN LATERAL UNNEST(constraint_row.confkey)
            WITH ORDINALITY AS parent_key(attnum, position)
          ON parent_key.position = child_key.position
        JOIN pg_attribute AS child_column
          ON child_column.attrelid = constraint_row.conrelid
         AND child_column.attnum = child_key.attnum
        JOIN pg_attribute AS parent_column
          ON parent_column.attrelid = constraint_row.confrelid
         AND parent_column.attnum = parent_key.attnum
        WHERE constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.users'::REGCLASS
          AND parent_column.attname = 'id'
    LOOP
        EXECUTE FORMAT(
            'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
            foreign_key.schema_name,
            foreign_key.table_name,
            foreign_key.column_name,
            foreign_key.column_name
        )
        USING request_row.auth_user_id, old_user_id;
    END LOOP;

    UPDATE public.dept_head_profiles
    SET department_id = request_row.requested_department_id,
        updated_at = NOW()
    WHERE user_id = request_row.auth_user_id;

    UPDATE public.account_role_requests
    SET profile_data = profile_data || JSONB_BUILD_OBJECT(
        'full_name',
        COALESCE(NULLIF(old_user.full_name, ''), profile_data->>'full_name', ''),
        'id_number',
        COALESCE(old_profile.employee_number, profile_data->>'id_number', '')
    )
    WHERE id = pending_request_id;

    DELETE FROM public.users
    WHERE id = old_user_id;

    RAISE NOTICE 'Identity reconciled; the request remains pending for normal Admin approval.';
END
$reconcile$;

COMMIT;
