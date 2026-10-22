# EduMetrics AI Handoff

Updated: 2026-10-22

## Project background

EduMetrics is a Flask application backed by Supabase. It supports role-based accounts for students, faculty, Department Heads, and Admin/Security staff. Account registration includes email/password signup and Google OAuth profile completion. Department Heads and Admins participate in account-request approval workflows.

The active project directory is `D:\Software-Design---OBTL`. Run the Flask app from that directory with the project virtual environment:

```powershell
Set-Location "D:\Software-Design---OBTL"
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

### Profile menu routing and account details

- Added an authenticated `/account-settings` route and pointed the shared avatar menu's Profile link to it, rather than linking directly to a static template. The route checks the signed-in user's role and account/profile readiness before rendering the page.
- Fixed Profile-page sidebar links to use absolute, role-correct Flask routes. Previously, relative links resolved from `/account-settings` and sent users to nonexistent top-level paths. Dashboard, course, main information, workflow, and Account Requests links now resolve to registered routes.
- The user confirmed the Profile-page sidebar navigation now works.
- Updated the shared account-menu header so authenticated profile name and role display across dashboard and role tabs. The header restores the role-specific profile image saved in this browser's local storage, and the shared avatar CSS displays it consistently.
- Reduced the visible header synchronization delay by caching the last fetched account profile in session storage, keyed by the signed-in email. On repeat visits the header displays that matching cached name immediately, then refreshes it from the authenticated profile API. Cache entries are cleared on logout, and OAuth login invalidates the current cached identity before redirecting.
- Added authenticated `/api/account/profile` data loading. It returns the signed-in user's full name, email, role-specific student/employee number, and student program or employee department from Supabase.
- Updated the shared Profile page script and template to load and display those fields rather than relying on unrelated browser session-storage keys.
- Verified the profile endpoint's role-specific response with focused tests for Student, Faculty, Department Head, and Admin, and verified unauthenticated requests are redirected to login.
- Verified all 17 destinations represented in the four role sidebars are registered Flask routes.
- The user confirmed the Profile page now displays account information successfully.
- The user confirmed Google student profile completion with a college/program selection is also done and the selected program is saved.

## Latest verified state

- Design reference: [OBTL Assessment & Grading](docs/reference/obtl-assessment-grading-reference.png). The concept shows target attainment as the share of students achieving the benchmark, compared with the passing threshold, and calls for auditable, print-ready reports: Course Syllabus Outcome Matrix, Class Master Grading Sheet, Student Outcome Attainment Summary, and CQI Action Report. Treat this image as a product/design reference for future assessment and reporting work.
- Python syntax compilation and `git diff --check` passed for the recent code changes.
- Focused mocked tests confirmed 35 unique seeded programs across seven colleges, college-specific program filtering, request validation, and the student-registration data flow.
- Focused tests confirmed `/api/account/profile` returns the expected name, ID, role affiliation, and email for all four roles; unauthenticated requests cannot read profile data.
- Confirmed the role sidebar target paths exist in the Flask route map; `git diff --check` passes.
- The signed-in header now fetches the authenticated profile for its display name/role and restores the saved browser profile photo on pages with the shared account menu.
- The header now paints a matching session-cached profile immediately and refreshes it in the background; login/logout handling avoids reusing the previous signed-in identity.
- The user confirmed the account Profile page now displays data after the API integration.
- Browser checks confirmed the college-to-program selection interaction. Live API checks subsequently confirmed seven colleges and exactly five programs for each college.
- The running app passed `/health`.
- During the latest student signup attempt, Flask logged `POST /api/auth/register` as `409`, followed by a retry returning `200` and a request to `/verification-signup.html`. No traceback accompanied the successful retry. The first conflict's exact cause was not established.
- The user confirmed the successful password-based student signup was email-verified, the student can sign in, and the selected program is saved and visible in the Profile page.
- The user also confirmed the Google student profile-completion flow with a selected college/program is done and the selected program is saved.
- The user confirmed Faculty and Department Head registration/profile/sidebar smoke tests and the relevant role-specific approval checks are complete.

## Remaining work / recommended next steps

1. No active registration, profile, or sidebar checks remain based on the user's confirmation.
2. Revisit the separate Department Head identity mismatch only if it is still affecting the project. Review the prepared reconciliation SQL and confirm the intended account/department before any live execution.

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

## Image upload

Buckets created for Profile pictures and signatures for users (both images). Created table for url (text) for pfp and signature. Attached is code snippet for backend integration, use as reference only.

# ----------------------------------------------------
# 1. PROFILE PICTURE UPLOAD (Public Bucket)
# ----------------------------------------------------
def upload_profile_picture(user_id: str, file_bytes: bytes, file_name: str, content_type: str = "image/png"):
    try:
        file_ext = file_name.split(".")[-1]
        file_path = f"{user_id}/avatar.{file_ext}"

        # 1. Upload file to 'profile_pictures' storage bucket
        supabase.storage.from_("profile_pictures").upload(
            path=file_path,
            file=file_bytes,
            file_options={"upsert": "true", "content-type": content_type}
        )

        # 2. Get Public URL
        public_url = supabase.storage.from_("profile_pictures").get_public_url(file_path)

        # 3. Update 'pfp_url' column in 'users' table
        supabase.table("users").update({"pfp_url": public_url}).eq("id", user_id).execute()

        print(f"✅ Profile picture updated: {public_url}")
        return public_url

    except Exception as e:
        print(f"❌ Error uploading profile picture: {str(e)}")
        return None


# ----------------------------------------------------
# 2. SIGNATURE UPLOAD (Private Bucket)
# ----------------------------------------------------
def upload_signature(user_id: str, file_bytes: bytes, file_name: str, content_type: str = "image/png"):
    try:
        file_ext = file_name.split(".")[-1]
        file_path = f"{user_id}/signature.{file_ext}"

        # 1. Upload file to 'signatures' storage bucket
        supabase.storage.from_("signatures").upload(
            path=file_path,
            file=file_bytes,
            file_options={"upsert": "true", "content-type": content_type}
        )

        # 2. Update 'signature_url' column in 'users' table (save relative path)
        supabase.table("users").update({"signature_url": file_path}).eq("id", user_id).execute()

        print(f"✅ Signature file path saved: {file_path}")
        return file_path

    except Exception as e:
        print(f"❌ Error uploading signature: {str(e)}")
        return None


# ----------------------------------------------------
# 3. GET SIGNATURE IMAGE URL (Private Signed URL)
# ----------------------------------------------------
def get_signature_url(file_path: str, expires_in: int = 60):
    try:
        # Generate temporary URL valid for 60 seconds
        response = supabase.storage.from_("signatures").create_signed_url(file_path, expires_in)
        return response.get("signedUrl")
    except Exception as e:
        print(f"❌ Error generating signed URL: {str(e)}")
        return None

## Backend persistence for posts and scores

- Dashboard posts now use authenticated Flask APIs and Supabase instead of browser storage. Faculty posts are scoped to a section they teach; Department Head posts are scoped to their own department. Students see posts from active enrolled sections and their program department. Faculty and Department Heads can see relevant section and department posts.
- The Faculty Assessment Entry page loads assigned sections, active enrolled students, course outcomes, assessments, saved scores, and open Department Head queries from the backend. Faculty can create assessments, edit scores, and release each assessment only for assigned sections. A released assessment remains editable until the Department Head locks the section gradebook.
- Student Assessment Records show only the signed-in student's own scores after Faculty releases the corresponding assessment. Unreleased scores, including whether a score has been entered, remain hidden.
- Department Head Assessment Entry is backed by department-scoped assessment/score review, missing-score counts, queries and Faculty responses, query resolution, and gradebook locking. Admin accounts have no score-entry or score-review API access.
- Raw score inserts and score changes are recorded by a database trigger in `raw_assessment_score_history`. Database guards serialize score, assessment, release, and query changes against gradebook locking and reject writes after lock.
- Apply `database/posts_and_scores_persistence.sql` and then `database/requirement_4_assessment_release_and_review.sql` to the Supabase database before using these features. The latter adds per-assessment release state, score history, Department Head queries, locked-gradebook guards, and the atomic gradebook-lock RPC. Routes use the server-side Supabase service-role client; browser clients must not access these tables directly.
- These changes have code-level validation only until both SQL migrations are applied and role-specific end-to-end checks are run against Supabase. Other Gradebook workflow transitions (such as submission and verification) remain separate from the implemented Department Head lock action.

## Shared Requirement 2 and 4 activities

- Requirement 2 is the single place where Faculty create, edit, remove, and map activities. An activity can be linked to multiple Course Outcomes; its saved maximum score and mappings are shared with Requirement 4.
- Requirement 4 is limited to raw-score entry, score saving, and per-activity release. Students only see their own results after release; CO attainment uses released activities only.
- Faculty Module 2 dispatches the section-change event after asynchronously restoring the requested/only assigned section, ensuring the activity workspace loads before Add Activity is enabled. The activity status explains when a section has no COs or the gradebook is locked.
- Faculty Curriculum Mapping now follows the three reference tabs (Assessment Mapping, Course Outcomes, Students' Attainment) and uses the assigned section's URL context to populate read-only academic year, department, course, and section values. Assessment Mapping omits the separate View Score column; course outcome and student attainment rows use the existing assessments and attainment APIs. The summary cards change by tab.
- Mocked browser validation confirmed the restored section enables Add Activity, opens the form with its CO choices, and submits the expected activity payload. This did not write to Supabase.
- Existing single-CO activity links are backfilled into `assessment_activity_course_outcomes`. Attainment remains null with `awaiting_results` status until there is a released result; the migration makes that status and nullable percentage valid in `co_attainment`. For an existing database, apply this after the base schema and `database/requirement_4_assessment_release_and_review.sql`, and before deploying the matching `app.py` changes. `database/schema.sql` contains the equivalent definitions for fresh installations. This migration has not been applied to the live database.
- Code validation includes Python compilation, clean diff formatting, a mocked calculation check for released-only multi-CO attainment, and browser checks using mocked API responses for multi-CO activity creation and Requirement 4 score display. The live Supabase migration and role-authenticated create/edit/delete, score, release, lock, and attainment flows still need end-to-end verification.

## Requirement 5 Attainment

- A student's CO result is the average of their percentages on released assessment activities mapped to that CO. Class attainment is the percentage of students with released scores for that CO whose individual result meets the CO's syllabus target; unreleased activities do not contribute. CO targets default to 70% but remain configurable per outcome in the syllabus.
- Faculty can review calculated CO attainment and its contributing released/unreleased activities. Students can view only their own results after both score release and Department Head mapping verification.
- The Department Head attainment overview uses a server-enforced department scope and reports section-level CO attainment plus aggregated gradebook readiness. Admin views read-only system-wide CO aggregates and cannot change scores, mappings, targets, or attainment.
- When a program filter is selected, Department Head and Admin attainment is recalculated from the selected program's enrolled students, rather than reusing a mixed-program section total. A focused mocked API check confirmed a section result of 66.67% becomes 50% for the two-student filtered program subset.
- `database/requirement_5_attainment_algorithm.sql` adds the algorithm-version marker used to refresh previously calculated attainment after this formula change. Apply it after the base schema and `database/requirement_2_4_multi_co_assessment_mappings.sql`; the latter is also required for multi-CO activity mappings. Deploy the matching `app.py` and `Static/script.js` after the migrations.

## Academic terms and course offerings

- Admins can create academic years with exactly three terms named Term 1, Term 2, and Term 3 at `/admin/academic-terms.html`. Year dates and each term's date range are optional; supplied ranges must be complete, sequential, within the year, and non-overlapping.
- Department Heads can manage their own department's course catalog, create sections for an academic term, assign active Faculty from their department, and reassign Faculty without deleting the section or its scores. Course codes remain institution-wide unique. Faculty see only sections assigned to them; student course and syllabus views include the academic term.
- `database/academic_terms_and_offerings.sql` is the upgrade migration for an existing Supabase database. Existing sections are assigned to Term 1 in their existing academic year; sections without a year are placed in a generated "Legacy Academic Year". The user reported completing the migration and checking the data; a screenshot of the year/term mismatch check showed `0`. This does not establish that all workflows have been tested.
- `database/schema.sql` includes the corresponding definitions for new database installations. The application calls server-side RPCs for atomic academic-year setup, section creation, and Faculty reassignment history; do not expose service-role credentials or call these RPCs from browser code.
- Code-level validation does not replace an end-to-end test against Supabase. Verify the year/term list, department scoping, unique course/section checks, active Faculty restrictions, reassignment history, and student term labels after applying the migration.
- The user reported that the Department Head could not create a course offering, but the exact in-app error and Flask log were not provided. The Schedule field is optional free text, so it should not block submission when left blank. A likely database-side cause was identified: the RPC functions used PL/pgSQL local variables named `department_id`, which overlap with table column names in authorization checks and may cause ambiguous-column errors. This is a code-based diagnosis and has not yet been confirmed against the live database error.
- The RPC definitions in `database/academic_terms_and_offerings.sql` and `database/schema.sql` now use `v_`-prefixed local variables. For a database where the original migration has already run, `database/academic_offering_rpc_fix.sql` is the corrective SQL script; it replaces the section-creation and Faculty-reassignment functions and re-applies the service-role grants. This corrective script has **not** been run against Supabase. The Flask create-offering endpoint now returns a specific instruction to apply the fix if it receives the recognized ambiguous-`department_id` error.
- Next diagnostic step: apply `database/academic_offering_rpc_fix.sql` in the correct Supabase project's SQL Editor, restart Flask, and retry creating an offering. If it still fails, capture the exact form status message and corresponding Flask traceback (redacting secrets); inspect selected course/year/term/Faculty, department affiliation and active status, and whether that section name already exists for the course and term. Do not repeatedly retry or modify records without checking whether the request partially succeeded.
- The Academic Terms page now allows document-level vertical scrolling so the setup form and configured-year table remain reachable on shorter viewports. Its Admin sidebar keeps the full navigation and logo visible, with independent scrolling when needed. Admin navigation pages that load the shared script receive an Academic Terms link, and the active state is set on that page.
- Layout validation confirmed page scrolling, visibility of all expected Admin links and the sidebar logo at desktop width, and sidebar visibility at a narrow viewport. The browser smoke test used static page hosting, so its unauthenticated API error does not validate or invalidate the live Flask/Supabase data workflow.
- Faculty and Student navigation links for Curriculum Mapping, Class Roster, Attainment, CQI Planning, and Compliance Report now have role-protected Flask routes to their existing templates. The Compliance Report is module 07 in the Faculty navigation and uses the Requirement 8 template path. Static route checks confirmed all requirement-tab links point to registered routes; live authenticated page rendering still needs verification.
- Faculty Class Roster now loads only sections assigned to the signed-in Faculty member, displays persisted enrollments, supports student-account search and CSV preview/import by student number, and marks enrollments dropped instead of deleting them. Status changes are recorded in `enrollment_status_history`. Student enrollment is checked server-side for an active student account and active enrollment in another section of the same course and term. The database RPC serializes competing enrollments and rechecks these rules atomically.
- Student Class Roster now requests classmates for the section selected from My Courses. The backend requires the signed-in Student to have an active enrollment in that exact section and returns only active classmates' names; Student roster UI displays names only. The Student roster template's shared JavaScript path must resolve to `/Static/script.js` so the section-specific roster fetch and rendering run.
- For an existing Supabase project, apply `database/student_enrollment_workflow.sql` before using Faculty roster add/import/drop actions. New installations receive the objects from `database/schema.sql`. The application uses its server-side service-role client; do not expose service-role credentials in browser code. CSV imports accept a Student ID/Student Number column and up to 200 rows; only existing active student accounts are eligible.
- Validation so far: Flask source compiles and static checks confirm API/function references, but a live Supabase enrollment test and JavaScript runtime check are still needed. Verify Faculty can manage only assigned sections, manual add/import, duplicate rows, unknown students, same-course/term conflicts, dropping and re-enrolling, and Student/Assessment/Gradebook views after applying the SQL migration.
- Department Head Course Offerings now uses document-level scrolling like the Admin Academic Terms page, with a sticky, independently scrollable sidebar on desktop and a full navigation block on narrow screens. The course-offering form clarifies that academic years and terms are configured by an Admin; the existing Admin Academic Terms link remains available in administrator navigation. An explicit empty-catalog message distinguishes a department with no courses from a failed catalog load.
- The Course Offerings page's "server did not return course data" message could be caused by the role decorator redirecting API fetches to an HTML login page when the session expires or the role is unauthorized. API authorization failures now return JSON with 401/403/503 status codes; browser page requests retain the existing redirects/text responses. Authenticated-user validation now attempts to refresh the Supabase session and stores rotated access/refresh tokens before declaring it expired. The client surfaces explicit session-expired or permission messages rather than treating HTML as missing course data. Retest with an authenticated Department Head session; the local static-server preview cannot exercise Supabase/API authentication.
- Student course cards now include an "Open Course Workspace" link to the Student Class Roster module. The student-courses API includes the enrolled section ID, and course-module tabs carry that selected section ID forward while navigating.

Flask Route Example (If using Flask in app.py)
If app.py is a Flask web app, here is how you handle file inputs from an HTML form request:

Python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/upload-pfp", methods=["POST"])
def handle_pfp_upload():
    user_id = request.form.get("user_id")
    file = request.files.get("pfp_image")

    if not user_id or not file:
        return jsonify({"error": "Missing user_id or file"}), 400

    file_bytes = file.read()
    public_url = upload_profile_picture(
        user_id=user_id,
        file_bytes=file_bytes,
        file_name=file.filename,
        content_type=file.content_type
    )

    if public_url:
        return jsonify({"message": "Success", "pfp_url": public_url}), 200
    return jsonify({"error": "Upload failed"}), 500

## Requirement 1: Syllabus & Outcome Setup

- Faculty Requirement 1 is organized into three working tabs: Course Syllabus (PDF management only), Course Outcomes (CO number, description, target attainment, SO alignment, and add/edit/delete actions), and Student Outcomes (self-assessment due date, response count, status, and actions). The assigned section is inferred from the course workspace URL, or auto-selected when the Faculty member has one assigned section; the internal selector is hidden. When multiple sections exist without course context, the page asks the Faculty member to open a specific course workspace rather than choosing arbitrarily.
- Student Outcome assessment setup retains configurable titles, performance indicators, rating scales, due dates, and draft/active/closed status. Indicators and score/label rating levels use add/remove row editors, prefilled 1-4 rating labels, and client validation; assessment edit loads saved values into the same editor. The table shows the SO, due date, response count, status, and response/edit/delete actions.
- Faculty syllabus management now uses the persisted `/api/faculty/syllabi/<section_id>` endpoints for the selected assigned section, including PDF upload, view/download links, and deletion. CO management, CO-to-SO alignment, and SO self-assessment setup use the existing authenticated workflow APIs.
- Student syllabus cards and the available-syllabus count now load from `/api/student/syllabi`; the course selector filters the returned records. Students continue to see only verified syllabi for their active enrolled sections, with separate inline-view and attachment-download signed URLs.
- Department Head/Admin overview calculations exclude draft SO self-assessments. The overview continues to include academic-year, program, course, and section filters; course/student/faculty metrics; SO response summaries/logs; and CO attainment summaries.
- Requirement 1 markup no longer contains stale comments claiming the student syllabus and pending assessment data are demo-only.
- Validation performed: the Requirement 1 HTML parsed with no duplicate IDs or missing editor controls; `git diff --check` passed. Browser checks confirmed the editor defaults, add-row behavior, and auto-incremented rating score. Browser preview uses a local `file:` page without an authenticated Flask session and its API calls returned 403, so authenticated persistence remains unverified. Node is unavailable in the current environment; browser loading confirmed the edited JavaScript parses and runs.
- The Faculty Requirement 1 browser page exposes all three tabs; browser checks confirmed tab switching, editor interactions, and the CO/SO table headings. Persistent create/edit/delete and syllabus/assessment operations still require an authenticated end-to-end test.
- The live Supabase schema/migrations and role-authenticated syllabus upload/download, student visibility, assessment submission, and overview filters still need end-to-end verification. No commit or push has been made.

## Requirements 5 and 6 fixes (2026-10-22)

- Faculty and Student CQI requests now carry the workspace `section_id`. The backend scopes Faculty plans and section choices to an assigned section (404 otherwise), and Student actions to an actively enrolled section (403 otherwise). Without a section filter, the existing cross-section view remains available. Student actions remain limited to approved, ongoing, and completed plans.
- Faculty's Below-target COs card now counts current flagged section/CO results, including outcomes without plans and excluding recovered outcomes. The same course outcome in two sections counts as two section-specific results. It no longer counts plan references.
- `_calculate_section_attainment` now calls the service-role-only `refresh_section_attainment` RPC. PostgreSQL calculates released-only, active-enrollment personal means and class threshold rates, then replaces class/personal results in one transaction. A section row lock serializes refreshes with each other and guarded assessment writes. There is no destructive Python fallback.
- Enrollment insert/update/delete (including dropping, re-enrolling, and section transfers) invalidates saved attainment versions in the same database transaction. Existing Student, Department Head, and dashboard stale-version checks recalculate on the next read. CQI enrichment refreshes section results before displaying attainment.
- **Required deployment step:** apply `database/requirement_5_6_attainment_refresh.sql` in the correct Supabase project AFTER `database/requirement_2_4_multi_co_assessment_mappings.sql` and `database/requirement_5_attainment_algorithm.sql`, and BEFORE restarting/deploying the matching `app.py`. The base schema and existing Requirement 4 migration must already exist. `database/schema.sql` includes the same functions/triggers for fresh installs. The new migration has NOT been applied to live Supabase from this session. Until it is applied, routes using attainment will fail rather than use the old non-atomic save path.
- Validation: seven isolated Python API regressions (`python -m unittest discover -s tests -p test_attainment_cqi.py -v`), JavaScript syntax, and diff formatting checks. PostgreSQL regression tests use a temporary PGlite package outside the repository with `node tests/attainment_database_check.cjs <path-to-pglite-package>`; they exercise migration reapplication, service-role permissions, released-only multi-CO calculations, personal averaging, enrollment invalidation, failed-save rollback, mapping visibility, cleared scores, and missing sections. The PostgreSQL tests use isolated fixture tables and do not connect to Supabase; simultaneous independent database sessions and authenticated browser workflows remain unverified.
- No live data was modified and no commit or push was made. The complete signed-in Faculty submit -> Department Head return/approve -> Faculty progress/complete -> Student view flow still needs a browser smoke test after applying the migration.
