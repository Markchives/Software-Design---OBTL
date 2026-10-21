ALTER TABLE assessment_activities
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS raw_assessment_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_activity_id UUID NOT NULL REFERENCES assessment_activities(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('entered', 'updated')),
    previous_score NUMERIC(7,2),
    new_score NUMERIC(7,2),
    previous_max_score NUMERIC(7,2),
    new_max_score NUMERIC(7,2),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_review_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    assessment_activity_id UUID NOT NULL REFERENCES assessment_activities(id) ON DELETE CASCADE,
    student_profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issue TEXT NOT NULL,
    description TEXT NOT NULL,
    response TEXT,
    responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'responded', 'resolved')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE raw_assessment_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_review_flags ENABLE ROW LEVEL SECURITY;

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
    PERFORM 1
    FROM course_sections
    WHERE id = v_section_id
    FOR UPDATE;
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
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_assessment_changes();

DROP TRIGGER IF EXISTS raw_assessment_scores_locked_guard
    ON raw_assessment_scores;
CREATE TRIGGER raw_assessment_scores_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON raw_assessment_scores
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_assessment_changes();

DROP TRIGGER IF EXISTS assessment_review_flags_locked_guard
    ON assessment_review_flags;
CREATE TRIGGER assessment_review_flags_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON assessment_review_flags
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_assessment_changes();

CREATE INDEX IF NOT EXISTS idx_assessment_review_flags_section_status
    ON assessment_review_flags (section_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_review_flags_activity
    ON assessment_review_flags (assessment_activity_id, status);
CREATE INDEX IF NOT EXISTS idx_raw_score_history_student_activity
    ON raw_assessment_score_history (assessment_activity_id, student_profile_id, changed_at DESC);

CREATE OR REPLACE FUNCTION record_raw_assessment_score_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO raw_assessment_score_history (
            assessment_activity_id, section_id, student_profile_id,
            changed_by, action, new_score, new_max_score
        )
        VALUES (
            NEW.assessment_activity_id, NEW.section_id, NEW.student_profile_id,
            NEW.entered_by, 'entered', NEW.score, NEW.max_score
        );
        RETURN NEW;
    END IF;

    IF NEW.score IS DISTINCT FROM OLD.score
       OR NEW.max_score IS DISTINCT FROM OLD.max_score THEN
        INSERT INTO raw_assessment_score_history (
            assessment_activity_id, section_id, student_profile_id,
            changed_by, action, previous_score, new_score,
            previous_max_score, new_max_score
        )
        VALUES (
            NEW.assessment_activity_id, NEW.section_id, NEW.student_profile_id,
            NEW.entered_by, 'updated', OLD.score, NEW.score,
            OLD.max_score, NEW.max_score
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS raw_assessment_scores_history_trigger
    ON raw_assessment_scores;
CREATE TRIGGER raw_assessment_scores_history_trigger
AFTER INSERT OR UPDATE ON raw_assessment_scores
FOR EACH ROW
EXECUTE FUNCTION record_raw_assessment_score_history();

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
    FROM course_sections
    WHERE id = p_section_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section does not exist.';
    END IF;
    IF v_actual_academic_year_id IS DISTINCT FROM p_academic_year_id THEN
        RAISE EXCEPTION 'The section academic year changed; reload and retry.';
    END IF;

    SELECT id, status
    INTO v_gradebook_id, v_status
    FROM gradebooks
    WHERE section_id = p_section_id
    FOR UPDATE;
    IF NOT FOUND OR v_status <> 'verified' THEN
        RAISE EXCEPTION 'Only a verified gradebook can be locked.';
    END IF;
    PERFORM assert_gradebook_readiness(p_section_id);
    UPDATE gradebooks
    SET status = 'locked',
        locked_by = p_actor_id,
        locked_at = NOW(),
        updated_at = NOW()
    WHERE id = v_gradebook_id;

    INSERT INTO gradebook_history (
        gradebook_id, user_id, action, from_status, to_status, reason
    )
    VALUES (
        v_gradebook_id, p_actor_id, 'locked', v_status, 'locked',
        'Department Head locked the verified gradebook.'
    );
    RETURN v_gradebook_id;
END;
$$;

REVOKE ALL ON FUNCTION lock_department_gradebook(UUID, UUID, UUID)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_department_gradebook(UUID, UUID, UUID)
    TO service_role;
