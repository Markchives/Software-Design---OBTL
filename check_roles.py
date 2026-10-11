
import app

users = app.admin_supabase.auth.admin.list_users()

for user in users:
    if user.email:
        role = (user.app_metadata or {}).get("role", "not assigned")
        print("Trusted role:", role)
