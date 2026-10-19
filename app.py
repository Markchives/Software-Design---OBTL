from threading import Lock
import time
from functools import wraps
import os
from uuid import uuid4

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
from werkzeug.utils import secure_filename


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
            .select("id, course_id, academic_year_id, section_name")
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

        assignments = []
        for section in sections:
            course = courses_by_id.get(section["course_id"])
            if not course:
                continue

            year = years_by_id.get(section.get("academic_year_id"), {})
            assignments.append({
                "section_id": section["id"],
                "section_name": section["section_name"],
                "course_id": course["id"],
                "course_code": course["code"],
                "course_title": course["title"],
                "academic_year_id": section.get("academic_year_id"),
                "academic_year_name": year.get("name", ""),
            })

        return jsonify({"sections": assignments}), 200
    except Exception:
        app.logger.exception("Unable to load faculty course assignments")
        return jsonify({"error": "Course assignments could not be loaded."}), 500


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
            .select("id, course_id, academic_year_id, section_name")
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

        courses = []
        for enrollment in enrollments:
            section = sections_by_id.get(enrollment["section_id"])
            if not section:
                continue

            course = courses_by_id.get(section["course_id"])
            if not course:
                continue

            year = years_by_id.get(section.get("academic_year_id"), {})
            courses.append({
                "enrollment_id": enrollment["id"],
                "enrollment_status": enrollment["enrollment_status"],
                "section_name": section["section_name"],
                "course_code": course["code"],
                "course_title": course["title"],
                "academic_year_name": year.get("name", ""),
            })

        return jsonify({"profile_complete": True, "courses": courses}), 200
    except Exception:
        app.logger.exception("Unable to load student course enrollments")
        return jsonify({"error": "Student courses could not be loaded."}), 500


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
            .select("id, course_id, academic_year_id, section_name")
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
            syllabi.append({
                "course_id": course["id"],
                "course_code": course["code"],
                "course_title": course["title"],
                "section_name": section["section_name"],
                "academic_year_name": year.get("name", ""),
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
        table_name = "programs"
    elif role in {"faculty", "department-head"}:
        table_name = "departments"
    elif role == "admin-security":
        return jsonify({"options": []}), 200
    else:
        return jsonify({"error": "Invalid account role."}), 400

    if not admin_supabase:
        return jsonify({"error": "Registration options are unavailable."}), 503

    try:
        query = admin_supabase.table(table_name).select("name, code")
        if table_name == "departments":
            query = query.eq("is_college", True)
        rows = query.order("name").execute().data or []
        return jsonify({
            "options": [
                {"label": row["name"], "value": row["name"]}
                for row in rows
            ]
        }), 200
    except Exception:
        app.logger.exception("Unable to load registration options")
        return jsonify({"error": "Registration options could not be loaded."}), 500


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


@app.get("/main/courses-faculty.html")
@require_role("faculty")
def faculty_courses_page():
    return render_template("main/courses-faculty.html")


@app.get("/main/courses.html")
@require_role("student")
def student_courses_page():
    return render_template("main/courses.html")


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

    if not full_name or not id_number:
        return jsonify({"error": "Name and student or employee ID are required."}), 400

    profile_data = {
        "email": str(g.authenticated_user.email or "").strip().lower(),
        "full_name": full_name,
        "id_number": id_number,
    }

    try:
        if role == "student":
            program_name = department_name
            program_id = find_reference_id("programs", program_name)
            if not program_id:
                return jsonify({"error": "Select a program that exists in the system."}), 400
            profile_data["program_name"] = program_name
            provision_student_profile(
                g.authenticated_user,
                full_name,
                id_number,
                program_id,
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
            program_id = find_reference_id("programs", department_name)
            if not program_id:
                return jsonify({
                    "error": "Select a program that exists in the system."
                }), 400

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

        remembered_accounts = session.get("remembered_accounts", {})
        now = int(time.time())

        # Remove expired remembered accounts.
        remembered_accounts = {
            account_email: account_data
            for account_email, account_data in remembered_accounts.items()
            if isinstance(account_data, dict)
            and account_data.get("expires_at", 0) > now
        }

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

            return jsonify({
                "status": "authenticated",
                "message": "Login successful."
            }), 200

        # Password is correct, but require a separate login OTP.
        auth_client.auth.sign_out()

        auth_client.auth.sign_in_with_otp({
            "email": email,
            "options": {
                "should_create_user": False
            }
        })

        return jsonify({
            "status": "login_otp_required",
            "message": "A login verification code has been requested."
        }), 200

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

            remember_me = data.get("rememberMe", False) is True

            # Preserve remembered accounts when switching users.
            remembered_accounts = session.get("remembered_accounts", {})
            now = int(time.time())

            remembered_accounts = {
                account_email: account_data
                for account_email, account_data in remembered_accounts.items()
                if isinstance(account_data, dict)
                and account_data.get("expires_at", 0) > now
            }

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
            session["remembered_accounts"] = remembered_accounts

        return jsonify({
            "status": "verified",
            "purpose": purpose,
            "message": (
                "Login successful."
                if purpose == "login"
                else "Email verification successful."
            )
        }), 200

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

    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security",
    }

    if role not in allowed_roles:
        role = "student"

    session.clear()

    return redirect(
        url_for("login_page", role=role)
    )


@app.post("/api/auth/logout")
def logout():
    refresh_token = session.get("refresh_token")
    access_token = session.get("access_token")

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
