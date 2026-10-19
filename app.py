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
from datetime import timedelta
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

    if role == "admin-security":
        return redirect("/requirement%202/cm-admin.html")

    if role not in {"student", "faculty", "department-head"}:
        return "You are not authorized to view this page.", 403

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

    if not isinstance(password, str) or len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    try:
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
            assign_trusted_role(result.user.id, role)

        # Preserve the existing email-verification workflow.
        return jsonify({
            "status": "request_processed",
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

        # Assign the selected role to a new Google account.
        if actual_role is None:
            if requested_role == "admin-security":
                auth_client.auth.sign_out()
                session.clear()
                return (
                    "Admin-Security access must be assigned by an administrator.",
                    403,
                )

            # Use the Supabase Admin client to assign trusted role metadata.
            assign_trusted_role(result.user.id, requested_role)
            actual_role = requested_role

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

        if actual_role == "student":
            return redirect("/requirement%201/so-student.html")
        elif actual_role == "faculty":
            return redirect("/requirement%201/so-faculty.html")
        elif actual_role == "department-head":
            return redirect("/requirement%201/so-dept-head.html")
        elif actual_role == "admin-security":
            return redirect("/requirement%202/cm-admin.html")
        else:
            return redirect("/")

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

        return view_function(*args, **kwargs)

    return wrapped


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

        if actual_role != selected_role:
            auth_client.auth.sign_out()
            return jsonify({
                "error": "The selected role does not match this account."
            }), 403

        session["user_role"] = actual_role

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
