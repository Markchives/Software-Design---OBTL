# EduMetrics AI Handoff

Updated: 2026-10-20

## Project background

EduMetrics is a Flask application backed by Supabase. It supports role-based accounts for students, faculty, Department Heads, and Admin/Security staff. Account registration includes email/password signup and Google OAuth profile completion. Department Heads and Admins participate in account-request approval workflows.

The active project directory is `D:\Final Proj\Software-Design---OBTL`. Run the Flask app from that directory with the project virtual environment:

```powershell
Set-Location "D:\Final Proj\Software-Design---OBTL"
& ".\.venv\Scripts\python.exe" app.py
```

Do not confuse this project with the separate Portfolio repository that may be the active VS Code workspace.

## Progress completed

### Development environment and troubleshooting

- Identified the correct project environment: `python-dotenv` is installed in the project `.venv`, not necessarily in global Python. Use `.venv\Scripts\python.exe` from the EduMetrics project root to avoid the earlier `ModuleNotFoundError: No module named 'dotenv'`.
- Traced why the student registration page showed only the legacy Computer Science and Information Technology options: port 5000 was being served by an older Flask process. The stale listener was stopped and the app was restarted using the project virtual environment.
- Verified the restarted app's `/health` endpoint and confirmed that the live student college endpoint then returned all seven colleges.

### Account approval workflow and Department Head request issue

- The intended approval model was documented: a different Admin approves Admin requests; an Admin approves Department Head requests; an approved Department Head approves Faculty in their department; students do not require role approval, while course access remains dependent on enrollment.
- Investigated the reported Department Head approval failure. The API returned `409 Conflict` because the request email was already linked to a different application user ID. This was a conflict safeguard, not an unhandled server traceback.
- The user confirmed the existing account belonged to the same person and that the department needed to change. A transactional reconciliation SQL script was prepared at `database/reconcile_department_head_identity.sql` to preserve linked history and leave the new request pending for normal approval. It has **not** been run on the live database.
- The app has logging for approval exceptions in the ignored `instance/account-approval.log`, in addition to normal Flask terminal output.
- Added a Department Head sidebar link named "Account Requests" to the existing account approvals page. The user confirmed the link works; the existing backend authorization continues to scope approvals by role/department.

### Google profile completion visuals

- Updated `Templates/account-profile-completion.html` and `Static/style.css` so post-Google profile completion uses the branded, two-panel registration visual style instead of an unstyled/basic form.
- Kept the role-specific fields: Faculty and Department Heads choose their department, while students use the college/program flow described below.

### Student college and program registration

- Added all seven requested colleges and their 35 programs (five per college) to `database/seed_reference_data.sql`.
- The seed upserts colleges and programs by stable codes. Existing `BSCS` and `BSIT` program IDs are retained while the programs are updated to their new names and College of Computer Studies parent, preserving references to those program rows.
- Updated `Templates/registration.html` so students select a college first and then a program offered by that college. The selected college and program IDs are included in the signup request.
- Added the same college-then-program interaction to `Templates/account-profile-completion.html` for Google student signup. Employee role department selection remains separate.
- Added the student college-options and college-specific program-options endpoints in `app.py`. The registration and Google profile-completion handlers validate that the college exists and that the chosen program belongs to that college before saving it.
- Student profile provisioning stores the selected program's ID as `program_id`; the college is derivable from that program's `department_id`.
- Fixed a CSS visibility issue so hidden role-specific registration selectors do not appear in the form.

## Latest verified state

- Python syntax compilation and `git diff --check` passed for the recent code changes.
- Focused mocked tests confirmed 35 unique seeded programs across seven colleges, college-specific program filtering, request validation, and the student-registration data flow.
- Browser checks confirmed the college-to-program selection interaction. Live API checks subsequently confirmed seven colleges and exactly five programs for each college.
- The running app passed `/health`.
- During the latest student signup attempt, Flask logged `POST /api/auth/register` as `409`, followed by a retry returning `200` and a request to `/verification-signup.html`. No traceback accompanied the successful retry. The first conflict's exact cause was not established.
- Email verification, successful student sign-in, and persistence of the selected program have not yet been confirmed by the user.

## Remaining work / recommended next steps

1. Complete email verification for the successful student signup, sign in, and verify the account is usable.
2. Check the student's saved profile in the app/database to confirm its `program_id` matches the selected program. Do not ask the user to share passwords or verification codes.
3. Test Google student profile completion with a college/program selection and verify persistence.
4. Smoke-test Faculty and Department Head registration options and account-request approval flows to ensure the student changes did not affect them.
5. Revisit the separate Department Head identity mismatch only if it remains an issue. Review the prepared reconciliation SQL and confirm the intended account/department before any live execution.

## Important files

- `app.py` — Flask routes, registration validation, Supabase integration, account approval logic.
- `Templates/registration.html` — email/password registration.
- `Templates/account-profile-completion.html` — OAuth profile completion.
- `Static/style.css` — registration/profile-completion styling.
- `Static/script.js` — shared UI behavior, including the Department Head Account Requests navigation link.
- `database/schema.sql` — main database schema.
- `database/seed_reference_data.sql` — reference/sample data and the 35 college programs.
- `database/reconcile_department_head_identity.sql` — prepared but unexecuted identity reconciliation; handle cautiously.

## Validation history

Previously completed checks include Python syntax compilation, `git diff --check`, focused mocked tests for the registration-options APIs and program/college validation, and browser checks of the college-to-program dropdown. The live endpoints were subsequently checked and returned the seven colleges and five programs per college. Full end-to-end confirmation of verified student login and profile persistence remains outstanding.
