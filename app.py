from threading import Lock
import time
from functools import wraps
import logging
import re
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
from werkzeug.middleware.proxy_fix import ProxyFix
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
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

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
    os.getenv("FLASK_ENV", "").lower() == "production"
    or os.getenv("RENDER", "").lower() == "true"
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
PROFILE_PHOTOS_BUCKET = "profile-photos"
PROFILE_PHOTO_MAX_BYTES = 1024 * 1024
FIXED_COURSE_OUTCOME_CODES = tuple(f"CO{number}" for number in range(1, 11))
FIXED_COURSE_OUTCOME_DESCRIPTIONS = {
    "CO1": "Evaluate how personal, family, and community values, morals, and ethics influence professional behavior and decision-making in IT.",
    "CO2": "Create strategies that demonstrate proper conduct, responsibility, and accountability in IT practice, guided by professional codes of ethics (e.g., ACM, IEEE, PSIA, PCS).",
    "CO3": "Analyze ethical dilemmas in computing, such as privacy versus security, whistleblowing, and conflicts of interest, and justify resolutions using established ethical frameworks.",
    "CO4": "Evaluate Philippine IT-related laws and policies, including the Data Privacy Act (RA 10173), the Cybercrime Prevention Act (RA 10175), and the E-Commerce Act (RA 8792), and justify their correct application in real-world scenarios.",
    "CO5": "Assess intellectual property frameworks (copyright, patents, trademarks, software licensing, and open source) and justify their proper application to software, digital content, and IT innovations.",
    "CO6": "Evaluate data privacy and electronic transaction scenarios for legal compliance, and recommend corrective measures that protect data subjects and organizations.",
    "CO7": "Evaluate contemporary IT issues, such as AI ethics, cybersecurity threats, the digital divide, misinformation, and environmental impact, for their effects on individuals, organizations, and society.",
    "CO8": "Design lifelong learning strategies (certifications, continuing education, professional networks, and portfolio building) that keep IT skills current in a rapidly changing industry.",
    "CO9": "Evaluate business and management trade-offs in IT decisions, such as cost versus quality, speed versus security, and profit versus social responsibility, and justify informed decisions.",
    "CO10": "Justify IT decisions and recommendations that balance technical, ethical, legal, and societal considerations, and communicate them effectively as an accountable professional.",
}
FIXED_STUDENT_OUTCOME_CODES = tuple(
    f"SO({code})" for code in ("A", "B", "C", "D", "E", "F", "G1", "G2", "H", "I", "J", "K", "L")
)


def record_audit_event(
    action,
    module,
    level="INFO",
    details="",
    user_id=None,
    table_name=None,
    record_id=None,
):
    """Persist a minimal system event without request payloads or credentials."""
    if not admin_supabase:
        return
    actor_id = user_id
    if actor_id is None:
        actor = getattr(g, "authenticated_user", None)
        actor_id = getattr(actor, "id", None) or session.get("user_id")
    try:
        admin_supabase.table("audit_logs").insert({
            "user_id": str(actor_id) if actor_id else None,
            "action": str(action)[:240],
            "module": str(module)[:80] if module else None,
            "table_name": str(table_name)[:120] if table_name else None,
            "record_id": str(record_id)[:160] if record_id else None,
            "details": str(details)[:2000] if details else None,
            "ip_address": request.remote_addr,
            "level": level if level in {"INFO", "SECURITY", "WARNING", "ERROR"} else "INFO",
        }).execute()
    except Exception:
        app.logger.exception("Unable to persist a system audit event")


@app.after_request
def audit_authenticated_api_mutations(response):
    if (
        request.path.startswith("/api/")
        and request.method in {"POST", "PUT", "PATCH", "DELETE"}
    ):
        endpoint = request.endpoint or "unknown_endpoint"
        module = request.path.split("/", 3)[2] if len(request.path.split("/", 3)) > 2 else "application"
        status_level = "INFO" if response.status_code < 400 else "WARNING"
        if module == "auth" or "password" in endpoint or "otp" in endpoint:
            status_level = "SECURITY" if response.status_code < 400 else "WARNING"
        actor = getattr(g, "authenticated_user", None)
        actor_id = getattr(actor, "id", None) or session.get("user_id")
        # Only write attributed changes. Public actions such as login requests
        # are logged explicitly once authentication succeeds.
        if actor_id:
            record_audit_event(
                action=f"{request.method} {endpoint.replace('_', ' ')}",
                module=module,
                level=status_level,
                details=f"Endpoint {endpoint} completed with HTTP {response.status_code}.",
                user_id=actor_id,
            )
    return response

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


def _auth_failure_response(message, status_code):
    if request.path.startswith("/api/"):
        return jsonify({"error": message}), status_code
    return message, status_code


def _login_required_response():
    if request.path.startswith("/api/"):
        return jsonify({"error": "Your session has expired. Sign in and retry."}), 401
    return redirect("/login page.html")


def require_role(required_role):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            user = get_authenticated_user()

            if not user:
                session.pop("access_token", None)
                session.pop("refresh_token", None)
                session.pop("user_id", None)
                return _login_required_response()

            if get_user_role(user) != required_role:
                return _auth_failure_response(
                    "You are not authorized to view this page.", 403
                )

            try:
                if not has_active_role_record(user.id, required_role):
                    return _auth_failure_response(
                        "Your account is not active for this role.", 403
                    )
                if has_pending_role_request(user.id):
                    return _auth_failure_response(
                        "Your account is awaiting approval.", 403
                    )
            except Exception:
                app.logger.exception("Unable to verify the user's active role")
                return _auth_failure_response(
                    "Authorization could not be verified.", 503
                )

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
                return _login_required_response()

            role = get_user_role(user)
            if role not in required_roles:
                return _auth_failure_response(
                    "You are not authorized to access this resource.", 403
                )

            try:
                if not has_active_role_record(user.id, role):
                    return _auth_failure_response(
                        "Your account is not active for this role.", 403
                    )
                if has_pending_role_request(user.id):
                    return _auth_failure_response(
                        "Your account is awaiting approval.", 403
                    )
            except Exception:
                app.logger.exception("Unable to verify the user's active role")
                return _auth_failure_response(
                    "Authorization could not be verified.", 503
                )

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
            return _login_required_response()

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
            .select("id, code, title, department_id")
            .in_("id", course_ids)
            .execute()
        )
        courses_by_id = {
            item["id"]: item for item in (course_result.data or [])
        }
        department_ids = list({
            item["department_id"]
            for item in courses_by_id.values()
            if item.get("department_id")
        })
        departments_by_id = {}
        if department_ids:
            department_result = (
                admin_supabase.table("departments")
                .select("id, name")
                .in_("id", department_ids)
                .execute()
            )
            departments_by_id = {
                item["id"]: item for item in (department_result.data or [])
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
                "department_id": course.get("department_id"),
                "department_name": departments_by_id.get(
                    course.get("department_id"), {}
                ).get("name", ""),
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
        request_rows = (
            admin_supabase.table("student_course_join_requests")
            .select("id, student_profile_id, requested_at")
            .eq("section_id", section_id)
            .eq("status", "pending")
            .order("requested_at")
            .execute()
            .data
            or []
        )
        request_profile_ids = list({
            row["student_profile_id"] for row in request_rows
            if row.get("student_profile_id")
        })
        request_profiles = []
        request_users = {}
        if request_profile_ids:
            request_profiles = (
                admin_supabase.table("student_profiles")
                .select("id, user_id, student_number")
                .in_("id", request_profile_ids)
                .execute()
                .data
                or []
            )
            request_user_ids = list({
                row["user_id"] for row in request_profiles if row.get("user_id")
            })
            if request_user_ids:
                request_users = {
                    row["id"]: row for row in (
                        admin_supabase.table("users")
                        .select("id, full_name, email")
                        .in_("id", request_user_ids)
                        .execute()
                        .data
                        or []
                    )
                }
        request_profiles_by_id = {row["id"]: row for row in request_profiles}
        for join_request in request_rows:
            profile = request_profiles_by_id.get(join_request.get("student_profile_id"))
            if not profile:
                continue
            user = request_users.get(profile.get("user_id"), {})
            roster.append({
                "student_profile_id": profile["id"],
                "student_number": profile.get("student_number", ""),
                "full_name": user.get("full_name", ""),
                "email": user.get("email", ""),
                "enrollment_status": "join_pending",
                "join_request_id": join_request["id"],
                "requested_at": join_request.get("requested_at"),
            })
        return jsonify({
            "roster": roster,
            "join_requests": [row for row in roster if row.get("join_request_id")],
            "counts": {
                "total": sum(not row.get("join_request_id") for row in roster),
                "active": sum(row["enrollment_status"] == "active" for row in roster),
                "inactive": sum(
                    row["enrollment_status"] != "active" and not row.get("join_request_id")
                    for row in roster
                ),
                "join_requests": len(request_rows),
            },
        }), 200
    except Exception:
        app.logger.exception("Unable to load Faculty section roster")
        return jsonify({"error": "Class roster could not be loaded."}), 500


@app.post("/api/faculty/sections/<section_id>/join-requests/<request_id>/decision")
@require_role("faculty")
def decide_faculty_course_join_request(section_id, request_id):
    if not admin_supabase:
        return jsonify({"error": "Course join requests are unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    decision = payload.get("decision") if isinstance(payload, dict) else None
    if decision not in ("accepted", "rejected"):
        return jsonify({"error": "Choose accept or reject for this request."}), 400
    try:
        section_uuid = str(UUID(str(section_id)))
        request_uuid = str(UUID(str(request_id)))
        if not _faculty_roster_section(section_uuid):
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        result = admin_supabase.rpc(
            "review_student_course_join_request",
            {
                "p_request_id": request_uuid,
                "p_section_id": section_uuid,
                "p_faculty_user_id": str(g.authenticated_user.id),
                "p_decision": decision,
            },
        ).execute()
        return jsonify({"result": result.data}), 200
    except ValueError:
        return jsonify({"error": "The section or request ID is invalid."}), 400
    except Exception:
        app.logger.exception("Unable to review a student course join request")
        return jsonify({
            "error": (
                "The course join request could not be reviewed. Verify that "
                "database/student_course_join_requests.sql has been applied."
            )
        }), 503


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


def _student_section_scope(section_ids):
    requested_section_id = request.args.get("section_id", "").strip()
    if requested_section_id:
        if requested_section_id not in section_ids:
            return None
        return [requested_section_id]
    return section_ids


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
                "section_id": section["id"],
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


@app.post("/api/student/course-join-requests/lookup")
@require_role("student")
def lookup_student_course_for_join():
    if not admin_supabase:
        return jsonify({"error": "Course lookup is unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("course_code", "")).strip().upper() if isinstance(payload, dict) else ""
    if not code or len(code) > 24 or any(not (char.isalnum() or char in " -_./") for char in code):
        return jsonify({"error": "Enter a valid course code."}), 400
    try:
        profile = _account_profile("student", g.authenticated_user.id, "id, is_enrolled")
        if not profile or profile.get("is_enrolled") is not True:
            return jsonify({"error": "Complete an active student profile before requesting a course."}), 403
        course_rows = (
            admin_supabase.table("courses")
            .select("id, code, title")
            .ilike("code", code)
            .limit(2)
            .execute()
            .data
            or []
        )
        course = next((row for row in course_rows if row.get("code", "").casefold() == code.casefold()), None)
        if not course:
            return jsonify({"error": "No course matches that code."}), 404
        section_rows = (
            admin_supabase.table("course_sections")
            .select("id, section_name, academic_year_id, academic_term_id, faculty_id")
            .eq("course_id", course["id"])
            .not_.is_("faculty_id", "null")
            .execute()
            .data
            or []
        )
        if not section_rows:
            return jsonify({"error": "There are no sections with an assigned faculty member for this course."}), 404
        year_ids = list({row["academic_year_id"] for row in section_rows if row.get("academic_year_id")})
        term_ids = list({row["academic_term_id"] for row in section_rows if row.get("academic_term_id")})
        faculty_ids = list({row["faculty_id"] for row in section_rows if row.get("faculty_id")})
        years = {
            row["id"]: row.get("name", "")
            for row in (admin_supabase.table("academic_years").select("id, name").in_("id", year_ids).execute().data or [])
        } if year_ids else {}
        terms = {
            row["id"]: row
            for row in (admin_supabase.table("academic_terms").select("id, term_number, name").in_("id", term_ids).execute().data or [])
        } if term_ids else {}
        faculty_profiles = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id")
            .in_("id", faculty_ids)
            .execute()
            .data
            or []
        ) if faculty_ids else []
        faculty_user_ids = list({row["user_id"] for row in faculty_profiles if row.get("user_id")})
        faculty_names = {
            row["id"]: row.get("full_name", "")
            for row in (admin_supabase.table("users").select("id, full_name").in_("id", faculty_user_ids).execute().data or [])
        } if faculty_user_ids else {}
        faculty_by_profile = {row["id"]: faculty_names.get(row.get("user_id"), "") for row in faculty_profiles}
        sections = []
        for section in section_rows:
            term = terms.get(section.get("academic_term_id"), {})
            sections.append({
                "id": section["id"],
                "section_name": section.get("section_name", ""),
                "academic_year": years.get(section.get("academic_year_id"), ""),
                "term": term.get("name") or (f"Term {term['term_number']}" if term.get("term_number") else ""),
                "faculty_name": faculty_by_profile.get(section.get("faculty_id"), ""),
            })
        sections.sort(key=lambda item: (item["academic_year"], item["term"], item["section_name"]))
        return jsonify({"course": {"code": course["code"], "title": course["title"]}, "sections": sections}), 200
    except Exception:
        app.logger.exception("Unable to look up a course join request")
        return jsonify({"error": "Course sections could not be loaded."}), 500


@app.post("/api/student/course-join-requests")
@require_role("student")
def create_student_course_join_request():
    if not admin_supabase:
        return jsonify({"error": "Course join requests are unavailable."}), 503
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Join request data must be a JSON object."}), 400
    code = str(payload.get("course_code", "")).strip().upper()
    section_id = str(payload.get("section_id", "")).strip()
    try:
        profile = _account_profile("student", g.authenticated_user.id, "id, is_enrolled")
        if not profile or profile.get("is_enrolled") is not True:
            return jsonify({"error": "Complete an active student profile before requesting a course."}), 403
        section_uuid = str(UUID(section_id))
        section_rows = (
            admin_supabase.table("course_sections")
            .select("id, course_id, faculty_id")
            .eq("id", section_uuid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not section_rows or not section_rows[0].get("faculty_id"):
            return jsonify({"error": "That section is not currently available to join."}), 404
        course_rows = (
            admin_supabase.table("courses")
            .select("id, code")
            .eq("id", section_rows[0]["course_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if not course_rows or course_rows[0].get("code", "").upper() != code:
            return jsonify({"error": "The selected section does not match that course code."}), 400
        existing = (
            admin_supabase.table("enrollments")
            .select("id, enrollment_status")
            .eq("student_profile_id", profile["id"])
            .eq("section_id", section_uuid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing and existing[0].get("enrollment_status") in ("active", "completed"):
            return jsonify({"error": "You are already enrolled in this section."}), 409
        pending = (
            admin_supabase.table("student_course_join_requests")
            .select("id")
            .eq("student_profile_id", profile["id"])
            .eq("section_id", section_uuid)
            .eq("status", "pending")
            .limit(1)
            .execute()
            .data
            or []
        )
        if pending:
            return jsonify({"request_id": pending[0]["id"], "status": "pending", "already_requested": True}), 200
        result = admin_supabase.table("student_course_join_requests").insert({
            "student_profile_id": profile["id"],
            "section_id": section_uuid,
            "status": "pending",
        }).execute()
        request_row = (result.data or [{}])[0]
        return jsonify({"request_id": request_row.get("id"), "status": "pending"}), 201
    except ValueError:
        return jsonify({"error": "Choose a valid course section."}), 400
    except Exception:
        app.logger.exception("Unable to create a student course join request")
        return jsonify({
            "error": (
                "Your course request could not be saved. Verify that "
                "database/student_course_join_requests.sql has been applied."
            )
        }), 503


@app.get("/api/student/sections/<section_id>/roster")
@require_role("student")
def student_section_roster(section_id):
    if not admin_supabase:
        return jsonify({"error": "Class rosters are unavailable."}), 503

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
            return jsonify({"error": "A student profile is required to view classmates."}), 403

        student_profile_id = profiles[0]["id"]
        own_enrollment = (
            admin_supabase.table("enrollments")
            .select("id")
            .eq("section_id", section_id)
            .eq("student_profile_id", student_profile_id)
            .eq("enrollment_status", "active")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not own_enrollment:
            return jsonify({"error": "You are not actively enrolled in this section."}), 403

        section_result = (
            admin_supabase.table("course_sections")
            .select("section_name")
            .eq("id", section_id)
            .limit(1)
            .execute()
        )
        section_rows = section_result.data or []
        if not section_rows:
            return jsonify({"error": "Section not found."}), 404

        enrollment_rows = (
            admin_supabase.table("enrollments")
            .select("student_profile_id")
            .eq("section_id", section_id)
            .eq("enrollment_status", "active")
            .execute()
            .data
            or []
        )
        profile_ids = list({
            row["student_profile_id"]
            for row in enrollment_rows
            if row.get("student_profile_id")
        })
        student_profiles = []
        if profile_ids:
            profiles_result = (
                admin_supabase.table("student_profiles")
                .select("id, user_id")
                .in_("id", profile_ids)
                .execute()
            )
            student_profiles = profiles_result.data or []
        user_ids = list({
            row["user_id"]
            for row in student_profiles
            if row.get("user_id")
        })
        names_by_user_id = {}
        if user_ids:
            users_result = (
                admin_supabase.table("users")
                .select("id, full_name")
                .in_("id", user_ids)
                .execute()
            )
            names_by_user_id = {
                row["id"]: row.get("full_name", "")
                for row in (users_result.data or [])
            }
        classmates = [
            names_by_user_id[profile["user_id"]]
            for profile in student_profiles
            if profile.get("user_id") in names_by_user_id
            and names_by_user_id[profile["user_id"]]
        ]
        classmates.sort(key=str.casefold)
        return jsonify({
            "section_name": section_rows[0].get("section_name", ""),
            "classmates": classmates,
        }), 200
    except Exception:
        app.logger.exception("Unable to load Student section classmates")
        return jsonify({"error": "Classmates could not be loaded."}), 500


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


def _assessment_outcomes_by_activity(activities):
    activity_ids = [row["id"] for row in activities]
    if not activity_ids:
        return {}
    mappings = (
        admin_supabase.table("assessment_activity_course_outcomes")
        .select("assessment_activity_id, course_outcome_id")
        .in_("assessment_activity_id", activity_ids)
        .execute()
        .data
        or []
    )
    outcome_ids = list({
        row["course_outcome_id"] for row in mappings
        if row.get("course_outcome_id")
    })
    outcomes = []
    if outcome_ids:
        outcomes = (
            admin_supabase.table("course_outcomes")
            .select("id, code, description, target_percentage")
            .in_("id", outcome_ids)
            .execute()
            .data
            or []
        )
    outcome_by_id = {row["id"]: row for row in outcomes}
    by_activity = {}
    for mapping in mappings:
        outcome = outcome_by_id.get(mapping["course_outcome_id"])
        if outcome:
            by_activity.setdefault(
                mapping["assessment_activity_id"], []
            ).append(outcome)
    for activity in activities:
        linked = by_activity.get(activity["id"], [])
        activity["course_outcomes"] = linked
        activity["course_outcome_ids"] = [row["id"] for row in linked]
        activity["outcome_codes"] = [row["code"] for row in linked]
        activity["outcome_code"] = ", ".join(activity["outcome_codes"])
    return by_activity


def _normalize_assessment_outcome_ids(data, workspace):
    values = data.get("course_outcome_ids")
    if values is None:
        legacy_value = data.get("course_outcome_id")
        values = [legacy_value] if legacy_value else []
    if not isinstance(values, list) or not values:
        return None, "Select at least one Course Outcome."
    if len(values) > 50:
        return None, "An activity can be mapped to at most 50 Course Outcomes."
    outcome_ids = []
    for value in values:
        try:
            outcome_id = str(UUID(str(value)))
        except (TypeError, ValueError):
            return None, "A Course Outcome identifier is invalid."
        if outcome_id in outcome_ids:
            return None, "Duplicate Course Outcome mapping."
        outcome_ids.append(outcome_id)
    available_ids = {row["id"] for row in workspace["outcomes"]}
    if any(outcome_id not in available_ids for outcome_id in outcome_ids):
        return None, "A selected outcome does not belong to this course."
    return outcome_ids, None


ASSESSMENT_MAPPING_SETUP_ERROR = (
    "Assessment database setup is incomplete. An administrator must apply "
    "database/requirement_2_4_multi_co_assessment_mappings.sql in Supabase "
    "after the base schema and Requirement 4 migration."
)


def _is_assessment_mapping_setup_error(error):
    code = getattr(error, "code", None)
    message = str(getattr(error, "message", error)).lower()
    return (
        code == "PGRST202"
        and "create_assessment_activity_with_outcomes" in message
    ) or (
        code == "PGRST205"
        and "assessment_activity_course_outcomes" in message
    )


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
            "max_score, created_at, released_at, released_by"
        )
        .eq("section_id", section_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    _assessment_outcomes_by_activity(activities)
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
    for activity in activities:
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
    review_flags = (
        admin_supabase.table("assessment_review_flags")
        .select(
            "id, assessment_activity_id, student_profile_id, issue, "
            "description, response, status, created_at"
        )
        .eq("section_id", section_id)
        .in_("status", ["open", "responded"])
        .order("created_at", desc=True)
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
        "review_flags": review_flags,
        "gradebook_status": gradebooks[0]["status"] if gradebooks else "draft",
    }


def _set_mapping_review_status(section_id, status, reviewer_id=None):
    """Persist the section's assessment/CO/SO mapping review state."""
    record = {
        "section_id": section_id,
        "status": status,
        "reviewed_by": reviewer_id,
        "reviewed_at": datetime.now(timezone.utc).isoformat()
        if reviewer_id else None,
        "submitted_at": datetime.now(timezone.utc).isoformat()
        if status == "submitted" else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    admin_supabase.table("course_mapping_reviews").upsert(
        record, on_conflict="section_id"
    ).execute()


def _section_mapping_is_verified(section_id):
    rows = (
        admin_supabase.table("course_mapping_reviews")
        .select("status")
        .eq("section_id", section_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows and rows[0].get("status") == "verified")


ATTAINMENT_ALGORITHM_VERSION = "co-threshold-rate-v1"


def _calculate_section_attainment(section_id):
    """Calculate CO class and individual results from saved raw scores."""
    section_rows = (
        admin_supabase.table("course_sections")
        .select("id, course_id")
        .eq("id", section_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not section_rows:
        raise LookupError("Course section not found.")
    course_id = section_rows[0]["course_id"]
    outcomes = (
        admin_supabase.table("course_outcomes")
        .select("id, code, description, target_percentage")
        .eq("course_id", course_id)
        .order("code")
        .execute()
        .data
        or []
    )
    activities = (
        admin_supabase.table("assessment_activities")
        .select(
            "id, course_outcome_id, title, activity_type, max_score, released_at"
        )
        .eq("section_id", section_id)
        .execute()
        .data
        or []
    )
    _assessment_outcomes_by_activity(activities)
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
    released_activities = [
        row for row in activities if row.get("released_at")
    ]
    released_activity_ids = [row["id"] for row in released_activities]
    scores = []
    if student_ids and released_activity_ids:
        scores = (
            admin_supabase.table("raw_assessment_scores")
            .select("assessment_activity_id, student_profile_id, percentage")
            .in_("assessment_activity_id", released_activity_ids)
            .in_("student_profile_id", student_ids)
            .execute()
            .data
            or []
        )
    activity_by_id = {row["id"]: row for row in released_activities}
    scores_by_student_outcome = {}
    for score in scores:
        activity = activity_by_id.get(score.get("assessment_activity_id"))
        percentage = score.get("percentage")
        if not activity or percentage is None:
            continue
        for outcome_id in activity["course_outcome_ids"]:
            scores_by_student_outcome.setdefault(
                (score["student_profile_id"], outcome_id), []
            ).append(float(percentage))

    verified = _section_mapping_is_verified(section_id)
    # Rebuild the materialized rows so blanked/deleted scores cannot leave stale
    # attainment visible in the student or CQI views.
    admin_supabase.table("co_attainment").delete().eq(
        "section_id", section_id
    ).execute()
    admin_supabase.table("student_co_attainment").delete().eq(
        "section_id", section_id
    ).execute()
    class_records, student_records, output = [], [], []
    for outcome in outcomes:
        outcome_id = outcome["id"]
        target = float(outcome.get("target_percentage") or 70)
        individual = []
        for student_id in student_ids:
            values = scores_by_student_outcome.get((student_id, outcome_id), [])
            if not values:
                continue
            attainment = round(sum(values) / len(values), 2)
            individual.append(attainment)
            student_records.append({
                "section_id": section_id,
                "student_profile_id": student_id,
                "course_outcome_id": outcome_id,
                "attainment_percentage": attainment,
                "status": "met" if attainment >= target else "not_met",
                "can_view": verified,
                "calculated_at": datetime.now(timezone.utc).isoformat(),
            })
        contributing = [
            {"id": activity["id"], "title": activity["title"],
             "activity_type": activity["activity_type"],
             "released_at": activity.get("released_at"),
             "released": bool(activity.get("released_at"))}
            for activity in activities
            if outcome_id in activity["course_outcome_ids"]
        ]
        met_student_count = sum(
            student_attainment >= target for student_attainment in individual
        )
        class_attainment = (
            round(met_student_count / len(individual) * 100, 2)
            if individual else None
        )
        status = "awaiting_results" if class_attainment is None else (
            "met" if class_attainment >= target else (
                "needs_improvement"
                if class_attainment < target * 0.85 else "below_target"
            )
        )
        output.append({
            "course_outcome_id": outcome_id,
            "code": outcome["code"],
            "description": outcome["description"],
            "attainment_percentage": class_attainment,
            "target_percentage": target,
            "status": status if individual else "awaiting_results",
            "flagged": bool(individual and class_attainment < target),
            "student_count": len(individual),
            "met_student_count": met_student_count,
            "activities": contributing,
        })
        class_records.append({
            "section_id": section_id,
            "course_outcome_id": outcome_id,
            "attainment_percentage": class_attainment,
            "target_percentage": target,
            "status": status,
            "flagged": bool(individual and class_attainment < target),
            "version": ATTAINMENT_ALGORITHM_VERSION,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        })
    if class_records:
        admin_supabase.table("co_attainment").upsert(
            class_records, on_conflict="section_id,course_outcome_id"
        ).execute()
    if student_records:
        admin_supabase.table("student_co_attainment").upsert(
            student_records,
            on_conflict="section_id,student_profile_id,course_outcome_id",
        ).execute()
    return output


def _cqi_enrich_plans(plans):
    if not plans:
        return []
    plan_ids = [row["id"] for row in plans]
    section_ids = list({row["section_id"] for row in plans})
    sections = admin_supabase.table("course_sections").select(
        "id, course_id, section_name, faculty_id"
    ).in_("id", section_ids).execute().data or []
    section_by_id = {row["id"]: row for row in sections}
    course_ids = list({row["course_id"] for row in sections})
    courses = admin_supabase.table("courses").select(
        "id, code, title, department_id"
    ).in_("id", course_ids).execute().data if course_ids else []
    course_by_id = {row["id"]: row for row in (courses or [])}
    department_ids = list({
        row["department_id"] for row in (courses or []) if row.get("department_id")
    })
    departments = admin_supabase.table("departments").select(
        "id, name"
    ).in_("id", department_ids).execute().data if department_ids else []
    department_names = {
        row["id"]: row.get("name", "") for row in (departments or [])
    }
    faculty_profile_ids = list({
        row["faculty_id"] for row in sections if row.get("faculty_id")
    })
    faculty_profiles = admin_supabase.table("faculty_profiles").select(
        "id, user_id"
    ).in_("id", faculty_profile_ids).execute().data if faculty_profile_ids else []
    faculty_user_ids = list({
        row["user_id"] for row in (faculty_profiles or []) if row.get("user_id")
    })
    faculty_users = admin_supabase.table("users").select(
        "id, full_name"
    ).in_("id", faculty_user_ids).execute().data if faculty_user_ids else []
    faculty_names = {
        row["id"]: row.get("full_name", "") for row in (faculty_users or [])
    }
    faculty_name_by_profile = {
        row["id"]: faculty_names.get(row["user_id"], "")
        for row in (faculty_profiles or [])
    }
    targets = admin_supabase.table("cqi_action_targets").select(
        "id, cqi_action_plan_id, course_outcome_id, category_id"
    ).in_("cqi_action_plan_id", plan_ids).execute().data or []
    outcome_ids = list({row["course_outcome_id"] for row in targets})
    outcomes = admin_supabase.table("course_outcomes").select(
        "id, course_id, code, description, target_percentage"
    ).in_("id", outcome_ids).execute().data if outcome_ids else []
    outcome_by_id = {row["id"]: row for row in (outcomes or [])}
    category_ids = list({
        row["category_id"] for row in targets if row.get("category_id")
    })
    categories = admin_supabase.table("cqi_categories").select(
        "id, name"
    ).in_("id", category_ids).execute().data if category_ids else []
    category_by_id = {row["id"]: row for row in (categories or [])}
    attainment_rows = admin_supabase.table("co_attainment").select(
        "section_id, course_outcome_id, attainment_percentage, target_percentage"
    ).in_("section_id", section_ids).execute().data or []
    attainment_by_key = {
        (row["section_id"], row["course_outcome_id"]): row
        for row in attainment_rows
    }
    reviews = admin_supabase.table("cqi_reviews").select(
        "cqi_action_plan_id, decision, comments, reviewed_at"
    ).in_("cqi_action_plan_id", plan_ids).order(
        "reviewed_at", desc=True
    ).execute().data or []
    latest_review = {}
    for review in reviews:
        latest_review.setdefault(review["cqi_action_plan_id"], review)
    targets_by_plan = {}
    for target in targets:
        outcome = outcome_by_id.get(target["course_outcome_id"], {})
        plan_section = next(
            (
                plan["section_id"] for plan in plans
                if plan["id"] == target["cqi_action_plan_id"]
            ),
            None,
        )
        attainment = attainment_by_key.get(
            (plan_section, target["course_outcome_id"]), {}
        )
        targets_by_plan.setdefault(target["cqi_action_plan_id"], []).append({
            "id": target["id"],
            "course_outcome_id": target["course_outcome_id"],
            "code": outcome.get("code", ""),
            "description": outcome.get("description", ""),
            "attainment_percentage": attainment.get("attainment_percentage"),
            "target_percentage": attainment.get(
                "target_percentage", outcome.get("target_percentage")
            ),
            "category_id": target.get("category_id"),
            "category_name": category_by_id.get(
                target.get("category_id"), {}
            ).get("name"),
        })
    enriched = []
    for plan in plans:
        section = section_by_id.get(plan["section_id"], {})
        course = course_by_id.get(section.get("course_id"), {})
        review = latest_review.get(plan["id"], {})
        enriched.append({
            **plan,
            "course_id": course.get("id"),
            "course_code": course.get("code", ""),
            "course_title": course.get("title", ""),
            "department_id": course.get("department_id"),
            "department_name": department_names.get(course.get("department_id"), ""),
            "section_name": section.get("section_name", ""),
            "faculty_name": faculty_name_by_profile.get(
                plan.get("faculty_id"), ""
            ),
            "targets": targets_by_plan.get(plan["id"], []),
            "review_comments": review.get("comments", ""),
            "review_decision": review.get("decision"),
            "reviewed_at": review.get("reviewed_at"),
        })
    return enriched


def _cqi_validate_plan_data(data, section_id=None):
    if not isinstance(data, dict):
        raise ValueError("CQI plan data must be a JSON object.")
    try:
        section_id = str(UUID(str(data.get("section_id") or section_id or "")))
        course_outcome_id = str(UUID(str(data.get("course_outcome_id") or "")))
        category_id = (
            str(UUID(str(data["category_id"]))) if data.get("category_id") else None
        )
    except (TypeError, ValueError):
        raise ValueError("Choose a valid course section and Course Outcome.")
    title = data.get("title", "")
    problem = data.get("problem_statement", "")
    intervention = data.get("proposed_intervention", "")
    expected = data.get("expected_improvement", "")
    target_date = data.get("target_date") or None
    status = data.get("status", "draft")
    if not isinstance(status, str):
        raise ValueError("CQI plan status must be Draft or Submitted.")
    for value, label, maximum, required in (
        (title, "Plan title", 160, True),
        (problem, "Outcome concern", 2000, True),
        (intervention, "Proposed intervention", 3000, True),
        (expected, "Expected improvement", 2000, False),
    ):
        if not isinstance(value, str) or (required and not value.strip()) or len(value.strip()) > maximum:
            qualifier = "1 to " if required else "at most "
            raise ValueError(f"{label} must contain {qualifier}{maximum} characters.")
    if status not in {"draft", "submitted"}:
        raise ValueError("CQI plan status must be Draft or Submitted.")
    if target_date:
        if not isinstance(target_date, str):
            raise ValueError("Target date must use YYYY-MM-DD format.")
        try:
            datetime.strptime(target_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Target date must use YYYY-MM-DD format.")
    return {
        "section_id": section_id,
        "course_outcome_id": course_outcome_id,
        "category_id": category_id,
        "title": title.strip(),
        "problem_statement": problem.strip(),
        "proposed_intervention": intervention.strip(),
        "expected_improvement": expected.strip() or None,
        "target_date": target_date,
        "status": status,
    }


def _cqi_validate_target(section_id, course_outcome_id, category_id):
    section = admin_supabase.table("course_sections").select(
        "id, course_id"
    ).eq("id", section_id).limit(1).execute().data or []
    if not section:
        raise LookupError("Section not found.")
    mapping_reviews = admin_supabase.table("course_mapping_reviews").select(
        "status"
    ).eq("section_id", section_id).limit(1).execute().data or []
    if not mapping_reviews or mapping_reviews[0].get("status") != "verified":
        raise ValueError(
            "CQI planning requires Department Head verification of the section's CO–SO mappings."
        )
    outcomes = admin_supabase.table("course_outcomes").select(
        "id, code, target_percentage"
    ).eq("id", course_outcome_id).eq(
        "course_id", section[0]["course_id"]
    ).limit(1).execute().data or []
    if not outcomes:
        raise ValueError("Choose a Course Outcome from this section's course.")
    if category_id:
        categories = admin_supabase.table("cqi_categories").select(
            "id"
        ).eq("id", category_id).eq("is_active", True).limit(1).execute().data or []
        if not categories:
            raise ValueError("Choose an active CQI intervention category.")
    attainment = {
        row["course_outcome_id"]: row
        for row in _calculate_section_attainment(section_id)
    }.get(course_outcome_id)
    if not attainment or attainment.get("attainment_percentage") is None:
        raise ValueError("Attainment is not available for this Course Outcome yet.")
    if attainment["attainment_percentage"] >= attainment["target_percentage"]:
        raise ValueError("CQI plans can only target Course Outcomes below their attainment target.")
    return section[0], outcomes[0], attainment


@app.get("/api/faculty/cqi")
@require_role("faculty")
def get_faculty_cqi_workspace():
    if not admin_supabase:
        return jsonify({"error": "CQI planning is unavailable."}), 503
    try:
        profile = _account_profile("faculty", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"error": "Your Faculty profile is incomplete."}), 409
        plans = admin_supabase.table("cqi_action_plans").select(
            "*"
        ).eq("faculty_id", profile["id"]).order("updated_at", desc=True).execute().data or []
        section_rows = admin_supabase.table("course_sections").select(
            "id, course_id, section_name, academic_year_id"
        ).eq("faculty_id", profile["id"]).execute().data or []
        course_ids = list({row["course_id"] for row in section_rows})
        courses = admin_supabase.table("courses").select(
            "id, code, title"
        ).in_("id", course_ids).execute().data if course_ids else []
        course_by_id = {row["id"]: row for row in (courses or [])}
        sections = [
            {
                **row,
                "course_code": course_by_id.get(row["course_id"], {}).get("code", ""),
                "course_title": course_by_id.get(row["course_id"], {}).get("title", ""),
            }
            for row in section_rows
        ]
        categories = admin_supabase.table("cqi_categories").select(
            "id, name, description"
        ).eq("is_active", True).order("name").execute().data or []
        return jsonify({
            "sections": sections,
            "categories": categories,
            "plans": _cqi_enrich_plans(plans),
        }), 200
    except Exception:
        app.logger.exception("Unable to load Faculty CQI workspace")
        return jsonify({"error": "CQI plans could not be loaded."}), 500


@app.get("/api/faculty/cqi/sections/<section_id>/outcomes")
@require_role("faculty")
def get_faculty_cqi_outcomes(section_id):
    if not admin_supabase:
        return jsonify({"error": "CQI outcome options are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        if not get_faculty_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        mapping_reviews = admin_supabase.table("course_mapping_reviews").select(
            "status"
        ).eq("section_id", section_id).limit(1).execute().data or []
        if not mapping_reviews or mapping_reviews[0].get("status") != "verified":
            return jsonify({
                "outcomes": [],
                "readiness": {
                    "can_plan": False,
                    "mapping_status": "pending_review",
                    "message": (
                        "CQI planning is available after the Department Head verifies "
                        "this section's CO–SO mappings."
                    ),
                },
            }), 200
        outcomes = _calculate_section_attainment(section_id)
        eligible_outcomes = [
            row for row in outcomes
            if row.get("attainment_percentage") is not None
            and row["attainment_percentage"] < row["target_percentage"]
        ]
        return jsonify({
            "outcomes": eligible_outcomes,
            "readiness": {
                "can_plan": bool(eligible_outcomes),
                "mapping_status": "verified",
                "message": (
                    "Attainment uses released assessment results. Results may change until the gradebook is locked."
                    if eligible_outcomes
                    else "No below-target Course Outcomes with released assessment results are available for this section."
                ),
            },
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to load Faculty CQI outcome options")
        return jsonify({"error": "Course Outcome attainment could not be loaded."}), 500


@app.post("/api/faculty/cqi")
@require_role("faculty")
def create_faculty_cqi_plan():
    if not admin_supabase:
        return jsonify({"error": "CQI planning is unavailable."}), 503
    plan_id = None
    try:
        profile = _account_profile("faculty", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"error": "Your Faculty profile is incomplete."}), 409
        data = _cqi_validate_plan_data(request.get_json(silent=True))
        if not get_faculty_section(data["section_id"]):
            return jsonify({"error": "Section is not assigned to you."}), 403
        _, _, _ = _cqi_validate_target(
            data["section_id"], data["course_outcome_id"], data["category_id"]
        )
        plan_fields = {key: value for key, value in data.items() if key not in {
            "course_outcome_id", "category_id",
        }}
        if plan_fields["status"] == "submitted":
            plan_fields["submitted_at"] = datetime.now(timezone.utc).isoformat()
        result = admin_supabase.table("cqi_action_plans").insert({
            **plan_fields, "faculty_id": profile["id"],
        }).execute()
        plans = result.data or []
        if not plans:
            raise RuntimeError("CQI plan insert returned no record.")
        plan_id = plans[0]["id"]
        admin_supabase.table("cqi_action_targets").insert({
            "cqi_action_plan_id": plan_id,
            "course_outcome_id": data["course_outcome_id"],
            "category_id": data["category_id"],
        }).execute()
        return jsonify({"plan": _cqi_enrich_plans(plans)[0]}), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except LookupError as error:
        return jsonify({"error": str(error)}), 404
    except Exception:
        if plan_id:
            try:
                admin_supabase.table("cqi_action_plans").delete().eq(
                    "id", plan_id
                ).execute()
            except Exception:
                app.logger.exception("Unable to roll back incomplete CQI plan")
        app.logger.exception("Unable to create Faculty CQI plan")
        return jsonify({"error": "CQI plan could not be saved."}), 500


@app.put("/api/faculty/cqi/<plan_id>")
@require_role("faculty")
def update_faculty_cqi_plan(plan_id):
    if not admin_supabase:
        return jsonify({"error": "CQI planning is unavailable."}), 503
    try:
        plan_id = str(UUID(plan_id))
        profile = _account_profile("faculty", g.authenticated_user.id, "id")
        existing = admin_supabase.table("cqi_action_plans").select(
            "id, faculty_id, status"
        ).eq("id", plan_id).limit(1).execute().data or []
        if not existing or not profile or existing[0]["faculty_id"] != profile["id"]:
            return jsonify({"error": "CQI plan not found."}), 404
        if existing[0]["status"] not in {"draft", "returned"}:
            return jsonify({"error": "Only draft or returned CQI plans can be edited."}), 409
        data = _cqi_validate_plan_data(request.get_json(silent=True))
        if not get_faculty_section(data["section_id"]):
            return jsonify({"error": "Section is not assigned to you."}), 403
        _cqi_validate_target(
            data["section_id"], data["course_outcome_id"], data["category_id"]
        )
        admin_supabase.rpc("update_cqi_action_plan_with_target", {
            "p_plan_id": plan_id,
            "p_faculty_id": profile["id"],
            "p_section_id": data["section_id"],
            "p_title": data["title"],
            "p_problem_statement": data["problem_statement"],
            "p_proposed_intervention": data["proposed_intervention"],
            "p_expected_improvement": data["expected_improvement"],
            "p_target_date": data["target_date"],
            "p_status": data["status"],
            "p_submitted_at": (
                datetime.now(timezone.utc).isoformat()
                if data["status"] == "submitted" else None
            ),
            "p_course_outcome_id": data["course_outcome_id"],
            "p_category_id": data["category_id"],
        }).execute()
        updated = admin_supabase.table("cqi_action_plans").select(
            "*"
        ).eq("id", plan_id).limit(1).execute().data or []
        if not updated:
            raise RuntimeError("Updated CQI plan could not be reloaded.")
        return jsonify({"plan": _cqi_enrich_plans(updated)[0]}), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Unable to update Faculty CQI plan")
        return jsonify({"error": "CQI plan could not be updated."}), 500


@app.delete("/api/faculty/cqi/<plan_id>")
@require_role("faculty")
def delete_faculty_cqi_plan(plan_id):
    if not admin_supabase:
        return jsonify({"error": "CQI planning is unavailable."}), 503
    try:
        plan_id = str(UUID(plan_id))
        profile = _account_profile("faculty", g.authenticated_user.id, "id")
        plans = admin_supabase.table("cqi_action_plans").select(
            "id, faculty_id, status"
        ).eq("id", plan_id).limit(1).execute().data or []
        if not plans or not profile or plans[0]["faculty_id"] != profile["id"]:
            return jsonify({"error": "CQI plan not found."}), 404
        if plans[0]["status"] not in {"draft", "returned"}:
            return jsonify({"error": "Only draft or returned CQI plans can be deleted."}), 409
        admin_supabase.table("cqi_action_plans").delete().eq(
            "id", plan_id
        ).execute()
        return jsonify({"status": "deleted"}), 200
    except ValueError:
        return jsonify({"error": "Invalid CQI plan ID."}), 400
    except Exception:
        app.logger.exception("Unable to delete Faculty CQI plan")
        return jsonify({"error": "CQI plan could not be deleted."}), 500


@app.post("/api/faculty/cqi/<plan_id>/progress")
@require_role("faculty")
def update_faculty_cqi_progress(plan_id):
    if not admin_supabase:
        return jsonify({"error": "CQI progress tracking is unavailable."}), 503
    try:
        plan_id = str(UUID(plan_id))
        profile = _account_profile("faculty", g.authenticated_user.id, "id")
        plans = admin_supabase.table("cqi_action_plans").select(
            "id, faculty_id, status"
        ).eq("id", plan_id).limit(1).execute().data or []
        if not plans or not profile or plans[0]["faculty_id"] != profile["id"]:
            return jsonify({"error": "CQI plan not found."}), 404
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Progress status must be a JSON object."}), 400
        next_status = data.get("status")
        allowed = {
            "approved": {"ongoing"},
            "ongoing": {"completed"},
        }
        current_status = plans[0]["status"]
        if next_status not in allowed.get(current_status, set()):
            return jsonify({"error": "CQI progress can only move from Approved to Ongoing to Completed."}), 409
        updated = admin_supabase.table("cqi_action_plans").update({
            "status": next_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", plan_id).execute().data or []
        return jsonify({"plan": updated[0] if updated else None}), 200
    except ValueError:
        return jsonify({"error": "Invalid CQI plan ID."}), 400
    except Exception:
        app.logger.exception("Unable to update CQI progress")
        return jsonify({"error": "CQI progress could not be updated."}), 500


@app.get("/api/department-head/cqi")
@require_role("department-head")
def get_department_head_cqi_register():
    if not admin_supabase:
        return jsonify({"error": "Department CQI register is unavailable."}), 503
    try:
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        courses = admin_supabase.table("courses").select(
            "id"
        ).eq("department_id", department_id).execute().data or []
        course_ids = [row["id"] for row in courses]
        sections = admin_supabase.table("course_sections").select(
            "id"
        ).in_("course_id", course_ids).execute().data if course_ids else []
        section_ids = [row["id"] for row in (sections or [])]
        plans = admin_supabase.table("cqi_action_plans").select(
            "*"
        ).in_("section_id", section_ids).order(
            "updated_at", desc=True
        ).execute().data if section_ids else []
        return jsonify({"plans": _cqi_enrich_plans(plans or [])}), 200
    except Exception:
        app.logger.exception("Unable to load Department Head CQI register")
        return jsonify({"error": "Department CQI records could not be loaded."}), 500


@app.post("/api/department-head/cqi/<plan_id>/review")
@require_role("department-head")
def review_department_head_cqi_plan(plan_id):
    if not admin_supabase:
        return jsonify({"error": "CQI review is unavailable."}), 503
    try:
        plan_id = str(UUID(plan_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        plans = admin_supabase.table("cqi_action_plans").select(
            "id, section_id, status"
        ).eq("id", plan_id).limit(1).execute().data or []
        if not plans:
            return jsonify({"error": "CQI plan not found."}), 404
        section = admin_supabase.table("course_sections").select(
            "id, course_id"
        ).eq("id", plans[0]["section_id"]).limit(1).execute().data or []
        course = admin_supabase.table("courses").select(
            "id"
        ).eq("id", section[0]["course_id"]).eq(
            "department_id", department_id
        ).limit(1).execute().data if section else []
        if not course:
            return jsonify({"error": "CQI plan is outside your department."}), 403
        if plans[0]["status"] != "submitted":
            return jsonify({"error": "Only submitted CQI plans can be reviewed."}), 409
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or data.get("decision") not in {"approved", "returned"}:
            return jsonify({"error": "Choose Approve or Return for Revision."}), 400
        comments = data.get("comments", "")
        if not isinstance(comments, str) or len(comments.strip()) > 2000:
            return jsonify({"error": "Review comments must be at most 2,000 characters."}), 400
        decision = data["decision"]
        if decision == "returned" and not comments.strip():
            return jsonify({"error": "Feedback is required when returning a plan."}), 400
        result = admin_supabase.rpc("review_cqi_action_plan", {
            "p_plan_id": plan_id,
            "p_reviewed_by": str(g.authenticated_user.id),
            "p_decision": decision,
            "p_comments": comments.strip() or None,
        }).execute()
        updated = result.data
        if isinstance(updated, list):
            updated = updated[0] if updated else None
        if not updated:
            raise RuntimeError("CQI review returned no updated plan.")
        return jsonify({"plan": _cqi_enrich_plans([updated])[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid CQI plan ID."}), 400
    except Exception as error:
        if "Only submitted CQI plans" in str(error):
            return jsonify({"error": "Only submitted CQI plans can be reviewed."}), 409
        app.logger.exception("Unable to review Department Head CQI plan")
        return jsonify({"error": "CQI review could not be saved."}), 500


@app.get("/api/student/cqi")
@require_role("student")
def get_student_cqi_actions():
    if not admin_supabase:
        return jsonify({"error": "CQI actions are unavailable."}), 503
    try:
        profile = _account_profile("student", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"plans": []}), 200
        enrollments = admin_supabase.table("enrollments").select(
            "section_id"
        ).eq("student_profile_id", profile["id"]).eq(
            "enrollment_status", "active"
        ).execute().data or []
        section_ids = list({row["section_id"] for row in enrollments})
        plans = admin_supabase.table("cqi_action_plans").select(
            "*"
        ).in_("section_id", section_ids).in_(
            "status", ["approved", "ongoing", "completed"]
        ).order("updated_at", desc=True).execute().data if section_ids else []
        return jsonify({"plans": _cqi_enrich_plans(plans or [])}), 200
    except Exception:
        app.logger.exception("Unable to load student CQI actions")
        return jsonify({"error": "Approved CQI actions could not be loaded."}), 500


@app.get("/api/admin/cqi")
@require_role("admin-security")
def get_admin_cqi_register():
    if not admin_supabase:
        return jsonify({"error": "System CQI register is unavailable."}), 503
    try:
        plans = admin_supabase.table("cqi_action_plans").select(
            "*"
        ).order("updated_at", desc=True).limit(1000).execute().data or []
        categories = admin_supabase.table("cqi_categories").select(
            "id, name, description, is_active"
        ).order("name").execute().data or []
        target_rows = admin_supabase.table("cqi_action_targets").select(
            "category_id"
        ).execute().data or []
        category_plan_counts = {}
        for row in target_rows:
            if not row.get("category_id"):
                continue
            category_plan_counts[row["category_id"]] = (
                category_plan_counts.get(row["category_id"], 0) + 1
            )
        categories = [
            {**category, "plan_count": category_plan_counts.get(category["id"], 0)}
            for category in categories
        ]
        return jsonify({
            "plans": _cqi_enrich_plans(plans),
            "categories": categories,
        }), 200
    except Exception:
        app.logger.exception("Unable to load Admin CQI register")
        return jsonify({"error": "System CQI records could not be loaded."}), 500


@app.post("/api/admin/cqi/categories")
@require_role("admin-security")
def create_admin_cqi_category():
    if not admin_supabase:
        return jsonify({"error": "CQI category management is unavailable."}), 503
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Category data must be a JSON object."}), 400
    name, description = data.get("name"), data.get("description", "")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        return jsonify({"error": "Category name must contain 1 to 80 characters."}), 400
    if not isinstance(description, str) or len(description.strip()) > 500:
        return jsonify({"error": "Category description must be at most 500 characters."}), 400
    try:
        rows = admin_supabase.table("cqi_categories").insert({
            "name": name.strip(),
            "description": description.strip() or None,
            "is_active": True,
        }).execute().data or []
        if not rows:
            raise RuntimeError("CQI category insert returned no record.")
        return jsonify({"category": rows[0]}), 201
    except Exception as error:
        if "duplicate key" in str(error).lower() or "unique" in str(error).lower():
            return jsonify({"error": "A CQI category with that name already exists."}), 409
        app.logger.exception("Unable to create Admin CQI category")
        return jsonify({"error": "CQI category could not be saved."}), 500


@app.patch("/api/admin/cqi/categories/<category_id>")
@require_role("admin-security")
def update_admin_cqi_category(category_id):
    if not admin_supabase:
        return jsonify({"error": "CQI category management is unavailable."}), 503
    try:
        category_id = str(UUID(category_id))
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("is_active"), bool):
            return jsonify({"error": "Provide a valid category status."}), 400
        rows = admin_supabase.table("cqi_categories").update({
            "is_active": data["is_active"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", category_id).execute().data or []
        if not rows:
            return jsonify({"error": "CQI category not found."}), 404
        return jsonify({"category": rows[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid CQI category ID."}), 400
    except Exception:
        app.logger.exception("Unable to update Admin CQI category")
        return jsonify({"error": "CQI category could not be updated."}), 500


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
    except Exception as error:
        if _is_assessment_mapping_setup_error(error):
            return jsonify({"error": ASSESSMENT_MAPPING_SETUP_ERROR}), 503
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
        if not isinstance(title, str) or not isinstance(activity_type, str):
            return jsonify({"error": "Assessment title and type must be text."}), 400
        title = title.strip()
        activity_type = activity_type.strip()
        due_date = str(data.get("due_date", "")).strip() or None
        outcome_ids, mapping_error = _normalize_assessment_outcome_ids(
            data, workspace
        )
        if mapping_error:
            return jsonify({"error": mapping_error}), 400
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
        result = admin_supabase.rpc(
            "create_assessment_activity_with_outcomes",
            {
                "p_section_id": section_id,
                "p_title": title,
                "p_activity_type": activity_type,
                "p_due_date": due_date,
                "p_max_score": max_score,
                "p_course_outcome_ids": outcome_ids,
            },
        ).execute()
        activity_id = result.data
        if isinstance(activity_id, list):
            activity_id = activity_id[0] if activity_id else None
        if isinstance(activity_id, dict):
            activity_id = next(iter(activity_id.values()), None)
        if not activity_id:
            raise RuntimeError("Assessment insert returned no saved record.")
        rows = (
            admin_supabase.table("assessment_activities")
            .select(
                "id, section_id, course_outcome_id, title, activity_type, "
                "due_date, max_score, created_at, released_at"
            )
            .eq("id", str(activity_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise RuntimeError("Assessment insert returned no saved record.")
        rows[0]["course_outcome_ids"] = outcome_ids
        _set_mapping_review_status(section_id, "pending")
        _calculate_section_attainment(section_id)
        return jsonify({"assessment": rows[0]}), 201
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception as error:
        if "gradebook is locked" in str(error).lower():
            return jsonify({"error": "This section's gradebook is locked."}), 409
        if _is_assessment_mapping_setup_error(error):
            return jsonify({"error": ASSESSMENT_MAPPING_SETUP_ERROR}), 503
        app.logger.exception("Unable to create faculty assessment")
        return jsonify({"error": "Assessment could not be created."}), 500


@app.put("/api/faculty/assessments/<assessment_id>")
@require_role("faculty")
def update_faculty_assessment(assessment_id):
    if not admin_supabase:
        return jsonify({"error": "Assessments are unavailable."}), 503
    try:
        assessment_id = str(UUID(assessment_id))
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, section_id")
            .eq("id", assessment_id).limit(1).execute().data or []
        )
        if not activities:
            return jsonify({"error": "Assessment not found."}), 404
        section_id = activities[0]["section_id"]
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Assessment is not in a section assigned to you."}), 403
        if workspace["gradebook_status"] == "locked":
            return jsonify({"error": "This section's gradebook is locked."}), 409
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Assessment data must be a JSON object."}), 400
        title = data.get("title", "")
        activity_type = data.get("activity_type", "")
        if not isinstance(title, str) or not isinstance(activity_type, str):
            return jsonify({"error": "Assessment title and type must be text."}), 400
        title, activity_type = title.strip(), activity_type.strip()
        if not title or len(title) > 120:
            return jsonify({"error": "Assessment title must contain 1 to 120 characters."}), 400
        if activity_type not in {"Quiz", "Major Exam", "Laboratory", "Assignment", "Other"}:
            return jsonify({"error": "Choose a valid assessment type."}), 400
        outcome_ids, mapping_error = _normalize_assessment_outcome_ids(
            data, workspace
        )
        if mapping_error:
            return jsonify({"error": mapping_error}), 400
        if isinstance(data.get("max_score"), bool):
            return jsonify({"error": "Maximum score must be a number."}), 400
        try:
            max_score = float(data.get("max_score"))
        except (TypeError, ValueError):
            return jsonify({"error": "Maximum score must be a number."}), 400
        if not math.isfinite(max_score) or not 0 < max_score <= 10000:
            return jsonify({"error": "Maximum score must be greater than 0 and at most 10,000."}), 400
        due_date = str(data.get("due_date", "")).strip() or None
        if due_date:
            try:
                datetime.strptime(due_date, "%Y-%m-%d")
            except ValueError:
                return jsonify({"error": "Due date must use YYYY-MM-DD format."}), 400
        result = admin_supabase.rpc(
            "update_assessment_activity_with_outcomes",
            {
                "p_assessment_activity_id": assessment_id,
                "p_title": title,
                "p_activity_type": activity_type,
                "p_due_date": due_date,
                "p_max_score": max_score,
                "p_course_outcome_ids": outcome_ids,
            },
        ).execute()
        updated_id = result.data
        if isinstance(updated_id, list):
            updated_id = updated_id[0] if updated_id else None
        if isinstance(updated_id, dict):
            updated_id = next(iter(updated_id.values()), None)
        if not updated_id:
            return jsonify({"error": "Assessment could not be updated."}), 404
        rows = (
            admin_supabase.table("assessment_activities")
            .select(
                "id, section_id, course_outcome_id, title, activity_type, "
                "due_date, max_score, created_at, released_at"
            )
            .eq("id", assessment_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return jsonify({"error": "Assessment could not be updated."}), 404
        rows[0]["course_outcome_ids"] = outcome_ids
        _set_mapping_review_status(section_id, "pending")
        _calculate_section_attainment(section_id)
        return jsonify({"assessment": rows[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception as error:
        if "gradebook is locked" in str(error).lower():
            return jsonify({"error": "This section's gradebook is locked."}), 409
        if "maximum score cannot be lower" in str(error).lower():
            return jsonify({
                "error": "Maximum score cannot be lower than a score already entered."
            }), 409
        if _is_assessment_mapping_setup_error(error):
            return jsonify({"error": ASSESSMENT_MAPPING_SETUP_ERROR}), 503
        app.logger.exception("Unable to update faculty assessment")
        return jsonify({"error": "Assessment could not be updated."}), 500


@app.delete("/api/faculty/assessments/<assessment_id>")
@require_role("faculty")
def delete_faculty_assessment(assessment_id):
    if not admin_supabase:
        return jsonify({"error": "Assessments are unavailable."}), 503
    try:
        assessment_id = str(UUID(assessment_id))
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, section_id")
            .eq("id", assessment_id).limit(1).execute().data or []
        )
        if not activities:
            return jsonify({"error": "Assessment not found."}), 404
        section_id = activities[0]["section_id"]
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Assessment is not in a section assigned to you."}), 403
        if workspace["gradebook_status"] == "locked":
            return jsonify({"error": "This section's gradebook is locked."}), 409
        admin_supabase.table("assessment_activities").delete().eq(
            "id", assessment_id
        ).execute()
        _set_mapping_review_status(section_id, "pending")
        _calculate_section_attainment(section_id)
        return jsonify({"status": "deleted"}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception as error:
        if _is_assessment_mapping_setup_error(error):
            return jsonify({"error": ASSESSMENT_MAPPING_SETUP_ERROR}), 503
        app.logger.exception("Unable to delete faculty assessment")
        return jsonify({"error": "Assessment could not be deleted."}), 500


@app.post("/api/faculty/sections/<section_id>/submit-mappings")
@require_role("faculty")
def submit_faculty_section_mappings(section_id):
    if not admin_supabase:
        return jsonify({"error": "Mapping review is unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        syllabi = (
            admin_supabase.table("course_syllabi")
            .select("section_id").eq("section_id", section_id)
            .limit(1).execute().data or []
        )
        if not syllabi:
            return jsonify({"error": "Upload the course syllabus before submitting mappings."}), 409
        unmapped_activities = [
            activity["title"] for activity in workspace["assessments"]
            if not activity["course_outcome_ids"]
        ]
        if unmapped_activities:
            return jsonify({
                "error": "Map every activity to at least one Course Outcome before submitting: "
                + ", ".join(unmapped_activities)
            }), 409
        outcome_ids = [row["id"] for row in workspace["outcomes"]]
        mappings = []
        if outcome_ids:
            mappings = (
                admin_supabase.table("course_outcome_student_outcomes")
                .select("course_outcome_id")
                .in_("course_outcome_id", outcome_ids).execute().data or []
            )
        mapped_outcome_ids = {row["course_outcome_id"] for row in mappings}
        unmapped = [row["code"] for row in workspace["outcomes"] if row["id"] not in mapped_outcome_ids]
        if unmapped:
            return jsonify({
                "error": "Map every Course Outcome to at least one Student Outcome before submitting: " + ", ".join(unmapped)
            }), 409
        _set_mapping_review_status(section_id, "submitted")
        return jsonify({"status": "submitted"}), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to submit section mappings for review")
        return jsonify({"error": "Mappings could not be submitted."}), 500


@app.put("/api/faculty/courses/<course_id>/outcome-mappings")
@require_role("faculty")
def save_faculty_outcome_mappings(course_id):
    if not admin_supabase:
        return jsonify({"error": "Outcome mappings are unavailable."}), 503
    try:
        course_id = str(UUID(course_id))
        assigned_sections = (
            admin_supabase.table("course_sections")
            .select("id")
            .eq("course_id", course_id)
            .execute().data or []
        )
        owned_section_ids = [
            row["id"] for row in assigned_sections
            if get_faculty_section(row["id"])
        ]
        if not owned_section_ids:
            return jsonify({"error": "Course is not assigned to you."}), 403
        data = request.get_json(silent=True) or {}
        mappings = data.get("mappings") if isinstance(data, dict) else None
        if not isinstance(mappings, list) or len(mappings) > 200:
            return jsonify({"error": "Provide a valid list of CO/SO mappings."}), 400
        outcomes = (
            admin_supabase.table("course_outcomes")
            .select("id, code").eq("course_id", course_id).execute().data or []
        )
        outcome_ids = {
            row["id"] for row in outcomes
            if row["code"] in FIXED_COURSE_OUTCOME_CODES
        }
        student_outcomes = (
            admin_supabase.table("student_outcomes")
            .select("id, code").execute().data or []
        )
        student_outcome_ids = {
            row["id"] for row in student_outcomes
            if row["code"] in FIXED_STUDENT_OUTCOME_CODES
        }
        normalized, seen = [], set()
        for item in mappings:
            if not isinstance(item, dict):
                return jsonify({"error": "Each mapping must be an object."}), 400
            try:
                co_id = str(UUID(str(item.get("course_outcome_id", ""))))
                so_id = str(UUID(str(item.get("student_outcome_id", ""))))
            except (TypeError, ValueError):
                return jsonify({"error": "A CO or SO identifier is invalid."}), 400
            pair = (co_id, so_id)
            if co_id not in outcome_ids or so_id not in student_outcome_ids:
                return jsonify({"error": "A mapping references an outcome outside this syllabus."}), 400
            if pair in seen:
                return jsonify({"error": "Duplicate CO/SO mapping."}), 400
            seen.add(pair)
            normalized.append({
                "course_outcome_id": co_id,
                "student_outcome_id": so_id,
            })
        if outcome_ids and student_outcome_ids:
            admin_supabase.table("course_outcome_student_outcomes").delete().in_(
                "course_outcome_id", list(outcome_ids)
            ).in_("student_outcome_id", list(student_outcome_ids)).execute()
        if normalized:
            admin_supabase.table("course_outcome_student_outcomes").insert(
                normalized
            ).execute()
        for section_id in owned_section_ids:
            _set_mapping_review_status(section_id, "pending")
        return jsonify({"saved_count": len(normalized)}), 200
    except ValueError:
        return jsonify({"error": "Invalid course ID."}), 400
    except Exception:
        app.logger.exception("Unable to save faculty CO/SO mappings")
        return jsonify({"error": "Outcome mappings could not be saved."}), 500


@app.get("/api/faculty/courses/<course_id>/outcome-mappings")
@require_role("faculty")
def get_faculty_outcome_mappings(course_id):
    if not admin_supabase:
        return jsonify({"error": "Outcome mappings are unavailable."}), 503
    try:
        course_id = str(UUID(course_id))
        sections = (
            admin_supabase.table("course_sections")
            .select("id").eq("course_id", course_id).execute().data or []
        )
        if not any(get_faculty_section(row["id"]) for row in sections):
            return jsonify({"error": "Course is not assigned to you."}), 403
        outcomes = (
            admin_supabase.table("course_outcomes")
            .select("id, code, description, target_percentage")
            .eq("course_id", course_id).order("code").execute().data or []
        )
        outcomes = [
            {
                **row,
                "description": FIXED_COURSE_OUTCOME_DESCRIPTIONS[row["code"]],
            }
            for row in outcomes if row["code"] in FIXED_COURSE_OUTCOME_DESCRIPTIONS
        ]
        used_codes = {row["code"] for row in outcomes}
        next_code = next(
            (code for code in FIXED_COURSE_OUTCOME_CODES if code not in used_codes),
            None,
        )
        student_outcomes = (
            admin_supabase.table("student_outcomes")
            .select("id, code, description").order("code").execute().data or []
        )
        student_outcomes = [
            {**row, "description": row["description"] if row["description"] != row["code"] else ""}
            for row in student_outcomes if row["code"] in FIXED_STUDENT_OUTCOME_CODES
        ]
        student_outcomes.sort(
            key=lambda row: FIXED_STUDENT_OUTCOME_CODES.index(row["code"])
        )
        outcome_ids = [row["id"] for row in outcomes]
        mappings = []
        if outcome_ids:
            mappings = (
                admin_supabase.table("course_outcome_student_outcomes")
                .select("course_outcome_id, student_outcome_id")
                .in_("course_outcome_id", outcome_ids).execute().data or []
            )
        fixed_student_outcome_ids = {row["id"] for row in student_outcomes}
        mappings = [
            row for row in mappings
            if row["student_outcome_id"] in fixed_student_outcome_ids
        ]
        return jsonify({
            "outcomes": outcomes,
            "next_course_outcome": {
                "code": next_code,
                "description": FIXED_COURSE_OUTCOME_DESCRIPTIONS[next_code],
            } if next_code else None,
            "student_outcomes": student_outcomes,
            "mappings": mappings,
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid course ID."}), 400
    except Exception:
        app.logger.exception("Unable to load faculty CO/SO mappings")
        return jsonify({"error": "Outcome mappings could not be loaded."}), 500


@app.post("/api/faculty/courses/<course_id>/outcomes")
@require_role("faculty")
def create_faculty_course_outcome(course_id):
    try:
        course_id = str(UUID(course_id))
        assigned = admin_supabase.table("course_sections").select("id").eq(
            "course_id", course_id
        ).execute().data or []
        if not any(get_faculty_section(row["id"]) for row in assigned):
            return jsonify({"error": "Course is not assigned to you."}), 403
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Provide a valid Course Outcome request."}), 400
        if "code" in data or "description" in data:
            return jsonify({"error": "Course Outcome codes and descriptions are fixed."}), 400
        target = data.get("target_percentage", 70)
        if isinstance(target, bool):
            return jsonify({"error": "Target must be a percentage."}), 400
        target = float(target)
        if not math.isfinite(target) or not 0 <= target <= 100:
            return jsonify({"error": "Target must be from 0 to 100."}), 400
        existing = admin_supabase.table("course_outcomes").select(
            "code"
        ).eq("course_id", course_id).execute().data or []
        used_codes = {row["code"] for row in existing if row["code"] in FIXED_COURSE_OUTCOME_CODES}
        code = next(
            (candidate for candidate in FIXED_COURSE_OUTCOME_CODES
             if candidate not in used_codes),
            None,
        )
        if code is None:
            return jsonify({"error": "This course already has all ten Course Outcomes."}), 409
        rows = admin_supabase.table("course_outcomes").insert({
            "course_id": course_id, "code": code,
            "description": FIXED_COURSE_OUTCOME_DESCRIPTIONS[code],
            "target_percentage": target,
        }).execute().data or []
        for section_row in assigned:
            if get_faculty_section(section_row["id"]):
                _set_mapping_review_status(section_row["id"], "pending")
        return jsonify({"outcome": rows[0]}), 201
    except ValueError:
        return jsonify({"error": "Invalid course ID or target."}), 400
    except Exception as error:
        if "duplicate key" in str(error).lower():
            return jsonify({"error": "That CO code already exists for this course."}), 409
        app.logger.exception("Unable to create faculty Course Outcome")
        return jsonify({"error": "Course Outcome could not be created."}), 500


@app.put("/api/faculty/courses/<course_id>/outcomes/<outcome_id>")
@require_role("faculty")
def update_faculty_course_outcome(course_id, outcome_id):
    try:
        course_id, outcome_id = str(UUID(course_id)), str(UUID(outcome_id))
        assigned = admin_supabase.table("course_sections").select("id").eq(
            "course_id", course_id
        ).execute().data or []
        if not any(get_faculty_section(row["id"]) for row in assigned):
            return jsonify({"error": "Course is not assigned to you."}), 403
        current = admin_supabase.table("course_outcomes").select(
            "code"
        ).eq("id", outcome_id).eq("course_id", course_id).limit(1).execute().data or []
        if not current or current[0]["code"] not in FIXED_COURSE_OUTCOME_CODES:
            return jsonify({"error": "Fixed Course Outcome not found for this course."}), 404
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Provide a valid Course Outcome request."}), 400
        target_value = data.get("target_percentage", 70)
        if isinstance(target_value, bool):
            return jsonify({"error": "Target must be a percentage."}), 400
        target = float(target_value)
        if "code" in data or "description" in data:
            return jsonify({"error": "Course Outcome codes and descriptions are fixed."}), 400
        if not math.isfinite(target) or not 0 <= target <= 100:
            return jsonify({"error": "Provide a target from 0 to 100."}), 400
        rows = admin_supabase.table("course_outcomes").update({
            "description": FIXED_COURSE_OUTCOME_DESCRIPTIONS[current[0]["code"]],
            "target_percentage": target,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", outcome_id).eq("course_id", course_id).execute().data or []
        if not rows:
            return jsonify({"error": "Course Outcome not found for this course."}), 404
        for section_row in assigned:
            if get_faculty_section(section_row["id"]):
                _set_mapping_review_status(section_row["id"], "pending")
        return jsonify({"outcome": rows[0] if rows else None}), 200
    except ValueError:
        return jsonify({"error": "Invalid course or outcome ID."}), 400
    except Exception as error:
        if "duplicate key" in str(error).lower():
            return jsonify({"error": "That CO code already exists for this course."}), 409
        app.logger.exception("Unable to update faculty Course Outcome")
        return jsonify({"error": "Course Outcome could not be updated."}), 500


@app.delete("/api/faculty/courses/<course_id>/outcomes/<outcome_id>")
@require_role("faculty")
def delete_faculty_course_outcome(course_id, outcome_id):
    try:
        course_id, outcome_id = str(UUID(course_id)), str(UUID(outcome_id))
        assigned = admin_supabase.table("course_sections").select("id").eq(
            "course_id", course_id
        ).execute().data or []
        if not any(get_faculty_section(row["id"]) for row in assigned):
            return jsonify({"error": "Course is not assigned to you."}), 403
        admin_supabase.table("course_outcomes").delete().eq("id", outcome_id).eq(
            "course_id", course_id
        ).execute()
        for section_row in assigned:
            if get_faculty_section(section_row["id"]):
                _set_mapping_review_status(section_row["id"], "pending")
        return jsonify({"status": "deleted"}), 200
    except ValueError:
        return jsonify({"error": "Invalid course or outcome ID."}), 400
    except Exception:
        app.logger.exception("Unable to delete faculty Course Outcome")
        return jsonify({"error": "Course Outcome could not be deleted."}), 500


@app.get("/api/faculty/so-assessments/<assessment_id>/responses")
@require_role("faculty")
def faculty_so_assessment_responses(assessment_id):
    try:
        assessment_id = str(UUID(assessment_id))
        assessment = admin_supabase.table("so_self_assessments").select(
            "id, section_id, performance_indicators, rating_scale"
        ).eq("id", assessment_id).limit(1).execute().data or []
        if not assessment or not get_faculty_section(assessment[0]["section_id"]):
            return jsonify({"error": "Assessment not found or not assigned to you."}), 404
        responses = admin_supabase.table("so_self_assessment_responses").select(
            "student_profile_id, answers, submitted_at"
        ).eq("assessment_id", assessment_id).order("submitted_at", desc=True).execute().data or []
        profile_ids = [row["student_profile_id"] for row in responses]
        profiles = admin_supabase.table("student_profiles").select(
            "id, user_id, student_number, program_id"
        ).in_("id", profile_ids).execute().data if profile_ids else []
        profiles_by_id = {row["id"]: row for row in (profiles or [])}
        user_ids = list({row["user_id"] for row in (profiles or [])})
        users = admin_supabase.table("users").select("id, full_name").in_("id", user_ids).execute().data if user_ids else []
        user_names = {row["id"]: row.get("full_name", "") for row in (users or [])}
        program_ids = list({row["program_id"] for row in (profiles or []) if row.get("program_id")})
        programs = admin_supabase.table("programs").select("id, name").in_("id", program_ids).execute().data if program_ids else []
        program_names = {row["id"]: row.get("name", "") for row in (programs or [])}
        result = []
        for response in responses:
            profile = profiles_by_id.get(response["student_profile_id"], {})
            result.append({
                "student_number": profile.get("student_number", ""),
                "student_name": user_names.get(profile.get("user_id"), ""),
                "program": program_names.get(profile.get("program_id"), ""),
                "answers": response.get("answers") or {},
                "submitted_at": response.get("submitted_at"),
            })
        return jsonify({"responses": result, "performance_indicators": assessment[0].get("performance_indicators") or [], "rating_scale": assessment[0].get("rating_scale") or []}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception:
        app.logger.exception("Unable to load SO response logs")
        return jsonify({"error": "SO response logs could not be loaded."}), 500


@app.get("/api/outcomes/overview")
@require_roles("department-head", "admin-security")
def outcomes_overview():
    """Filtered SO/CO dashboard and response log for department heads/admins."""
    try:
        role = normalize_role_name(get_user_role(g.authenticated_user))
        department_scope_id = None
        filters = {key: str(request.args.get(key, "")).strip() for key in (
            "academic_year_id", "program_id", "course_id", "section_id"
        )}
        courses_query = admin_supabase.table("courses").select("id, code, title, department_id")
        if role == "department-head":
            department_id = _department_head_department_id(g.authenticated_user.id)
            if not department_id:
                return jsonify({"error": "Your department profile is incomplete."}), 409
            department_scope_id = department_id
            courses_query = courses_query.eq("department_id", department_id)
        courses = courses_query.order("code").execute().data or []
        course_by_id = {row["id"]: row for row in courses}
        course_ids = list(course_by_id)
        sections = admin_supabase.table("course_sections").select(
            "id, course_id, academic_year_id, academic_term_id, section_name, faculty_id"
        ).in_("course_id", course_ids).execute().data if course_ids else []
        sections = sections or []
        if filters["academic_year_id"]:
            sections = [r for r in sections if r.get("academic_year_id") == filters["academic_year_id"]]
        if filters["course_id"]:
            sections = [r for r in sections if r.get("course_id") == filters["course_id"]]
        if filters["section_id"]:
            sections = [r for r in sections if r["id"] == filters["section_id"]]
        section_ids = [row["id"] for row in sections]
        section_by_id = {row["id"]: row for row in sections}
        faculty_ids = list({row["faculty_id"] for row in sections if row.get("faculty_id")})
        faculty_profiles = admin_supabase.table("faculty_profiles").select("id, user_id").in_("id", faculty_ids).execute().data if faculty_ids else []
        faculty_user_ids = list({row["user_id"] for row in (faculty_profiles or [])})
        faculty_users = admin_supabase.table("users").select("id, full_name").in_("id", faculty_user_ids).execute().data if faculty_user_ids else []
        faculty_names = {row["id"]: row.get("full_name", "") for row in (faculty_users or [])}
        faculty_by_id = {row["id"]: faculty_names.get(row["user_id"], "") for row in (faculty_profiles or [])}
        enrollments = admin_supabase.table("enrollments").select("section_id, student_profile_id").in_("section_id", section_ids).eq("enrollment_status", "active").execute().data if section_ids else []
        enrollments = enrollments or []
        enrollment_by_section = {}
        for row in enrollments:
            enrollment_by_section.setdefault(row["section_id"], []).append(row["student_profile_id"])
        profile_ids = list({row["student_profile_id"] for row in enrollments})
        profiles = admin_supabase.table("student_profiles").select("id, user_id, student_number, program_id").in_("id", profile_ids).execute().data if profile_ids else []
        profiles = profiles or []
        profile_by_id = {row["id"]: row for row in profiles}
        program_ids = list({row["program_id"] for row in profiles if row.get("program_id")})
        programs_query = admin_supabase.table("programs").select("id, name, code")
        if department_scope_id:
            programs_query = programs_query.eq("department_id", department_scope_id)
        programs = programs_query.execute().data or []
        if filters["program_id"]:
            sections_programs = {row["id"] for row in profiles if row.get("program_id") == filters["program_id"]}
            sections = [row for row in sections if set(enrollment_by_section.get(row["id"], [])) & sections_programs]
            section_ids = [row["id"] for row in sections]
            section_by_id = {row["id"]: row for row in sections}
            enrollments = [row for row in enrollments if row["section_id"] in section_by_id and profile_by_id.get(row["student_profile_id"], {}).get("program_id") == filters["program_id"]]
        programs_by_id = {row["id"]: row for row in programs}
        sections = [row for row in sections if row.get("course_id") in course_by_id]
        section_ids = [row["id"] for row in sections]
        section_by_id = {row["id"]: row for row in sections}
        if section_ids:
            enrollments = [row for row in enrollments if row["section_id"] in section_by_id]
        active_profile_ids = list({row["student_profile_id"] for row in enrollments})
        active_enrollment_pairs = {
            (row["section_id"], row["student_profile_id"]) for row in enrollments
        }
        users = admin_supabase.table("users").select("id, full_name").in_("id", list({p["user_id"] for p in profiles if p["id"] in active_profile_ids})).execute().data if active_profile_ids else []
        student_names = {row["id"]: row.get("full_name", "") for row in (users or [])}
        academic_years = admin_supabase.table("academic_years").select("id, name").order("name", desc=True).execute().data or []
        outcome_assessments = admin_supabase.table("so_self_assessments").select("id, section_id, student_outcome_id, title, performance_indicators, rating_scale, status").in_("section_id", section_ids).execute().data if section_ids else []
        outcome_assessments = [
            row for row in (outcome_assessments or [])
            if row.get("status") in {"open", "closed"}
        ]
        assessment_section_by_id = {row["id"]: row["section_id"] for row in outcome_assessments}
        assessment_ids = [row["id"] for row in outcome_assessments]
        response_rows = admin_supabase.table("so_self_assessment_responses").select("assessment_id, student_profile_id, answers, submitted_at").in_("assessment_id", assessment_ids).execute().data if assessment_ids else []
        response_rows = [
            row for row in (response_rows or [])
            if (assessment_section_by_id.get(row["assessment_id"]), row["student_profile_id"])
            in active_enrollment_pairs
        ]
        responses_by_assessment = {}
        for row in response_rows:
            responses_by_assessment.setdefault(row["assessment_id"], []).append(row)
        assessment_by_id = {row["id"]: row for row in outcome_assessments}
        so_ids = list({row["student_outcome_id"] for row in outcome_assessments})
        so_rows = admin_supabase.table("student_outcomes").select("id, code, description").in_("id", so_ids).execute().data if so_ids else []
        so_by_id = {row["id"]: row for row in (so_rows or [])}
        course_rows = []
        for section in sections:
            enrolled_ids = [pid for pid in enrollment_by_section.get(section["id"], []) if any(e["section_id"] == section["id"] and e["student_profile_id"] == pid for e in enrollments)]
            section_assessments = [row for row in outcome_assessments if row["section_id"] == section["id"]]
            total_expected = len(section_assessments) * len(enrolled_ids)
            total_submitted = sum(len(responses_by_assessment.get(row["id"], [])) for row in section_assessments)
            course = course_by_id.get(section["course_id"], {})
            program_names = sorted({
                programs_by_id.get(profile_by_id.get(pid, {}).get("program_id"), {}).get("name", "")
                for pid in enrolled_ids
            } - {""})
            course_rows.append({
                "course_id": section["course_id"], "course_code": course.get("code", ""),
                "course_title": course.get("title", ""), "section_id": section["id"],
                "section_name": section.get("section_name", ""),
                "academic_year_id": section.get("academic_year_id"),
                "faculty_name": faculty_by_id.get(section.get("faculty_id"), "Unassigned"),
                "program": ", ".join(program_names),
                "student_count": len(enrolled_ids), "assessment_count": len(section_assessments),
                "completion_rate": round(total_submitted / total_expected * 100, 1) if total_expected else 0,
            })
        filtered_section_ids = {row["section_id"] for row in course_rows}
        summary = {}
        for so_id in so_ids:
            so = so_by_id.get(so_id, {})
            summary[so_id] = {
                "so_code": so.get("code", ""),
                "description": (
                    so.get("description", "")
                    if so.get("description") != so.get("code") else ""
                ),
                "score_sum": 0.0, "rating_count": 0, "responses": 0,
            }
        response_log = []
        for assessment in outcome_assessments:
            if assessment["section_id"] not in filtered_section_ids:
                continue
            so = so_by_id.get(assessment["student_outcome_id"], {})
            scale = assessment.get("rating_scale") or []
            scale_labels = {str(item.get("value")): item.get("label", "") for item in scale if isinstance(item, dict)}
            for response in responses_by_assessment.get(assessment["id"], []):
                profile = profile_by_id.get(response["student_profile_id"], {})
                program = programs_by_id.get(profile.get("program_id"), {})
                answers = response.get("answers") or {}
                numeric = []
                for answer in answers.values():
                    try: numeric.append(float(answer))
                    except (TypeError, ValueError): pass
                scale_numbers = []
                for item in scale:
                    try: scale_numbers.append(float(item.get("value")))
                    except (TypeError, ValueError, AttributeError): pass
                low, high = (min(scale_numbers), max(scale_numbers)) if scale_numbers else (0.0, 0.0)
                normalized_ratings = [((value - low) / (high - low) * 100) if high > low else 0.0 for value in numeric]
                group = summary.setdefault(so.get("id", assessment["student_outcome_id"]), {"so_code": so.get("code", ""), "description": so.get("description", ""), "score_sum": 0.0, "rating_count": 0, "responses": 0})
                group["score_sum"] += sum(normalized_ratings)
                group["rating_count"] += len(normalized_ratings)
                group["responses"] += 1
                section = section_by_id.get(assessment["section_id"], {})
                course = course_by_id.get(section.get("course_id"), {})
                response_log.append({
                    "student_name": student_names.get(profile.get("user_id"), ""),
                    "student_number": profile.get("student_number", ""), "program": program.get("name", ""),
                    "course_code": course.get("code", ""), "course_title": course.get("title", ""),
                    "section_name": section.get("section_name", ""), "so_code": so.get("code", ""),
                    "assessment_title": assessment.get("title", ""), "answers": answers,
                    "rating_labels": {key: scale_labels.get(str(val), str(val)) for key, val in answers.items()},
                    "submitted_at": response.get("submitted_at"),
                })
        so_summary = [{**row, "average_rating": round(row["score_sum"] / row["rating_count"], 2) if row["rating_count"] else None} for row in summary.values()]
        selected_course_ids = list({row["course_id"] for row in sections})
        co_rows = admin_supabase.table("course_outcomes").select("id, course_id, code, description, target_percentage").in_("course_id", selected_course_ids).execute().data if selected_course_ids else []
        co_by_id = {row["id"]: row for row in (co_rows or [])}
        attainment_rows = admin_supabase.table("co_attainment").select("section_id, course_outcome_id, attainment_percentage, status").in_("section_id", section_ids).execute().data if section_ids else []
        co_groups = {}
        for row in attainment_rows or []:
            outcome = co_by_id.get(row.get("course_outcome_id"))
            if not outcome:
                continue
            group = co_groups.setdefault(outcome["id"], {"code": outcome["code"], "description": outcome["description"], "target_percentage": float(outcome.get("target_percentage") or 70), "values": []})
            if row.get("attainment_percentage") is not None:
                group["values"].append(float(row["attainment_percentage"]))
        co_summary = [{"code": row["code"], "description": row["description"],
                       "target_percentage": row["target_percentage"],
                       "attainment_percentage": round(sum(row["values"]) / len(row["values"]), 2) if row["values"] else None,
                       "flagged": bool(row["values"] and sum(row["values"]) / len(row["values"]) < row["target_percentage"])}
                      for row in co_groups.values()]
        all_course_rows = [{"id": row["id"], "code": row["code"], "title": row["title"]} for row in courses]
        return jsonify({
            "filters": {"academic_years": academic_years, "programs": programs, "courses": all_course_rows,
                        "sections": [{"id": r["section_id"], "name": r["section_name"], "course_id": r["course_id"]} for r in course_rows]},
            "metrics": {"students": len({row["student_profile_id"] for row in enrollments}), "courses": len({r["course_id"] for r in course_rows}),
                        "sections": len(course_rows), "faculty": len({r["faculty_name"] for r in course_rows if r["faculty_name"] != "Unassigned"})},
            "courses": course_rows, "so_summary": so_summary, "co_summary": co_summary,
            "responses": response_log,
        }), 200
    except Exception:
        app.logger.exception("Unable to load SO/CO overview")
        return jsonify({"error": "Outcome overview could not be loaded."}), 500


@app.get("/api/faculty/sections/<section_id>/attainment")
@require_role("faculty")
def get_faculty_section_attainment(section_id):
    if not admin_supabase:
        return jsonify({"error": "Attainment records are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        workspace = _faculty_assessment_workspace(section_id)
        if not workspace:
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        outcomes = _calculate_section_attainment(section_id)
        return jsonify({
            "section": workspace["section"],
            "gradebook_status": workspace["gradebook_status"],
            "assessments": workspace["assessments"],
            "mapping_status": (
                "verified" if _section_mapping_is_verified(section_id) else "pending_review"
            ),
            "outcomes": outcomes,
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to load faculty CO attainment")
        return jsonify({"error": "Attainment could not be calculated."}), 500


@app.get("/api/attainment/overview")
@require_roles("department-head", "admin-security")
def get_attainment_overview():
    if not admin_supabase:
        return jsonify({"error": "Attainment records are unavailable."}), 503
    try:
        role = normalize_role_name(get_user_role(g.authenticated_user))
        department_scope_id = None
        if role == "department-head":
            department_scope_id = _department_head_department_id(
                g.authenticated_user.id
            )
            if not department_scope_id:
                return jsonify({
                    "error": "Your department profile is incomplete."
                }), 409

        filters = {
            key: str(request.args.get(key, "")).strip()
            for key in (
                "academic_year_id", "department_id", "program_id",
                "course_id", "section_id",
            )
        }
        for key, value in filters.items():
            if value:
                try:
                    filters[key] = str(UUID(value))
                except ValueError:
                    return jsonify({"error": "An attainment filter is invalid."}), 400

        departments = (
            admin_supabase.table("departments")
            .select("id, name")
            .order("name")
            .execute()
            .data
            or []
        )
        if department_scope_id:
            departments = [row for row in departments if row["id"] == department_scope_id]
        department_ids = [row["id"] for row in departments]
        course_department_ids = department_ids
        if role != "department-head" and filters["department_id"]:
            if filters["department_id"] not in department_ids:
                return jsonify({"error": "Department was not found."}), 404
            course_department_ids = [filters["department_id"]]

        courses_query = admin_supabase.table("courses").select(
            "id, code, title, department_id"
        )
        if course_department_ids:
            courses_query = courses_query.in_("department_id", course_department_ids)
        else:
            courses_query = courses_query.eq(
                "department_id", "00000000-0000-0000-0000-000000000000"
            )
        courses = courses_query.order("code").execute().data or []
        course_by_id = {row["id"]: row for row in courses}
        course_ids = list(course_by_id)

        programs_query = admin_supabase.table("programs").select(
            "id, name, code, department_id"
        )
        if course_department_ids:
            programs_query = programs_query.in_("department_id", course_department_ids)
        else:
            programs_query = programs_query.eq(
                "department_id", "00000000-0000-0000-0000-000000000000"
            )
        programs = programs_query.order("name").execute().data or []
        program_by_id = {row["id"]: row for row in programs}
        if filters["program_id"] and filters["program_id"] not in program_by_id:
            return jsonify({"error": "Program is outside your access scope."}), 403

        academic_years = (
            admin_supabase.table("academic_years")
            .select("id, name")
            .order("name", desc=True)
            .execute()
            .data
            or []
        )
        sections_query = admin_supabase.table("course_sections").select(
            "id, course_id, academic_year_id, section_name, faculty_id"
        )
        if course_ids:
            sections_query = sections_query.in_("course_id", course_ids)
        else:
            sections_query = sections_query.eq(
                "course_id", "00000000-0000-0000-0000-000000000000"
            )
        if filters["academic_year_id"]:
            sections_query = sections_query.eq(
                "academic_year_id", filters["academic_year_id"]
            )
        if filters["course_id"]:
            sections_query = sections_query.eq("course_id", filters["course_id"])
        if filters["section_id"]:
            sections_query = sections_query.eq("id", filters["section_id"])
        sections = sections_query.execute().data or []
        if filters["section_id"] and not sections:
            return jsonify({"error": "Section is outside your access scope."}), 404
        section_ids = [row["id"] for row in sections]

        enrollments = (
            admin_supabase.table("enrollments")
            .select("section_id, student_profile_id")
            .in_("section_id", section_ids)
            .eq("enrollment_status", "active")
            .execute()
            .data
            if section_ids else []
        ) or []
        profile_ids = list({
            row["student_profile_id"] for row in enrollments
            if row.get("student_profile_id")
        })
        profiles = (
            admin_supabase.table("student_profiles")
            .select("id, program_id")
            .in_("id", profile_ids)
            .execute()
            .data
            if profile_ids else []
        ) or []
        profile_by_id = {row["id"]: row for row in profiles}
        selected_program_profile_ids = None
        if filters["program_id"]:
            eligible_profiles = {
                row["id"] for row in profiles
                if row.get("program_id") == filters["program_id"]
            }
            selected_program_profile_ids = eligible_profiles
            eligible_sections = {
                row["section_id"] for row in enrollments
                if row["student_profile_id"] in eligible_profiles
            }
            sections = [
                row for row in sections if row["id"] in eligible_sections
            ]
            section_ids = [row["id"] for row in sections]
            enrollments = [
                row for row in enrollments
                if row["section_id"] in eligible_sections
                and row["student_profile_id"] in eligible_profiles
            ]
        section_by_id = {row["id"]: row for row in sections}
        enrollments = [
            row for row in enrollments
            if row["section_id"] in section_by_id
        ]
        enrollments_by_section = {}
        for enrollment in enrollments:
            enrollments_by_section.setdefault(
                enrollment["section_id"], set()
            ).add(enrollment["student_profile_id"])

        outcome_rows = (
            admin_supabase.table("course_outcomes")
            .select("id, course_id, code, description, target_percentage")
            .in_("course_id", course_ids)
            .order("code")
            .execute()
            .data
            if course_ids else []
        ) or []
        outcomes_by_course = {}
        for outcome in outcome_rows:
            outcomes_by_course.setdefault(outcome["course_id"], []).append(outcome)

        saved_attainment = (
            admin_supabase.table("co_attainment")
            .select("section_id, course_outcome_id, version")
            .in_("section_id", section_ids)
            .execute()
            .data
            if section_ids else []
        ) or []
        saved_by_key = {
            (row["section_id"], row["course_outcome_id"]): row
            for row in saved_attainment
        }
        stale_sections = set()
        for section in sections:
            for outcome in outcomes_by_course.get(section["course_id"], []):
                record = saved_by_key.get((section["id"], outcome["id"]))
                if (
                    not record
                    or record.get("version") != ATTAINMENT_ALGORITHM_VERSION
                ):
                    stale_sections.add(section["id"])
                    break
        for section_id in stale_sections:
            _calculate_section_attainment(section_id)

        attainment_rows = (
            admin_supabase.table("co_attainment")
            .select(
                "section_id, course_outcome_id, attainment_percentage, "
                "target_percentage, status, flagged"
            )
            .in_("section_id", section_ids)
            .execute()
            .data
            if section_ids else []
        ) or []
        attainment_by_key = {
            (row["section_id"], row["course_outcome_id"]): row
            for row in attainment_rows
        }
        if selected_program_profile_ids is not None:
            student_attainment_rows = (
                admin_supabase.table("student_co_attainment")
                .select(
                    "section_id, student_profile_id, course_outcome_id, "
                    "attainment_percentage"
                )
                .in_("section_id", section_ids)
                .in_("student_profile_id", list(selected_program_profile_ids))
                .execute()
                .data
                if section_ids and selected_program_profile_ids else []
            ) or []
            values_by_key = {}
            for record in student_attainment_rows:
                attainment = record.get("attainment_percentage")
                if attainment is None:
                    continue
                values_by_key.setdefault(
                    (record["section_id"], record["course_outcome_id"]), []
                ).append(float(attainment))

            attainment_by_key = {}
            for section in sections:
                for outcome in outcomes_by_course.get(section["course_id"], []):
                    key = (section["id"], outcome["id"])
                    target = float(outcome.get("target_percentage") or 70)
                    values = values_by_key.get(key, [])
                    met_student_count = sum(value >= target for value in values)
                    class_attainment = (
                        round(met_student_count / len(values) * 100, 2)
                        if values else None
                    )
                    status = "awaiting_results" if class_attainment is None else (
                        "met" if class_attainment >= target else (
                            "needs_improvement"
                            if class_attainment < target * 0.85 else "below_target"
                        )
                    )
                    attainment_by_key[key] = {
                        "attainment_percentage": class_attainment,
                        "target_percentage": target,
                        "status": status,
                        "flagged": bool(
                            values and class_attainment < target
                        ),
                    }
        activities = (
            admin_supabase.table("assessment_activities")
            .select(
                "id, section_id, course_outcome_id, title, activity_type, "
                "max_score, released_at"
            )
            .in_("section_id", section_ids)
            .execute()
            .data
            if section_ids else []
        ) or []
        _assessment_outcomes_by_activity(activities)
        activities_by_section = {}
        for activity in activities:
            activities_by_section.setdefault(
                activity["section_id"], []
            ).append(activity)

        faculty_ids = list({
            row["faculty_id"] for row in sections if row.get("faculty_id")
        })
        faculty_profiles = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id")
            .in_("id", faculty_ids)
            .execute()
            .data
            if faculty_ids else []
        ) or []
        faculty_user_ids = list({
            row["user_id"] for row in faculty_profiles if row.get("user_id")
        })
        faculty_users = (
            admin_supabase.table("users")
            .select("id, full_name")
            .in_("id", faculty_user_ids)
            .execute()
            .data
            if faculty_user_ids else []
        ) or []
        full_name_by_user = {
            row["id"]: row.get("full_name", "") for row in faculty_users
        }
        faculty_name_by_profile = {
            row["id"]: full_name_by_user.get(row.get("user_id"), "")
            for row in faculty_profiles
        }
        department_by_id = {row["id"]: row for row in departments}
        gradebooks = (
            admin_supabase.table("gradebooks")
            .select("section_id, status")
            .in_("section_id", section_ids)
            .execute()
            .data
            if section_ids else []
        ) or []
        gradebook_by_section = {
            row["section_id"]: row.get("status", "draft")
            for row in gradebooks
        }
        mapping_reviews = (
            admin_supabase.table("course_mapping_reviews")
            .select("section_id, status")
            .in_("section_id", section_ids)
            .execute()
            .data
            if section_ids else []
        ) or []
        mapping_status_by_section = {
            row["section_id"]: row.get("status", "pending_review")
            for row in mapping_reviews
        }
        approval_by_section = {}
        if role == "department-head":
            activity_ids = [row["id"] for row in activities]
            score_rows = (
                admin_supabase.table("raw_assessment_scores")
                .select("assessment_activity_id, student_profile_id")
                .in_("assessment_activity_id", activity_ids)
                .execute()
                .data
                if activity_ids else []
            ) or []
            score_keys = {
                (row["assessment_activity_id"], row["student_profile_id"])
                for row in score_rows
            }
            flags = (
                admin_supabase.table("assessment_review_flags")
                .select("section_id, status")
                .in_("section_id", section_ids)
                .in_("status", ["open", "responded"])
                .execute()
                .data
                if section_ids else []
            ) or []
            open_flags_by_section = {}
            for flag in flags:
                open_flags_by_section[flag["section_id"]] = (
                    open_flags_by_section.get(flag["section_id"], 0) + 1
                )
            for section in sections:
                section_id = section["id"]
                section_activities = activities_by_section.get(section_id, [])
                active_student_ids = enrollments_by_section.get(section_id, set())
                missing_score_count = sum(
                    1
                    for activity in section_activities
                    for student_id in active_student_ids
                    if (activity["id"], student_id) not in score_keys
                )
                below_target_count = sum(
                    1
                    for outcome in outcomes_by_course.get(section["course_id"], [])
                    if (
                        attainment_by_key.get((section_id, outcome["id"]), {})
                        .get("flagged")
                    )
                )
                mapping_status = mapping_status_by_section.get(
                    section_id, "pending_review"
                )
                gradebook_status = gradebook_by_section.get(section_id, "draft")
                open_query_count = open_flags_by_section.get(section_id, 0)
                if gradebook_status == "locked":
                    recommendation = "Locked; results finalized"
                elif mapping_status != "verified":
                    recommendation = "Verify mappings before CQI review"
                elif missing_score_count or open_query_count:
                    recommendation = "Resolve missing scores or open queries"
                else:
                    recommendation = "Ready for review"
                approval_by_section[section_id] = {
                    "missing_score_count": missing_score_count,
                    "open_query_count": open_query_count,
                    "below_target_count": below_target_count,
                    "gradebook_status": gradebook_status,
                    "mapping_status": mapping_status,
                    "recommendation": recommendation,
                }

        rows = []
        course_programs = {}
        for section in sections:
            course = course_by_id.get(section["course_id"], {})
            department = department_by_id.get(course.get("department_id"), {})
            section_program_ids = {
                profile_by_id.get(profile_id, {}).get("program_id")
                for profile_id in enrollments_by_section.get(section["id"], set())
            }
            section_programs = [
                program_by_id[program_id]["name"]
                for program_id in section_program_ids
                if program_id in program_by_id
            ]
            course_programs.setdefault(course.get("id"), set()).update(
                program_id for program_id in section_program_ids if program_id
            )
            section_activities = activities_by_section.get(section["id"], [])
            approval = approval_by_section.get(section["id"], {})
            for outcome in outcomes_by_course.get(section["course_id"], []):
                attainment = attainment_by_key.get(
                    (section["id"], outcome["id"]), {}
                )
                linked_activities = [
                    activity for activity in section_activities
                    if outcome["id"] in activity.get("course_outcome_ids", [])
                ]
                rows.append({
                    "department_id": course.get("department_id"),
                    "department_name": department.get("name", ""),
                    "program": ", ".join(sorted(section_programs)),
                    "course_id": course.get("id"),
                    "course_code": course.get("code", ""),
                    "course_title": course.get("title", ""),
                    "section_id": section["id"],
                    "section_name": section.get("section_name", ""),
                    "academic_year_id": section.get("academic_year_id"),
                    "faculty_name": faculty_name_by_profile.get(
                        section.get("faculty_id"), "Unassigned"
                    ) or "Unassigned",
                    "course_outcome_id": outcome["id"],
                    "code": outcome["code"],
                    "description": outcome["description"],
                    "attainment_percentage": attainment.get(
                        "attainment_percentage"
                    ),
                    "target_percentage": float(
                        outcome.get("target_percentage") or 70
                    ),
                    "status": attainment.get("status", "awaiting_results"),
                    "flagged": bool(attainment.get("flagged", False)),
                    "student_count": len(
                        enrollments_by_section.get(section["id"], set())
                    ),
                    "activities": [{
                        "title": activity.get("title", ""),
                        "activity_type": activity.get("activity_type", ""),
                        "released": bool(activity.get("released_at")),
                    } for activity in linked_activities],
                    **approval,
                })

        department_groups = {}
        for row in rows:
            group = department_groups.setdefault(row["department_id"], {
                "id": row["department_id"],
                "name": row["department_name"],
                "program_ids": set(),
                "course_ids": set(),
                "total_cos": 0,
                "on_target": 0,
                "below_target": 0,
                "attainments": [],
            })
            group["program_ids"].update(
                course_programs.get(row["course_id"], set())
            )
            group["course_ids"].add(row["course_id"])
            group["total_cos"] += 1
            if row["status"] == "met":
                group["on_target"] += 1
            elif row["flagged"]:
                group["below_target"] += 1
            if row["attainment_percentage"] is not None:
                group["attainments"].append(
                    float(row["attainment_percentage"])
                )
        department_summaries = [{
            "id": group["id"],
            "name": group["name"],
            "program_count": len(group["program_ids"]),
            "course_count": len(group["course_ids"]),
            "total_cos": group["total_cos"],
            "on_target": group["on_target"],
            "below_target": group["below_target"],
            "average_attainment": (
                round(sum(group["attainments"]) / len(group["attainments"]), 2)
                if group["attainments"] else None
            ),
        } for group in department_groups.values()]
        return jsonify({
            "role": role,
            "filters": {
                "academic_years": academic_years,
                "departments": departments,
                "programs": programs,
                "courses": [
                    {"id": row["id"], "code": row["code"], "title": row["title"]}
                    for row in courses
                ],
                "sections": [{
                    "id": row["id"],
                    "name": row["section_name"],
                    "course_id": row["course_id"],
                    "academic_year_id": row.get("academic_year_id"),
                } for row in sections],
            },
            "metrics": {
                "departments": len(department_summaries),
                "on_target": sum(
                    row["status"] == "met" for row in rows
                ),
                "below_target": sum(row["flagged"] for row in rows),
            },
            "departments_summary": department_summaries,
            "rows": rows,
            "approval_rows": [{
                "section_id": section["id"],
                "course_id": section["course_id"],
                "course_code": course_by_id.get(
                    section["course_id"], {}
                ).get("code", ""),
                "course_title": course_by_id.get(
                    section["course_id"], {}
                ).get("title", ""),
                "section_name": section.get("section_name", ""),
                "faculty_name": faculty_name_by_profile.get(
                    section.get("faculty_id"), "Unassigned"
                ) or "Unassigned",
                **approval_by_section.get(section["id"], {}),
            } for section in sections if role == "department-head"],
        }), 200
    except Exception:
        app.logger.exception("Unable to load attainment overview")
        return jsonify({"error": "Attainment overview could not be loaded."}), 500


def _department_head_section(section_id, department_id):
    sections = (
        admin_supabase.table("course_sections")
        .select("id, course_id, section_name, faculty_id")
        .eq("id", section_id).limit(1).execute().data or []
    )
    if not sections:
        return None
    section = sections[0]
    courses = (
        admin_supabase.table("courses")
        .select("id, code, title, department_id")
        .eq("id", section["course_id"]).limit(1).execute().data or []
    )
    if not courses or str(courses[0].get("department_id")) != str(department_id):
        return None
    return {**section, "course": courses[0]}


@app.get("/api/department-head/mapping-reviews")
@require_role("department-head")
def list_department_mapping_reviews():
    if not admin_supabase:
        return jsonify({"error": "Mapping reviews are unavailable."}), 503
    try:
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        courses = (
            admin_supabase.table("courses").select("id, code, title")
            .eq("department_id", department_id).execute().data or []
        )
        course_ids = [row["id"] for row in courses]
        sections = []
        if course_ids:
            sections = (
                admin_supabase.table("course_sections")
                .select("id, course_id, section_name, faculty_id")
                .in_("course_id", course_ids).execute().data or []
            )
        section_ids = [row["id"] for row in sections]
        reviews = []
        if section_ids:
            reviews = (
                admin_supabase.table("course_mapping_reviews")
                .select("section_id, status, submitted_at, reviewed_at")
                .in_("section_id", section_ids).execute().data or []
            )
        course_by_id = {row["id"]: row for row in courses}
        review_by_section = {row["section_id"]: row for row in reviews}
        return jsonify({"reviews": [{
            "section_id": row["id"],
            "section_name": row["section_name"],
            "course_code": course_by_id[row["course_id"]]["code"],
            "course_title": course_by_id[row["course_id"]]["title"],
            "status": review_by_section.get(row["id"], {}).get("status", "draft"),
        } for row in sections]}), 200
    except Exception:
        app.logger.exception("Unable to list department mapping reviews")
        return jsonify({"error": "Mapping reviews could not be loaded."}), 500


@app.get("/api/department-head/sections/<section_id>/mapping-review")
@require_role("department-head")
def get_department_mapping_review(section_id):
    if not admin_supabase:
        return jsonify({"error": "Mapping reviews are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        section = _department_head_section(section_id, department_id)
        if not section:
            return jsonify({"error": "Section not found in your department."}), 404
        review = (
            admin_supabase.table("course_mapping_reviews")
            .select("status, submitted_at, reviewed_at")
            .eq("section_id", section_id).limit(1).execute().data or []
        )
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, title, activity_type, due_date, course_outcome_id")
            .eq("section_id", section_id).execute().data or []
        )
        outcomes = (
            admin_supabase.table("course_outcomes")
            .select("id, code, description, target_percentage")
            .eq("course_id", section["course_id"]).order("code")
            .execute().data or []
        )
        _assessment_outcomes_by_activity(activities)
        outcome_ids = [row["id"] for row in outcomes]
        coso = []
        if outcome_ids:
            coso = (
                admin_supabase.table("course_outcome_student_outcomes")
                .select("course_outcome_id, student_outcome_id")
                .in_("course_outcome_id", outcome_ids).execute().data or []
            )
        so_ids = list({row["student_outcome_id"] for row in coso})
        student_outcomes = []
        if so_ids:
            student_outcomes = (
                admin_supabase.table("student_outcomes")
                .select("id, code, description").in_("id", so_ids)
                .execute().data or []
            )
        so_by_id = {row["id"]: row for row in student_outcomes}
        coso_by_id = {}
        for row in coso:
            coso_by_id.setdefault(row["course_outcome_id"], []).append(
                so_by_id.get(row["student_outcome_id"])
            )
        co_by_id = {row["id"]: row for row in outcomes}
        for activity in activities:
            activity["course_outcomes"] = [
                co_by_id[outcome_id]
                for outcome_id in activity["course_outcome_ids"]
                if outcome_id in co_by_id
            ]
            activity["course_outcome"] = (
                activity["course_outcomes"][0]
                if activity["course_outcomes"] else None
            )
        attainment = _calculate_section_attainment(section_id)
        syllabus_rows = (
            admin_supabase.table("course_syllabi")
            .select("storage_path, file_name, uploaded_at")
            .eq("section_id", section_id).limit(1).execute().data or []
        )
        syllabus = None
        if syllabus_rows:
            syllabus = {
                "file_name": syllabus_rows[0]["file_name"],
                "uploaded_at": syllabus_rows[0].get("uploaded_at"),
                "signed_url": signed_syllabus_url(syllabus_rows[0]),
            }
        return jsonify({
            "section": {
                "id": section_id, "section_name": section["section_name"],
                "course": section["course"],
            },
            "review": review[0] if review else {"status": "draft"},
            "syllabus": syllabus,
            "assessments": activities,
            "outcomes": [{
                **row,
                "student_outcomes": [item for item in coso_by_id.get(row["id"], []) if item],
            } for row in outcomes],
            "attainment": attainment,
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to load department mapping review")
        return jsonify({"error": "Mapping review could not be loaded."}), 500


@app.post("/api/department-head/sections/<section_id>/verify-mappings")
@require_role("department-head")
def verify_department_section_mappings(section_id):
    if not admin_supabase:
        return jsonify({"error": "Mapping verification is unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not _department_head_section(section_id, department_id):
            return jsonify({"error": "Section not found in your department."}), 404
        rows = (
            admin_supabase.table("course_mapping_reviews")
            .select("status").eq("section_id", section_id)
            .limit(1).execute().data or []
        )
        if not rows or rows[0].get("status") != "submitted":
            return jsonify({"error": "Faculty must submit mappings before verification."}), 409
        _set_mapping_review_status(
            section_id, "verified", str(g.authenticated_user.id)
        )
        _calculate_section_attainment(section_id)
        return jsonify({"status": "verified"}), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to verify department section mappings")
        return jsonify({"error": "Mappings could not be verified."}), 500


@app.post("/api/faculty/assessments/<assessment_id>/release")
@require_role("faculty")
def release_faculty_assessment(assessment_id):
    if not admin_supabase:
        return jsonify({"error": "Assessment release is unavailable."}), 503
    try:
        assessment_id = str(UUID(assessment_id))
        activities = (
            admin_supabase.table("assessment_activities")
            .select("id, section_id, released_at")
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
        if activity.get("released_at"):
            _calculate_section_attainment(activity["section_id"])
            return jsonify({
                "released": True,
                "released_at": activity["released_at"],
            }), 200
        released_at = datetime.now(timezone.utc).isoformat()
        result = (
            admin_supabase.table("assessment_activities")
            .update({
                "released_at": released_at,
                "released_by": str(g.authenticated_user.id),
                "updated_at": released_at,
            })
            .eq("id", assessment_id)
            .execute()
        )
        if not result.data:
            raise RuntimeError("Assessment release returned no updated record.")
        _calculate_section_attainment(activity["section_id"])
        return jsonify({
            "released": True,
            "released_at": result.data[0]["released_at"],
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception as error:
        if "gradebook is locked" in str(error).lower():
            return jsonify({"error": "This section's gradebook is locked."}), 409
        app.logger.exception("Unable to release faculty assessment")
        return jsonify({"error": "Assessment could not be released."}), 500


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
        _calculate_section_attainment(activity["section_id"])
        return jsonify({"saved_count": len(payload)}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception as error:
        if "gradebook is locked" in str(error).lower():
            return jsonify({"error": "This section's gradebook is locked."}), 409
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
        section_ids = _student_section_scope(section_ids)
        if section_ids is None:
            return jsonify({"error": "You are not actively enrolled in this section."}), 403
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
        review_rows = (
            admin_supabase.table("course_mapping_reviews")
            .select("section_id, status")
            .in_("section_id", list(section_map))
            .execute()
            .data
            or []
        )
        verified_section_ids = {
            row["section_id"] for row in review_rows
            if row.get("status") == "verified"
        }
        if not verified_section_ids:
            return jsonify({
                "assessments": [], "profile_complete": True,
                "course_count": 0, "released_count": 0, "pending_count": 0,
            }), 200
        section_map = {
            section_id: section for section_id, section in section_map.items()
            if section_id in verified_section_ids
        }
        course_ids = list({
            row["course_id"] for row in section_map.values()
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
        activities = (
            admin_supabase.table("assessment_activities")
            .select(
                "id, section_id, course_outcome_id, title, activity_type, "
                "due_date, max_score, released_at"
            )
            .in_("section_id", list(section_map))
            .order("due_date", desc=True)
            .execute()
            .data
            or []
        )
        _assessment_outcomes_by_activity(activities)
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
        rows = []
        for activity in activities:
            section_id = activity["section_id"]
            section = section_map.get(section_id, {})
            course = courses.get(section.get("course_id"), {})
            score = score_map.get(activity["id"])
            released = bool(activity.get("released_at"))
            mapped_outcomes = activity["course_outcomes"]
            rows.append({
                "assessment_id": activity["id"],
                "title": activity["title"],
                "course_code": course.get("code", ""),
                "course_title": course.get("title", ""),
                "activity_type": activity["activity_type"],
                "course_outcome_ids": activity["course_outcome_ids"],
                "course_outcome_codes": [row["code"] for row in mapped_outcomes],
                "course_outcome_code": ", ".join(
                    row["code"] for row in mapped_outcomes
                ),
                "course_outcome_descriptions": [
                    row["description"] for row in mapped_outcomes
                ],
                "course_outcome_description": "; ".join(
                    row["description"] for row in mapped_outcomes
                ),
                "due_date": activity.get("due_date"),
                "score": score.get("score") if released and score else None,
                "max_score": activity["max_score"],
                "percentage": score.get("percentage") if released and score else None,
                "has_score": bool(
                    released and score and score.get("score") is not None
                ),
                "released_at": activity.get("released_at"),
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
                row.get("course_id") for row in section_map.values()
                if row.get("course_id")
            }),
            "released_count": released_count,
            "pending_count": len(rows) - released_count,
        }), 200
    except Exception:
        app.logger.exception("Unable to load student assessment scores")
        return jsonify({"error": "Assessment scores could not be loaded."}), 500


def _department_head_assessment_review_workspace(department_id):
    courses = (
        admin_supabase.table("courses")
        .select("id, code, title")
        .eq("department_id", department_id)
        .order("code")
        .execute()
        .data
        or []
    )
    course_map = {row["id"]: row for row in courses}
    course_ids = list(course_map)
    if not course_ids:
        return {"assessments": [], "flags": [], "sections": []}

    sections = (
        admin_supabase.table("course_sections")
        .select("id, course_id, section_name, academic_year_id, faculty_id")
        .in_("course_id", course_ids)
        .execute()
        .data
        or []
    )
    section_map = {row["id"]: row for row in sections}
    section_ids = list(section_map)
    if not section_ids:
        return {"assessments": [], "flags": [], "sections": []}
    year_ids = list({
        row["academic_year_id"] for row in sections
        if row.get("academic_year_id")
    })
    years = []
    if year_ids:
        years = (
            admin_supabase.table("academic_years")
            .select("id, name")
            .in_("id", year_ids)
            .execute()
            .data
            or []
        )
    year_names = {row["id"]: row.get("name", "") for row in years}

    activities = (
        admin_supabase.table("assessment_activities")
        .select(
            "id, section_id, course_outcome_id, title, activity_type, "
            "due_date, max_score, released_at"
        )
        .in_("section_id", section_ids)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    _assessment_outcomes_by_activity(activities)
    activity_ids = [row["id"] for row in activities]
    enrollments = (
        admin_supabase.table("enrollments")
        .select("section_id, student_profile_id")
        .in_("section_id", section_ids)
        .eq("enrollment_status", "active")
        .execute()
        .data
        or []
    )
    student_ids = list({
        row["student_profile_id"] for row in enrollments
        if row.get("student_profile_id")
    })
    student_profiles = []
    if student_ids:
        student_profiles = (
            admin_supabase.table("student_profiles")
            .select("id, user_id, student_number")
            .in_("id", student_ids)
            .execute()
            .data
            or []
        )
    user_ids = list({
        row["user_id"] for row in student_profiles if row.get("user_id")
    })
    student_users = []
    if user_ids:
        student_users = (
            admin_supabase.table("users")
            .select("id, full_name")
            .in_("id", user_ids)
            .execute()
            .data
            or []
        )
    users_by_id = {row["id"]: row for row in student_users}
    student_by_id = {
        row["id"]: {
            "student_profile_id": row["id"],
            "student_number": row.get("student_number") or "",
            "full_name": users_by_id.get(row.get("user_id"), {}).get(
                "full_name", ""
            ),
        }
        for row in student_profiles
    }

    faculty_ids = list({
        row["faculty_id"] for row in sections if row.get("faculty_id")
    })
    faculty_profiles = []
    if faculty_ids:
        faculty_profiles = (
            admin_supabase.table("faculty_profiles")
            .select("id, user_id")
            .in_("id", faculty_ids)
            .execute()
            .data
            or []
        )
    faculty_user_ids = list({
        row["user_id"] for row in faculty_profiles if row.get("user_id")
    })
    faculty_users = []
    if faculty_user_ids:
        faculty_users = (
            admin_supabase.table("users")
            .select("id, full_name")
            .in_("id", faculty_user_ids)
            .execute()
            .data
            or []
        )
    faculty_names = {
        row["id"]: next((
            user.get("full_name", "")
            for user in faculty_users if user["id"] == row.get("user_id")
        ), "")
        for row in faculty_profiles
    }

    score_rows = []
    if activity_ids:
        score_rows = (
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
    for row in score_rows:
        scores_by_activity.setdefault(
            row["assessment_activity_id"], {}
        )[row["student_profile_id"]] = row

    flag_rows = (
        admin_supabase.table("assessment_review_flags")
        .select(
            "id, section_id, assessment_activity_id, student_profile_id, "
            "issue, description, response, status, created_at"
        )
        .in_("section_id", section_ids)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    flags_by_activity = {}
    for flag in flag_rows:
        flags_by_activity.setdefault(
            flag["assessment_activity_id"], []
        ).append(flag)

    gradebooks = (
        admin_supabase.table("gradebooks")
        .select("section_id, status")
        .in_("section_id", section_ids)
        .execute()
        .data
        or []
    )
    gradebook_status = {
        row["section_id"]: row.get("status", "draft")
        for row in gradebooks
    }
    students_by_section = {}
    for enrollment in enrollments:
        profile = student_by_id.get(enrollment.get("student_profile_id"))
        if profile:
            students_by_section.setdefault(
                enrollment["section_id"], []
            ).append(profile)

    assessment_rows = []
    for activity in activities:
        section = section_map.get(activity["section_id"], {})
        course = course_map.get(section.get("course_id"), {})
        active_students = students_by_section.get(activity["section_id"], [])
        saved_scores = scores_by_activity.get(activity["id"], {})
        score_entries = []
        for student in active_students:
            score = saved_scores.get(student["student_profile_id"])
            score_entries.append({
                **student,
                "score": score.get("score") if score else None,
                "max_score": score.get("max_score") if score else activity["max_score"],
                "percentage": score.get("percentage") if score else None,
            })
        missing_count = sum(
            1 for row in score_entries if row["score"] is None
        )
        flags = flags_by_activity.get(activity["id"], [])
        open_flags = [row for row in flags if row["status"] != "resolved"]
        assessment_rows.append({
            **activity,
            "course_code": course.get("code", ""),
            "course_title": course.get("title", ""),
            "section_name": section.get("section_name", ""),
            "academic_year_name": year_names.get(
                section.get("academic_year_id"), ""
            ),
            "faculty_profile_id": section.get("faculty_id"),
            "faculty_name": faculty_names.get(section.get("faculty_id"), ""),
            "student_count": len(score_entries),
            "missing_score_count": missing_count,
            "entered_score_count": len(score_entries) - missing_count,
            "review_status": (
                "Query Pending" if open_flags
                else "Missing Scores" if missing_count
                else "No Issues"
            ),
            "gradebook_status": gradebook_status.get(
                activity["section_id"], "draft"
            ),
            "scores": score_entries,
            "flags": flags,
        })

    flag_output = []
    for flag in flag_rows:
        section = section_map.get(flag["section_id"], {})
        activity = next((
            item for item in activities
            if item["id"] == flag["assessment_activity_id"]
        ), {})
        course = course_map.get(section.get("course_id"), {})
        student = student_by_id.get(flag.get("student_profile_id"), {})
        flag_output.append({
            **flag,
            "assessment_title": activity.get("title", ""),
            "faculty_name": faculty_names.get(section.get("faculty_id"), ""),
            "course_code": course.get("code", ""),
            "section_name": section.get("section_name", ""),
            "student_name": student.get("full_name", ""),
        })

    return {
        "assessments": assessment_rows,
        "flags": flag_output,
        "sections": [{
            "id": row["id"],
            "section_name": row.get("section_name", ""),
            "course_code": course_map.get(row["course_id"], {}).get("code", ""),
            "course_title": course_map.get(row["course_id"], {}).get("title", ""),
            "faculty_profile_id": row.get("faculty_id"),
            "faculty_name": faculty_names.get(row.get("faculty_id"), ""),
            "academic_year_name": year_names.get(
                row.get("academic_year_id"), ""
            ),
            "gradebook_status": gradebook_status.get(row["id"], "draft"),
        } for row in sections],
    }


@app.get("/api/department-head/assessment-reviews")
@require_role("department-head")
def get_department_head_assessment_reviews():
    if not admin_supabase:
        return jsonify({"error": "Department assessment reviews are unavailable."}), 503
    try:
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        workspace = _department_head_assessment_review_workspace(department_id)
        departments = (
            admin_supabase.table("departments")
            .select("id, name")
            .eq("id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        workspace["department"] = departments[0] if departments else {
            "id": department_id,
            "name": "",
        }
        return jsonify(workspace), 200
    except Exception:
        app.logger.exception("Unable to load department assessment reviews")
        return jsonify({"error": "Department assessment reviews could not be loaded."}), 500


@app.post("/api/department-head/assessment-reviews/<assessment_id>/flags")
@require_role("department-head")
def create_department_head_assessment_flag(assessment_id):
    if not admin_supabase:
        return jsonify({"error": "Assessment queries are unavailable."}), 503
    try:
        assessment_id = str(UUID(assessment_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        workspace = _department_head_assessment_review_workspace(department_id)
        activity = next((
            row for row in workspace["assessments"]
            if row["id"] == assessment_id
        ), None)
        if not activity:
            return jsonify({"error": "Assessment not found in your department."}), 404
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Query data must be a JSON object."}), 400
        issue = data.get("issue", "")
        description = data.get("description", "")
        if not isinstance(issue, str) or not isinstance(description, str):
            return jsonify({"error": "Query issue and details must be text."}), 400
        issue, description = issue.strip(), description.strip()
        if not issue or len(issue) > 80:
            return jsonify({"error": "Choose an issue label up to 80 characters."}), 400
        if not description or len(description) > 1000:
            return jsonify({"error": "Query details must contain 1 to 1,000 characters."}), 400
        student_profile_id = None
        if data.get("student_profile_id"):
            student_profile_id = str(UUID(str(data["student_profile_id"])))
            if not any(
                row["student_profile_id"] == student_profile_id
                for row in activity["scores"]
            ):
                return jsonify({"error": "Student is not actively enrolled in this section."}), 400
        result = (
            admin_supabase.table("assessment_review_flags")
            .insert({
                "section_id": activity["section_id"],
                "assessment_activity_id": assessment_id,
                "student_profile_id": student_profile_id,
                "created_by": str(g.authenticated_user.id),
                "issue": issue,
                "description": description,
            })
            .execute()
        )
        if not result.data:
            raise RuntimeError("Assessment query returned no saved record.")
        return jsonify({"flag": result.data[0]}), 201
    except ValueError:
        return jsonify({"error": "Invalid assessment or student ID."}), 400
    except Exception:
        app.logger.exception("Unable to create department assessment query")
        return jsonify({"error": "Assessment query could not be created."}), 500


@app.post("/api/faculty/assessment-review-flags/<flag_id>/respond")
@require_role("faculty")
def respond_to_assessment_review_flag(flag_id):
    if not admin_supabase:
        return jsonify({"error": "Assessment queries are unavailable."}), 503
    try:
        flag_id = str(UUID(flag_id))
        flags = (
            admin_supabase.table("assessment_review_flags")
            .select("id, section_id, status")
            .eq("id", flag_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not flags:
            return jsonify({"error": "Assessment query not found."}), 404
        flag = flags[0]
        if not get_faculty_section(flag["section_id"]):
            return jsonify({"error": "This query is not for a section assigned to you."}), 403
        if flag["status"] == "resolved":
            return jsonify({"error": "This query has already been resolved."}), 409
        data = request.get_json(silent=True)
        response = data.get("response") if isinstance(data, dict) else None
        if not isinstance(response, str) or not response.strip() or len(response.strip()) > 1000:
            return jsonify({"error": "Provide a response of 1 to 1,000 characters."}), 400
        updated_at = datetime.now(timezone.utc).isoformat()
        result = (
            admin_supabase.table("assessment_review_flags")
            .update({
                "response": response.strip(),
                "responded_by": str(g.authenticated_user.id),
                "responded_at": updated_at,
                "status": "responded",
                "updated_at": updated_at,
            })
            .eq("id", flag_id)
            .execute()
        )
        if not result.data:
            raise RuntimeError("Faculty query response returned no updated record.")
        return jsonify({"flag": result.data[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid query ID."}), 400
    except Exception:
        app.logger.exception("Unable to respond to assessment query")
        return jsonify({"error": "Query response could not be saved."}), 500


@app.post("/api/department-head/assessment-review-flags/<flag_id>/resolve")
@require_role("department-head")
def resolve_department_head_assessment_flag(flag_id):
    if not admin_supabase:
        return jsonify({"error": "Assessment query resolution is unavailable."}), 503
    try:
        flag_id = str(UUID(flag_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        flags = (
            admin_supabase.table("assessment_review_flags")
            .select("id, section_id, status")
            .eq("id", flag_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not flags:
            return jsonify({"error": "Assessment query not found."}), 404
        flag = flags[0]
        sections = (
            admin_supabase.table("course_sections")
            .select("id, course_id")
            .eq("id", flag["section_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        courses = (
            admin_supabase.table("courses")
            .select("id")
            .eq("id", sections[0]["course_id"])
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            if sections else []
        )
        if not courses:
            return jsonify({"error": "Assessment query is outside your department."}), 403
        if flag["status"] == "resolved":
            return jsonify({"error": "Assessment query is already resolved."}), 409
        resolved_at = datetime.now(timezone.utc).isoformat()
        result = (
            admin_supabase.table("assessment_review_flags")
            .update({
                "status": "resolved",
                "resolved_by": str(g.authenticated_user.id),
                "resolved_at": resolved_at,
                "updated_at": resolved_at,
            })
            .eq("id", flag_id)
            .execute()
        )
        if not result.data:
            raise RuntimeError("Assessment query resolution returned no updated record.")
        return jsonify({"flag": result.data[0]}), 200
    except ValueError:
        return jsonify({"error": "Invalid query ID."}), 400
    except Exception:
        app.logger.exception("Unable to resolve department assessment query")
        return jsonify({"error": "Assessment query could not be resolved."}), 500


@app.post("/api/department-head/sections/<section_id>/lock")
@require_role("department-head")
def lock_department_head_gradebook(section_id):
    if not admin_supabase:
        return jsonify({"error": "Gradebook locking is unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        department_id = _department_head_department_id(g.authenticated_user.id)
        if not department_id:
            return jsonify({"error": "Your department profile is incomplete."}), 409
        sections = (
            admin_supabase.table("course_sections")
            .select("id, course_id, academic_year_id")
            .eq("id", section_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not sections:
            return jsonify({"error": "Section not found."}), 404
        section = sections[0]
        courses = (
            admin_supabase.table("courses")
            .select("id")
            .eq("id", section["course_id"])
            .eq("department_id", department_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not courses:
            return jsonify({"error": "Section is outside your department."}), 403
        if not section.get("academic_year_id"):
            return jsonify({"error": "Assign this section to an academic year before locking its gradebook."}), 409
        result = admin_supabase.rpc(
            "lock_department_gradebook",
            {
                "p_section_id": section_id,
                "p_academic_year_id": section["academic_year_id"],
                "p_actor_id": str(g.authenticated_user.id),
            },
        ).execute()
        gradebook_id = result.data
        if isinstance(gradebook_id, list):
            gradebook_id = gradebook_id[0] if gradebook_id else None
        if not gradebook_id:
            raise RuntimeError("Gradebook lock returned no record.")
        return jsonify({"gradebook_id": str(gradebook_id), "status": "locked"}), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception as error:
        if "open assessment queries" in str(error).lower():
            return jsonify({"error": "Resolve all open assessment queries before locking this gradebook."}), 409
        if "already locked" in str(error).lower():
            return jsonify({"error": "This gradebook is already locked."}), 409
        app.logger.exception("Unable to lock department gradebook")
        return jsonify({"error": "Gradebook could not be locked."}), 500

@app.get("/api/student/course-outcomes")
@require_role("student")
def get_student_course_outcomes():
    if not admin_supabase:
        return jsonify({"error": "Course outcome results are unavailable."}), 503
    try:
        profile = _account_profile("student", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"error": "Your student profile is incomplete."}), 409
        enrollments = (
            admin_supabase.table("enrollments")
            .select("section_id")
            .eq("student_profile_id", profile["id"])
            .eq("enrollment_status", "active").execute().data or []
        )
        section_ids = list({row["section_id"] for row in enrollments})
        section_ids = _student_section_scope(section_ids)
        if section_ids is None:
            return jsonify({"error": "You are not actively enrolled in this section."}), 403
        if not section_ids:
            return jsonify({"outcomes": [], "profile_complete": True}), 200
        sections = (
            admin_supabase.table("course_sections")
            .select("id, course_id, section_name")
            .in_("id", section_ids).execute().data or []
        )
        reviews = (
            admin_supabase.table("course_mapping_reviews")
            .select("section_id, status")
            .in_("section_id", section_ids).execute().data or []
        )
        verified = {row["section_id"] for row in reviews if row.get("status") == "verified"}
        sections = [row for row in sections if row["id"] in verified]
        if not sections:
            return jsonify({"outcomes": [], "profile_complete": True}), 200
        section_ids = [row["id"] for row in sections]
        course_ids = list({row["course_id"] for row in sections})
        courses = (
            admin_supabase.table("courses")
            .select("id, code, title").in_("id", course_ids)
            .execute().data or []
        )
        course_by_id = {row["id"]: row for row in courses}
        outcomes = (
            admin_supabase.table("course_outcomes")
            .select("id, course_id, code, description, target_percentage")
            .in_("course_id", course_ids).order("code")
            .execute().data or []
        )
        outcome_ids = [row["id"] for row in outcomes]
        coso_rows = []
        if outcome_ids:
            coso_rows = (
                admin_supabase.table("course_outcome_student_outcomes")
                .select("course_outcome_id, student_outcome_id")
                .in_("course_outcome_id", outcome_ids).execute().data or []
            )
        so_ids = list({row["student_outcome_id"] for row in coso_rows})
        so_rows = []
        if so_ids:
            so_rows = (
                admin_supabase.table("student_outcomes")
                .select("id, code, description").in_("id", so_ids)
                .execute().data or []
            )
        so_by_id = {row["id"]: row for row in so_rows}
        so_by_co = {}
        for mapping in coso_rows:
            so = so_by_id.get(mapping["student_outcome_id"])
            if so:
                so_by_co.setdefault(mapping["course_outcome_id"], []).append(so)
        attainment = (
            admin_supabase.table("student_co_attainment")
            .select("section_id, course_outcome_id, attainment_percentage, status, can_view")
            .eq("student_profile_id", profile["id"])
            .in_("section_id", section_ids).execute().data or []
        )
        attainment_by_key = {
            (row["section_id"], row["course_outcome_id"]): row
            for row in attainment if row.get("can_view")
        }
        section_by_course = {}
        for section in sections:
            section_by_course.setdefault(section["course_id"], []).append(section)
        results = []
        for outcome in outcomes:
            course = course_by_id.get(outcome["course_id"], {})
            for section in section_by_course.get(outcome["course_id"], []):
                record = attainment_by_key.get((section["id"], outcome["id"]))
                results.append({
                    "section_id": section["id"],
                    "section_name": section["section_name"],
                    "course_code": course.get("code", ""),
                    "course_title": course.get("title", ""),
                    "course_outcome_id": outcome["id"],
                    "code": outcome["code"],
                    "description": outcome["description"],
                    "student_outcomes": so_by_co.get(outcome["id"], []),
                    "attainment_percentage": record.get("attainment_percentage") if record else None,
                    "status": record.get("status") if record else "awaiting_results",
                    "target_percentage": float(outcome.get("target_percentage") or 70),
                    "release_status": (
                        "Released"
                        if record and record.get("attainment_percentage") is not None
                        else "Not Released"
                    ),
                })
        return jsonify({"outcomes": results, "profile_complete": True}), 200
    except Exception:
        app.logger.exception("Unable to load student course outcome results")
        return jsonify({"error": "Course outcome results could not be loaded."}), 500


def _so_assessment_payload(assessment, so_by_id=None):
    so_by_id = so_by_id or {}
    so = so_by_id.get(assessment.get("student_outcome_id"), {})
    if so.get("description") == so.get("code"):
        so = {**so, "description": ""}
    return {
        **assessment,
        "student_outcome": so,
        "performance_indicators": assessment.get("performance_indicators") or [],
        "rating_scale": assessment.get("rating_scale") or [],
    }


@app.get("/api/faculty/sections/<section_id>/so-assessments")
@require_role("faculty")
def faculty_so_assessments(section_id):
    if not admin_supabase:
        return jsonify({"error": "SO assessments are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        if not get_faculty_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        rows = admin_supabase.table("so_self_assessments").select(
            "id, section_id, student_outcome_id, title, due_date, performance_indicators, "
            "rating_scale, status, created_at, updated_at"
        ).eq("section_id", section_id).order("created_at", desc=True).execute().data or []
        so_ids = list({row["student_outcome_id"] for row in rows})
        so_rows = admin_supabase.table("student_outcomes").select(
            "id, code, description"
        ).in_("id", so_ids).execute().data if so_ids else []
        so_by_id = {row["id"]: row for row in (so_rows or [])}
        counts = {}
        active_students = admin_supabase.table("enrollments").select(
            "student_profile_id"
        ).eq("section_id", section_id).eq("enrollment_status", "active").execute().data or []
        student_count = len(active_students)
        active_student_ids = {row["student_profile_id"] for row in active_students}
        if rows:
            response_rows = admin_supabase.table("so_self_assessment_responses").select(
                "assessment_id, student_profile_id"
            ).in_("assessment_id", [row["id"] for row in rows]).execute().data or []
            for response in response_rows:
                if response["student_profile_id"] in active_student_ids:
                    counts[response["assessment_id"]] = counts.get(response["assessment_id"], 0) + 1
        return jsonify({"assessments": [
            {**_so_assessment_payload(row, so_by_id),
             "response_count": counts.get(row["id"], 0),
             "student_count": student_count,
             "completion_rate": (
                 round(counts.get(row["id"], 0) / student_count * 100, 1)
                 if student_count and row.get("status") != "draft"
                 else None if row.get("status") == "draft" else 0
             )}
            for row in rows
        ]}), 200
    except ValueError:
        return jsonify({"error": "Invalid section ID."}), 400
    except Exception:
        app.logger.exception("Unable to load faculty SO assessments")
        return jsonify({"error": "SO assessments could not be loaded."}), 500


def _validate_so_assessment_data(data):
    if not isinstance(data, dict):
        raise ValueError("Assessment data must be an object.")
    title = str(data.get("title", "")).strip()
    if not title or len(title) > 160:
        raise ValueError("Enter an assessment title up to 160 characters.")
    try:
        so_id = str(UUID(str(data.get("student_outcome_id", ""))))
    except (TypeError, ValueError):
        raise ValueError("Choose a valid Student Outcome.")
    due_date = str(data.get("due_date") or "").strip() or None
    if due_date:
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Due date must use YYYY-MM-DD format.")
    indicators = data.get("performance_indicators")
    scale = data.get("rating_scale")
    if not isinstance(indicators, list) or not 1 <= len(indicators) <= 30:
        raise ValueError("Add between 1 and 30 performance indicators.")
    clean_indicators = []
    for item in indicators:
        text = str(item).strip() if isinstance(item, str) else ""
        if not text or len(text) > 300:
            raise ValueError("Each performance indicator must contain 1 to 300 characters.")
        clean_indicators.append(text)
    if not isinstance(scale, list) or not 2 <= len(scale) <= 10:
        raise ValueError("Add between 2 and 10 rating scale levels.")
    clean_scale = []
    seen_values = set()
    for item in scale:
        if not isinstance(item, dict):
            raise ValueError("Rating scale levels need a value and label.")
        try:
            value = int(item.get("value"))
        except (TypeError, ValueError):
            raise ValueError("Rating values must be whole numbers.")
        label = str(item.get("label", "")).strip()
        if value in seen_values or not label or len(label) > 80:
            raise ValueError("Rating scale values must be unique and labels must be 1 to 80 characters.")
        seen_values.add(value)
        clean_scale.append({"value": value, "label": label})
    status = data.get("status", "draft")
    if status not in {"draft", "open", "closed"}:
        raise ValueError("Choose a valid assessment status.")
    return {
        "student_outcome_id": so_id, "title": title, "due_date": due_date,
        "performance_indicators": clean_indicators, "rating_scale": clean_scale,
        "status": status,
    }


def _course_has_fixed_so_mapping(course_id, student_outcome_id):
    student_outcomes = admin_supabase.table("student_outcomes").select(
        "id, code"
    ).eq("id", student_outcome_id).limit(1).execute().data or []
    if not student_outcomes or student_outcomes[0]["code"] not in FIXED_STUDENT_OUTCOME_CODES:
        return False
    course_outcomes = admin_supabase.table("course_outcomes").select(
        "id, code"
    ).eq("course_id", course_id).execute().data or []
    fixed_course_outcome_ids = [
        row["id"] for row in course_outcomes
        if row["code"] in FIXED_COURSE_OUTCOME_CODES
    ]
    if not fixed_course_outcome_ids:
        return False
    mappings = admin_supabase.table("course_outcome_student_outcomes").select(
        "student_outcome_id"
    ).in_("course_outcome_id", fixed_course_outcome_ids).eq(
        "student_outcome_id", student_outcome_id
    ).limit(1).execute().data or []
    return bool(mappings)


@app.post("/api/faculty/sections/<section_id>/so-assessments")
@require_role("faculty")
def create_faculty_so_assessment(section_id):
    if not admin_supabase:
        return jsonify({"error": "SO assessments are unavailable."}), 503
    try:
        section_id = str(UUID(section_id))
        if not get_faculty_section(section_id):
            return jsonify({"error": "Section not found or not assigned to you."}), 404
        section = admin_supabase.table("course_sections").select("course_id").eq(
            "id", section_id
        ).limit(1).execute().data or []
        if not section:
            return jsonify({"error": "Section not found."}), 404
        data = _validate_so_assessment_data(request.get_json(silent=True))
        if not _course_has_fixed_so_mapping(
            section[0]["course_id"], data["student_outcome_id"]
        ):
            return jsonify({"error": "Map this Student Outcome to a Course Outcome before creating its assessment."}), 409
        result = admin_supabase.table("so_self_assessments").insert({
            **data, "section_id": section_id, "created_by": str(g.authenticated_user.id),
        }).execute()
        rows = result.data or []
        if not rows:
            return jsonify({"error": "Assessment could not be saved."}), 500
        so = admin_supabase.table("student_outcomes").select("id, code, description").eq(
            "id", data["student_outcome_id"]
        ).limit(1).execute().data or []
        return jsonify({"assessment": _so_assessment_payload(rows[0], {so[0]["id"]: so[0]} if so else {})}), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        if "duplicate key" in str(error).lower():
            return jsonify({"error": "An assessment for this Student Outcome already exists in this section."}), 409
        app.logger.exception("Unable to create faculty SO assessment")
        return jsonify({"error": "SO assessment could not be saved."}), 500


@app.put("/api/faculty/so-assessments/<assessment_id>")
@require_role("faculty")
def update_faculty_so_assessment(assessment_id):
    try:
        assessment_id = str(UUID(assessment_id))
        rows = admin_supabase.table("so_self_assessments").select("id, section_id").eq(
            "id", assessment_id
        ).limit(1).execute().data or []
        if not rows:
            return jsonify({"error": "Assessment not found."}), 404
        if not get_faculty_section(rows[0]["section_id"]):
            return jsonify({"error": "Assessment is not in a section assigned to you."}), 403
        data = _validate_so_assessment_data(request.get_json(silent=True))
        section = admin_supabase.table("course_sections").select("course_id").eq(
            "id", rows[0]["section_id"]
        ).limit(1).execute().data or []
        if not section or not _course_has_fixed_so_mapping(
            section[0]["course_id"], data["student_outcome_id"]
        ):
            return jsonify({"error": "Map this Student Outcome to a Course Outcome before updating its assessment."}), 409
        result = admin_supabase.table("so_self_assessments").update({
            **data, "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", assessment_id).execute().data or []
        return jsonify({"assessment": result[0] if result else None}), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Unable to update faculty SO assessment")
        return jsonify({"error": "SO assessment could not be updated."}), 500


@app.delete("/api/faculty/so-assessments/<assessment_id>")
@require_role("faculty")
def delete_faculty_so_assessment(assessment_id):
    try:
        assessment_id = str(UUID(assessment_id))
        rows = admin_supabase.table("so_self_assessments").select("id, section_id").eq(
            "id", assessment_id
        ).limit(1).execute().data or []
        if not rows:
            return jsonify({"error": "Assessment not found."}), 404
        if not get_faculty_section(rows[0]["section_id"]):
            return jsonify({"error": "Assessment is not in a section assigned to you."}), 403
        admin_supabase.table("so_self_assessments").delete().eq("id", assessment_id).execute()
        return jsonify({"status": "deleted"}), 200
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception:
        app.logger.exception("Unable to delete faculty SO assessment")
        return jsonify({"error": "SO assessment could not be deleted."}), 500


@app.get("/api/student/so-assessments")
@require_role("student")
def student_so_assessments():
    try:
        profile = _account_profile("student", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"assessments": [], "profile_complete": False}), 200
        enrollment_rows = admin_supabase.table("enrollments").select("section_id").eq(
            "student_profile_id", profile["id"]
        ).eq("enrollment_status", "active").execute().data or []
        section_ids = list({row["section_id"] for row in enrollment_rows})
        section_ids = _student_section_scope(section_ids)
        if section_ids is None:
            return jsonify({"error": "You are not actively enrolled in this section."}), 403
        if not section_ids:
            return jsonify({"assessments": [], "profile_complete": True}), 200
        reviews = admin_supabase.table("course_mapping_reviews").select(
            "section_id, status"
        ).in_("section_id", section_ids).execute().data or []
        verified_ids = [row["section_id"] for row in reviews if row.get("status") == "verified"]
        if not verified_ids:
            return jsonify({"assessments": [], "profile_complete": True}), 200
        rows = admin_supabase.table("so_self_assessments").select(
            "id, section_id, student_outcome_id, title, due_date, performance_indicators, rating_scale, status"
        ).in_("section_id", verified_ids).eq("status", "open").order("due_date").execute().data or []
        today = datetime.now(timezone.utc).date().isoformat()
        rows = [row for row in rows if not row.get("due_date") or row["due_date"] >= today]
        response_rows = admin_supabase.table("so_self_assessment_responses").select(
            "assessment_id"
        ).eq("student_profile_id", profile["id"]).in_(
            "assessment_id", [row["id"] for row in rows]
        ).execute().data if rows else []
        completed = {row["assessment_id"] for row in (response_rows or [])}
        rows = [row for row in rows if row["id"] not in completed]
        section_rows = admin_supabase.table("course_sections").select(
            "id, course_id, section_name, academic_term_id"
        ).in_("id", verified_ids).execute().data or []
        course_ids = list({row["course_id"] for row in section_rows})
        courses = admin_supabase.table("courses").select("id, code, title").in_(
            "id", course_ids
        ).execute().data if course_ids else []
        terms_by_id = {}
        term_ids = list({row["academic_term_id"] for row in section_rows if row.get("academic_term_id")})
        terms = admin_supabase.table("academic_terms").select("id, name, academic_year_id").in_(
            "id", term_ids
        ).execute().data if term_ids else []
        terms_by_id = {row["id"]: row for row in (terms or [])}
        year_ids = list({row["academic_year_id"] for row in (terms or []) if row.get("academic_year_id")})
        years = admin_supabase.table("academic_years").select("id, name").in_("id", year_ids).execute().data if year_ids else []
        year_by_id = {row["id"]: row["name"] for row in (years or [])}
        course_by_id = {row["id"]: row for row in (courses or [])}
        section_by_id = {row["id"]: row for row in section_rows}
        so_ids = list({row["student_outcome_id"] for row in rows})
        so_rows = admin_supabase.table("student_outcomes").select("id, code, description").in_("id", so_ids).execute().data if so_ids else []
        so_by_id = {row["id"]: row for row in (so_rows or [])}
        syllabus_rows = admin_supabase.table("course_syllabi").select("section_id, file_name, storage_path").in_("section_id", verified_ids).execute().data or []
        syllabus_by_section = {row["section_id"]: row for row in syllabus_rows}
        result = []
        for row in rows:
            section = section_by_id.get(row["section_id"], {})
            course = course_by_id.get(section.get("course_id"), {})
            syllabus = syllabus_by_section.get(row["section_id"])
            term = terms_by_id.get(section.get("academic_term_id"), {})
            result.append({
                **_so_assessment_payload(row, so_by_id),
                "course_code": course.get("code", ""), "course_title": course.get("title", ""),
                "section_name": section.get("section_name", ""),
                "academic_term": term.get("name", ""),
                "academic_year": year_by_id.get(term.get("academic_year_id"), ""),
                "syllabus_file_name": syllabus.get("file_name") if syllabus else None,
                "syllabus_url": signed_syllabus_url(syllabus, download=False) if syllabus else None,
                "syllabus_download_url": signed_syllabus_url(syllabus) if syllabus else None,
            })
        return jsonify({"assessments": result, "profile_complete": True}), 200
    except Exception:
        app.logger.exception("Unable to load student SO assessments")
        return jsonify({"error": "SO assessments could not be loaded."}), 500


@app.post("/api/student/so-assessments/<assessment_id>/responses")
@require_role("student")
def submit_student_so_response(assessment_id):
    try:
        assessment_id = str(UUID(assessment_id))
        profile = _account_profile("student", g.authenticated_user.id, "id")
        if not profile:
            return jsonify({"error": "Complete your student profile before submitting."}), 409
        assessment_rows = admin_supabase.table("so_self_assessments").select(
            "id, section_id, due_date, performance_indicators, rating_scale, status"
        ).eq("id", assessment_id).eq("status", "open").limit(1).execute().data or []
        if not assessment_rows:
            return jsonify({"error": "This assessment is no longer open."}), 404
        assessment = assessment_rows[0]
        enrollment = admin_supabase.table("enrollments").select("id").eq(
            "section_id", assessment["section_id"]
        ).eq("student_profile_id", profile["id"]).eq("enrollment_status", "active").limit(1).execute().data or []
        if not enrollment or not _section_mapping_is_verified(assessment["section_id"]):
            return jsonify({"error": "This assessment is not available for your verified course section."}), 403
        if assessment.get("due_date") and assessment["due_date"] < datetime.now(timezone.utc).date().isoformat():
            return jsonify({"error": "The due date has passed."}), 409
        data = request.get_json(silent=True) or {}
        answers = data.get("answers") if isinstance(data, dict) else None
        indicators = assessment.get("performance_indicators") or []
        scale_values = {str(item.get("value")) for item in assessment.get("rating_scale") or [] if isinstance(item, dict)}
        if not isinstance(answers, dict) or len(answers) != len(indicators):
            return jsonify({"error": "Answer every performance indicator before submitting."}), 400
        normalized = {}
        for index in range(len(indicators)):
            value = str(answers.get(str(index), ""))
            if value not in scale_values:
                return jsonify({"error": "Choose a valid rating for every indicator."}), 400
            normalized[str(index)] = value
        admin_supabase.table("so_self_assessment_responses").upsert({
            "assessment_id": assessment_id, "student_profile_id": profile["id"],
            "answers": normalized, "submitted_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="assessment_id,student_profile_id").execute()
        return jsonify({"status": "submitted"}), 201
    except ValueError:
        return jsonify({"error": "Invalid assessment ID."}), 400
    except Exception:
        app.logger.exception("Unable to save student SO response")
        return jsonify({"error": "Your response could not be submitted."}), 500


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


def signed_syllabus_url(record, download=True):
    options = {"download": record["file_name"]} if download else None
    response = admin_supabase.storage.from_(SYLLABI_BUCKET).create_signed_url(
        record["storage_path"], 900, options=options,
    )
    return response.get("signedURL") or response.get("signedUrl")


def get_oauth_callback_url():
    """Build the callback from Render's public URL, or the local request URL."""
    public_base_url = (
        os.getenv("PUBLIC_APP_URL", "").strip()
        or os.getenv("RENDER_EXTERNAL_URL", "").strip()
    )
    if public_base_url:
        return public_base_url.rstrip("/") + url_for("auth_callback")
    return url_for("auth_callback", _external=True)


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
                "signed_url": signed_syllabus_url(record, download=False),
                "download_url": signed_syllabus_url(record),
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

        _set_mapping_review_status(section_id, "pending")

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
            _set_mapping_review_status(section_id, "pending")

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
        section_ids = _student_section_scope(section_ids)
        if section_ids is None:
            return jsonify({"error": "You are not actively enrolled in this section."}), 403
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
                "signed_url": signed_syllabus_url(record, download=False),
                "download_url": signed_syllabus_url(record),
            })

        return jsonify({"profile_complete": True, "syllabi": syllabi}), 200
    except Exception:
        app.logger.exception("Unable to load student syllabi")
        return jsonify({"error": "Syllabi could not be loaded."}), 500


@app.get("/")
def home():
    # Supabase can fall back to the configured Site URL when the requested
    # OAuth redirect is not allowlisted. Forward that returned code to the
    # PKCE callback while this browser still has the OAuth session cookie.
    if session.get("oauth_code_verifier") and (
        request.args.get("code") or request.args.get("error")
    ):
        callback_args = {
            key: value
            for key in ("code", "error", "error_description")
            if (value := request.args.get(key))
        }
        app.logger.warning(
            "OAuth returned to the site root; forwarding to the callback route."
        )
        return redirect(url_for("auth_callback", **callback_args))

    return render_template("website.html")


@app.get("/healthz")
def health_check():
    return jsonify({"status": "ok"}), 200


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
        redirect_uri = get_oauth_callback_url()
        app.logger.info("Starting Google OAuth with redirect URI %s", redirect_uri)

        response = auth_client.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": redirect_uri,
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

        session.permanent = True
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
        redirect_uri = get_oauth_callback_url()
        app.logger.info("Starting Microsoft OAuth with redirect URI %s", redirect_uri)

        response = auth_client.auth.sign_in_with_oauth({
            "provider": "azure",
            "options": {
                "redirect_to": redirect_uri,
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

        session.permanent = True
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
    return render_template(
        "requirement 1/so-dept-head.html",
        role_label="Department Head", admin_view=False,
    )


@app.get("/requirement 1/so-admin.html")
@require_role("admin-security")
def admin_so_dashboard():
    return render_template(
        "requirement 1/so-dept-head.html",
        role_label="Admin & Security", admin_view=True,
    )


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
        settings_rows = (
            admin_supabase.table("account_settings")
            .select("profile_photo_path")
            .eq("user_id", str(g.authenticated_user.id))
            .limit(1)
            .execute()
            .data
            or []
        )
        photo_url = ""
        if settings_rows and settings_rows[0].get("profile_photo_path"):
            signed_photo = admin_supabase.storage.from_(PROFILE_PHOTOS_BUCKET).create_signed_url(
                settings_rows[0]["profile_photo_path"], 60 * 60
            )
            photo_url = (
                signed_photo.get("signedURL")
                or signed_photo.get("signedUrl")
                or ""
            )
        return jsonify({
            "profile": {
                "role": role,
                "full_name": user.get("full_name") or "",
                "id_number": id_number or "",
                "affiliation": affiliation,
                "email": user.get("email") or g.authenticated_user.email or "",
                "profile_photo_url": photo_url,
            }
        }), 200
    except Exception:
        app.logger.exception("Unable to load authenticated account profile")
        return jsonify({"error": "Account details could not be loaded."}), 500


@app.post("/api/account/profile-photo")
@require_authenticated
def upload_account_profile_photo():
    if not admin_supabase:
        return jsonify({"error": "Profile photo storage is unavailable."}), 503

    photo = request.files.get("photo")
    if not photo or not photo.filename:
        return jsonify({"error": "Choose a profile photo to upload."}), 400

    content = photo.stream.read(PROFILE_PHOTO_MAX_BYTES + 1)
    if not content:
        return jsonify({"error": "The selected photo is empty."}), 400
    if len(content) > PROFILE_PHOTO_MAX_BYTES:
        return jsonify({"error": "Choose an image up to 1 MB."}), 413

    signatures = {
        "image/jpeg": (b"\xff\xd8\xff", "jpg"),
        "image/png": (b"\x89PNG\r\n\x1a\n", "png"),
        "image/webp": (None, "webp"),
    }
    content_type = (photo.mimetype or "").lower()
    if content_type not in signatures:
        return jsonify({"error": "Use a JPG, PNG, or WebP image."}), 400
    signature, extension = signatures[content_type]
    if signature and not content.startswith(signature):
        return jsonify({"error": "The uploaded file is not a valid image of that type."}), 400
    if content_type == "image/webp" and not (
        len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    ):
        return jsonify({"error": "The uploaded file is not a valid WebP image."}), 400

    user_id = str(g.authenticated_user.id)
    photo_path = f"{user_id}/{uuid4().hex}.{extension}"
    try:
        previous_rows = (
            admin_supabase.table("account_settings")
            .select("profile_photo_path")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        previous_path = previous_rows[0].get("profile_photo_path") if previous_rows else None

        admin_supabase.storage.from_(PROFILE_PHOTOS_BUCKET).upload(
            photo_path,
            content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        admin_supabase.table("account_settings").upsert({
            "user_id": user_id,
            "profile_photo_path": photo_path,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()

        if previous_path and previous_path != photo_path:
            try:
                admin_supabase.storage.from_(PROFILE_PHOTOS_BUCKET).remove([previous_path])
            except Exception:
                app.logger.warning("Unable to remove replaced profile photo for user %s", user_id)

        signed_photo = admin_supabase.storage.from_(PROFILE_PHOTOS_BUCKET).create_signed_url(
            photo_path, 60 * 60
        )
        return jsonify({
            "status": "photo_updated",
            "profile_photo_url": signed_photo.get("signedURL") or signed_photo.get("signedUrl") or "",
        }), 200
    except Exception:
        app.logger.exception("Unable to save profile photo for user %s", user_id)
        return jsonify({"error": "Profile photo could not be saved."}), 500


@app.delete("/api/account/profile-photo")
@require_authenticated
def delete_account_profile_photo():
    if not admin_supabase:
        return jsonify({"error": "Profile photo storage is unavailable."}), 503

    user_id = str(g.authenticated_user.id)
    try:
        rows = (
            admin_supabase.table("account_settings")
            .select("profile_photo_path")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        photo_path = rows[0].get("profile_photo_path") if rows else None
        admin_supabase.table("account_settings").upsert({
            "user_id": user_id,
            "profile_photo_path": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()
        if photo_path:
            try:
                admin_supabase.storage.from_(PROFILE_PHOTOS_BUCKET).remove([photo_path])
            except Exception:
                app.logger.warning("Unable to delete old profile photo for user %s", user_id)
        return jsonify({"status": "photo_removed"}), 200
    except Exception:
        app.logger.exception("Unable to remove profile photo for user %s", user_id)
        return jsonify({"error": "Profile photo could not be removed."}), 500


@app.post("/api/account/change-password")
@require_authenticated
def change_account_password():
    data = get_json_data()
    current_password = data.get("currentPassword")
    new_password = data.get("newPassword")
    confirm_password = data.get("confirmPassword")

    if not all(isinstance(value, str) and value for value in (
        current_password, new_password, confirm_password
    )):
        return jsonify({"error": "Complete all password fields."}), 400
    if new_password != confirm_password:
        return jsonify({"error": "New password and confirmation do not match."}), 400
    if (
        len(new_password) < 8
        or not any(character.isalpha() for character in new_password)
        or not any(character.isdigit() for character in new_password)
        or not any(not character.isalnum() for character in new_password)
    ):
        return jsonify({
            "error": "Use at least 8 characters with a letter, number, and special character."
        }), 400

    email = str(g.authenticated_user.email or "").strip().lower()
    user_id = str(g.authenticated_user.id)
    if not email:
        return jsonify({"error": "Your account email could not be verified."}), 400

    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        current_login = auth_client.auth.sign_in_with_password({
            "email": email,
            "password": current_password,
        })
        if not current_login.user or str(current_login.user.id) != user_id:
            return jsonify({"error": "Current password is incorrect."}), 400

        updated = auth_client.auth.update_user({"password": new_password})
        if not updated.user or str(updated.user.id) != user_id:
            return jsonify({"error": "Password could not be updated."}), 400

        remembered_accounts = {
            remembered_email: account
            for remembered_email, account in get_remembered_accounts().items()
            if str(account.get("user_id")) != user_id
        }
        session["remembered_accounts"] = remembered_accounts
        response = jsonify({
            "status": "password_updated",
            "message": "Password updated successfully.",
        })
        set_remembered_accounts_cookie(response, remembered_accounts)
        return response, 200
    except Exception as error:
        error_text = str(error).lower()
        if any(term in error_text for term in (
            "invalid login credentials", "invalid credentials", "invalid password"
        )):
            return jsonify({"error": "Current password is incorrect."}), 400
        app.logger.exception("Unable to change password for user %s", user_id)
        return jsonify({"error": "Password could not be updated. Please try again."}), 500


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


@app.get("/api/admin/system-history")
@require_role("admin-security")
def admin_system_history_api():
    if not admin_supabase:
        return jsonify({"error": "System history storage is unavailable."}), 503

    try:
        result = (
            admin_supabase.table("audit_logs")
            .select("id,user_id,action,module,table_name,record_id,details,ip_address,level,created_at")
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        rows = result.data or []
        actor_ids = list({row.get("user_id") for row in rows if row.get("user_id")})
        actors = {}
        if actor_ids:
            users_result = (
                admin_supabase.table("users")
            .select("id,role")
                .in_("id", actor_ids)
                .execute()
            )
            actors = {user["id"]: user for user in (users_result.data or [])}

        events = []
        for row in rows:
            user = actors.get(row.get("user_id"), {})
            role = user.get("role") or "system"
            role_labels = {
                "student": "Student",
                "faculty": "Faculty",
                "department-head": "Department Head",
                "admin-security": "Admin",
            }
            details = row.get("details") or ""
            level = (row.get("level") or "INFO").upper()
            status_match = re.search(r"HTTP\s+(\d{3})", details, re.IGNORECASE)
            if status_match and int(status_match.group(1)) >= 400:
                outcome = "Failed"
            elif level == "ERROR":
                outcome = "Failed"
            elif level == "WARNING":
                outcome = "Failed"
            elif "requested" in details.casefold() or "pending" in details.casefold():
                outcome = "Pending"
            else:
                outcome = "Success"
            events.append({
                "id": row.get("id"),
                "timestamp": row.get("created_at"),
                "level": level,
                "role": role_labels.get(role, role.replace("-", " ").title()),
                "operation": row.get("action") or "System event",
                "module": row.get("module") or "System",
                "result": outcome,
                "details": details or row.get("module") or "—",
                "ip_address": row.get("ip_address") or "—",
            })
        return jsonify({"events": events, "count": len(events)})
    except Exception:
        app.logger.exception("Unable to load admin system history")
        return jsonify({"error": "System history could not be loaded."}), 500


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


@app.get("/verification-reset-password.html")
def verification_reset_password_page():
    return render_template("verification-reset-password.html")


@app.get("/create password.html")
def create_password_page():
    return render_template("create password.html")


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

    auth_client = None
    try:
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        result = auth_client.auth.get_user(access_token)
        return result.user
    except Exception:
        refresh_token = session.get("refresh_token")
        if not refresh_token:
            app.logger.exception("Failed to validate authenticated user")
            return None

    try:
        if auth_client is None:
            auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        refreshed = auth_client.auth.refresh_session(refresh_token)
        if not refreshed.user or not refreshed.session:
            raise RuntimeError("Supabase refresh returned no authenticated session.")
        session["access_token"] = refreshed.session.access_token
        session["refresh_token"] = refreshed.session.refresh_token
        session["user_id"] = refreshed.user.id
        session["user_role"] = get_user_role(refreshed.user)
        return refreshed.user
    except Exception:
        app.logger.exception("Failed to refresh authenticated user session")
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
            record_audit_event(
                action=f"{provider_name} sign-in",
                module="auth",
                level="SECURITY",
                details="OAuth sign-in completed; profile setup is required.",
                user_id=result.user.id,
            )
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
        record_audit_event(
            action=f"{provider_name} sign-in",
            module="auth",
            level="SECURITY",
            details="OAuth sign-in completed successfully.",
            user_id=result.user.id,
        )
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
        session["remembered_accounts"] = remembered_accounts

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

        # A password change invalidates this account's remembered-device trust.
        # Keep any other accounts remembered in the same browser.
        remembered_accounts = get_remembered_accounts()
        remembered_accounts = {
            email: account
            for email, account in remembered_accounts.items()
            if str(account.get("user_id")) != str(user_id)
        }
        session["remembered_accounts"] = remembered_accounts

        # Remove temporary reset authorization after success.
        session.pop("reset_password_user_id", None)
        session.pop("reset_password_access_token", None)
        session.pop("reset_password_refresh_token", None)

        response = jsonify({
            "status": "password_reset",
            "message": "Password updated successfully. Please log in."
        })
        set_remembered_accounts_cookie(response, remembered_accounts)
        return response, 200

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
    actor_id = session.get("user_id")

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if role not in allowed_roles:
        role = "student"

    if actor_id:
        record_audit_event(
            action="Logout",
            module="auth",
            level="SECURITY",
            details="User signed out.",
            user_id=actor_id,
        )
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
    actor_id = session.get("user_id")

    if actor_id:
        record_audit_event(
            action="Logout",
            module="auth",
            level="SECURITY",
            details="User signed out.",
            user_id=actor_id,
        )

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
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true"
    )
