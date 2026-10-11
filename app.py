from functools import wraps
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request, render_template, session
from supabase import create_client, Client
from datetime import timedelta

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


@app.get("/")
def home():
    return render_template("website.html")


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "EduMetrics Flask backend is running"
    })


@app.get("/requirement 1/so-student.html")
def student_dashboard():
    return render_template("requirement 1/so-student.html")


@app.get("/requirement 1/so-faculty.html")
def faculty_dashboard():
    return render_template("requirement 1/so-faculty.html")


@app.get("/requirement 1/so-dept-head.html")
def department_head_dashboard():
    return render_template("requirement 1/so-dept-head.html")


@app.get("/register")
def register_page():
    return render_template("registration.html")


@app.get("/login page.html")
def login_page():
    return render_template("login page.html")


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

    role = str(data.get("role", "student")).strip().lower()

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
            "error": "First name, last name, email, and password are required."
        }), 400

    if not isinstance(password, str) or len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    try:
        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": role
                }
            }
        })

        if result.user:
            assign_trusted_role(result.user.id, role)

        # Do not expose tokens or passwords to the browser.
        return jsonify({
            "status": "request_processed",
            "message": (
                "If registration is accepted, check your email "
                "for the verification instructions."
            ),
            "user_created": result.user is not None
        }), 200

    except Exception:
        # Avoid exposing internal errors or secrets.
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
    return app_metadata.get("role")


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
    allowed_roles = {
        "student",
        "faculty",
        "department-head",
        "admin-security"
    }

    if not admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")

    if role not in allowed_roles:
        raise ValueError("Invalid role.")

    return admin_supabase.auth.admin.update_user_by_id(
        user_id,
        {
            "app_metadata": {
                "role": role
            }
        }
    )


def get_json_data():
    return request.get_json(silent=True) or {}


@app.post("/api/auth/login")
def login():
    data = get_json_data()

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    selected_role = str(data.get("role", "")).strip().lower()
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

    try:
        # Use a separate Supabase client for this authentication attempt.
        auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)

        result = auth_client.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if not result.user:
            return jsonify({
                "error": "Login could not be completed."
            }), 401

        actual_role = get_user_role(result.user)

        if actual_role != selected_role:
            auth_client.auth.sign_out()
            return jsonify({
                "error": "The selected role does not match this account."
            }), 403

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
        import time

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

    except Exception:
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
