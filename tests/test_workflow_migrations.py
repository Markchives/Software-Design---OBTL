import csv
import os
import sys
import unittest
from contextlib import ExitStack
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.update({
    "FLASK_SECRET_KEY": "unit-test-secret",
    "SUPABASE_URL": "https://unit-test.supabase.co",
    "SUPABASE_KEY": "unit-test-anon-key",
    "SUPABASE_SECRET_KEY": "unit-test-service-key",
})
import app as app_module


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}

    def __getattr__(self, name):
        if name in {"select", "order", "limit"}:
            return lambda *args, **kwargs: self
        if name == "eq":
            return self._eq
        if name == "in_":
            return self._in
        if name == "execute":
            return self._execute
        raise AttributeError(name)

    def _eq(self, field, value):
        self.filters[field] = value
        return self

    def _in(self, field, values):
        self.filters[field] = set(values)
        return self

    def _execute(self):
        if isinstance(self.rows, dict):
            return SimpleNamespace(data=self.rows)
        rows = self.rows
        for field, expected in self.filters.items():
            if isinstance(expected, set):
                rows = [row for row in rows if row.get(field) in expected]
            else:
                rows = [row for row in rows if row.get(field) == expected]
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, tables=None, rpc_data=None):
        self.tables = tables or {}
        self.rpc_data = rpc_data or {}

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))

    def rpc(self, name, _payload):
        return FakeQuery(self.rpc_data.get(name, {}))


def authenticated_as(role):
    stack = ExitStack()
    stack.enter_context(patch.object(
        app_module, "get_authenticated_user",
        return_value=SimpleNamespace(id="test-user"),
    ))
    stack.enter_context(patch.object(
        app_module, "get_user_role", return_value=role,
    ))
    stack.enter_context(patch.object(
        app_module, "has_active_role_record", return_value=True,
    ))
    stack.enter_context(patch.object(
        app_module, "has_pending_role_request", return_value=False,
    ))
    return stack


class GradebookRosterLockMigrationTests(unittest.TestCase):
    def test_enrollment_mutations_are_guarded_at_database_layer(self):
        migration = (
            ROOT / "database" / "gradebook_roster_lock_guard.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments", migration)
        self.assertIn("FOR KEY SHARE", migration)
        self.assertIn("NEW.student_profile_id IS NOT DISTINCT FROM OLD.student_profile_id", migration)
        self.assertIn("gradebook.status = 'locked'", migration)
        self.assertIn("reopen it before changing roster membership", migration)
        self.assertIn("GRANT EXECUTE", migration)

    def test_gradebook_transitions_serialize_on_the_section_row(self):
        migration = (
            ROOT / "database" / "gradebook_locking_workflow.sql"
        ).read_text(encoding="utf-8")

        self.assertGreaterEqual(migration.count("FOR UPDATE"), 4)
        self.assertIn("status = 'locked'", migration)
        self.assertIn("status = 'reopened'", migration)


class WorkflowApiRegressionTests(unittest.TestCase):
    def test_student_and_faculty_gradebook_entry_routes_are_accessible(self):
        client = app_module.app.test_client()
        with authenticated_as("student"):
            student_page = client.get("/requirement 7/gl-student.html")
        with authenticated_as("faculty"):
            faculty_page = client.get("/requirement 4/ra-faculty.html")
            wrong_role_page = client.get("/requirement 7/gl-student.html")

        self.assertEqual(student_page.status_code, 200)
        self.assertEqual(faculty_page.status_code, 200)
        self.assertEqual(wrong_role_page.status_code, 403)

    def test_student_gradebook_api_returns_only_active_own_sections(self):
        fake_supabase = FakeSupabase({
            "enrollments": [
                {
                    "section_id": "own-section",
                    "student_profile_id": "profile-1",
                    "enrollment_status": "active",
                },
                {
                    "section_id": "other-section",
                    "student_profile_id": "profile-2",
                    "enrollment_status": "active",
                },
            ],
            "course_sections": [
                {
                    "id": "own-section",
                    "course_id": "course-1",
                    "section_name": "A",
                    "academic_year_id": "year-1",
                },
                {
                    "id": "other-section",
                    "course_id": "course-2",
                    "section_name": "B",
                    "academic_year_id": "year-1",
                },
            ],
            "courses": [
                {"id": "course-1", "code": "IT101", "title": "Foundations"},
                {"id": "course-2", "code": "IT102", "title": "Other Course"},
            ],
            "academic_years": [{"id": "year-1", "name": "2026-2027"}],
            "gradebooks": [{
                "section_id": "own-section",
                "status": "locked",
                "verified_at": "2026-10-01T00:00:00Z",
                "locked_at": "2026-10-02T00:00:00Z",
            }],
        })
        with authenticated_as("student"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_account_profile", return_value={"id": "profile-1"}):
            response = app_module.app.test_client().get("/api/student/gradebooks")

        self.assertEqual(response.status_code, 200)
        gradebooks = response.get_json()["gradebooks"]
        self.assertEqual(len(gradebooks), 1)
        self.assertEqual(gradebooks[0]["section_id"], "own-section")
        self.assertEqual(gradebooks[0]["gradebook_status"], "locked")

    def test_student_cqi_response_is_scoped_and_allowlisted(self):
        private_plan = {
            "id": "plan-1",
            "title": "Improve practice",
            "course_id": "course-1",
            "course_code": "IT101",
            "course_title": "Foundations",
            "section_name": "A",
            "status": "approved",
            "problem_statement": "Low outcome attainment",
            "proposed_intervention": "Guided exercises",
            "expected_improvement": "Improved practice",
            "review_comments": "Internal review note",
            "reviewed_by": "reviewer-1",
            "targets": [{
                "code": "CO1",
                "category_name": "Additional Practice",
                "category_id": "category-1",
                "attainment_percentage": 45,
            }],
        }
        fake_supabase = FakeSupabase({
            "enrollments": [
                {
                    "section_id": "section-1",
                    "student_profile_id": "profile-1",
                    "enrollment_status": "active",
                },
            ],
            "cqi_action_plans": [
                {"id": "own", "section_id": "section-1", "status": "approved"},
                {"id": "other", "section_id": "section-2", "status": "approved"},
                {"id": "draft", "section_id": "section-1", "status": "draft"},
            ],
        })

        def enrich_and_check(plans):
            self.assertEqual([plan["id"] for plan in plans], ["own"])
            return [private_plan]

        with authenticated_as("student"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_account_profile", return_value={"id": "profile-1"}), \
                patch.object(app_module, "_cqi_enrich_plans", side_effect=enrich_and_check):
            response = app_module.app.test_client().get("/api/student/cqi")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()["plans"][0]
        self.assertEqual(payload["id"], "plan-1")
        self.assertEqual(payload["targets"], [{
            "code": "CO1",
            "category_name": "Additional Practice",
        }])
        self.assertNotIn("review_comments", payload)
        self.assertNotIn("reviewed_by", payload)
        self.assertNotIn("attainment_percentage", payload["targets"][0])
        self.assertEqual(
            set(payload),
            {
                "id", "title", "course_id", "course_code", "course_title",
                "section_name", "status", "problem_statement",
                "proposed_intervention", "expected_improvement", "targets",
            },
        )

    def test_admin_cqi_pagination_keeps_database_order_and_total(self):
        fake_supabase = FakeSupabase(
            tables={
                "cqi_action_plans": [
                    {"id": "plan-old"},
                    {"id": "plan-new"},
                ],
                "cqi_categories": [],
            },
            rpc_data={"admin_cqi_register_page": {
                "plan_ids": ["plan-new", "plan-old"],
                "total_count": 1001,
                "progress_count": 400,
                "pending_count": 50,
                "departments": [{"id": "dept-1", "name": "Engineering"}],
                "category_counts": {},
            }},
        )
        with authenticated_as("admin-security"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_cqi_enrich_plans", side_effect=lambda plans: plans):
            response = app_module.app.test_client().get(
                "/api/admin/cqi?page=21&page_size=50"
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(
            [plan["id"] for plan in payload["plans"]],
            ["plan-new", "plan-old"],
        )
        self.assertEqual(payload["pagination"]["total_count"], 1001)
        self.assertEqual(payload["pagination"]["total_pages"], 21)
        self.assertEqual(payload["departments"][0]["id"], "dept-1")

    def test_admin_csv_export_fetches_matching_records_across_pages(self):
        plans = [
            {
                "id": f"plan-{number:03d}",
                "status": "approved",
                "proposed_intervention": f"Intervention {number}",
            }
            for number in range(101)
        ]
        plan_ids = [plan["id"] for plan in plans]

        class ExportSupabase(FakeSupabase):
            def __init__(self):
                super().__init__({"cqi_action_plans": plans})
                self.rpc_calls = []

            def rpc(self, name, payload):
                self.rpc_calls.append((name, payload.copy()))
                start = (payload["p_page"] - 1) * payload["p_page_size"]
                page_ids = plan_ids[start:start + payload["p_page_size"]]
                return FakeQuery({
                    "plan_ids": page_ids,
                    "page": payload["p_page"],
                    "total_count": len(plan_ids),
                    "progress_count": 0,
                    "pending_count": 0,
                    "departments": [],
                    "category_counts": {},
                })

        fake_supabase = ExportSupabase()
        with authenticated_as("admin-security"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_cqi_enrich_plans", side_effect=lambda rows: rows):
            response = app_module.app.test_client().get(
                "/api/admin/cqi/export?status=approved&search=Intervention"
            )

        rows = list(csv.reader(StringIO(response.get_data(as_text=True))))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(rows), 102)
        self.assertEqual([call[1]["p_page"] for call in fake_supabase.rpc_calls], [1, 2])
        self.assertTrue(all(call[1]["p_page_size"] == 100 for call in fake_supabase.rpc_calls))
        self.assertTrue(all(call[1]["p_status"] == "approved" for call in fake_supabase.rpc_calls))
        self.assertTrue(all(call[1]["p_search"] == "Intervention" for call in fake_supabase.rpc_calls))

    def test_non_admin_roles_cannot_read_admin_cqi_pagination(self):
        for role in ("student", "faculty", "department-head"):
            with self.subTest(role=role), authenticated_as(role):
                response = app_module.app.test_client().get("/api/admin/cqi")
                self.assertEqual(response.status_code, 403)

    def test_admin_cqi_pagination_rejects_invalid_pages(self):
        with authenticated_as("admin-security"):
            response = app_module.app.test_client().get(
                "/api/admin/cqi?page=0&page_size=50"
            )
        self.assertEqual(response.status_code, 400)
        with authenticated_as("admin-security"):
            oversized_page = app_module.app.test_client().get(
                "/api/admin/cqi?page=2147483648&page_size=50"
            )
        self.assertEqual(oversized_page.status_code, 400)

    def test_report_classification_does_not_claim_immutability(self):
        self.assertEqual(
            app_module._compliance_report_classification("locked"),
            (
                "LOCKED GRADEBOOK",
                "LOCKED GRADEBOOK - NOT AN IMMUTABLE SNAPSHOT",
            ),
        )
        for status in ("draft", "for_verification", "verified", "reopened"):
            with self.subTest(status=status):
                self.assertEqual(
                    app_module._compliance_report_classification(status),
                    ("PRELIMINARY", "PRELIMINARY"),
                )

    def test_compliance_pdf_metadata_reflects_locked_and_preliminary_states(self):
        section_id = "11111111-1111-4111-8111-111111111111"
        captured = {}

        def capture_pdf(title, subtitle, metadata, headers, rows, note):
            captured["title"] = title
            captured["metadata"] = dict(metadata)
            return b"pdf-bytes"

        for status, expected_title, expected_classification in (
            ("locked", "LOCKED GRADEBOOK:", "LOCKED GRADEBOOK - NOT AN IMMUTABLE SNAPSHOT"),
            ("reopened", "PRELIMINARY:", "PRELIMINARY"),
        ):
            fake_supabase = FakeSupabase({
                "course_sections": [{
                    "id": section_id,
                    "course_id": "course-1",
                    "section_name": "A",
                    "academic_year_id": "year-1",
                    "academic_term_id": "term-1",
                    "faculty_id": None,
                }],
                "courses": [{
                    "id": "course-1",
                    "code": "IT101",
                    "title": "Foundations",
                    "department_id": "dept-1",
                }],
                "academic_years": [{"id": "year-1", "name": "2026-2027"}],
                "academic_terms": [{"id": "term-1", "name": "Term 1", "term_number": 1}],
                "course_mapping_reviews": [],
                "gradebooks": [{
                    "section_id": section_id,
                    "status": status,
                    "locked_at": "2026-10-02T00:00:00Z" if status == "locked" else None,
                }],
                "cqi_action_plans": [],
            })
            with self.subTest(status=status), \
                    authenticated_as("admin-security"), \
                    patch.object(app_module, "admin_supabase", fake_supabase), \
                    patch.object(app_module, "_report_pdf", side_effect=capture_pdf):
                response = app_module.app.test_client().get(
                    f"/api/reports/cqi-action-report/{section_id}"
                )

            self.assertEqual(response.status_code, 200)
            self.assertTrue(captured["title"].startswith(expected_title))
            metadata = captured["metadata"]
            self.assertEqual(metadata["Report classification"], expected_classification)
            self.assertEqual(metadata["Section ID"], section_id)
            self.assertEqual(metadata["Academic Term"], "Term 1")
            self.assertEqual(metadata["Term ID"], "term-1")
            self.assertIn("Generated", metadata)

    def test_compliance_report_endpoint_enforces_section_scope(self):
        section_id = "11111111-1111-4111-8111-111111111111"
        fake_supabase = FakeSupabase({
            "course_sections": [{
                "id": section_id,
                "course_id": "course-1",
                "section_name": "A",
                "academic_year_id": "year-1",
                "academic_term_id": "term-1",
                "faculty_id": "faculty-profile-1",
            }],
            "courses": [{
                "id": "course-1",
                "code": "IT101",
                "title": "Foundations",
                "department_id": "dept-1",
            }],
        })
        client = app_module.app.test_client()
        with authenticated_as("student"), \
                patch.object(app_module, "admin_supabase", fake_supabase):
            student_class_sheet = client.get(
                f"/api/reports/class-grading-sheet/{section_id}"
            )
        with authenticated_as("faculty"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "get_faculty_section", return_value=None):
            unassigned_faculty = client.get(
                f"/api/reports/syllabus-matrix/{section_id}"
            )
        with authenticated_as("department-head"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_department_head_department_id", return_value="other-dept"):
            other_department = client.get(
                f"/api/reports/cqi-action-report/{section_id}"
            )

        self.assertEqual(student_class_sheet.status_code, 403)
        self.assertEqual(unassigned_faculty.status_code, 403)
        self.assertEqual(other_department.status_code, 403)

    def test_student_attainment_report_contains_only_own_visible_attainment(self):
        section_id = "11111111-1111-4111-8111-111111111111"
        captured = {}

        def capture_pdf(title, subtitle, metadata, headers, rows, note):
            captured["rows"] = rows
            return b"pdf-bytes"

        fake_supabase = FakeSupabase({
            "course_sections": [{
                "id": section_id,
                "course_id": "course-1",
                "section_name": "A",
                "academic_year_id": "year-1",
                "academic_term_id": "term-1",
                "faculty_id": None,
            }],
            "courses": [{
                "id": "course-1",
                "code": "IT101",
                "title": "Foundations",
                "department_id": "dept-1",
            }],
            "enrollments": [{
                "id": "enrollment-1",
                "section_id": section_id,
                "student_profile_id": "profile-1",
                "enrollment_status": "active",
            }],
            "academic_years": [{"id": "year-1", "name": "2026-2027"}],
            "academic_terms": [{"id": "term-1", "name": "Term 1", "term_number": 1}],
            "course_mapping_reviews": [{
                "section_id": section_id,
                "status": "verified",
            }],
            "gradebooks": [{"status": "locked", "locked_at": "2026-10-02T00:00:00Z"}],
            "course_outcomes": [{
                "id": "co-1",
                "course_id": "course-1",
                "code": "CO1",
                "description": "Outcome one",
                "target_percentage": 70,
            }],
            "student_co_attainment": [
                {
                    "course_outcome_id": "co-1",
                    "section_id": section_id,
                    "student_profile_id": "profile-1",
                    "attainment_percentage": 82,
                    "status": "met",
                    "can_view": True,
                },
                {
                    "course_outcome_id": "co-1",
                    "section_id": section_id,
                    "student_profile_id": "profile-2",
                    "attainment_percentage": 99,
                    "status": "met",
                    "can_view": True,
                },
            ],
        })
        with authenticated_as("student"), \
                patch.object(app_module, "admin_supabase", fake_supabase), \
                patch.object(app_module, "_account_profile", return_value={"id": "profile-1"}), \
                patch.object(app_module, "_report_pdf", side_effect=capture_pdf):
            response = app_module.app.test_client().get(
                f"/api/reports/student-outcome-attainment/{section_id}"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured["rows"]), 1)
        self.assertIn("82.0%", captured["rows"][0][2])
        self.assertNotIn("99.0%", str(captured["rows"]))

    def test_admin_pagination_migration_has_stable_order_and_role_grant(self):
        migration = (
            ROOT / "database" / "cqi_admin_pagination.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("ORDER BY updated_at DESC NULLS LAST, id DESC", migration)
        self.assertIn("POSITION(", migration)
        self.assertIn("FROM PUBLIC, anon, authenticated", migration)
        self.assertIn("TO service_role", migration)


if __name__ == "__main__":
    unittest.main()