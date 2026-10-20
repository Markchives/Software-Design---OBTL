CREATE TABLE IF NOT EXISTS course_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_role TEXT NOT NULL CHECK (author_role IN ('faculty', 'department-head')),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('section', 'department')),
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (audience_type = 'section' AND section_id IS NOT NULL AND department_id IS NULL)
        OR
        (audience_type = 'department' AND section_id IS NULL AND department_id IS NOT NULL)
    ),
    CHECK (
        (author_role = 'faculty' AND audience_type = 'section')
        OR
        (author_role = 'department-head' AND audience_type = 'department')
    )
);

ALTER TABLE course_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE assessment_activities
    ALTER COLUMN max_score TYPE NUMERIC(7,2);

ALTER TABLE assessment_activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw_assessment_scores
    ALTER COLUMN score TYPE NUMERIC(7,2),
    ALTER COLUMN max_score TYPE NUMERIC(7,2),
    ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE raw_assessment_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_course_posts_section_created_at
    ON course_posts (section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_posts_department_created_at
    ON course_posts (department_id, created_at DESC);
