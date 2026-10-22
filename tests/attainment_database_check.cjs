// Run with: node tests/attainment_database_check.cjs <path-to-pglite-package>
// Uses an isolated in-memory PostgreSQL engine; never connects to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../database/requirement_5_6_attainment_refresh.sql'), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const section = id(1), course = id(2), co1 = id(3), co2 = id(4);
const s1 = id(5), s2 = id(6), s3 = id(7), a1 = id(8), a2 = id(9);

(async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
            CREATE TABLE course_sections(id UUID PRIMARY KEY, course_id UUID);
            CREATE TABLE course_outcomes(id UUID PRIMARY KEY, course_id UUID, code TEXT,
                description TEXT, target_percentage NUMERIC(5,2));
            CREATE TABLE course_mapping_reviews(section_id UUID PRIMARY KEY, status TEXT);
            CREATE TABLE assessment_activities(id UUID PRIMARY KEY, section_id UUID,
                course_outcome_id UUID, title TEXT, activity_type TEXT, released_at TIMESTAMPTZ);
            CREATE TABLE assessment_activity_course_outcomes(assessment_activity_id UUID,
                course_outcome_id UUID, UNIQUE(assessment_activity_id, course_outcome_id));
            CREATE TABLE enrollments(section_id UUID, student_profile_id UUID, enrollment_status TEXT,
                UNIQUE(section_id, student_profile_id));
            CREATE TABLE raw_assessment_scores(assessment_activity_id UUID,
                student_profile_id UUID, percentage NUMERIC(5,2));
            CREATE TABLE co_attainment(id UUID DEFAULT gen_random_uuid(), section_id UUID,
                course_outcome_id UUID, attainment_percentage NUMERIC(5,2), target_percentage NUMERIC(5,2),
                status TEXT, flagged BOOLEAN, version TEXT, calculated_at TIMESTAMPTZ,
                UNIQUE(section_id, course_outcome_id));
            CREATE TABLE student_co_attainment(id UUID DEFAULT gen_random_uuid(), section_id UUID,
                student_profile_id UUID, course_outcome_id UUID, attainment_percentage NUMERIC(5,2),
                status TEXT, can_view BOOLEAN, calculated_at TIMESTAMPTZ,
                UNIQUE(section_id, student_profile_id, course_outcome_id));
            INSERT INTO course_sections VALUES ('${section}', '${course}');
            INSERT INTO course_outcomes VALUES
                ('${co1}', '${course}', 'CO1', 'One', 70), ('${co2}', '${course}', 'CO2', 'Two', 70);
            INSERT INTO course_mapping_reviews VALUES ('${section}', 'verified');
            INSERT INTO enrollments VALUES ('${section}', '${s1}', 'active'),
                ('${section}', '${s2}', 'active'), ('${section}', '${s3}', 'active');
            INSERT INTO assessment_activities VALUES
                ('${a1}', '${section}', '${co1}', 'Released', 'quiz', NOW()),
                ('${a2}', '${section}', '${co1}', 'Unreleased', 'quiz', NULL);
            INSERT INTO assessment_activity_course_outcomes VALUES
                ('${a1}', '${co1}'), ('${a1}', '${co2}'), ('${a2}', '${co1}');
            INSERT INTO raw_assessment_scores VALUES
                ('${a1}', '${s1}', 80), ('${a1}', '${s2}', 60), ('${a2}', '${s2}', 100);
        `);
        await db.exec(migration);
        // Reapplying must be safe for an existing database.
        await db.exec(migration);
        const permissions = (await db.query(`SELECT
            has_function_privilege('authenticated', 'refresh_section_attainment(uuid)', 'EXECUTE') AS browser,
            has_function_privilege('anon', 'refresh_section_attainment(uuid)', 'EXECUTE') AS anonymous,
            has_function_privilege('service_role', 'refresh_section_attainment(uuid)', 'EXECUTE') AS server
        `)).rows[0];
        assert.deepEqual(permissions, { browser: false, anonymous: false, server: true });
        const refresh = async () => (await db.query(
            'SELECT refresh_section_attainment($1) AS results', [section])).rows[0].results;
        const rows = async table => (await db.query(`SELECT * FROM ${table} ORDER BY course_outcome_id, id`)).rows;

        let result = await refresh();
        assert.deepEqual(result.map(r => Number(r.attainment_percentage)), [50, 50]);
        assert.ok(result.every(r => r.student_count === 2 && r.met_student_count === 1));
        assert.equal(result[0].activities.length, 2);
        assert.equal((await rows('student_co_attainment')).length, 4);
        console.log('PASS: migration applies twice; released-only multi-CO results; unscored students excluded');

        await db.exec(`UPDATE enrollments SET enrollment_status='dropped' WHERE student_profile_id='${s2}';`);
        assert.ok((await rows('co_attainment')).every(r => r.version === null));
        result = await refresh();
        assert.ok(result.every(r => Number(r.attainment_percentage) === 100 && r.student_count === 1));
        assert.ok((await rows('student_co_attainment')).every(r => r.student_profile_id === s1));
        await db.exec(`UPDATE enrollments SET enrollment_status='active' WHERE student_profile_id='${s2}';`);
        assert.ok((await rows('co_attainment')).every(r => r.version === null));
        result = await refresh();
        assert.ok(result.every(r => Number(r.attainment_percentage) === 50));
        console.log('PASS: dropping and re-enrolling invalidate and rebuild attainment');

        // Release a second score: individual means are averaged before class thresholds.
        await db.exec(`UPDATE assessment_activities SET released_at=NOW() WHERE id='${a2}';`);
        result = await refresh();
        assert.equal(Number(result[0].attainment_percentage), 100);
        assert.equal(Number(result[1].attainment_percentage), 50);
        const personalMean = (await rows('student_co_attainment')).find(
            r => r.student_profile_id === s2 && r.course_outcome_id === co1);
        assert.equal(Number(personalMean.attainment_percentage), 80);
        await db.exec(`UPDATE assessment_activities SET released_at=NULL WHERE id='${a2}';`);
        await refresh();
        console.log('PASS: service-role permissions; mean of released percentages before class threshold');

        // Fail after deletes and personal inserts; the whole refresh must roll back.
        const beforeClass = await rows('co_attainment'), beforeStudent = await rows('student_co_attainment');
        await db.exec(`CREATE FUNCTION fail_attainment_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'forced save failure'; END; $$;
            CREATE TRIGGER fail_refresh BEFORE INSERT ON co_attainment
            FOR EACH ROW EXECUTE FUNCTION fail_attainment_insert();`);
        await assert.rejects(refresh(), /forced save failure/);
        assert.deepEqual(await rows('co_attainment'), beforeClass);
        assert.deepEqual(await rows('student_co_attainment'), beforeStudent);
        await db.exec('DROP TRIGGER fail_refresh ON co_attainment;');
        console.log('PASS: failed replacement rolls back class and personal results');

        await db.exec("UPDATE course_mapping_reviews SET status='pending';");
        await refresh();
        assert.ok((await rows('student_co_attainment')).every(r => !r.can_view));
        await db.exec('DELETE FROM raw_assessment_scores;');
        result = await refresh();
        assert.ok(result.every(r => r.attainment_percentage === null && r.status === 'awaiting_results' && !r.flagged));
        assert.equal((await rows('student_co_attainment')).length, 0);
        console.log('PASS: mapping visibility and cleared-score results');

        // Enrollment insert, deletion and section transfer all invalidate saved results.
        await db.exec(`INSERT INTO enrollments VALUES ('${section}', '${id(10)}', 'active');`);
        assert.ok((await rows('co_attainment')).every(r => r.version === null));
        await refresh();
        await db.exec(`DELETE FROM enrollments WHERE student_profile_id='${id(10)}';`);
        assert.ok((await rows('co_attainment')).every(r => r.version === null));
        await refresh();
        await db.exec(`INSERT INTO course_sections VALUES ('${id(11)}', '${course}');
            UPDATE enrollments SET section_id='${id(11)}' WHERE student_profile_id='${s3}';`);
        assert.ok((await rows('co_attainment')).every(r => r.version === null));
        await assert.rejects(db.query('SELECT refresh_section_attainment($1)', [id(999)]), /not found/);
        console.log('PASS: insert/delete/transfer invalidation and missing-section rejection');
    } finally {
        await db.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
