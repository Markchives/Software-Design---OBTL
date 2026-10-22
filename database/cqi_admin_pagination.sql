-- Server-side filtering and pagination for the Admin CQI register.
-- Apply after cqi_planning_workflow.sql.

CREATE OR REPLACE FUNCTION public.admin_cqi_register_page(
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 50,
    p_department_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_search TEXT := NULLIF(BTRIM(p_search), '');
    v_plan_ids JSONB;
    v_total_count BIGINT;
    v_total_pages INTEGER;
    v_effective_page INTEGER;
    v_progress_count BIGINT;
    v_pending_count BIGINT;
    v_departments JSONB;
    v_category_counts JSONB;
BEGIN
    IF p_page IS NULL OR p_page < 1 THEN
        RAISE EXCEPTION 'Page must be a positive integer.';
    END IF;
    IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Page size must be between 1 and 100.';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN (
        'draft', 'submitted', 'approved', 'rejected', 'returned',
        'ongoing', 'completed'
    ) THEN
        RAISE EXCEPTION 'Choose a valid CQI status filter.';
    END IF;
    IF LENGTH(v_search) > 120 THEN
        RAISE EXCEPTION 'Search text must be 120 characters or fewer.';
    END IF;

    WITH plan_scope AS (
        SELECT plan.id, plan.status, plan.updated_at,
               course.department_id, department.name AS department_name,
               course.code AS course_code, course.title AS course_title,
               COALESCE(app_user.full_name, '') AS faculty_name,
               COALESCE(target_codes.codes, '') AS outcome_codes,
               plan.proposed_intervention
        FROM public.cqi_action_plans AS plan
        JOIN public.course_sections AS section
          ON section.id = plan.section_id
        JOIN public.courses AS course
          ON course.id = section.course_id
        JOIN public.departments AS department
          ON department.id = course.department_id
        LEFT JOIN public.faculty_profiles AS faculty
          ON faculty.id = section.faculty_id
        LEFT JOIN public.users AS app_user
          ON app_user.id = faculty.user_id
        LEFT JOIN LATERAL (
            SELECT STRING_AGG(DISTINCT outcome.code, ' ') AS codes
            FROM public.cqi_action_targets AS action_target
            JOIN public.course_outcomes AS outcome
              ON outcome.id = action_target.course_outcome_id
            WHERE action_target.cqi_action_plan_id = plan.id
        ) AS target_codes ON TRUE
    ), matching AS (
        SELECT *
        FROM plan_scope
        WHERE (p_department_id IS NULL OR department_id = p_department_id)
          AND (p_status IS NULL OR status = p_status)
          AND (
              v_search IS NULL
              OR POSITION(
                  LOWER(v_search) IN LOWER(CONCAT_WS(
                    ' ', id::TEXT, department_name, course_code,
                    course_title, faculty_name, outcome_codes,
                    proposed_intervention
                  ))
                ) > 0
          )
    )
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('ongoing', 'completed')),
        COUNT(*) FILTER (WHERE status = 'submitted')
    INTO v_total_count, v_progress_count, v_pending_count
    FROM matching;

    v_total_pages := CEIL(v_total_count::NUMERIC / p_page_size)::INTEGER;
    v_effective_page := CASE
      WHEN v_total_pages = 0 THEN 1
      ELSE LEAST(p_page, v_total_pages)
    END;

    WITH plan_scope AS (
        SELECT plan.id, plan.status, plan.updated_at,
               course.department_id, department.name AS department_name,
               course.code AS course_code, course.title AS course_title,
               COALESCE(app_user.full_name, '') AS faculty_name,
               COALESCE(target_codes.codes, '') AS outcome_codes,
               plan.proposed_intervention
        FROM public.cqi_action_plans AS plan
        JOIN public.course_sections AS section
          ON section.id = plan.section_id
        JOIN public.courses AS course
          ON course.id = section.course_id
        JOIN public.departments AS department
          ON department.id = course.department_id
        LEFT JOIN public.faculty_profiles AS faculty
          ON faculty.id = section.faculty_id
        LEFT JOIN public.users AS app_user
          ON app_user.id = faculty.user_id
        LEFT JOIN LATERAL (
            SELECT STRING_AGG(DISTINCT outcome.code, ' ') AS codes
            FROM public.cqi_action_targets AS action_target
            JOIN public.course_outcomes AS outcome
              ON outcome.id = action_target.course_outcome_id
            WHERE action_target.cqi_action_plan_id = plan.id
        ) AS target_codes ON TRUE
    ), matching AS (
        SELECT *
        FROM plan_scope
        WHERE (p_department_id IS NULL OR department_id = p_department_id)
          AND (p_status IS NULL OR status = p_status)
          AND (
              v_search IS NULL
              OR POSITION(
                  LOWER(v_search) IN LOWER(CONCAT_WS(
                    ' ', id::TEXT, department_name, course_code,
                    course_title, faculty_name, outcome_codes,
                    proposed_intervention
                  ))
                ) > 0
          )
    )
    SELECT COALESCE(JSONB_AGG(page.id ORDER BY page.updated_at DESC NULLS LAST, page.id DESC), '[]'::JSONB)
    INTO v_plan_ids
    FROM (
        SELECT id, updated_at
        FROM matching
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT p_page_size
        OFFSET (v_effective_page::BIGINT - 1) * p_page_size
    ) AS page;

    SELECT COALESCE(JSONB_AGG(option_row.value ORDER BY option_row.name), '[]'::JSONB)
    INTO v_departments
    FROM (
        SELECT DISTINCT department.id,
               department.name,
               JSONB_BUILD_OBJECT('id', department.id, 'name', department.name) AS value
        FROM public.cqi_action_plans AS plan
        JOIN public.course_sections AS section ON section.id = plan.section_id
        JOIN public.courses AS course ON course.id = section.course_id
        JOIN public.departments AS department ON department.id = course.department_id
    ) AS option_row;

    SELECT COALESCE(JSONB_OBJECT_AGG(counts.category_id::TEXT, counts.plan_count), '{}'::JSONB)
    INTO v_category_counts
    FROM (
        SELECT target.category_id, COUNT(DISTINCT target.cqi_action_plan_id) AS plan_count
        FROM public.cqi_action_targets AS target
        WHERE target.category_id IS NOT NULL
        GROUP BY target.category_id
    ) AS counts;

    RETURN JSONB_BUILD_OBJECT(
        'plan_ids', v_plan_ids,
        'page', v_effective_page,
        'total_count', v_total_count,
        'progress_count', v_progress_count,
        'pending_count', v_pending_count,
        'departments', v_departments,
        'category_counts', v_category_counts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cqi_register_page(
    INTEGER, INTEGER, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cqi_register_page(
    INTEGER, INTEGER, UUID, TEXT, TEXT
) TO service_role;