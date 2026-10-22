"""Isolated API regressions; no Supabase credentials or application startup needed."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "app.py"


def load_functions(names, namespace):
    tree = ast.parse(SOURCE.read_text(encoding="utf-8-sig"))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            node.decorator_list = []
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace


class Query:
    def __init__(self, rows):
        self.rows = list(rows)

    def select(self, *args):
        return self

    def eq(self, key, value):
        self.rows = [row for row in self.rows if row.get(key) == value]
        return self

    def in_(self, key, values):
        self.rows = [row for row in self.rows if row.get(key) in values]
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class CQIWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tables = {
            "course_sections": [dict(id=s, course_id="c", faculty_id="f") for s in ("a", "b")],
            "courses": [dict(id="c", code="C", title="Course")],
            "cqi_categories": [],
            "cqi_action_plans": [dict(id=s, section_id=s, faculty_id="f", status="approved")
                                 for s in ("a", "b")],
            "enrollments": [dict(section_id=s, student_profile_id="student", enrollment_status="active")
                            for s in ("a", "b")],
        }
        self.calculated = []

        def calculate(section):
            self.calculated.append(section)
            # Same CO in separate sections counts separately. Includes a CO without a plan.
            return [dict(course_outcome_id="co", flagged=True),
                    dict(course_outcome_id="no-plan", flagged=section == "a"),
                    dict(course_outcome_id="improved", flagged=False)]

        self.ns = load_functions(
            {"get_faculty_cqi_workspace", "get_student_cqi_actions", "_student_section_scope"},
            dict(admin_supabase=SimpleNamespace(table=lambda name: Query(self.tables[name])),
                 request=SimpleNamespace(args={}), g=SimpleNamespace(authenticated_user=SimpleNamespace(id="u")),
                 jsonify=lambda value: value,
                 _account_profile=lambda role, *args: dict(id="f" if role == "faculty" else "student"),
                 _cqi_enrich_plans=lambda plans: plans, _calculate_section_attainment=calculate,
                 app=SimpleNamespace(logger=SimpleNamespace(exception=lambda *args: None))),
        )

    def test_count_uses_current_section_outcomes_without_requiring_plans(self):
        self.tables["cqi_action_plans"] = []
        body, status = self.ns["get_faculty_cqi_workspace"]()
        self.assertEqual(status, 200)
        self.assertEqual(body["below_target_count"], 3)
        self.assertCountEqual(self.calculated, ["a", "b"])

    def test_faculty_section_scopes_plans_choices_and_count(self):
        self.ns["request"].args = {"section_id": "a"}
        body, status = self.ns["get_faculty_cqi_workspace"]()
        self.assertEqual(status, 200)
        self.assertEqual([p["section_id"] for p in body["plans"]], ["a"])
        self.assertEqual([s["id"] for s in body["sections"]], ["a"])
        self.assertEqual(body["below_target_count"], 2)
        self.assertEqual(self.calculated, ["a"])

    def test_foreign_faculty_section_is_denied_before_calculation(self):
        self.ns["request"].args = {"section_id": "foreign"}
        self.assertEqual(self.ns["get_faculty_cqi_workspace"]()[1], 404)
        self.assertEqual(self.calculated, [])

    def test_student_gets_only_selected_section_and_approved_states(self):
        self.ns["request"].args = {"section_id": "a"}
        self.tables["cqi_action_plans"].append(dict(id="draft", section_id="a", status="draft"))
        body, status = self.ns["get_student_cqi_actions"]()
        self.assertEqual(status, 200)
        self.assertEqual([p["id"] for p in body["plans"]], ["a"])

    def test_student_foreign_or_dropped_section_is_denied(self):
        for section in ("foreign", "a"):
            self.tables["enrollments"][0]["enrollment_status"] = "dropped"
            self.ns["request"].args = {"section_id": section}
            self.assertEqual(self.ns["get_student_cqi_actions"]()[1], 403)


class AtomicRefreshTests(unittest.TestCase):
    def test_refresh_uses_one_rpc_and_returns_empty_results(self):
        calls = []
        def rpc(name, args):
            calls.append((name, args))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))
        ns = load_functions({"_calculate_section_attainment"},
                            dict(admin_supabase=SimpleNamespace(rpc=rpc)))
        self.assertEqual(ns["_calculate_section_attainment"]("a"), [])
        self.assertEqual(calls, [("refresh_section_attainment", {"p_section_id": "a"})])

    def test_failure_propagates_without_python_deletes_or_fallback(self):
        def rpc(*args):
            raise RuntimeError("Database unavailable")
        ns = load_functions({"_calculate_section_attainment"},
                            dict(admin_supabase=SimpleNamespace(rpc=rpc)))
        with self.assertRaisesRegex(RuntimeError, "Database unavailable"):
            ns["_calculate_section_attainment"]("a")


if __name__ == "__main__":
    unittest.main()
