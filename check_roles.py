
import argparse

import app


def list_roles():
    page = 1
    page_size = 1000

    while True:
        response = app.admin_supabase.auth.admin.list_users(
            page=page,
            per_page=page_size,
        )
        users = (
            response
            if isinstance(response, list)
            else getattr(response, "users", None) or []
        )

        for user in users:
            if user.email:
                role = app.get_user_role(user) or "not assigned"
                print(f"{user.email}: {role}")

        if len(users) < page_size:
            break
        page += 1


def bootstrap_first_admin(email, employee_number):
    if not app.admin_supabase:
        raise RuntimeError("Supabase Admin client is not configured.")
    if not employee_number:
        raise ValueError("A real Admin employee number is required.")

    user = app.find_auth_user_by_email(email)
    if not user:
        raise ValueError("No Supabase Auth account was found for that email.")
    if not getattr(user, "email_confirmed_at", None):
        raise ValueError("The first Admin account must have a confirmed email.")

    current_role = app.get_user_role(user)
    if current_role not in (None, "admin-security"):
        raise ValueError(
            "The selected account already has another trusted role. "
            "Use a dedicated account for the first Admin."
        )

    page = 1
    page_size = 1000
    while True:
        response = app.admin_supabase.auth.admin.list_users(
            page=page,
            per_page=page_size,
        )
        users = (
            response
            if isinstance(response, list)
            else getattr(response, "users", None) or []
        )
        other_admins = [
            existing_user
            for existing_user in users
            if str(existing_user.id) != str(user.id)
            and app.get_user_role(existing_user) == "admin-security"
        ]
        if other_admins:
            raise ValueError(
                "An Admin already exists. First-Admin bootstrap is disabled."
            )
        if len(users) < page_size:
            break
        page += 1

    confirmation = input(
        f"Type BOOTSTRAP {user.email} to make this the first Admin: "
    )
    if confirmation != f"BOOTSTRAP {user.email}":
        raise ValueError("Bootstrap confirmation did not match; no changes made.")

    metadata = getattr(user, "user_metadata", None) or {}
    full_name = " ".join(
        str(value).strip()
        for value in (metadata.get("first_name"), metadata.get("last_name"))
        if value and str(value).strip()
    )
    full_name = full_name or metadata.get("full_name") or metadata.get("name") or ""

    existing_rows = (
        app.admin_supabase.table("users")
        .select("id")
        .eq("email", user.email)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_rows and str(existing_rows[0]["id"]) != str(user.id):
        raise ValueError(
            "public.users already has this email with a different UUID; "
            "resolve that mismatch before bootstrapping."
        )

    bootstrap_claims = (
        app.admin_supabase.table("system_bootstrap")
        .select("auth_user_id")
        .eq("bootstrap_key", "first-admin")
        .limit(1)
        .execute()
        .data
        or []
    )
    if bootstrap_claims:
        if str(bootstrap_claims[0]["auth_user_id"]) != str(user.id):
            raise ValueError(
                "The first-Admin slot has already been claimed by another account."
            )
    else:
        app.admin_supabase.table("system_bootstrap").insert(
            {
                "bootstrap_key": "first-admin",
                "auth_user_id": user.id,
            }
        ).execute()

    app.admin_supabase.table("users").upsert(
        {
            "id": user.id,
            "email": user.email,
            "full_name": full_name,
            "role": "admin-security",
            "is_active": True,
        },
        on_conflict="id",
    ).execute()
    app.admin_supabase.table("admin_security_profiles").upsert(
        {
            "user_id": user.id,
            "employee_number": employee_number,
        },
        on_conflict="user_id",
    ).execute()
    app.assign_trusted_role(user.id, "admin-security")
    print(f"Bootstrapped first Admin account: {user.email}")


def main():
    parser = argparse.ArgumentParser(
        description="Inspect trusted roles or bootstrap the first Admin account."
    )
    parser.add_argument(
        "--bootstrap-first-admin",
        metavar="EMAIL",
        help="one-time bootstrap for a confirmed, dedicated Auth account",
    )
    parser.add_argument(
        "--employee-number",
        metavar="NUMBER",
        help="required institutional employee number for first Admin bootstrap",
    )
    args = parser.parse_args()

    if args.bootstrap_first_admin:
        bootstrap_first_admin(
            args.bootstrap_first_admin.strip().lower(),
            (args.employee_number or "").strip(),
        )
    else:
        list_roles()


if __name__ == "__main__":
    main()
