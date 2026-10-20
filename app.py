from threading import Lock
import time
from functools import wraps
import logging
from logging.handlers import RotatingFileHandler
import os
from uuid import UUID, uuid4

from dotenv import load_dotenv

from flask import (
    Flask,
    jsonify,
    request,
    render_template,
    session,
    redirect,
    url_for,
    g,
)
from supabase import create_client, Client
from datetime import datetime, timedelta, timezone
import math
from werkzeug.utils import secure_filename
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

admin_supabase = (
    create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    if SUPABASE_URL and SUPABASE_SECRET_KEY
    else None
)

app = Flask(
    __name__,
    template_folder="Templates",
    static_folder="Static"
)

account_approval_logger = logging.getLogger("edumetrics.account_approvals")
account_approval_logger.setLevel(logging.ERROR)
account_approval_logger.propagate = False
if not account_approval_logger.handlers:
    os.makedirs(app.instance_path, exist_ok=True)
    approval_log_handler = RotatingFileHandler(
        os.path.join(app.instance_path, "account-approval.log"),
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    approval_log_handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s"
    ))
    account_approval_logger.addHandler(approval_log_handler)


app.permanent_session_lifetime = timedelta(days=30)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

app.secret_key = os.getenv("FLASK_SECRET_KEY")


app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

app.config["SESSION_COOKIE_NAME"] = "edumetrics_session"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (
    os.getenv("FLASK_ENV") == "production"
)


if not app.secret_key:
    raise RuntimeError("FLASK_SECRET_KEY is missing from .env")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Supabase configuration is missing from .env")

REMEMBERED_ACCOUNTS_COOKIE = "edumetrics_remembered_accounts"
remembered_accounts_serializer = URLSafeTimedSerializer(
    app.secret_key,
    salt="edumetrics-remembered-accounts",
)


def get_remembered_accounts():
    """Load and merge this browser's signed remember-me list and session copy."""
    cookie_accounts = {}
    cookie_value = request.cookies.get(REMEMBERED_ACCOUNTS_COOKIE)
    if cookie_value:
        try:
            cookie_accounts = remembered_accounts_serializer.loads(
                cookie_value,
                max_age=30 * 24 * 60 * 60,
            )
        except (BadSignature, SignatureExpired):
            cookie_accounts = {}

    session_accounts = session.get("remembered_accounts", {})
    accounts = {}
    if isinstance(cookie_accounts, dict):
        accounts.update(cookie_accounts)
    if isinstance(session_accounts, dict):
        accounts.update(session_accounts)

    now = int(time.time())
    return {
        str(email).strip().lower(): account
        for email, account in accounts.items()
        if isinstance(account, dict)
        and account.get("expires_at", 0) > now
        and account.get("user_id")
    }


def set_remembered_accounts_cookie(response, accounts):
    response.set_cookie(
        REMEMBERED_ACCOUNTS_COOKIE,
        remembered_accounts_serializer.dumps(accounts),
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        secure=app.config["SESSION_COOKIE_SECURE"],
        samesite="Lax",
        path="/",
    )
    return response

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SYLLABI_BUCKET = "course-syllabi"

# Password login lockout: 3 failed attempts, then 30 seconds.

LOGIN_MAX_FAILED_ATTEMPTS = 3
LOGIN_LOCKOUT_SECONDS = 30

_login_attempts = {}
_login_attempts_lock = Lock()


def normalize_role_name(role):
    if role is None:
        return None

    normalized = str(role).strip().lower()
    aliases = {
        "dept-head": "department-head",
        "department_head": "department-head",
        "depthead": "department-head",
        "head": "department-head",
        "admin": "admin-security",
        "admin_security": "admin-security",
    }
    return aliases.get(normalized, normalized)


def has_active_role_record(user_id, role):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    rows = (
        admin_supabase.table("users")
        .select("role, is_active")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(
        rows
        and normalize_role_name(rows[0].get("role")) == role
        and rows[0].get("is_active") is True
    )


def require_role(required_role):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            user = get_authenticated_user()

            if not user:
                session.pop("access_token", None)
                session.pop("refresh_token", None)
                session.pop("user_id", None)
                return redirect("/login page.html")

            if get_user_role(user) != required_role:
                return "You are not authorized to view this page.", 403

            try:
                if not has_active_role_record(user.id, required_role):
                    return "Your account is not active for this role.", 403
                if has_pending_role_request(user.id):
                    return "Your account is awaiting approval.", 403
            except Exception:
                app.logger.exception("Unable to verify the user's active role")
                return "Authorization could not be verified.", 503

            g.authenticated_user = user
            return view_function(*args, **kwargs)

        return wrapped

    return decorator


def require_roles(*required_roles):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            user = get_authenticated_user()
            if not user:
                session.pop("access_token", None)
                session.pop("refresh_token", None)
                session.pop("user_id", None)
                return redirect("/login page.html")

            role = get_user_role(user)
            if role not in required_roles:
                return "You are not authorized to access this resource.", 403

            try:
                if not has_active_role_record(user.id, role):
                    return "Your account is not active for this role.", 403
                if has_pending_role_request(user.id):
                    return "Your account is awaiting approval.", 403
            except Exception:
                app.logger.exception("Unable to verify the user's active role")
                return "Authorization could not be verified.", 503

            g.authenticated_user = user
            return view_function(*args, **kwargs)

        return wrapped

    return decorator


def require_authenticated(view_function):
    @wraps(view_function)
    def wrapped(*args, **kwargs):
        user = get_authenticated_user()

        if not user:
            session.pop("access_token", None)
            session.pop("refresh_token", None)
            session.pop("user_id", None)
            return redirect("/login page.html")

        g.authenticated_user = user
        return view_function(*args, **kwargs)

    return wrapped


@app.get("/api/faculty/sections")
@require_role("faculty")
def faculty_sections():
    if not admin_supabase:
        return jsonify({"error": "Course assignments are unavailable."}), 503

    try:
        user_id = g.authenticated_user.id
        profile_result = (
            admin_supabase.table("faculty_profiles")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        profiles = profile_result.data or []

        if not profiles:
            return jsonify({"sections": []}), 200

        section_result = (
            admin_supabase.table("course_sections")
            .select("id, course_id, academic_year_id, academic_term_id, section_name")
            .eq("faculty_id", profiles[0]["id"])
            .execute()
        )
        sections = section_result.data or []

        if not sections:
            return jsonify({"sections": []}), 200

        course_ids = list({item["course_id"] for item in sections})
        year_ids = list({
            item["academic_year_id"]
            for item in sections
            if item.get("academic_year_id")
        })

        course_result = (
            admin_supabase.table("courses")
            .select("id, code, title")
            .in_("id", course_ids)
            .execute()
        )
        courses_by_id = {
            item["id"]: item for item in (course_result.data or [])
        }

        years_by_id = {}
        if year_ids:
            year_result = (
                admin_supabase.table("academic_years")
                .select("id, name")
                .in_("id", year_ids)
                .execute()
            )
            years_by_id = {
                item["id"]: item for item in (year_result.data or [])
            }
        term_ids = list({
            item["academic_term_id"]
            for item in sections
            if item.get("academic_term_id")
        })
        terms_by_id = {}
        if term_ids:
            term_result = (
                admin_supabase.table("academic_terms")
                .select("id, term_number, name, start_date, end_date")
                .in_("id", term_ids)
                .execute()
            )
            terms_by_id = {
                item["id"]: item for item in (term_result.data or [])
            }

        assignments = []
        for section in sections:
            course = courses_by_id.get(section["course_id"])
            if not course:
                continue

            year = years_by_id.get(section.get("academic_year_id"), {})
            term = terms_by_id.get(section.get("academic_term_id"), {})
            assignments.append({
                "section_id": section["id"],
                "section_name": section["section_name"],
                "course_id": course["id"],
                "course_code": course["code"],
                "course_title": course["title"],
                "academic_year_id": section.get("academic_year_id"),
                "academic_year_name": year.get("name", ""),
                "academic_term_id": section.get("academic_term_id"),
                "term_number": term.get("term_number"),
                "term_name": term.get("name", ""),
                "term_start_date": term.get("start_date"),
                "term_end_date": term.get("end_date"),
            })

        return jsonify({"sections": assignments}), 200
    except Exception:
        app.logger.exception("Unable to load faculty course assignments")
        return jsonify({"error": "Course assignments could not be loaded."}), 500


def _faculty_roster_section(section_id):
    if not admin_supabase or not get_faculty_section(section_id):
        return None
    rows = (
        admin_supabase.table("course_sections")
        .select("id, course_id, academic_term_id, section_name")
        .eq("id", section_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _student_roster_preview(profile, section):
    user_rows = (
        admin_supabase.table("users")
        .select("id, full_name, email, role, is_active")
        .eq("id", profile["user_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    user = user_rows[0] if user_rows else {}
    status = "eligible"
    reason = ""
    if (
        user.get("role") != "student"
        or user.get("is_active") is not True
        or profile.get("is_enrolled") is not True
    ):
        status = "invalid_student"
        reason = "No active student account was found."
    else:
        current_rows = (
            admin_supabase.table("enrollments")
            .select("id, enrollment_status")
            .eq("section_id", section["id"])
            .eq("student_profile_id", profile["id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if current_rows:
            current_status = current_rows[0].get("enrollment_status")
            if current_status == "active":
                status = "already_active"
                reason = "Already active in this section."
            elif current_status == "completed":
                status = "already_completed"
                reason = "This enrollment is already completed."
        if status == "eligible":
            other_sections = (
                admin_supabase.table("course_sections")
                .select("id")
                .eq("course_id", section["course_id"])
                .eq("academic_term_id", section["academic_term_id"])
                .neq("id", section["id"])
                .execute()
                .data
                or []
            )
            other_section_ids = [row["id"] for row in other_sections]
            if other_section_ids:
                conflict_rows = (
                    admin_supabase.table("enrollments")
                    .select("id")
                    .eq("student_profile_id", profile["id"])
                    .eq("enrollment_status", "active")
                    .in_("section_id", other_section_ids)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if conflict_rows:
                    status = "section_conflict"
                    reason = "Already active in another section of this course and term."
    return {
        "student_profile_id": profile["id"],
        "student_number": profile.get("student_number", ""),
        "full_name": user.get("full_name", ""),
        "email": user.get("email", ""),
        "status": status,
        "reason": reason,
    }


@app.get("/api/faculty/sections/<section_id>/roster")
@require_role("faculty")
def faculty_section_roster(section_id):
    if not admin_supabase:
        return jsonify({"error": "Class rosters are unavailable."}), 503
    try:
        section = _faculty_roster_section(section_id)
        if not section:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        enrollment_rows = (
            admin_supabase.table("enrollments")
            .select("student_profile_id, enrollment_status")
            .eq("section_id", section_id)
            .execute()
            .data
            or []
        )
        student_ids = list({
            row["student_profile_id"] for row in enrollment_rows
            if row.get("student_profile_id")
        })
        profiles = []
        users_by_id = {}
        if student_ids:
            profiles = (
                admin_supabase.table("student_profiles")
                .select("id, user_id, student_number")
                .in_("id", student_ids)
                .execute()
                .data
                or []
            )
            user_ids = list({
                row["user_id"] for row in profiles if row.get("user_id")
            })
            if user_ids:
                users = (
                    admin_supabase.table("users")
                    .select("id, full_name, email")
                    .in_("id", user_ids)
                    .execute()
                    .data
                    or []
                )
                users_by_id = {row["id"]: row for row in users}
        profiles_by_id = {row["id"]: row for row in profiles}
        roster = []
        for enrollment in enrollment_rows:
            profile = profiles_by_id.get(enrollment.get("student_profile_id"))
            if not profile:
                continue
            user = users_by_id.get(profile.get("user_id"), {})
            roster.append({
                "student_profile_id": profile["id"],
                "student_number": profile.get("student_number", ""),
                "full_name": user.get("full_name", ""),
                "email": user.get("email", ""),
                "enrollment_status": enrollment.get("enrollment_status", ""),
            })
        return jsonify({
            "roster": roster,
            "counts": {
                "total": len(roster),
                "active": sum(row["enrollment_status"] == "active" for row in roster),
                "inactive": sum(row["enrollment_status"] != "active" for row in roster),
            },
        }), 200
    except Exception:
        app.logger.exception("Unable to load Faculty section roster")
        return jsonify({"error": "Class roster could not be loaded."}), 500


@app.get("/api/faculty/sections/<section_id>/students")
@require_role("faculty")
def search_faculty_roster_students(section_id):
    if not admin_supabase:
        return jsonify({"error": "Student search is unavailable."}), 503
    query = (request.args.get("q") or "").strip()
    if len(query) < 2 or len(query) > 100:
        return jsonify({"students": []}), 200
    try:
        section = _faculty_roster_section(section_id)
        if not section:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        pattern = f"%{query}%"
        profiles_by_id = {}
        number_matches = (
            admin_supabase.table("student_profiles")
            .select("id, user_id, student_number, is_enrolled")
            .ilike("student_number", pattern)
            .limit(20)
            .execute()
            .data
            or []
        )
        for profile in number_matches:
            profiles_by_id[profile["id"]] = profile
        user_ids = set()
        for field in ("full_name", "email"):
            users = (
                admin_supabase.table("users")
                .select("id")
                .eq("role", "student")
                .eq("is_active", True)
                .ilike(field, pattern)
                .limit(20)
                .execute()
                .data
                or []
            )
            user_ids.update(row["id"] for row in users)
        if user_ids:
            name_matches = (
                admin_supabase.table("student_profiles")
                .select("id, user_id, student_number, is_enrolled")
                .in_("user_id", list(user_ids))
                .limit(20)
                .execute()
                .data
                or []
            )
            for profile in name_matches:
                profiles_by_id[profile["id"]] = profile
        results = [
            _student_roster_preview(profile, section)
            for profile in list(profiles_by_id.values())[:25]
        ]
        results = [
            result for result in results
            if result["status"] != "invalid_student"
        ]
        return jsonify({"students": results}), 200
    except Exception:
        app.logger.exception("Unable to search students for a Faculty roster")
        return jsonify({"error": "Student search could not be completed."}), 500


@app.post("/api/faculty/sections/<section_id>/enrollments/preview")
@require_role("faculty")
def preview_faculty_section_enrollments(section_id):
    if not admin_supabase:
        return jsonify({"error": "Roster import is unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Roster preview must be a JSON object."}), 400
    student_numbers = payload.get("student_numbers")
    if (
        not isinstance(student_numbers, list)
        or not student_numbers
        or len(student_numbers) > 200
        or any(not isinstance(number, str) or len(number.strip()) > 40 for number in student_numbers)
    ):
        return jsonify({"error": "Provide up to 200 student numbers to preview."}), 400
    try:
        section = _faculty_roster_section(section_id)
        if not section:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        results = []
        seen = set()
        for raw_number in student_numbers:
            number = raw_number.strip()
            if not number:
                results.append({
                    "student_number": "",
                    "status": "invalid_student",
                    "reason": "Student number is blank.",
                })
                continue
            normalized = number.casefold()
            if normalized in seen:
                results.append({
                    "student_number": number,
                    "status": "duplicate_in_file",
                    "reason": "Student number appears more than once in the file.",
                })
                continue
            seen.add(normalized)
            profiles = (
                admin_supabase.table("student_profiles")
                .select("id, user_id, student_number, is_enrolled")
                .ilike("student_number", number)
                .limit(2)
                .execute()
                .data
                or []
            )
            if not profiles:
                results.append({
                    "student_number": number,
                    "status": "unknown_student",
                    "reason": "No existing student account matches this student number.",
                })
                continue
            if len(profiles) != 1 or profiles[0].get("student_number", "").casefold() != normalized:
                results.append({
                    "student_number": number,
                    "status": "unknown_student",
                    "reason": "Student number must match an existing account exactly.",
                })
                continue
            results.append(_student_roster_preview(profiles[0], section))
        return jsonify({"results": results}), 200
    except Exception:
        app.logger.exception("Unable to preview a Faculty roster import")
        return jsonify({"error": "Roster import could not be previewed."}), 500


@app.post("/api/faculty/sections/<section_id>/enrollments")
@require_role("faculty")
def enroll_students_in_faculty_section(section_id):
    if not admin_supabase:
        return jsonify({"error": "Student enrollment is unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Enrollment data must be a JSON object."}), 400
    student_profile_ids = payload.get("student_profile_ids")
    if (
        not isinstance(student_profile_ids, list)
        or not student_profile_ids
        or len(student_profile_ids) > 200
    ):
        return jsonify({"error": "Select between 1 and 200 students to enroll."}), 400
    try:
        section = _faculty_roster_section(section_id)
        if not section:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        parsed_ids = [str(UUID(str(value))) for value in student_profile_ids]
        response = admin_supabase.rpc(
            "manage_faculty_section_enrollments",
            {
                "p_section_id": section_id,
                "p_faculty_user_id": str(g.authenticated_user.id),
                "p_student_profile_ids": parsed_ids,
                "p_action": "enroll",
            },
        ).execute()
        return jsonify({"results": response.data or []}), 200
    except ValueError:
        return jsonify({"error": "One or more selected student IDs are invalid."}), 400
    except Exception:
        app.logger.exception("Unable to enroll students in a Faculty section")
        return jsonify({
            "error": (
                "Student enrollment could not be saved. Check the Flask log "
                "for the database error and verify that "
                "database/student_enrollment_workflow.sql has been applied."
            )
        }), 503


@app.post("/api/faculty/sections/<section_id>/enrollments/drop")
@require_role("faculty")
def drop_faculty_section_enrollment(section_id):
    if not admin_supabase:
        return jsonify({"error": "Enrollment updates are unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Enrollment data must be a JSON object."}), 400
    try:
        profile_id = str(UUID(str(payload.get("student_profile_id", ""))))
        if not _faculty_roster_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        response = admin_supabase.rpc(
            "manage_faculty_section_enrollments",
            {
                "p_section_id": section_id,
                "p_faculty_user_id": str(g.authenticated_user.id),
                "p_student_profile_ids": [profile_id],
                "p_action": "drop",
            },
        ).execute()
        return jsonify({"results": response.data or []}), 200
    except ValueError:
        return jsonify({"error": "The selected student ID is invalid."}), 400
    except Exception:
        app.logger.exception("Unable to update a Faculty section enrollment")
        return jsonify({
            "error": (
                "Enrollment status could not be updated. Check the Flask log "
                "and verify that database/student_enrollment_workflow.sql "
                "has been applied."
            )
        }), 503


@app.get("/api/student/courses")
@require_role("student")
def student_courses():
    if not admin_supabase:
        return jsonify({"error": "Student courses are unavailable."}), 503

    try:
        profile_result = (
            admin_supabase.table("student_profiles")
            .select("id")
            .eq("user_id", g.authenticated_user.id)
            .limit(1)
            .execute()
        )
        profiles = profile_result.data or []
        if not profiles:
            return jsonify({"profile_complete": False, "courses": []}), 200

        enrollment_result = (
            admin_supabase.table("enrollments")
            .select("id, section_id, enrollment_status")
            .eq("student_profile_id", profiles[0]["id"])
            .eq("enrollment_status", "active")
            .execute()
        )
        enrollments = enrollment_result.data or []
        if not enrollments:
            return jsonify({"profile_complete": True, "courses": []}), 200

        section_ids = list({item["section_id"] for item in enrollments})
        section_result = (
            admin_supabase.table("course_sections")
            .select("id, course_id, academic_year_id, academic_term_id, section_name")
            .in_("id", section_ids)
            .execute()
        )
        sections_by_id = {
            item["id"]: item for item in (section_result.data or [])
        }
        course_ids = list({
            item["course_id"]
            for item in sections_by_id.values()
        })
        year_ids = list({
            item["academic_year_id"]
            for item in sections_by_id.values()
            if item.get("academic_year_id")
        })

        courses_by_id = {}
        if course_ids:
            course_result = (
                admin_supabase.table("courses")
                .select("id, code, title")
                .in_("id", course_ids)
                .execute()
            )
            courses_by_id = {
                item["id"]: item for item in (course_result.data or [])
            }

        years_by_id = {}
        if year_ids:
            year_result = (
                admin_supabase.table("academic_years")
                .select("id, name")
                .in_("id", year_ids)
                .execute()
            )
            years_by_id = {
                item["id"]: item for item in (year_result.data or [])
            }
        term_ids = list({
            item["academic_term_id"]
            for item in sections_by_id.values()
            if item.get("academic_term_id")
        })
        terms_by_id = {}
        if term_ids:
            term_result = (
                admin_supabase.table("academic_terms")
                .select("id, term_number, name")
                .in_("id", term_ids)
                .execute()
            )
            terms_by_id = {
                item["id"]: item for item in (term_result.data or [])
            }

        courses = []
        for enrollment in enrollments:
            section = sections_by_id.get(enrollment["section_id"])
            if not section:
                continue

            course = courses_by_id.get(section["course_id"])
            if not course:
                continue

            year = years_by_id.get(section.get("academic_year_id"), {})
            term = terms_by_id.get(section.get("academic_term_id"), {})
            courses.append({
                "enrollment_id": enrollment["id"],
                "enrollment_status": enrollment["enrollment_status"],
                "section_name": section["section_name"],
                "course_code": course["code"],
                "course_title": course["title"],
                "academic_year_name": year.get("name", ""),
                "academic_term_id": section.get("academic_term_id"),
                "term_number": term.get("term_number"),
                "term_name": term.get("name", ""),
            })

        return jsonify({"profile_complete": True, "courses": courses}), 200
    except Exception:
        app.logger.exception("Unable to load student course enrollments")
        return jsonify({"error": "Student courses could not be loaded."}), 500


def _account_profile(role, user_id, fields):
    table_by_role = {
        "student": "student_profiles",
        "faculty": "faculty_profiles",
        "department-head": "dept_head_profiles",
    }
    table = table_by_role.get(role)
    if not table:
        return None
    result = (
        admin_supabase.table(table)
        .select(fields)
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _department_head_department_id(user_id):
    profile = _account_profile(
        "department-head", user_id, "department_id"
    )
    return profile.get("department_id") if profile else None


def _parse_uuid(value, error_message):
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        raise ValueError(error_message) from None


@app.get("/api/admin/academic-years")
@require_role("admin-security")
def list_academic_years():
    if not admin_supabase:
        return jsonify({"error": "Academic years are unavailable."}), 503
    try:
        years = (
            admin_supabase.table("academic_years")
            .select("id, name, start_date, end_date, is_active")
            .order("start_date", desc=True)
            .execute()
            .data
            or []
        )
        year_ids = [row["id"] for row in years]
        terms = []
        if year_ids:
            terms = (
                admin_supabase.table("academic_terms")
                .select("id, academic_year_id, term_number, name, start_date, end_date")
                .in_("academic_year_id", year_ids)
                .order("term_number")
                .execute()
                .data
                or []
            )
        terms_by_year = {}
        for term in terms:
            terms_by_year.setdefault(term["academic_year_id"], []).append(term)
        return jsonify({
            "academic_years": [
                {**year, "terms": terms_by_year.get(year["id"], [])}
                for year in years
            ]
        }), 200
    except Exception:
        app.logger.exception("Unable to load academic years and terms")
        return jsonify({"error": "Academic years could not be loaded."}), 500


@app.post("/api/admin/academic-years")
@require_role("admin-security")
def create_academic_year():
    if not admin_supabase:
        return jsonify({"error": "Academic years are unavailable."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Academic year data must be a JSON object."}), 400
    name = data.get("name")
    terms = data.get("terms")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        return jsonify({"error": "Academic year name must contain 1 to 80 characters."}), 400
    if not isinstance(terms, list) or len(terms) != 3:
        return jsonify({"error": "An academic year must have exactly three terms."}), 400
    start_date = str(data.get("start_date", "")).strip() or None
    end_date = str(data.get("end_date", "")).strip() or None
    parsed_year_dates = []
    for date_value in (start_date, end_date):
        if date_value is None:
            parsed_year_dates.append(None)
            continue
        try:
            parsed_year_dates.append(datetime.strptime(date_value, "%Y-%m-%d").date())
        except ValueError:
            return jsonify({"error": "Academic year dates must use YYYY-MM-DD format."}), 400
    if bool(start_date) != bool(end_date):
        return jsonify({"error": "Provide both academic year dates or leave both blank."}), 400
    if all(parsed_year_dates) and parsed_year_dates[0] > parsed_year_dates[1]:
        return jsonify({"error": "Academic year start date must be before its end date."}), 400

    validated_terms = []
    previous_end = None
    for index, term in enumerate(terms, start=1):
        if not isinstance(term, dict):
            return jsonify({"error": "Each academic term must be an object."}), 400
        term_number = term.get("term_number")
        label = term.get("name", f"Term {index}")
        if term_number != index or label != f"Term {index}":
            return jsonify({"error": "Terms must be supplied in Term 1, Term 2, Term 3 order."}), 400
        if not isinstance(label, str) or not label.strip() or len(label.strip()) > 40:
            return jsonify({"error": "Each term name must contain 1 to 40 characters."}), 400
        term_start = str(term.get("start_date", "")).strip() or None
        term_end = str(term.get("end_date", "")).strip() or None
        if bool(term_start) != bool(term_end):
            return jsonify({"error": "Provide both dates for a term or leave both blank."}), 400
        dates = []
        for date_value in (term_start, term_end):
            if date_value is None:
                dates.append(None)
                continue
            try:
                dates.append(datetime.strptime(date_value, "%Y-%m-%d").date())
            except ValueError:
                return jsonify({"error": "Term dates must use YYYY-MM-DD format."}), 400
        if dates[0] and dates[0] > dates[1]:
            return jsonify({"error": f"{label.strip()} start date must be before its end date."}), 400
        if dates[0] and parsed_year_dates[0] and dates[0] < parsed_year_dates[0]:
            return jsonify({"error": "Term dates must fall within the academic year."}), 400
        if dates[1] and parsed_year_dates[1] and dates[1] > parsed_year_dates[1]:
            return jsonify({"error": "Term dates must fall within the academic year."}), 400
        if dates[0] and previous_end and dates[0] <= previous_end:
            return jsonify({"error": "Academic term date ranges must not overlap."}), 400
        previous_end = dates[1] or previous_end
        validated_terms.append({
            "term_number": index,
            "name": label.strip(),
            "start_date": term_start,
            "end_date": term_end,
        })

    try:
        result = admin_supabase.rpc(
            "create_academic_year_with_terms",
            {
                "p_name": name.strip(),
                "p_start_date": start_date,
                "p_end_date": end_date,
                "p_terms": validated_terms,
            },
        ).execute()
        year_id = result.data
        if isinstance(year_id, list):
            year_id = year_id[0] if year_id else None
        if not year_id:
            raise RuntimeError("Academic year creation returned no ID.")
        return jsonify({"academic_year_id": str(year_id)}), 201
    except Exception:
        app.logger.exception("Unable to create academic year and its three terms")
        return jsonify({"error": "Academic year and terms could not be created."}), 500


@app.get("/api/department-head/offerings")
@require_role("department-head")
def department_head_offerings():
    if not admin_supabase:
        return jsonify({"error": "Course offerings are unavailable."}), 503
    try:
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409

        courses = (
            admin_supabase.table("courses")
            .select("id, code, title, description, units")
            .eq("department_id", department_id)
            .order("code")
            .execute()
            .data
            or []
        )
        faculty_profiles = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id, employee_number")
            .eq("department_id", department_id)
            .execute()
            .data
            or []
        )
        faculty_by_id = {}
        if faculty_profiles:
            user_ids = [profile["user_id"] for profile in faculty_profiles]
            users = (
                admin_supabase.table("users")
                .select("id, full_name, is_active, role")
                .in_("id", user_ids)
                .execute()
                .data
                or []
            )
            users_by_id = {user["id"]: user for user in users}
            faculty_by_id = {
                profile["id"]: {
                    "id": profile["id"],
                    "employee_number": profile.get("employee_number") or "",
                    "user_id": profile["user_id"],
                    "full_name": users_by_id.get(profile["user_id"], {}).get("full_name") or "",
                }
                for profile in faculty_profiles
                if users_by_id.get(profile["user_id"], {}).get("role") == "faculty"
                and users_by_id.get(profile["user_id"], {}).get("is_active") is True
            }

        years = (
            admin_supabase.table("academic_years")
            .select("id, name, start_date, end_date, is_active")
            .order("start_date", desc=True)
            .execute()
            .data
            or []
        )
        year_ids = [year["id"] for year in years]
        terms = []
        if year_ids:
            terms = (
                admin_supabase.table("academic_terms")
                .select("id, academic_year_id, term_number, name, start_date, end_date")
                .in_("academic_year_id", year_ids)
                .order("term_number")
                .execute()
                .data
                or []
            )
        terms_by_year = {}
        for term in terms:
            terms_by_year.setdefault(term["academic_year_id"], []).append(term)

        sections = []
        course_ids = [course["id"] for course in courses]
        if course_ids:
            sections = (
                admin_supabase.table("course_sections")
                .select("id, course_id, academic_year_id, academic_term_id, section_name, faculty_id, room, schedule")
                .in_("course_id", course_ids)
                .order("section_name")
                .execute()
                .data
                or []
            )
        year_names = {year["id"]: year["name"] for year in years}
        course_by_id = {course["id"]: course for course in courses}
        offerings = []
        for section in sections:
            course = course_by_id.get(section["course_id"], {})
            faculty = faculty_by_id.get(section.get("faculty_id"), {})
            term = next(
                (term for term in terms if term["id"] == section.get("academic_term_id")),
                {},
            )
            offerings.append({
                **section,
                "course_code": course.get("code", ""),
                "course_title": course.get("title", ""),
                "faculty_name": faculty.get("full_name", "Unassigned"),
                "academic_year_name": year_names.get(section.get("academic_year_id"), ""),
                "term_name": term.get("name", ""),
                "term_number": term.get("term_number"),
            })

        return jsonify({
            "department_id": department_id,
            "courses": courses,
            "faculty": list(faculty_by_id.values()),
            "academic_years": [
                {**year, "terms": terms_by_year.get(year["id"], [])}
                for year in years
            ],
            "offerings": offerings,
        }), 200
    except Exception:
        app.logger.exception("Unable to load department course offerings")
        return jsonify({"error": "Department course offerings could not be loaded."}), 500


@app.post("/api/department-head/courses")
@require_role("department-head")
def create_department_course():
    if not admin_supabase:
        return jsonify({"error": "Course catalog is unavailable."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Course data must be a JSON object."}), 400
    code = data.get("code")
    title = data.get("title")
    description = data.get("description", "")
    units = data.get("units", 0)
    if not isinstance(code, str) or not isinstance(title, str):
        return jsonify({"error": "Course code and title must be text."}), 400
    code = code.strip().upper()
    title = title.strip()
    if not 2 <= len(code) <= 30:
        return jsonify({"error": "Course code must contain 2 to 30 characters."}), 400
    if not code.replace("-", "").replace("_", "").replace(".", "").isalnum():
        return jsonify({"error": "Course code may contain letters, numbers, dots, underscores, and hyphens."}), 400
    if not title or len(title) > 120:
        return jsonify({"error": "Course title must contain 1 to 120 characters."}), 400
    if not isinstance(description, str) or len(description.strip()) > 2000:
        return jsonify({"error": "Course description must be at most 2,000 characters."}), 400
    if isinstance(units, bool) or not isinstance(units, int) or not 0 <= units <= 30:
        return jsonify({"error": "Course units must be a whole number from 0 to 30."}), 400
    try:
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        result = (
            admin_supabase.table("courses")
            .insert({
                "department_id": department_id,
                "code": code,
                "title": title,
                "description": description.strip(),
                "units": units,
            })
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise RuntimeError("Course creation returned no saved record.")
        return jsonify({"course": rows[0]}), 201
    except Exception as error:
        if "duplicate key" in str(error).lower() or "unique" in str(error).lower():
            return jsonify({"error": "That course code is already in use institution-wide."}), 409
        app.logger.exception("Unable to create department course")
        return jsonify({"error": "Course could not be created."}), 500


@app.put("/api/department-head/courses/<course_id>")
@require_role("department-head")
def update_department_course(course_id):
    if not admin_supabase:
        return jsonify({"error": "Course catalog is unavailable."}), 503
    try:
        course_id = str(UUID(course_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        existing = (
            admin_supabase.table("courses")
            .select("id")
            .eq("id", course_id)
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            return jsonify({"error": "Course not found in your department."}), 404
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Course data must be a JSON object."}), 400
        code, title = data.get("code"), data.get("title")
        description, units = data.get("description", ""), data.get("units", 0)
        if not isinstance(code, str) or not isinstance(title, str):
            return jsonify({"error": "Course code and title must be text."}), 400
        code, title = code.strip().upper(), title.strip()
        if not 2 <= len(code) <= 30 or not code.replace("-", "").replace("_", "").replace(".", "").isalnum():
            return jsonify({"error": "Enter a valid course code (2 to 30 letters, numbers, dots, underscores, or hyphens)."}), 400
        if not title or len(title) > 120:
            return jsonify({"error": "Course title must contain 1 to 120 characters."}), 400
        if not isinstance(description, str) or len(description.strip()) > 2000:
            return jsonify({"error": "Course description must be at most 2,000 characters."}), 400
        if isinstance(units, bool) or not isinstance(units, int) or not 0 <= units <= 30:
            return jsonify({"error": "Course units must be a whole number from 0 to 30."}), 400
        result = (
            admin_supabase.table("courses")
            .update({
                "code": code,
                "title": title,
                "description": description.strip(),
                "units": units,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", course_id)
            .eq("department_id", department_id)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return jsonify({"error": "Course could not be found or updated."}), 404
        return jsonify({"course": rows[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid course ID."}), 400
    except Exception as error:
        if "duplicate key" in str(error).lower() or "unique" in str(error).lower():
            return jsonify({"error": "That course code is already in use institution-wide."}), 409
        app.logger.exception("Unable to update department course")
        return jsonify({"error": "Course could not be updated."}), 500


@app.post("/api/department-head/offerings")
@require_role("department-head")
def create_department_offering():
    if not admin_supabase:
        return jsonify({"error": "Course offerings are unavailable."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Offering data must be a JSON object."}), 400
    section_name = data.get("section_name")
    if not isinstance(section_name, str) or not section_name.strip() or len(section_name.strip()) > 40:
        return jsonify({"error": "Section name must contain 1 to 40 characters."}), 400
    try:
        course_id = _parse_uuid(data.get("course_id"), "Choose a valid course.")
        term_id = _parse_uuid(data.get("academic_term_id"), "Choose a valid academic term.")
        faculty_id = _parse_uuid(data.get("faculty_id"), "Choose an active Faculty member.")
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        course = (
            admin_supabase.table("courses")
            .select("id")
            .eq("id", course_id)
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not course:
            return jsonify({"error": "Course not found in your department."}), 404
        term = (
            admin_supabase.table("academic_terms")
            .select("id, academic_year_id")
            .eq("id", term_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not term:
            return jsonify({"error": "Academic term not found."}), 404
        faculty = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id")
            .eq("id", faculty_id)
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not faculty:
            return jsonify({"error": "Faculty member must be assigned to your department."}), 400
        active_user = (
            admin_supabase.table("users")
            .select("id")
            .eq("id", faculty[0]["user_id"])
            .eq("role", "faculty")
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not active_user:
            return jsonify({"error": "Faculty member is not active."}), 400
        result = admin_supabase.rpc(
            "create_course_section_with_assignment",
            {
                "p_course_id": course_id,
                "p_academic_term_id": term_id,
                "p_section_name": section_name.strip(),
                "p_faculty_id": faculty_id,
                "p_actor_id": str(g.authenticated_user.id),
                "p_room": str(data.get("room", "")).strip(),
                "p_schedule": str(data.get("schedule", "")).strip(),
            },
        ).execute()
        section_id = result.data
        if isinstance(section_id, list):
            section_id = section_id[0] if section_id else None
        if not section_id:
            raise RuntimeError("Course offering creation returned no section ID.")
        return jsonify({"section_id": str(section_id)}), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        message = str(error).lower()
        if "duplicate key" in message or "unique" in message:
            return jsonify({"error": "That section name already exists for this course and term."}), 409
        if 'column reference "department_id" is ambiguous' in message:
            app.logger.exception("Course-offering RPC has an ambiguous department identifier")
            return jsonify({
                "error": "The database offering function needs an update. Apply database/academic_offering_rpc_fix.sql in the Supabase SQL Editor, then retry."
            }), 503
        app.logger.exception("Unable to create course offering")
        return jsonify({"error": "Course offering could not be created."}), 500


@app.patch("/api/department-head/offerings/<section_id>/faculty")
@require_role("department-head")
def reassign_department_offering(section_id):
    if not admin_supabase:
        return jsonify({"error": "Faculty assignments are unavailable."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Assignment data must be a JSON object."}), 400
    try:
        section_id = str(UUID(section_id))
        faculty_id = _parse_uuid(data.get("faculty_id"), "Choose an active Faculty member.")
        reason = data.get("reason", "")
        if not isinstance(reason, str) or len(reason.strip()) > 500:
            return jsonify({"error": "Assignment reason must be at most 500 characters."}), 400
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        section = (
            admin_supabase.table("course_sections")
            .select("id, course_id, faculty_id")
            .eq("id", section_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not section:
            return jsonify({"error": "Course section not found."}), 404
        course = (
            admin_supabase.table("courses")
            .select("id")
            .eq("id", section[0]["course_id"])
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not course:
            return jsonify({"error": "Course section is outside your department."}), 403
        faculty = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id")
            .eq("id", faculty_id)
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not faculty:
            return jsonify({"error": "Faculty member must be assigned to your department."}), 400
        active_user = (
            admin_supabase.table("users")
            .select("id")
            .eq("id", faculty[0]["user_id"])
            .eq("role", "faculty")
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not active_user:
            return jsonify({"error": "Faculty member is not active."}), 400
        admin_supabase.rpc(
            "reassign_course_section_faculty",
            {
                "p_section_id": section_id,
                "p_faculty_id": faculty_id,
                "p_actor_id": str(g.authenticated_user.id),
                "p_reason": reason.strip(),
            },
        ).execute()
        return jsonify({"message": "Faculty assignment updated."}), 200
    except ValueError:
        return jsonify({"error": "Invalid course section ID."}), 400
    except Exception:
        app.logger.exception("Unable to reassign course section")
        return jsonify({"error": "Faculty assignment could not be updated."}), 500


def _post_rows_for_scope(column, values):
    if not values:
        return []
    result = (
        admin_supabase.table("course_posts")
        .select(
            "id, author_user_id, audience_type, section_id, department_id, "
            "title, message, created_at"
        )
        .in_(column, values)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data or []


@app.get("/api/posts")
@require_roles("student", "faculty", "department-head")
def get_dashboard_posts():
    if not admin_supabase:
        return jsonify({"error": "Posts are unavailable."}), 503

    role = get_user_role(g.authenticated_user)
    try:
        section_ids = []
        department_id = None
        if role == "student":
            profile = _account_profile(
                role, g.authenticated_user.id, "id, program_id"
            )
            if not profile:
                return jsonify({"error": "Your student profile is incomplete."}), 409
            enrollments = (
                admin_supabase.table("enrollments")
                .select("section_id")
                .eq("student_profile_id", profile["id"])
                .eq("enrollment_status", "active")
                .execute()
                .data
                or []
            )
            section_ids = list({
                row["section_id"] for row in enrollments
                if row.get("section_id")
            })
            if profile.get("program_id"):
                program_rows = (
                    admin_supabase.table("programs")
                    .select("department_id")
                    .eq("id", profile["program_id"])
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                department_id = (
                    program_rows[0].get("department_id")
                    if program_rows else None
                )
        elif role == "faculty":
            profile = _account_profile(
                role, g.authenticated_user.id, "id, department_id"
            )
            if not profile:
                return jsonify({"error": "Your faculty profile is incomplete."}), 409
            assignments = (
                admin_supabase.table("course_sections")
                .select("id")
                .eq("faculty_id", profile["id"])
                .execute()
                .data
                or []
            )
            section_ids = [row["id"] for row in assignments]
            department_id = profile.get("department_id")
        elif role == "department-head":
            profile = _account_profile(
                role, g.authenticated_user.id, "department_id"
            )
            department_id = profile.get("department_id") if profile else None
            if not department_id:
                return jsonify({"error": "Your department profile is incomplete."}), 409
            if department_id:
                department_courses = (
                    admin_supabase.table("courses")
                    .select("id")
                    .eq("department_id", department_id)
                    .execute()
                    .data
                    or []
                )
                department_course_ids = [
                    row["id"] for row in department_courses
                ]
                if department_course_ids:
                    sections = (
                        admin_supabase.table("course_sections")
                        .select("id")
                        .in_("course_id", department_course_ids)
                        .execute()
                        .data
                        or []
                    )
                    section_ids = [row["id"] for row in sections]
        else:
            return jsonify({"error": "Your account role cannot view posts."}), 403

        posts = _post_rows_for_scope("section_id", section_ids)
        if department_id:
            posts.extend(_post_rows_for_scope(
                "department_id", [department_id]
            ))

        unique_posts = {row["id"]: row for row in posts}
        posts = sorted(
            unique_posts.values(),
            key=lambda row: row.get("created_at") or "",
            reverse=True,
        )[:100]
        author_ids = list({
            row["author_user_id"] for row in posts
            if row.get("author_user_id")
        })
        authors = {}
        if author_ids:
            author_rows = (
                admin_supabase.table("users")
                .select("id, full_name")
                .in_("id", author_ids)
                .execute()
                .data
                or []
            )
            authors = {row["id"]: row for row in author_rows}
        post_section_ids = list({
            row["section_id"] for row in posts if row.get("section_id")
        })
        sections = {}
        if post_section_ids:
            section_rows = (
                admin_supabase.table("course_sections")
                .select("id, course_id, section_name")
                .in_("id", post_section_ids)
                .execute()
                .data
                or []
            )
            course_ids = list({
                row["course_id"] for row in section_rows
                if row.get("course_id")
            })
            courses = {}
            if course_ids:
                course_rows = (
                    admin_supabase.table("courses")
                    .select("id, code, title")
                    .in_("id", course_ids)
                    .execute()
                    .data
                    or []
                )
                courses = {row["id"]: row for row in course_rows}
            for row in section_rows:
                course = courses.get(row.get("course_id"), {})
                sections[row["id"]] = {
                    "course_code": course.get("code", ""),
                    "course_title": course.get("title", ""),
                    "section_name": row.get("section_name", ""),
                }

        response_posts = []
        for row in posts:
            section = sections.get(row.get("section_id"), {})
            response_posts.append({
                "id": row["id"],
                "title": row["title"],
                "message": row["message"],
                "author": authors.get(row.get("author_user_id"), {}).get(
                    "full_name", "EduMetrics user"
                ),
                "audience_type": row["audience_type"],
                "section_id": row.get("section_id"),
                "course_label": " - ".join(filter(None, (
                    section.get("course_code"),
                    section.get("section_name"),
                ))),
                "created_at": row.get("created_at"),
            })
        return jsonify({"posts": response_posts}), 200
    except Exception:
        app.logger.exception("Unable to load dashboard posts")
        return jsonify({"error": "Posts could not be loaded."}), 500


@app.post("/api/posts")
@require_roles("faculty", "department-head")
def create_dashboard_post():
    if not admin_supabase:
        return jsonify({"error": "Posts are unavailable."}), 503

    role = get_user_role(g.authenticated_user)
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Post data must be a JSON object."}), 400
    title_value = data.get("title", "")
    message_value = data.get("message", "")
    if not isinstance(title_value, str) or not isinstance(message_value, str):
        return jsonify({"error": "Post title and message must be text."}), 400
    title = title_value.strip()
    message = message_value.strip()
    if not title or len(title) > 120:
        return jsonify({"error": "Post title must contain 1 to 120 characters."}), 400
    if not message or len(message) > 3000:
        return jsonify({"error": "Post message must contain 1 to 3,000 characters."}), 400

    try:
        record = {
            "author_user_id": str(g.authenticated_user.id),
            "author_role": role,
            "title": title,
            "message": message,
        }
        if role == "faculty":
            section_id = str(data.get("section_id", "")).strip()
            try:
                section_id = str(UUID(section_id))
            except (TypeError, ValueError):
                return jsonify({"error": "Choose a valid course section."}), 400
            if not get_faculty_section(section_id):
                return jsonify({"error": "Section not found or not assigned to you."}), 404
            record.update({
                "audience_type": "section",
                "section_id": section_id,
                "department_id": None,
            })
        elif role == "department-head":
            profile = _account_profile(
                role, g.authenticated_user.id, "department_id"
            )
            if not profile or not profile.get("department_id"):
                return jsonify({"error": "Your department profile is incomplete."}), 403
            record.update({
                "audience_type": "department",
                "section_id": None,
                "department_id": profile["department_id"],
            })
        else:
            return jsonify({"error": "Your account role cannot publish posts."}), 403

        result = (
            admin_supabase.table("course_posts")
            .insert(record)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise RuntimeError("Post insert returned no saved record.")
        post = rows[0]
        return jsonify({
            "post": {
                "id": post["id"],
                "title": post["title"],
                "message": post["message"],
                "audience_type": post["audience_type"],
                "created_at": post.get("created_at"),
            }
        }), 201
    except Exception:
        app.logger.exception("Unable to create dashboard post")
        return jsonify({"error": "Post could not be published."}), 500


def _faculty_assessment_workspace(section_id):
    if not get_faculty_section(section_id):
        return None
    sections = (
        admin_supabase.table("course_sections")
        .select("id, course_id, section_name")
        .eq("id", section_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sections:
        return None
    section = sections[0]
    courses = (
        admin_supabase.table("courses")
        .select("id, code, title")
        .eq("id", section["course_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    outcomes = (
        admin_supabase.table("course_outcomes")
        .select("id, code, description")
        .eq("course_id", section["course_id"])
        .order("code")
        .execute()
        .data
        or []
    )
    enrollments = (
        admin_supabase.table("enrollments")
        .select("student_profile_id")
        .eq("section_id", section_id)
        .eq("enrollment_status", "active")
        .execute()
        .data
        or []
    )
    student_ids = list({
        row["student_profile_id"] for row in enrollments
        if row.get("student_profile_id")
    })
    students = []
    if student_ids:
        profiles = (
            admin_supabase.table("student_profiles")
            .select("id, user_id, student_number")
            .in_("id", student_ids)
            .execute()
            .data
            or []
        )
        user_ids = list({
            row["user_id"] for row in profiles if row.get("user_id")
        })
        users = {}
        if user_ids:
            user_rows = (
                admin_supabase.table("users")
                .select("id, full_name")
                .in_("id", user_ids)
                .execute()
                .data
                or []
            )
            users = {row["id"]: row for row in user_rows}
        students = [{
            "student_profile_id": row["id"],
            "student_number": row.get("student_number", ""),
            "full_name": users.get(row.get("user_id"), {}).get(
                "full_name", ""
            ),
        } for row in profiles]
    activities = (
        admin_supabase.table("assessment_activities")
        .select(
            "id, course_outcome_id, title, activity_type, due_date, "
            "max_score, created_at"
        )
        .eq("section_id", section_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    activity_ids = [row["id"] for row in activities]
    scores = []
    if activity_ids:
        scores = (
            admin_supabase.table("raw_assessment_scores")
            .select(
                "assessment_activity_id, student_profile_id, score, "
                "max_score, percentage"
            )
            .in_("assessment_activity_id", activity_ids)
            .execute()
            .data
            or []
        )
    scores_by_activity = {}
    for row in scores:
        scores_by_activity.setdefault(
            row["assessment_activity_id"], {}
        )[row["student_profile_id"]] = row
    outcome_codes = {row["id"]: row["code"] for row in outcomes}
    for activity in activities:
        activity["outcome_code"] = outcome_codes.get(
            activity.get("course_outcome_id"), ""
        )
        activity["scores"] = scores_by_activity.get(activity["id"], {})
    gradebooks = (
        admin_supabase.table("gradebooks")
        .select("status")
        .eq("section_id", section_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return {
        "section": {
            **section,
            "course_code": courses[0].get("code", "") if courses else "",
            "course_title": courses[0].get("title", "") if courses else "",
        },
        "outcomes": outcomes,
        "students": students,
        "assessments": activities,
        "gradebook_status": gradebooks[0]["status"] if gradebooks else "draft",
    }


@app.get("/api/faculty/sections/<section_id>/assessments")
@require_role("faculty")
def get_faculty_assessment_workspace(section_id):
    if not admin_supabase:
        return jsonify({"error": "Assessment records are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        return jsonify(workspace), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to load faculty assessment workspace")
        return jsonify({"error": "Assessment records could not be loaded."}), 500


@app.post("/api/faculty/sections/<section_id>/assessments")
@require_role("faculty")
def create_faculty_assessment(section_id):
    if not admin_supabase:
        return jsonify({"error": "Assessments are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        if workspace["gradebook_status"] == "locked":
            return jsonify({"error": "This section's gradebook is locked."}), 409

        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Assessment data must be a JSON object."}), 400
        title = data.get("title", "")
        activity_type = data.get("activity_type", "")
        outcome_id = str(data.get("course_outcome_id", "")).strip()
        if not isinstance(title, str) or not isinstance(activity_type, str):
            return jsonify({"error": "Assessment title and type must be text."}), 400
        title = title.strip()
        activity_type = activity_type.strip()
        due_date = str(data.get("due_date", "")).strip() or None
        try:
            outcome_id = str(UUID(outcome_id))
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a valid course outcome."}), 400
        if isinstance(data.get("max_score"), bool):
            return jsonify({"error": "Maximum score must be a number."}), 400
        try:
            max_score = float(data.get("max_score"))
        except (TypeError, ValueError):
            return jsonify({"error": "Maximum score must be a number."}), 400
        if not title or len(title) > 120:
            return jsonify({"error": "Assessment title must contain 1 to 120 characters."}), 400
        if not activity_type or len(activity_type) > 50:
            return jsonify({"error": "Choose a valid assessment type."}), 400
        if activity_type not in {
            "Quiz", "Major Exam", "Laboratory", "Assignment", "Other"
        }:
            return jsonify({"error": "Choose a valid assessment type."}), 400
        if not math.isfinite(max_score) or not 0 < max_score <= 10000:
            return jsonify({"error": "Maximum score must be greater than 0 and at most 10,000."}), 400
        if due_date:
            try:
                datetime.strptime(due_date, "%Y-%m-%d")
            except ValueError:
                return jsonify({"error": "Due date must use YYYY-MM-DD format."}), 400
        if not any(item["id"] == outcome_id for item in workspace["outcomes"]):
            return jsonify({"error": "The selected outcome does not belong to this course."}), 400

        result = (
            admin_supabase.table("assessment_activities")
            .insert({
                "section_id": section_id,
                "course_outcome_id": outcome_id,
                "title": title,
                "activity_type": activity_type,
                "due_date": due_date,
                "max_score": max_score,
            })
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise RuntimeError("Assessment insert returned no saved record.")
        return jsonify({"assessment": rows[0]}), 201
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to create faculty assessment")
        return jsonify({"error": "Assessment could not be created."}), 500


@app.put("/api/faculty/assessments/<assessment_id>/scores")
@require_role("faculty")
def save_faculty_assessment_scores(assessment_id):
    if not admin_supabase:
        return jsonify({"error": "Scores are unavailable."}), 503
    try:
        assessment_id = str(UUID(assessment_id))
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, section_id, max_score")
            .eq("id", assessment_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not activities:
            return jsonify({"error": "Assessment not found."}), 404
        activity = activities[0]
        if not get_faculty_section(activity["section_id"]):
            return jsonify({"error": "Assessment is not in a section assigned to you."}), 403
        workspace = _faculty_assessment_workspace(activity["section_id"])
        if workspace["gradebook_status"] == "locked":
            return jsonify({"error": "This section's gradebook is locked."}), 409

        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Score data must be a JSON object."}), 400
        entries = data.get("scores")
        if not isinstance(entries, list):
            return jsonify({"error": "Scores must be supplied as a list."}), 400
        allowed_students = {
            row["student_profile_id"] for row in workspace["students"]
        }
        max_score = float(activity["max_score"])
        if not math.isfinite(max_score) or max_score <= 0:
            return jsonify({"error": "Assessment maximum score is invalid."}), 409
        payload = []
        seen_students = set()
        for entry in entries:
            if not isinstance(entry, dict):
                return jsonify({"error": "Each score entry must be an object."}), 400
            try:
                student_id = str(UUID(str(entry.get("student_profile_id", ""))))
            except (TypeError, ValueError):
                return jsonify({"error": "A score entry has an invalid student ID."}), 400
            if student_id not in allowed_students:
                return jsonify({"error": "A student is not actively enrolled in this section."}), 400
            if student_id in seen_students:
                return jsonify({"error": "A student may appear only once per save."}), 400
            seen_students.add(student_id)
            raw_score = entry.get("score")
            if raw_score in (None, ""):
                score = None
                percentage = None
            else:
                if isinstance(raw_score, bool):
                    return jsonify({"error": "Scores must be numeric or blank."}), 400
                try:
                    score = float(raw_score)
                except (TypeError, ValueError):
                    return jsonify({"error": "Scores must be numeric or blank."}), 400
                if not math.isfinite(score) or not 0 <= score <= max_score:
                    return jsonify({"error": f"Scores must be between 0 and {max_score:g}."}), 400
                percentage = round(score / max_score * 100, 2)
            payload.append({
                "section_id": activity["section_id"],
                "student_profile_id": student_id,
                "assessment_activity_id": assessment_id,
                "score": score,
                "max_score": max_score,
                "percentage": percentage,
                "entered_by": str(g.authenticated_user.id),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        if payload:
            admin_supabase.table("raw_assessment_scores").upsert(
                payload,
                on_conflict="assessment_activity_id,student_profile_id",
            ).execute()
        return jsonify({"saved_count": len(payload)}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception:
        app.logger.exception("Unable to save faculty assessment scores")
        return jsonify({"error": "Scores could not be saved."}), 500


@app.get("/api/student/assessment-scores")
@require_role("student")
def get_student_assessment_scores():
    if not admin_supabase:
        return jsonify({"error": "Assessment scores are unavailable."}), 503
    try:
        profile = _account_profile(
            "student", g.authenticated_user.id, "id"
        )
        if not profile:
            return jsonify({"error": "Your student profile is incomplete."}), 409
        enrollments = (
            admin_supabase.table("enrollments")
            .select("section_id")
            .eq("student_profile_id", profile["id"])
            .eq("enrollment_status", "active")
            .execute()
            .data
            or []
        )
        section_ids = list({
            row["section_id"] for row in enrollments if row.get("section_id")
        })
        if not section_ids:
            return jsonify({"assessments": [], "profile_complete": True}), 200
        sections = (
            admin_supabase.table("course_sections")
            .select("id, course_id")
            .in_("id", section_ids)
            .execute()
            .data
            or []
        )
        section_map = {row["id"]: row for row in sections}
        course_ids = list({
            row["course_id"] for row in sections if row.get("course_id")
        })
        courses = {}
        if course_ids:
            course_rows = (
                admin_supabase.table("courses")
                .select("id, code, title")
                .in_("id", course_ids)
                .execute()
                .data
                or []
            )
            courses = {row["id"]: row for row in course_rows}
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, section_id, course_outcome_id, title, activity_type, due_date, max_score")
            .in_("section_id", list(section_map))
            .order("due_date", desc=True)
            .execute()
            .data
            or []
        )
        activity_ids = [row["id"] for row in activities]
        score_map = {}
        if activity_ids:
            score_rows = (
                admin_supabase.table("raw_assessment_scores")
                .select("assessment_activity_id, score, max_score, percentage")
                .eq("student_profile_id", profile["id"])
                .in_("assessment_activity_id", activity_ids)
                .execute()
                .data
                or []
            )
            score_map = {
                row["assessment_activity_id"]: row for row in score_rows
            }
        gradebooks = (
            admin_supabase.table("gradebooks")
            .select("section_id, status")
            .in_("section_id", list(section_map))
            .execute()
            .data
            or []
        )
        released_sections = {
            row["section_id"] for row in gradebooks
            if row.get("status") == "locked"
        }
        rows = []
        for activity in activities:
            section_id = activity["section_id"]
            section = section_map.get(section_id, {})
            course = courses.get(section.get("course_id"), {})
            score = score_map.get(activity["id"])
            released = section_id in released_sections
            rows.append({
                "assessment_id": activity["id"],
                "title": activity["title"],
                "course_code": course.get("code", ""),
                "course_title": course.get("title", ""),
                "activity_type": activity["activity_type"],
                "due_date": activity.get("due_date"),
                "score": score.get("score") if released and score else None,
                "max_score": activity["max_score"],
                "percentage": score.get("percentage") if released and score else None,
                "has_score": bool(score and score.get("score") is not None),
                "release_status": "Released" if released else "Awaiting Release",
            })
        rows.sort(
            key=lambda row: row.get("due_date") or "",
            reverse=True,
        )
        released_count = sum(
            1 for row in rows if row["release_status"] == "Released"
            and row["has_score"]
        )
        return jsonify({
            "assessments": rows,
            "profile_complete": True,
            "course_count": len({
                row.get("course_id") for row in sections
                if row.get("course_id")
            }),
            "released_count": released_count,
            "pending_count": len(rows) - released_count,
        }), 200
    except Exception:
        app.logger.exception("Unable to load student assessment scores")
        return jsonify({"error": "Assessment scores could not be loaded."}), 500


def get_faculty_section(section_id):
    profile_result = (
        admin_supabase.table("faculty_profiles")
        .select("id")
        .eq("user_id", g.authenticated_user.id)
        .limit(1)
        .execute()
    )
    profiles = profile_result.data or []
    if not profiles:
        return None

    section_result = (
        admin_supabase.table("course_sections")
        .select("id")
        .eq("id", section_id)
        .eq("faculty_id", profiles[0]["id"])
        .limit(1)
        .execute()
    )
    sections = section_result.data or []
    return sections[0] if sections else None


def signed_syllabus_url(record):
    response = admin_supabase.storage.from_(SYLLABI_BUCKET).create_signed_url(
        record["storage_path"],
        900,
        options={"download": record["file_name"]},
    )
    return response.get("signedURL") or response.get("signedUrl")


@app.get("/api/faculty/syllabi/<section_id>")
@require_role("faculty")
def get_faculty_syllabus(section_id):
    if not admin_supabase:
        return jsonify({"error": "Syllabus storage is unavailable."}), 503

    try:
        if not get_faculty_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404

        result = (
            admin_supabase.table("course_syllabi")
            .select("section_id, storage_path, file_name, uploaded_at")
            .eq("section_id", section_id)
            .limit(1)
            .execute()
        )
        records = result.data or []
        if not records:
            return jsonify({"syllabus": None}), 200

        record = records[0]
        return jsonify({
            "syllabus": {
                "file_name": record["file_name"],
                "uploaded_at": record["uploaded_at"],
                "signed_url": signed_syllabus_url(record),
            }
        }), 200
    except Exception:
        app.logger.exception("Unable to load faculty syllabus")
        return jsonify({"error": "Syllabus could not be loaded."}), 500


@app.post("/api/faculty/syllabi/<section_id>")
@require_role("faculty")
def upload_faculty_syllabus(section_id):
    if not admin_supabase:
        return jsonify({"error": "Syllabus storage is unavailable."}), 503

    try:
        section = get_faculty_section(section_id)
        if not section:
            return jsonify({"error": "Section not found or not assigned to you."}), 404

        upload = request.files.get("syllabus")
        if not upload or not upload.filename:
            return jsonify({"error": "Choose a PDF syllabus to upload."}), 400

        file_name = secure_filename(upload.filename)
        if not file_name.lower().endswith(".pdf"):
            return jsonify({"error": "Only PDF syllabi are allowed."}), 400

        file_bytes = upload.read((20 * 1024 * 1024) + 1)
        if len(file_bytes) > 20 * 1024 * 1024:
            return jsonify({"error": "The PDF must be 20 MB or smaller."}), 413
        if not file_bytes.startswith(b"%PDF-"):
            return jsonify({"error": "The selected file is not a valid PDF."}), 400

        old_result = (
            admin_supabase.table("course_syllabi")
            .select("storage_path")
            .eq("section_id", section_id)
            .limit(1)
            .execute()
        )
        old_records = old_result.data or []
        storage_path = f"{section_id}/{uuid4().hex}/{file_name}"
        storage = admin_supabase.storage.from_(SYLLABI_BUCKET)

        storage.upload(
            storage_path,
            file_bytes,
            file_options={
                "content-type": "application/pdf",
                "upsert": "false",
            },
        )

        try:
            admin_supabase.table("course_syllabi").upsert({
                "section_id": section_id,
                "storage_path": storage_path,
                "file_name": file_name,
                "uploaded_by": g.authenticated_user.id,
            }, on_conflict="section_id").execute()
        except Exception:
            storage.remove([storage_path])
            raise

        if old_records and old_records[0]["storage_path"] != storage_path:
            storage.remove([old_records[0]["storage_path"]])

        record = {
            "section_id": section_id,
            "storage_path": storage_path,
            "file_name": file_name,
        }
        return jsonify({
            "syllabus": {
                "file_name": file_name,
                "signed_url": signed_syllabus_url(record),
            }
        }), 201
    except Exception:
        app.logger.exception("Unable to upload faculty syllabus")
        return jsonify({"error": "Syllabus upload failed. Please try again."}), 500


@app.delete("/api/faculty/syllabi/<section_id>")
@require_role("faculty")
def delete_faculty_syllabus(section_id):
    if not admin_supabase:
        return jsonify({"error": "Syllabus storage is unavailable."}), 503

    try:
        if not get_faculty_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404

        result = (
            admin_supabase.table("course_syllabi")
            .select("storage_path")
            .eq("section_id", section_id)
            .limit(1)
            .execute()
        )
        records = result.data or []
        if records:
            admin_supabase.storage.from_(SYLLABI_BUCKET).remove(
                [records[0]["storage_path"]]
            )
            (
                admin_supabase.table("course_syllabi")
                .delete()
                .eq("section_id", section_id)
                .execute()
            )

        return jsonify({"status": "deleted"}), 200
    except Exception:
        app.logger.exception("Unable to delete faculty syllabus")
        return jsonify({"error": "Syllabus could not be deleted."}), 500


@app.get("/api/student/syllabi")
@require_role("student")
def student_syllabi():
    if not admin_supabase:
        return jsonify({"error": "Syllabus storage is unavailable."}), 503

    try:
        profile_result = (
            admin_supabase.table("student_profiles")
            .select("id")
            .eq("user_id", g.authenticated_user.id)
            .limit(1)
            .execute()
        )
        profiles = profile_result.data or []
        if not profiles:
            return jsonify({"profile_complete": False, "syllabi": []}), 200

        enrollments_result = (
            admin_supabase.table("enrollments")
            .select("section_id")
            .eq("student_profile_id", profiles[0]["id"])
            .eq("enrollment_status", "active")
            .execute()
        )
        section_ids = list({
            item["section_id"] for item in (enrollments_result.data or [])
        })
        if not section_ids:
            return jsonify({"profile_complete": True, "syllabi": []}), 200

        sections_result = (
            admin_supabase.table("course_sections")
            .select("id, course_id, academic_year_id, academic_term_id, section_name")
            .in_("id", section_ids)
            .execute()
        )
        sections = sections_result.data or []
        sections_by_id = {item["id"]: item for item in sections}
        course_ids = list({item["course_id"] for item in sections})
        year_ids = list({
            item["academic_year_id"]
            for item in sections
            if item.get("academic_year_id")
        })

        course_result = (
            admin_supabase.table("courses")
            .select("id, code, title")
            .in_("id", course_ids)
            .execute()
        )
        courses_by_id = {
            item["id"]: item for item in (course_result.data or [])
        }
        years_by_id = {}
        if year_ids:
            year_result = (
                admin_supabase.table("academic_years")
                .select("id, name")
                .in_("id", year_ids)
                .execute()
            )
            years_by_id = {
                item["id"]: item for item in (year_result.data or [])
            }
        term_ids = list({
            item["academic_term_id"]
            for item in sections
            if item.get("academic_term_id")
        })
        terms_by_id = {}
        if term_ids:
            term_result = (
                admin_supabase.table("academic_terms")
                .select("id, term_number, name")
                .in_("id", term_ids)
                .execute()
            )
            terms_by_id = {
                item["id"]: item for item in (term_result.data or [])
            }

        syllabus_result = (
            admin_supabase.table("course_syllabi")
            .select("section_id, storage_path, file_name, uploaded_at")
            .in_("section_id", section_ids)
            .execute()
        )

        syllabi = []
        for record in syllabus_result.data or []:
            section = sections_by_id.get(record["section_id"])
            course = courses_by_id.get(
                section["course_id"]) if section else None
            if not section or not course:
                continue

            year = years_by_id.get(section.get("academic_year_id"), {})
            term = terms_by_id.get(section.get("academic_term_id"), {})
            syllabi.append({
                "course_id": course["id"],
                "course_code": course["code"],
                "course_title": course["title"],
                "section_name": section["section_name"],
                "academic_year_name": year.get("name", ""),
                "term_name": term.get("name", ""),
                "file_name": record["file_name"],
                "uploaded_at": record["uploaded_at"],
                "signed_url": signed_syllabus_url(record),
            })

        return jsonify({"profile_complete": True, "syllabi": syllabi}), 200
    except Exception:
        app.logger.exception("Unable to load student syllabi")
        return jsonify({"error": "Syllabi could not be loaded."}), 500


@app.get("/")
def home():
    return render_template("website.html")


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "EduMetrics Flask backend is running"
    })


@app.get("/api/registration-options/<role>")
def registration_options(role):
    role = normalize_role_name(role)
    if role == "student":
        table_name = "departments"
    elif role in {"faculty", "department-head"}:
        table_name = "departments"
    elif role == "admin-security":
        return jsonify({"options": []}), 200
    else:
        return jsonify({"error": "Invalid account role."}), 400

    if not admin_supabase:
        return jsonify({"error": "Registration options are unavailable."}), 503

    try:
        query = admin_supabase.table(table_name).select("id, name, code")
        query = query.eq("is_college", True)
        rows = query.order("name").execute().data or []
        return jsonify({
            "options": [
                {"label": row["name"], "value": row["name"], "id": row["id"]}
                for row in rows
            ]
        }), 200
    except Exception:
        app.logger.exception("Unable to load registration options")
        return jsonify({"error": "Registration options could not be loaded."}), 500


@app.get("/api/registration-options/student/<department_id>/programs")
def student_program_options(department_id):
    if not admin_supabase:
        return jsonify({"error": "Registration options are unavailable."}), 503

    try:
        department_uuid = str(UUID(department_id))
        department_rows = (
            admin_supabase.table("departments")
            .select("id")
            .eq("id", department_uuid)
            .eq("is_college", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not department_rows:
            return jsonify({"error": "Select a college that exists in the system."}), 400

        rows = (
            admin_supabase.table("programs")
            .select("id, name, code")
            .eq("department_id", department_uuid)
            .order("name")
            .execute()
            .data
            or []
        )
        return jsonify({
            "options": [
                {"label": row["name"], "value": row["name"], "id": row["id"]}
                for row in rows
            ]
        }), 200
    except ValueError:
        return jsonify({"error": "Select a valid college."}), 400
    except Exception:
        app.logger.exception("Unable to load programs for college")
        return jsonify({"error": "Programs could not be loaded."}), 500


def find_student_program(program_id, department_id):
    try:
        program_uuid = str(UUID(str(program_id)))
        department_uuid = str(UUID(str(department_id)))
    except (TypeError, ValueError, AttributeError):
        return None

    department_rows = (
        admin_supabase.table("departments")
        .select("id")
        .eq("id", department_uuid)
        .eq("is_college", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not department_rows:
        return None

    rows = (
        admin_supabase.table("programs")
        .select("id, name, department_id")
        .eq("id", program_uuid)
        .eq("department_id", department_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


@app.get("/auth/google")
def google_login():
    role = request.args.get("role", "student").strip().lower()

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if role not in allowed_roles:
        return jsonify({"error": "Invalid account role."}), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        response = auth_client.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": request.host_url.rstrip("/") + "/auth/callback",
                "query_params": {
                    "prompt": "select_account",
                },
            },
        })

        storage = auth_client.auth._storage
        verifier = storage.get_item(
            f"{auth_client.auth._storage_key}-code-verifier"
        )

        if not verifier:
            app.logger.error("Google OAuth PKCE verifier was not created.")
            return "Unable to initialize Google sign-in. Please try again.", 500

        session["oauth_code_verifier"] = verifier
        session["oauth_requested_role"] = role
        session["oauth_provider"] = "google"

        return redirect(response.url)

    except Exception:
        app.logger.exception("Google OAuth initiation failed")
        return "Unable to start Google sign-in. Please try again.", 500


@app.get("/auth/microsoft")
def microsoft_login():
    role = request.args.get("role", "student").strip().lower()

    allowed_roles = {
        "student", "faculty", "department-head", "admin-security",
    }

    if role not in allowed_roles:
        return jsonify({"error": "Invalid account role."}), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        response = auth_client.auth.sign_in_with_oauth({
            "provider": "azure",
            "options": {
                "redirect_to": request.host_url.rstrip("/") + "/auth/callback",
                "scopes": "email",
                "query_params": {"prompt": "select_account"},
            },
        })

        storage = auth_client.auth._storage
        verifier = storage.get_item(
            f"{auth_client.auth._storage_key}-code-verifier"
        )

        if not verifier:
            app.logger.error(
                "Microsoft OAuth PKCE verifier was not created."
            )
            return (
                "Unable to initialize Microsoft sign-in. Please try again.",
                500,
            )

        session["oauth_code_verifier"] = verifier
        session["oauth_requested_role"] = role
        session["oauth_provider"] = "microsoft"

        return redirect(response.url)

    except Exception:
        app.logger.exception("Microsoft OAuth initiation failed")
        return "Unable to start Microsoft sign-in. Please try again.", 500


@app.get("/requirement 1/so-student.html")
@require_role("student")
def student_dashboard():
    return render_template("requirement 1/so-student.html")


@app.get("/requirement 1/so-faculty.html")
@require_role("faculty")
def faculty_dashboard():
    return render_template("requirement 1/so-faculty.html")


@app.get("/requirement 1/so-dept-head.html")
@require_role("department-head")
def dept_head_dashboard():
    return render_template("requirement 1/so-dept-head.html")


@app.get("/requirement 4/ra-faculty.html")
@require_role("faculty")
def faculty_assessment_page():
    return render_template("requirement 4/ra-faculty.html")


@app.get("/requirement 2/cm-faculty.html")
@app.get("/requirement 3/cr.faculty.html")
@app.get("/requirement 5/ac-faculty.html")
@app.get("/requirement 6/cqi-faculty.html")
@app.get("/requirement 8/rp-faculty.html")
@require_role("faculty")
def faculty_workflow_page():
    return render_template(request.path.lstrip("/"))


@app.get("/requirement 2/cm-student.html")
@app.get("/requirement 3/cr-student.html")
@app.get("/requirement 5/ac-student.html")
@app.get("/requirement 6/cqi-student.html")
@app.get("/requirement 8/rp-student.html")
@require_role("student")
def student_workflow_page():
    return render_template(request.path.lstrip("/"))


@app.get("/requirement 4/ra-student.html")
@require_role("student")
def student_assessment_page():
    return render_template("requirement 4/ra-student.html")


@app.get("/requirement 2/cm-dept-head.html")
@app.get("/requirement 3/cr-dept-head.html")
@app.get("/requirement 4/ra-dept-head.html")
@app.get("/requirement 5/ac-dept-head.html")
@app.get("/requirement 6/cqi-dept-head.html")
@app.get("/requirement 7/gl-dept-head.html")
@app.get("/requirement 8/rp-dept-head.html")
@require_role("department-head")
def dept_head_workflow_page():
    return render_template(request.path.lstrip("/"))


@app.get("/main/dashboard.html")
@require_authenticated
def main_dashboard_page():
    role = normalize_role_name(get_user_role(g.authenticated_user))

    if role not in {"student", "faculty", "department-head", "admin-security"}:
        return "You are not authorized to view this page.", 403

    try:
        if has_pending_role_request(g.authenticated_user.id):
            session.clear()
            return redirect(url_for("account_pending_page"))

        if not has_active_role_record(g.authenticated_user.id, role):
            session["profile_completion_role"] = role
            session["profile_completion_mode"] = (
                "repair" if role == "student" else "request"
            )
            return redirect(url_for("complete_profile_page"))

        profile_complete = has_role_profile(g.authenticated_user.id, role)
    except Exception:
        app.logger.exception("Unable to verify account profile completeness")
        return "Account profile could not be verified.", 503

    if not profile_complete:
        session["profile_completion_role"] = role
        session["profile_completion_mode"] = "repair"
        return redirect(url_for("complete_profile_page"))

    if role == "admin-security":
        return redirect("/requirement%202/cm-admin.html")

    return render_template("main/dashboard.html", dashboard_role=role)


@app.get("/account-settings")
@require_authenticated
def account_settings_page():
    role = normalize_role_name(get_user_role(g.authenticated_user))
    allowed_roles = {"student", "faculty", "department-head", "admin-security"}
    if role not in allowed_roles:
        return "You are not authorized to view this page.", 403

    try:
        if has_pending_role_request(g.authenticated_user.id):
            session.clear()
            return redirect(url_for("account_pending_page"))

        if not has_active_role_record(g.authenticated_user.id, role):
            session["profile_completion_role"] = role
            session["profile_completion_mode"] = (
                "repair" if role == "student" else "request"
            )
            return redirect(url_for("complete_profile_page"))

        if not has_role_profile(g.authenticated_user.id, role):
            session["profile_completion_role"] = role
            session["profile_completion_mode"] = "repair"
            return redirect(url_for("complete_profile_page"))
    except Exception:
        app.logger.exception("Unable to verify account settings access")
        return "Account settings could not be verified.", 503

    return render_template("main/account-settings.html", account_role=role)


@app.get("/api/account/profile")
@require_authenticated
def account_profile():
    if not admin_supabase:
        return jsonify({"error": "Account details are unavailable."}), 503

    role = normalize_role_name(get_user_role(g.authenticated_user))
    profile_tables = {
        "student": "student_profiles",
        "faculty": "faculty_profiles",
        "department-head": "dept_head_profiles",
        "admin-security": "admin_security_profiles",
    }
    profile_fields = {
        "student": "student_number, program_id",
        "faculty": "employee_number, department_id",
        "department-head": "employee_number, department_id",
        "admin-security": "employee_number",
    }
    if role not in profile_tables:
        return jsonify({"error": "Your account role could not be verified."}), 403

    try:
        user_rows = (
            admin_supabase.table("users")
            .select("full_name, email")
            .eq("id", str(g.authenticated_user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not user_rows:
            return jsonify({"error": "Account details could not be found."}), 404

        profile_rows = (
            admin_supabase.table(profile_tables[role])
            .select(profile_fields[role])
            .eq("user_id", str(g.authenticated_user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not profile_rows:
            return jsonify({"error": "Your account profile is incomplete."}), 404

        profile = profile_rows[0]
        id_number = (
            profile.get("student_number")
            if role == "student"
            else profile.get("employee_number")
        )
        affiliation = ""
        if role == "student" and profile.get("program_id"):
            program_rows = (
                admin_supabase.table("programs")
                .select("name")
                .eq("id", profile["program_id"])
                .limit(1)
                .execute()
                .data
                or []
            )
            affiliation = program_rows[0]["name"] if program_rows else ""
        elif role in {"faculty", "department-head"} and profile.get("department_id"):
            department_rows = (
                admin_supabase.table("departments")
                .select("name")
                .eq("id", profile["department_id"])
                .limit(1)
                .execute()
                .data
                or []
            )
            affiliation = department_rows[0]["name"] if department_rows else ""
        elif role == "admin-security":
            affiliation = "Admin & Security"

        user = user_rows[0]
        return jsonify({
            "profile": {
                "role": role,
                "full_name": user.get("full_name") or "",
                "id_number": id_number or "",
                "affiliation": affiliation,
                "email": user.get("email") or g.authenticated_user.email or "",
            }
        }), 200
    except Exception:
        app.logger.exception("Unable to load authenticated account profile")
        return jsonify({"error": "Account details could not be loaded."}), 500


@app.get("/main/courses-faculty.html")
@require_role("faculty")
def faculty_courses_page():
    return render_template("main/courses-faculty.html")


@app.get("/main/courses.html")
@require_role("student")
def student_courses_page():
    return render_template("main/courses.html")


@app.get("/department-head/course-offerings.html")
@require_role("department-head")
def department_head_course_offerings_page():
    return render_template("department-head/course-offerings.html")


@app.get("/admin/academic-terms.html")
@require_role("admin-security")
def admin_academic_terms_page():
    return render_template("admin/academic-terms.html")


@app.get("/main/platform.html")
@app.get("/main/resources.html")
@app.get("/main/about us.html")
def dept_head_main_page():
    return render_template(request.path.lstrip("/"))


@app.get("/requirement 2/cm-admin.html")
@require_role("admin-security")
def admin_dashboard():
    return render_template("requirement 2/cm-admin.html")


@app.get("/requirement 7/gl-admin.html")
@require_role("admin-security")
def admin_system_records():
    return render_template("requirement 7/gl-admin.html")


@app.get("/requirement 4/ra-admin.html")
@app.get("/requirement 5/ac-admin.html")
@app.get("/requirement 6/cqi-admin.html")
@app.get("/requirement 8/rp-admin.html")
@require_role("admin-security")
def admin_workflow_page():
    return render_template(request.path.lstrip("/"))


@app.get("/register")
def register_page():
    return render_template("registration.html")


@app.get("/complete-profile")
@require_authenticated
def complete_profile_page():
    role = normalize_role_name(session.get("profile_completion_role"))
    if role not in {"student", "faculty", "department-head", "admin-security"}:
        return redirect("/main/dashboard.html")

    metadata = getattr(g.authenticated_user, "user_metadata", None) or {}
    full_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or " ".join(filter(None, (
            metadata.get("first_name"),
            metadata.get("last_name"),
        )))
    )
    return render_template(
        "account-profile-completion.html",
        requested_role=role,
        email=getattr(g.authenticated_user, "email", "") or "",
        full_name=full_name,
    )


@app.get("/account-pending.html")
def account_pending_page():
    return render_template("account-pending.html")


@app.get("/account-approvals.html")
@require_authenticated
def account_approvals_page():
    role = normalize_role_name(get_user_role(g.authenticated_user))
    if role not in {"admin-security", "department-head"}:
        return "You are not authorized to review account requests.", 403

    try:
        if not has_active_role_record(g.authenticated_user.id, role):
            return "Reviewer account is not active.", 403
        if has_pending_role_request(g.authenticated_user.id):
            return "Pending accounts cannot review requests.", 403
    except Exception:
        app.logger.exception("Unable to verify account reviewer access")
        return "Authorization could not be verified.", 503

    return render_template("account-approvals.html", reviewer_role=role)


@app.post("/api/auth/complete-profile")
@require_authenticated
def complete_profile():
    role = normalize_role_name(session.get("profile_completion_role"))
    if role not in {"student", "faculty", "department-head", "admin-security"}:
        return jsonify({"error": "Profile completion is not active for this account."}), 403
    completion_mode = session.get("profile_completion_mode", "signup")
    if completion_mode == "repair" and normalize_role_name(
        get_user_role(g.authenticated_user)
    ) != role:
        return jsonify({"error": "This profile can only be completed by its assigned role."}), 403

    data = get_json_data()
    full_name = str(data.get("fullName", "")).strip()
    id_number = str(data.get("idNumber", "")).strip()
    department_name = str(data.get("department", "")).strip()
    department_id = str(data.get("departmentId", "")).strip()
    program_id = str(data.get("programId", "")).strip()

    if not full_name or not id_number:
        return jsonify({"error": "Name and student or employee ID are required."}), 400

    profile_data = {
        "email": str(g.authenticated_user.email or "").strip().lower(),
        "full_name": full_name,
        "id_number": id_number,
    }

    try:
        if role == "student":
            program = find_student_program(program_id, department_id)
            if not program:
                return jsonify({
                    "error": "Select a program offered by the selected college."
                }), 400
            provision_student_profile(
                g.authenticated_user,
                full_name,
                id_number,
                program["id"],
            )
            session.pop("profile_completion_role", None)
            session.pop("profile_completion_mode", None)
            session["user_role"] = "student"
            return jsonify({"status": "profile_complete", "role": "student"}), 200

        department_id = None
        if role in {"faculty", "department-head"}:
            if not department_name:
                return jsonify({"error": "A department is required."}), 400
            department_id = find_reference_id("departments", department_name)
            if not department_id:
                return jsonify({"error": "Select a department that exists in the system."}), 400
            profile_data["department_name"] = department_name

        if completion_mode == "repair":
            save_trusted_role_profile(
                g.authenticated_user,
                role,
                full_name,
                id_number,
                department_id,
            )
            session.pop("profile_completion_role", None)
            session.pop("profile_completion_mode", None)
            session["user_role"] = role
            return jsonify({"status": "profile_complete", "role": role}), 200

        create_pending_role_request(
            g.authenticated_user,
            role,
            profile_data,
            department_id,
        )
        if normalize_role_name(get_user_role(g.authenticated_user)) == role:
            try:
                admin_supabase.table("users").update({
                    "is_active": False,
                }).eq("id", str(g.authenticated_user.id)).execute()
            finally:
                clear_trusted_role(g.authenticated_user.id)
        session.clear()
        return jsonify({"status": "approval_pending"}), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("OAuth profile completion failed")
        return jsonify({"error": "Profile could not be saved. Please try again."}), 500


@app.get("/login page.html")
def login_page():
    oauth_error = request.args.get("oauth_error")

    return render_template(
        "login page.html",
        oauth_error=oauth_error
    )


@app.route("/verification-login.html")
def verification_login():
    return render_template("verification-login.html")


@app.get("/verification-signup.html")
def verification_signup_page():
    return render_template("verification-signup.html")


@app.route("/verification-success.html")
def verification_success():
    return render_template("verification-success.html")


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    first_name = str(data.get("firstName", "")).strip()
    last_name = str(data.get("lastName", "")).strip()
    id_number = str(data.get("idNumber", "")).strip()
    department_name = str(data.get("department", "")).strip()
    requested_department_id = str(data.get("departmentId", "")).strip()
    requested_program_id = str(data.get("programId", "")).strip()
    role = normalize_role_name(data.get("role", "student"))

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if role not in allowed_roles:
        return jsonify({
            "error": (
                "This role cannot be registered publicly. "
                "Please contact the administrator."
            )
        }), 403

    if not email or not password or not first_name or not last_name:
        return jsonify({
            "error": (
                "First name, last name, email, and password "
                "are required."
            )
        }), 400

    if not id_number:
        return jsonify({
            "error": "A student or employee ID number is required."
        }), 400

    if role in {"student", "faculty", "department-head"} and not department_name:
        return jsonify({
            "error": "A program or department is required for this role."
        }), 400

    if not isinstance(password, str) or len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    try:
        department_id = None
        program_id = None
        if role in {"faculty", "department-head"}:
            department_id = find_reference_id("departments", department_name)
            if not department_id:
                return jsonify({
                    "error": "Select a department that exists in the system."
                }), 400
        elif role == "student":
            program = find_student_program(
                requested_program_id,
                requested_department_id,
            )
            if not program:
                return jsonify({
                    "error": "Select a program offered by the selected college."
                }), 400
            program_id = program["id"]

            existing_student = (
                admin_supabase.table("student_profiles")
                .select("id")
                .eq("student_number", id_number)
                .limit(1)
                .execute()
                .data
                or []
            )
            if existing_student:
                return jsonify({
                    "error": "That student ID is already registered."
                }), 409

        # Check existing accounts before attempting registration.
        existing_user = find_auth_user_by_email(email)

        if existing_user:
            return jsonify({
                "error": "Account Already Exists",
                "message": (
                    "An account with this email already exists. "
                    "Please sign in using your existing account."
                )
            }), 409

        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": role,
                }
            }
        })

        if result.user:
            full_name = f"{first_name} {last_name}".strip()
            profile_data = {
                "email": email,
                "full_name": full_name,
                "id_number": id_number,
                "department_or_program": department_name,
            }

            try:
                if role == "student":
                    provision_student_profile(
                        result.user,
                        full_name,
                        id_number,
                        program_id,
                    )
                else:
                    create_pending_role_request(
                        result.user,
                        role,
                        profile_data,
                        department_id,
                    )
            except Exception:
                try:
                    admin_supabase.table("student_profiles").delete().eq(
                        "user_id", str(result.user.id)
                    ).execute()
                    admin_supabase.table("account_role_requests").delete().eq(
                        "auth_user_id", str(result.user.id)
                    ).execute()
                    admin_supabase.table("users").delete().eq(
                        "id", str(result.user.id)
                    ).execute()
                    admin_supabase.auth.admin.delete_user(str(result.user.id))
                except Exception:
                    app.logger.exception(
                        "Unable to clean up incomplete signup for user %s",
                        result.user.id,
                    )
                raise

        # Preserve the existing email-verification workflow.
        return jsonify({
            "status": "request_processed",
            "account_status": (
                "active_after_email_verification"
                if role == "student"
                else "pending_approval"
            ),
            "message": (
                "If registration is accepted, check your email "
                "for the verification instructions."
            ),
            "user_created": result.user is not None,
        }), 200

    except Exception:
        app.logger.exception("Supabase registration request failed")
        return jsonify({
            "error": (
                "Registration could not be completed. "
                "Check the server terminal for the error."
            )
        }), 400


def get_authenticated_user():
    access_token = session.get("access_token")

    if not access_token:
        return None

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        result = auth_client.auth.get_user(access_token)
        return result.user
    except Exception:
        app.logger.exception("Failed to validate authenticated user")
        return None


def get_user_role(user):
    if not user:
        return None

    app_metadata = getattr(user, "app_metadata", None) or {}
    return normalize_role_name(app_metadata.get("role"))


@app.get("/auth/callback")
def auth_callback():

    provider = session.get("oauth_provider", "google")
    provider_name = "Microsoft" if provider == "microsoft" else "Google"

    error = request.args.get("error")

    if error:
        app.logger.warning(
            "OAuth provider returned an error: %s", error
        )
        session.clear()
        return f"{provider_name} sign-in was cancelled or failed. Please try again.", 400

    code = request.args.get("code")
    if not code:
        return "Missing OAuth authorization code.", 400

    requested_role = normalize_role_name(session.get("oauth_requested_role"))
    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if requested_role not in allowed_roles:
        return "Your sign-in request expired. Please start again.", 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        code_verifier = session.get("oauth_code_verifier")
        if not code_verifier:
            app.logger.error(
                "OAuth PKCE verifier is missing from Flask session."
            )
            session.clear()
            return (
                f"Your sign-in session expired. Please start {provider_name} sign-in again.",
                400,
            )

        result = auth_client.auth.exchange_code_for_session({
            "auth_code": code,
            "code_verifier": code_verifier,
        })

        if not result.user or not result.session:
            session.clear()
            return f"{provider_name} sign-in could not be completed.", 401

        actual_role = get_user_role(result.user)

        if actual_role is None:
            existing_request = get_pending_role_request(result.user.id)
            if existing_request:
                session.clear()
                return redirect(url_for("account_pending_page"))

            session.clear()
            session.permanent = True
            session["access_token"] = result.session.access_token
            session["refresh_token"] = result.session.refresh_token
            session["user_id"] = result.user.id
            session["profile_completion_role"] = requested_role
            return redirect(url_for("complete_profile_page"))

        # Existing accounts must match their trusted assigned role.
        if actual_role not in allowed_roles or actual_role != requested_role:
            auth_client.auth.sign_out()
            session.clear()
            return redirect(
                url_for(
                    "login_page",
                    oauth_error="account_exists",
                    role=requested_role
                )
            )

        session.clear()
        session.permanent = True
        session["access_token"] = result.session.access_token
        session["refresh_token"] = result.session.refresh_token
        session["user_id"] = result.user.id
        return redirect("/main/dashboard.html")

    except Exception:
        app.logger.exception("%s OAuth callback failed", provider_name)
        session.clear()
        return f"{provider_name} sign-in failed. Please try again.", 400


def require_admin_security(view_function):
    @wraps(view_function)
    def wrapped(*args, **kwargs):
        user = get_authenticated_user()

        if not user:
            return jsonify({
                "error": "Authentication required."
            }), 401

        if get_user_role(user) != "admin-security":
            return jsonify({
                "error": "Administrator access required."
            }), 403

        try:
            if not has_active_role_record(user.id, "admin-security"):
                return jsonify({
                    "error": "Administrator account is not active."
                }), 403
            if has_pending_role_request(user.id):
                return jsonify({
                    "error": "Pending accounts cannot access administrator APIs."
                }), 403
        except Exception:
            app.logger.exception("Unable to verify administrator role")
            return jsonify({
                "error": "Authorization could not be verified."
            }), 503

        return view_function(*args, **kwargs)

    return wrapped


@app.get("/api/account-role-requests")
def list_account_role_requests():
    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    reviewer_role = normalize_role_name(get_user_role(user))
    if reviewer_role not in {"admin-security", "department-head"}:
        return jsonify({"error": "You are not authorized to review account requests."}), 403

    try:
        if not has_active_role_record(user.id, reviewer_role):
            return jsonify({"error": "Reviewer account is not active."}), 403
        if has_pending_role_request(user.id):
            return jsonify({"error": "Pending accounts cannot review requests."}), 403

        query = (
            admin_supabase.table("account_role_requests")
            .select(
                "id, auth_user_id, requested_role, requested_department_id, "
                "profile_data, submitted_at"
            )
            .eq("status", "pending")
        )
        if reviewer_role == "admin-security":
            query = query.in_("requested_role", ["department-head", "admin-security"])
        else:
            reviewer_department = (
                admin_supabase.table("dept_head_profiles")
                .select("department_id")
                .eq("user_id", str(user.id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if not reviewer_department or not reviewer_department[0].get("department_id"):
                return jsonify({"error": "Reviewer department is not configured."}), 403
            query = (
                query.eq("requested_role", "faculty")
                .eq("requested_department_id", reviewer_department[0]["department_id"])
            )

        requests = query.order("submitted_at").execute().data or []
        return jsonify({"requests": requests}), 200
    except Exception:
        app.logger.exception("Unable to list account role requests")
        return jsonify({"error": "Account requests could not be loaded."}), 500


@app.post("/api/account-role-requests/<request_id>/decision")
def decide_account_role_request(request_id):
    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    reviewer_role = normalize_role_name(get_user_role(user))
    if reviewer_role not in {"admin-security", "department-head"}:
        return jsonify({"error": "You are not authorized to decide account requests."}), 403

    data = get_json_data()
    decision = str(data.get("decision", "")).strip().lower()
    reason = str(data.get("reason", "")).strip()
    if decision not in {"approved", "rejected"}:
        return jsonify({"error": "Decision must be approved or rejected."}), 400
    if decision == "rejected" and not reason:
        return jsonify({"error": "A reason is required when rejecting a request."}), 400

    try:
        if not has_active_role_record(user.id, reviewer_role):
            return jsonify({"error": "Reviewer account is not active."}), 403
        if has_pending_role_request(user.id):
            return jsonify({"error": "Pending accounts cannot decide requests."}), 403

        request_rows = (
            admin_supabase.table("account_role_requests")
            .select(
                "id, auth_user_id, requested_role, requested_department_id, profile_data"
            )
            .eq("id", request_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not request_rows:
            return jsonify({"error": "Pending account request was not found."}), 404

        role_request = request_rows[0]
        if str(role_request["auth_user_id"]) == str(user.id):
            return jsonify({"error": "You cannot approve or reject your own request."}), 403

        requested_role = role_request["requested_role"]
        if reviewer_role == "admin-security":
            if requested_role not in {"department-head", "admin-security"}:
                return jsonify({"error": "Admins may review only Admin or Department Head requests."}), 403
        else:
            if requested_role != "faculty":
                return jsonify({"error": "Department Heads may review only Faculty requests."}), 403
            reviewer_department = (
                admin_supabase.table("dept_head_profiles")
                .select("department_id")
                .eq("user_id", str(user.id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if (
                not reviewer_department
                or reviewer_department[0].get("department_id")
                != role_request.get("requested_department_id")
            ):
                return jsonify({"error": "You may only review Faculty requests for your department."}), 403

        if decision == "approved":
            target_user = find_auth_user_by_email(
                str((role_request.get("profile_data") or {}).get("email", ""))
            )
            if not target_user or str(target_user.id) != str(role_request["auth_user_id"]):
                return jsonify({"error": "The requested Auth account could not be found."}), 409
            if not getattr(target_user, "email_confirmed_at", None):
                return jsonify({"error": "The requester must confirm their email before approval."}), 409

            profile_data = role_request.get("profile_data") or {}
            existing_app_users = (
                admin_supabase.table("users")
                .select("id, role, is_active")
                .eq("email", str(target_user.email or "").strip().lower())
                .limit(2)
                .execute()
                .data
                or []
            )
            conflicting_user = next(
                (
                    app_user for app_user in existing_app_users
                    if str(app_user["id"]) != str(target_user.id)
                ),
                None,
            )
            if conflicting_user:
                return jsonify({
                    "error": (
                        "This email is already linked to a different application "
                        "user ID. An administrator must reconcile the existing "
                        "account before this request can be approved."
                    )
                }), 409

            save_trusted_role_profile(
                target_user,
                requested_role,
                str(profile_data.get("full_name", "")).strip(),
                str(profile_data.get("id_number", "")).strip(),
                role_request.get("requested_department_id"),
            )
            assign_trusted_role(target_user.id, requested_role)

        update_result = (
            admin_supabase.table("account_role_requests")
            .update({
                "status": decision,
                "decided_by": str(user.id),
                "decided_at": datetime.now(timezone.utc).isoformat(),
                "decision_reason": reason or None,
            })
            .select("id")
            .eq("id", request_id)
            .eq("status", "pending")
            .execute()
        )
        if not update_result.data:
            return jsonify({"error": "The request was already decided."}), 409

        if decision == "approved":
            try:
                admin_supabase.auth.admin.update_user_by_id(
                    role_request["auth_user_id"],
                    {"ban_duration": "none"},
                )
            except Exception:
                app.logger.exception("Unable to clear pending account lockout")

        return jsonify({"status": decision}), 200
    except Exception:
        app.logger.exception("Unable to decide account role request")
        account_approval_logger.exception("Unable to decide account role request")
        return jsonify({"error": "The account request could not be processed."}), 500


def assign_trusted_role(user_id, role):
    normalized_role = normalize_role_name(role)
    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security"
    }

    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    if normalized_role not in allowed_roles:
        raise ValueError("Invalid role.")

    return admin_supabase.auth.admin.update_user_by_id(
        user_id,
        {
            "app_metadata": {
                "role": normalized_role
            }
        }
    )


def clear_trusted_role(user_id):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    return admin_supabase.auth.admin.update_user_by_id(
        user_id,
        {"app_metadata": {"role": None}},
    )


def find_auth_user_by_email(email):
    if not admin_supabase:
        raise RuntimeError(
            "Supabase Admin client is not configured."
        )

    target_email = email.strip().lower()
    page = 1
    per_page = 1000

    while True:
        response = admin_supabase.auth.admin.list_users(
            page=page,
            per_page=per_page
        )

        # Support different Supabase SDK response formats.
        if isinstance(response, list):
            users = response
        else:
            users = getattr(response, "users", None)

        if users is None:
            app.logger.error(
                "Unexpected Supabase list_users response type: %s",
                type(response).__name__
            )
            raise RuntimeError(
                "Could not retrieve users from Supabase Auth."
            )

        for user in users:
            user_email = (
                getattr(user, "email", None) or ""
            ).strip().lower()

            if user_email == target_email:
                return user

        if len(users) < per_page:
            return None

        page += 1


def find_reference_id(table_name, value):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    normalized = str(value or "").strip().casefold()
    if not normalized:
        return None

    result = (
        admin_supabase.table(table_name)
        .select("id, name, code")
        .execute()
    )
    for record in result.data or []:
        if normalized in {
            str(record.get("name") or "").strip().casefold(),
            str(record.get("code") or "").strip().casefold(),
        }:
            return record["id"]
    return None


def get_pending_role_request(user_id, requested_role=None):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    query = (
        admin_supabase.table("account_role_requests")
        .select("id, requested_role, requested_department_id, profile_data, status")
        .eq("auth_user_id", str(user_id))
        .eq("status", "pending")
    )
    if requested_role:
        query = query.eq("requested_role", requested_role)
    rows = query.limit(1).execute().data or []
    return rows[0] if rows else None


def has_pending_role_request(user_id):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    rows = (
        admin_supabase.table("account_role_requests")
        .select("id")
        .eq("auth_user_id", str(user_id))
        .eq("status", "pending")
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def create_pending_role_request(user, role, profile_data, department_id=None):
    if role not in {"faculty", "department-head", "admin-security"}:
        raise ValueError("Only approval-required roles may have pending requests.")
    if role in {"faculty", "department-head"} and not department_id:
        raise ValueError("A department is required for this role request.")

    existing = get_pending_role_request(user.id)
    if existing:
        if existing["requested_role"] == role:
            return existing
        raise ValueError("This account already has a pending role request.")

    result = (
        admin_supabase.table("account_role_requests")
        .insert({
            "auth_user_id": str(user.id),
            "requested_role": role,
            "requested_department_id": department_id,
            "profile_data": profile_data,
        })
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def provision_student_profile(user, full_name, student_number, program_id=None):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    existing_profiles = (
        admin_supabase.table("student_profiles")
        .select("id, user_id")
        .eq("student_number", student_number)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_profiles and str(existing_profiles[0]["user_id"]) != str(user.id):
        raise ValueError("That student number is already assigned to another account.")

    admin_supabase.table("users").upsert({
        "id": str(user.id),
        "email": str(user.email or "").strip().lower(),
        "full_name": full_name,
        "role": "student",
        "is_active": True,
    }, on_conflict="id").execute()

    admin_supabase.table("student_profiles").upsert({
        "user_id": str(user.id),
        "student_number": student_number,
        "program_id": program_id,
        "is_enrolled": True,
    }, on_conflict="user_id").execute()

    assign_trusted_role(user.id, "student")


def has_role_profile(user_id, role):
    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    if role == "admin-security":
        rows = (
            admin_supabase.table("admin_security_profiles")
            .select("id")
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        return bool(rows)

    profile_tables = {
        "student": "student_profiles",
        "faculty": "faculty_profiles",
        "department-head": "dept_head_profiles",
        "admin-security": "admin_security_profiles",
    }
    table_name = profile_tables.get(role)
    if not table_name:
        return False

    required_fields = {
        "student": ("student_number", "program_id"),
        "faculty": ("employee_number", "department_id"),
        "department-head": ("employee_number", "department_id"),
        "admin-security": ("employee_number",),
    }[role]
    rows = (
        admin_supabase.table(table_name)
        .select(", ".join(required_fields))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows) and all(rows[0].get(field) for field in required_fields)


def save_trusted_role_profile(user, role, full_name, id_number, department_id=None, program_id=None):
    if role == "student":
        provision_student_profile(user, full_name, id_number, program_id)
        return

    admin_supabase.table("users").upsert({
        "id": str(user.id),
        "email": str(user.email or "").strip().lower(),
        "full_name": full_name,
        "role": role,
        "is_active": True,
    }, on_conflict="id").execute()

    if role == "admin-security":
        admin_supabase.table("admin_security_profiles").upsert({
            "user_id": str(user.id),
            "employee_number": id_number,
        }, on_conflict="user_id").execute()
    elif role == "faculty":
        admin_supabase.table("faculty_profiles").upsert({
            "user_id": str(user.id),
            "employee_number": id_number,
            "department_id": department_id,
        }, on_conflict="user_id").execute()
    elif role == "department-head":
        admin_supabase.table("dept_head_profiles").upsert({
            "user_id": str(user.id),
            "employee_number": id_number,
            "department_id": department_id,
        }, on_conflict="user_id").execute()


def get_json_data():
    return request.get_json(silent=True) or {}


@app.post("/api/auth/login")
def login():
    data = get_json_data()

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    selected_role = normalize_role_name(data.get("role", ""))
    remember_me = data.get("rememberMe") is True

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if selected_role not in allowed_roles:
        return jsonify({
            "error": "Please select a valid login role."
        }), 400

    # Check whether this email is temporarily locked.
    now = time.time()

    with _login_attempts_lock:
        attempt_data = _login_attempts.get(email, {})
        locked_until = attempt_data.get("locked_until", 0)

        if locked_until > now:
            remaining = int(locked_until - now + 0.999)

            return jsonify({
                "error": (
                    f"Too many failed password attempts. "
                    f"Try again in {remaining} seconds."
                ),
                "locked": True,
                "retry_after": remaining,
            }), 429

    try:
        # Use a separate Supabase client for this authentication attempt.
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        result = auth_client.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if not result.user:
            app.logger.warning(
                "Login returned no user for email: %s",
                email
            )

            return jsonify({
                "error": "Invalid email or password."
            }), 401

        with _login_attempts_lock:
            _login_attempts.pop(email, None)

        actual_role = get_user_role(result.user)

        if not result.user.email_confirmed_at:
            auth_client.auth.sign_out()

            auth_client.auth.resend({
                "type": "signup",
                "email": email
            })

            return jsonify({
                "status": "verification_required",
                "message": "Check your email for a signup verification code."
            }), 200

        if actual_role != selected_role:
            pending_request = (
                get_pending_role_request(result.user.id, selected_role)
                if actual_role is None
                else None
            )
            auth_client.auth.sign_out()
            if pending_request:
                return jsonify({
                    "status": "approval_pending",
                    "message": (
                        "Your account is waiting for approval. "
                        "You cannot access role-specific pages until it is approved."
                    ),
                }), 200
            return jsonify({
                "error": "The selected role does not match this account."
            }), 403

        session["user_role"] = actual_role

        # Check remembered accounts for this browser.

        remembered_accounts = get_remembered_accounts()

        remembered_account = remembered_accounts.get(email)

        if (
            remembered_account
            and remembered_account.get("user_id") == result.user.id
            and result.session
        ):
            # Preserve remembered accounts while changing the active login.
            session.clear()
            session.permanent = True

            session["access_token"] = result.session.access_token
            session["refresh_token"] = result.session.refresh_token
            session["user_id"] = result.user.id
            session["user_role"] = actual_role
            session["remembered_accounts"] = remembered_accounts

            response = jsonify({
                "status": "authenticated",
                "message": "Login successful."
            })
            return set_remembered_accounts_cookie(response, remembered_accounts), 200

        # Password is correct, but require a separate login OTP.
        session.permanent = True
        session["pending_login_email"] = email
        session["pending_login_remember"] = remember_me
        auth_client.auth.sign_out()

        auth_client.auth.sign_in_with_otp({
            "email": email,
            "options": {
                "should_create_user": False
            }
        })

        response = jsonify({
            "status": "login_otp_required",
            "message": "A login verification code has been requested."
        })
        return set_remembered_accounts_cookie(response, remembered_accounts), 200

    except Exception as exc:
        error_text = str(exc).lower()

        # Count only password or credential failures.
        if any(term in error_text for term in (
            "invalid login credentials",
            "invalid credentials",
            "invalid password",
            "incorrect password",
        )):
            now = time.time()

            with _login_attempts_lock:
                attempt_data = _login_attempts.get(email, {})
                failed_attempts = attempt_data.get("failed_attempts", 0) + 1

                if failed_attempts >= LOGIN_MAX_FAILED_ATTEMPTS:
                    _login_attempts[email] = {
                        "failed_attempts": 0,
                        "locked_until": now + LOGIN_LOCKOUT_SECONDS,
                    }

                    return jsonify({
                        "error": (
                            "Too many failed password attempts. "
                            "Try again in 30 seconds."
                        ),
                        "locked": True,
                        "retry_after": LOGIN_LOCKOUT_SECONDS,
                    }), 429

                _login_attempts[email] = {
                    "failed_attempts": failed_attempts,
                    "locked_until": 0,
                }

            return jsonify({
                "error": "Login could not be completed."
            }), 401

        app.logger.exception("Login request failed")
        return jsonify({
            "error": "Login failed. Check your credentials and try again."
        }), 401


@app.post("/api/auth/forgot-password")
def forgot_password():
    data = get_json_data()
    email = str(data.get("email", "")).strip().lower()
    requested_role = str(data.get("role", "")).strip().lower()

    if not email:
        return jsonify({
            "error": "Email address is required."
        }), 400

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if requested_role not in allowed_roles:
        return jsonify({
            "error": "Invalid account role."
        }), 400

    if not admin_supabase:
        app.logger.error(
            "Password reset unavailable: Supabase Admin client is not configured."
        )
        return jsonify({
            "error": "Password recovery is temporarily unavailable."
        }), 500

    try:
        # Find the account using the trusted Supabase Admin API.
        users_response = admin_supabase.auth.admin.list_users()

        # Support Supabase responses that return users in a .users property.
        users = getattr(users_response, "users", users_response)

        user = next(
            (
                item for item in users
                if str(getattr(item, "email", "") or "").strip().lower()
                == email
            ),
            None
        )

        # Require both the email and selected role to match.
        if not user or get_user_role(user) != requested_role:
            return jsonify({
                "error": "No account was found for this email and selected role."
            }), 400

        # Request a password recovery OTP only for the matching account.
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        auth_client.auth.reset_password_for_email(email)

        return jsonify({
            "status": "reset_requested",
            "message": "Check your email for the password reset code."
        }), 200

    except Exception as e:
        app.logger.exception("Password reset request failed")

        error_message = str(e)

        if "after" in error_message and "seconds" in error_message:
            return jsonify({
                "error": (
                    "Please wait a few seconds before requesting "
                    "another password reset code."
                )
            }), 429

        if "429" in error_message or "Too Many Requests" in error_message:
            return jsonify({
                "error": (
                    "Too many reset code requests. Please wait before "
                    "trying again."
                )
            }), 429

        return jsonify({
            "error": "Password recovery is temporarily unavailable."
        }), 500


@app.post("/api/auth/verify-otp")
def verify_otp():
    data = get_json_data()

    email = str(data.get("email", "")).strip().lower()
    token = str(data.get("token", "")).strip()
    purpose = str(data.get("purpose", "signup")).strip().lower()

    if not email or not token:
        return jsonify({
            "error": "Email and verification code are required."
        }), 400

    if not token.isdigit() or len(token) != 6:
        return jsonify({
            "error": "Enter the complete 6-digit verification code."
        }), 400

    if purpose not in ("signup", "login", "reset_password"):
        return jsonify({
            "error": "Invalid verification purpose."
        }), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        if purpose == "signup":
            otp_type = "signup"
        elif purpose == "login":
            otp_type = "email"
        else:
            otp_type = "recovery"

        result = auth_client.auth.verify_otp({
            "email": email,
            "token": token,
            "type": otp_type
        })

        if not result.user:
            return jsonify({
                "error": "The code could not be verified."
            }), 400

        # Password reset OTP verified successfully.
        if purpose == "reset_password":
            if not result.session:
                return jsonify({
                    "error": "Verification succeeded, but no recovery session was returned."
                }), 400

            session.clear()
            session.permanent = True

            session["reset_password_user_id"] = result.user.id
            session["reset_password_access_token"] = result.session.access_token
            session["reset_password_refresh_token"] = result.session.refresh_token

            return jsonify({
                "status": "reset_verified",
                "purpose": "reset_password",
                "message": "Code verified. You may now set a new password."
            }), 200

        # Login requires a session; signup verification does not.
        if purpose == "login":
            if not result.session:
                return jsonify({
                    "error": "Verification succeeded, but no login session was returned."
                }), 400

            import time

            pending_login_matches = (
                session.get("pending_login_email") == email
            )
            remember_me = (
                session.get("pending_login_remember") is True
                if pending_login_matches
                else data.get("rememberMe", False) is True
            )

            # Preserve remembered accounts when switching users.
            remembered_accounts = get_remembered_accounts()
            now = int(time.time())

            if remember_me:
                remembered_accounts[email] = {
                    "user_id": result.user.id,
                    "expires_at": now + (30 * 24 * 60 * 60)
                }

            session.clear()
            session.permanent = True

            session["access_token"] = result.session.access_token
            session["refresh_token"] = result.session.refresh_token
            session["user_id"] = result.user.id
            session["user_role"] = get_user_role(result.user)
            session["remembered_accounts"] = remembered_accounts

        response = jsonify({
            "status": "verified",
            "purpose": purpose,
            "message": (
                "Login successful."
                if purpose == "login"
                else "Email verification successful."
            )
        })
        if purpose == "login":
            set_remembered_accounts_cookie(response, remembered_accounts)
        return response, 200

    except Exception as e:
        app.logger.exception("OTP verification failed")
        return jsonify({
            "error": str(e)
        }), 400


@app.post("/api/auth/reset-password")
def reset_password():
    data = get_json_data()

    new_password = data.get("newPassword", "")
    confirm_password = data.get("confirmPassword", "")

    # Require successful OTP verification first.
    user_id = session.get("reset_password_user_id")
    access_token = session.get("reset_password_access_token")
    refresh_token = session.get("reset_password_refresh_token")

    if not user_id or not access_token or not refresh_token:
        return jsonify({
            "error": "Please verify your password reset code first."
        }), 401

    if not isinstance(new_password, str) or len(new_password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    if new_password != confirm_password:
        return jsonify({
            "error": "Passwords do not match."
        }), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        auth_client.auth.set_session(access_token, refresh_token)

        result = auth_client.auth.update_user({
            "password": new_password
        })

        if not result.user or result.user.id != user_id:
            return jsonify({
                "error": "Password reset could not be completed."
            }), 400

        # Remove temporary reset authorization after success.
        session.pop("reset_password_user_id", None)
        session.pop("reset_password_access_token", None)
        session.pop("reset_password_refresh_token", None)

        return jsonify({
            "status": "password_reset",
            "message": "Password updated successfully. Please log in."
        }), 200

    except Exception:
        app.logger.exception("Password reset failed")
        return jsonify({
            "error": "Password reset failed. Please request a new code and try again."
        }), 400


@app.post("/api/auth/resend-otp")
def resend_otp():
    data = get_json_data()
    email = str(data.get("email", "")).strip().lower()

    if not email:
        return jsonify({
            "error": "Email is required."
        }), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        auth_client.auth.resend({
            "type": "signup",
            "email": email
        })

        return jsonify({
            "status": "requested",
            "message": "A new signup verification code has been requested. Check your email."
        }), 200

    except Exception:
        app.logger.exception("Signup OTP resend failed")
        return jsonify({
            "error": "Unable to resend the signup code. Please try again later."
        }), 400


@app.post("/api/auth/login/resend-otp")
def resend_login_otp():
    data = get_json_data()
    email = str(data.get("email", "")).strip().lower()

    if not email:
        return jsonify({
            "error": "Email is required."
        }), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        result = auth_client.auth.sign_in_with_otp({
            "email": email,
            "options": {
                "should_create_user": False
            }
        })

        if result is None:
            raise RuntimeError("Supabase returned no response.")

        if getattr(result, "error", None):
            raise result.error

        return jsonify({
            "status": "requested",
            "message": "A new login verification code has been requested. Check your email."
        }), 200

    except Exception:
        app.logger.exception("Login OTP resend failed")
        return jsonify({
            "error": "Unable to resend the login code. Please try again later."
        }), 400


@app.get("/forgot-password.html")
def forgot_password_page():
    return render_template("forgot-password.html")


@app.get("/logout")
def logout_redirect():
    role = session.get("user_role") or session.get("role") or "student"
    remembered_accounts = session.get("remembered_accounts", {})

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if role not in allowed_roles:
        role = "student"

    session.clear()
    session.permanent = True
    session["remembered_accounts"] = remembered_accounts

    return redirect(
        url_for("login_page", role=role)
    )


@app.post("/api/auth/logout")
def logout():
    refresh_token = session.get("refresh_token")
    access_token = session.get("access_token")
    remembered_accounts = session.get("remembered_accounts", {})

    try:
        if access_token:
            auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            auth_client.auth.set_session(
                access_token,
                refresh_token
            )
            auth_client.auth.sign_out()
    except Exception:
        app.logger.exception("Supabase sign-out failed")
    finally:
        session.clear()
        session.permanent = True
        session["remembered_accounts"] = remembered_accounts

    response = jsonify({
        "status": "logged_out",
        "message": "You have been logged out successfully."
    })
    response.headers["Cache-Control"] = "no-store"
    return response, 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true"
    )
