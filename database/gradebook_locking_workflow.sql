CREATE TABLE IF NOT EXISTS gradebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL UNIQUE REFERENCES course_sections(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'for_verification', 'verified', 'locked', 'reopened')
    ),
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopen_reason TEXT,
    correction_notes TEXT,
    missing_score_count INTEGER NOT NULL DEFAULT 0,
    invalid_entry_count INTEGER NOT NULL DEFAULT 0,
    unmapped_co_so_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gradebooks
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopen_reason TEXT,
    ADD COLUMN IF NOT EXISTS correction_notes TEXT,
    ADD COLUMN IF NOT EXISTS missing_score_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS invalid_entry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unmapped_co_so_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS gradebook_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gradebook_id UUID NOT NULL REFERENCES gradebooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gradebook_history_gradebook_created
    ON gradebook_history (gradebook_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_locked_assessment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_section_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_section_id := OLD.section_id;
    ELSE
        v_section_id := NEW.section_id;
    END IF;
    PERFORM 1 FROM course_sections WHERE id = v_section_id FOR UPDATE;
    IF NOT FOUND THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Assessment section does not exist.';
    END IF;

    IF TG_TABLE_NAME = 'assessment_review_flags' THEN
        IF EXISTS (
            SELECT 1 FROM gradebooks
            WHERE section_id = v_section_id AND status = 'locked'
        ) THEN
            RAISE EXCEPTION 'Gradebook is locked.';
        END IF;
    ELSIF EXISTS (
        SELECT 1 FROM gradebooks
        WHERE section_id = v_section_id
          AND status IN ('for_verification', 'verified', 'locked')
    ) THEN
        RAISE EXCEPTION 'Gradebook is submitted for review or locked.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_activities_locked_guard
    ON assessment_activities;
CREATE TRIGGER assessment_activities_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON assessment_activities
FOR EACH ROW EXECUTE FUNCTION prevent_locked_assessment_changes();

DROP TRIGGER IF EXISTS raw_assessment_scores_locked_guard
    ON raw_assessment_scores;
CREATE TRIGGER raw_assessment_scores_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON raw_assessment_scores
FOR EACH ROW EXECUTE FUNCTION prevent_locked_assessment_changes();

DROP TRIGGER IF EXISTS assessment_review_flags_locked_guard
    ON assessment_review_flags;
CREATE TRIGGER assessment_review_flags_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON assessment_review_flags
FOR EACH ROW EXECUTE FUNCTION prevent_locked_assessment_changes();

CREATE OR REPLACE FUNCTION assert_gradebook_readiness(p_section_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_course_id UUID;
BEGIN
    SELECT course_id INTO v_course_id
    FROM course_sections
    WHERE id = p_section_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM enrollments
        WHERE section_id = p_section_id
          AND enrollment_status = 'active'
          AND student_profile_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'The section has no active enrolled students.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM assessment_activities
        WHERE section_id = p_section_id
    ) THEN
        RAISE EXCEPTION 'Create at least one assessment activity.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM course_outcomes WHERE course_id = v_course_id
    ) THEN
        RAISE EXCEPTION 'The course has no Course Outcomes to assess.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM assessment_activities
        WHERE section_id = p_section_id AND released_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Release scores for all assessment activities.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM assessment_activities activity
        JOIN enrollments enrollment
          ON enrollment.section_id = activity.section_id
         AND enrollment.enrollment_status = 'active'
         AND enrollment.student_profile_id IS NOT NULL
        LEFT JOIN raw_assessment_scores score
          ON score.assessment_activity_id = activity.id
         AND score.student_profile_id = enrollment.student_profile_id
        WHERE activity.section_id = p_section_id
          AND (score.id IS NULL OR score.score IS NULL)
    ) THEN
        RAISE EXCEPTION 'Enter all missing student scores.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM raw_assessment_scores score
        JOIN assessment_activities activity
          ON activity.id = score.assessment_activity_id
        WHERE activity.section_id = p_section_id
          AND (
              activity.max_score <= 0
              OR
              score.score < 0
              OR score.score > activity.max_score
              OR score.max_score IS DISTINCT FROM activity.max_score
          )
    ) THEN
        RAISE EXCEPTION 'Correct invalid score entries.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM course_outcomes outcome
        WHERE outcome.course_id = v_course_id
          AND NOT EXISTS (
              SELECT 1
              FROM assessment_activities activity
              JOIN assessment_activity_course_outcomes mapping
                ON mapping.assessment_activity_id = activity.id
              WHERE activity.section_id = p_section_id
                AND mapping.course_outcome_id = outcome.id
          )
    ) THEN
        RAISE EXCEPTION 'Map every course outcome to an assessment activity.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM assessment_activities activity
        WHERE activity.section_id = p_section_id
          AND NOT EXISTS (
              SELECT 1 FROM assessment_activity_course_outcomes mapping
              WHERE mapping.assessment_activity_id = activity.id
          )
    ) THEN
        RAISE EXCEPTION 'Map every assessment activity to at least one Course Outcome.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM course_outcomes outcome
        WHERE outcome.course_id = v_course_id
          AND NOT EXISTS (
              SELECT 1 FROM course_outcome_student_outcomes mapping
              WHERE mapping.course_outcome_id = outcome.id
          )
    ) THEN
        RAISE EXCEPTION 'Map every Course Outcome to a Student Outcome.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM course_mapping_reviews
        WHERE section_id = p_section_id AND status = 'verified'
    ) THEN
        RAISE EXCEPTION 'Verify the section CO-SO mappings before gradebook review.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM assessment_review_flags
        WHERE section_id = p_section_id AND status <> 'resolved'
    ) THEN
        RAISE EXCEPTION 'Resolve open assessment queries before gradebook review.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION submit_faculty_gradebook(
    p_section_id UUID,
    p_academic_year_id UUID,
    p_actor_id UUID,
    p_missing_score_count INTEGER,
    p_invalid_entry_count INTEGER,
    p_unmapped_co_so_count INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gradebook_id UUID;
    v_from_status TEXT;
    v_actual_academic_year_id UUID;
BEGIN
    SELECT academic_year_id INTO v_actual_academic_year_id
    FROM course_sections WHERE id = p_section_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;
    IF v_actual_academic_year_id IS DISTINCT FROM p_academic_year_id THEN
        RAISE EXCEPTION 'The section academic year changed; reload and retry.';
    END IF;
    PERFORM assert_gradebook_readiness(p_section_id);

    SELECT id, status INTO v_gradebook_id, v_from_status
    FROM gradebooks WHERE section_id = p_section_id FOR UPDATE;
    IF FOUND THEN
        IF v_from_status NOT IN ('draft', 'reopened') THEN
            RAISE EXCEPTION 'Only a draft or reopened gradebook can be submitted.';
        END IF;
        UPDATE gradebooks SET
            academic_year_id = p_academic_year_id,
            status = 'for_verification',
            submitted_by = p_actor_id,
            submitted_at = NOW(),
            missing_score_count = p_missing_score_count,
            invalid_entry_count = p_invalid_entry_count,
            unmapped_co_so_count = p_unmapped_co_so_count,
            correction_notes = NULL,
            reopen_reason = NULL,
            updated_at = NOW()
        WHERE id = v_gradebook_id;
    ELSE
        v_from_status := 'draft';
        INSERT INTO gradebooks (
            section_id, academic_year_id, status, submitted_by, submitted_at,
            missing_score_count, invalid_entry_count, unmapped_co_so_count
        ) VALUES (
            p_section_id, p_academic_year_id, 'for_verification',
            p_actor_id, NOW(), p_missing_score_count,
            p_invalid_entry_count, p_unmapped_co_so_count
        ) RETURNING id INTO v_gradebook_id;
    END IF;

    INSERT INTO gradebook_history (
        gradebook_id, user_id, action, from_status, to_status, reason
    ) VALUES (
        v_gradebook_id, p_actor_id, 'submitted', v_from_status,
        'for_verification', 'Faculty submitted the gradebook for verification.'
    );
    RETURN v_gradebook_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_department_gradebook(
    p_section_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gradebook_id UUID;
    v_status TEXT;
BEGIN
    PERFORM 1 FROM course_sections
    WHERE id = p_section_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;
    SELECT id, status INTO v_gradebook_id, v_status
    FROM gradebooks WHERE section_id = p_section_id FOR UPDATE;
    IF NOT FOUND OR v_status <> 'for_verification' THEN
        RAISE EXCEPTION 'Only a submitted gradebook can be verified.';
    END IF;
    PERFORM assert_gradebook_readiness(p_section_id);
    UPDATE gradebooks SET
        status = 'verified',
        verified_by = p_actor_id,
        verified_at = NOW(),
        correction_notes = NULLIF(BTRIM(p_reason), ''),
        updated_at = NOW()
    WHERE id = v_gradebook_id;
    INSERT INTO gradebook_history (
        gradebook_id, user_id, action, from_status, to_status, reason
    ) VALUES (
        v_gradebook_id, p_actor_id, 'verified', v_status, 'verified',
        NULLIF(BTRIM(p_reason), '')
    );
    RETURN v_gradebook_id;
END;
$$;

CREATE OR REPLACE FUNCTION lock_department_gradebook(
    p_section_id UUID,
    p_academic_year_id UUID,
    p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gradebook_id UUID;
    v_status TEXT;
    v_actual_academic_year_id UUID;
BEGIN
    SELECT academic_year_id INTO v_actual_academic_year_id
    FROM course_sections WHERE id = p_section_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;
    IF v_actual_academic_year_id IS DISTINCT FROM p_academic_year_id THEN
        RAISE EXCEPTION 'The section academic year changed; reload and retry.';
    END IF;
    SELECT id, status INTO v_gradebook_id, v_status
    FROM gradebooks WHERE section_id = p_section_id FOR UPDATE;
    IF NOT FOUND OR v_status <> 'verified' THEN
        RAISE EXCEPTION 'Only a verified gradebook can be locked.';
    END IF;
    PERFORM assert_gradebook_readiness(p_section_id);
    UPDATE gradebooks SET
        academic_year_id = p_academic_year_id,
        status = 'locked',
        locked_by = p_actor_id,
        locked_at = NOW(),
        updated_at = NOW()
    WHERE id = v_gradebook_id;
    INSERT INTO gradebook_history (
        gradebook_id, user_id, action, from_status, to_status, reason
    ) VALUES (
        v_gradebook_id, p_actor_id, 'locked', v_status, 'locked',
        'Department Head locked the verified gradebook.'
    );
    RETURN v_gradebook_id;
END;
$$;

CREATE OR REPLACE FUNCTION reopen_department_gradebook(
    p_section_id UUID,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gradebook_id UUID;
    v_status TEXT;
    v_reason TEXT := BTRIM(COALESCE(p_reason, ''));
BEGIN
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required to reopen a gradebook.';
    END IF;
    PERFORM 1 FROM course_sections
    WHERE id = p_section_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;
    SELECT id, status INTO v_gradebook_id, v_status
    FROM gradebooks WHERE section_id = p_section_id FOR UPDATE;
    IF NOT FOUND OR v_status <> 'locked' THEN
        RAISE EXCEPTION 'Only a locked gradebook can be reopened.';
    END IF;
    UPDATE gradebooks SET
        status = 'reopened',
        reopened_by = p_actor_id,
        reopened_at = NOW(),
        reopen_reason = v_reason,
        verified_by = NULL,
        verified_at = NULL,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
    WHERE id = v_gradebook_id;
    INSERT INTO gradebook_history (
        gradebook_id, user_id, action, from_status, to_status, reason
    ) VALUES (
        v_gradebook_id, p_actor_id, 'reopened', v_status, 'reopened', v_reason
    );
    RETURN v_gradebook_id;
END;
$$;

REVOKE ALL ON FUNCTION assert_gradebook_readiness(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION submit_faculty_gradebook(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION verify_department_gradebook(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lock_department_gradebook(UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reopen_department_gradebook(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assert_gradebook_readiness(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION submit_faculty_gradebook(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION verify_department_gradebook(UUID, UUID, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION lock_department_gradebook(UUID, UUID, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION reopen_department_gradebook(UUID, UUID, TEXT)
    TO service_role;
