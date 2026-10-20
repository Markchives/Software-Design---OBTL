(function () {
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
    const api = async (url, options = {}) => {
        const response = await fetch(url, {
            credentials: "same-origin",
            headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Request failed.");
        return data;
    };
    const notify = message => window.alert(message);
    const studentSectionScopedUrl = path => {
        const sectionId = new URLSearchParams(window.location.search).get("section_id");
        if (!sectionId) return path;
        const url = new URL(path, window.location.href);
        url.searchParams.set("section_id", sectionId);
        return url.pathname + url.search + url.hash;
    };

    function initFaculty() {
        const root = document.getElementById("soWorkflowManager");
        if (!root) return;
        const sectionContext = document.getElementById("soSelectedSection");
        const sectionSelect = document.getElementById("soFacultySection");
        const status = document.getElementById("soFacultyStatus");
        const coForm = document.getElementById("soCourseOutcomeForm");
        const assessmentForm = document.getElementById("soAssessmentForm");
        const addCoButton = document.getElementById("addCourseOutcomeButton");
        const addAssessmentButton = document.getElementById("addStudentOutcomeButton");
        const saveCoButton = document.getElementById("soSaveCo");
        const saveAssessmentButton = document.getElementById("soSaveAssessment");
        const coRows = document.getElementById("soCoRows");
        const assessmentRows = document.getElementById("soAssessmentRows");
        const outcomeSelect = document.getElementById("soAssessmentOutcome");
        let sections = [];
        let section = null;
        let outcomes = [];
        let studentOutcomes = [];
        let mappings = [];
        let editingAssessmentId = null;
        const indicatorRows = document.getElementById("soIndicatorRows");
        const ratingRows = document.getElementById("soRatingRows");
        const indicatorDefaults = [""];
        const ratingDefaults = [
            { value: 1, label: "Beginning" },
            { value: 2, label: "Developing" },
            { value: 3, label: "Proficient" },
            { value: 4, label: "Advanced" }
        ];
        const button = (text, action, id) => `<button class="so-workflow-action" type="button" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
        if (coForm) coForm.hidden = true;
        if (assessmentForm) assessmentForm.hidden = true;
        function addIndicator(value = "") {
            const row = document.createElement("div");
            row.className = "so-editor-row so-indicator-row";
            row.innerHTML = `<input type="text" maxlength="300" aria-label="Performance indicator" placeholder="Example: Apply relevant knowledge to solve problems" value="${esc(value)}"><button class="so-editor-remove" type="button" aria-label="Remove performance indicator">Remove</button>`;
            row.querySelector("button").addEventListener("click", () => {
                row.remove();
                updateEditorControls();
            });
            indicatorRows.appendChild(row);
            updateEditorControls();
        }
        function addRating(value = "", label = "") {
            const row = document.createElement("div");
            row.className = "so-editor-row so-rating-row";
            row.innerHTML = `<input type="number" min="0" max="100" step="1" aria-label="Rating score" placeholder="1" value="${esc(value)}"><input type="text" maxlength="80" aria-label="Rating label" placeholder="Example: Beginning" value="${esc(label)}"><button class="so-editor-remove" type="button" aria-label="Remove rating level">Remove</button>`;
            row.querySelector("button").addEventListener("click", () => {
                row.remove();
                updateEditorControls();
            });
            ratingRows.appendChild(row);
            updateEditorControls();
        }
        function updateEditorControls() {
            const indicators = indicatorRows.querySelectorAll(".so-indicator-row");
            const ratings = ratingRows.querySelectorAll(".so-rating-row");
            indicators.forEach(row => { row.querySelector("button").disabled = indicators.length <= 1; });
            ratings.forEach(row => { row.querySelector("button").disabled = ratings.length <= 2; });
            document.getElementById("soAddRating").disabled = ratings.length >= 10;
            document.getElementById("soAddIndicator").disabled = indicators.length >= 30;
        }
        function setAssessmentEditor(assessment) {
            editingAssessmentId = assessment?.id || null;
            document.getElementById("soAssessmentOutcome").value = assessment?.student_outcome_id || "";
            document.getElementById("soAssessmentTitle").value = assessment?.title || "";
            document.getElementById("soAssessmentDue").value = assessment?.due_date || "";
            document.getElementById("soAssessmentStatus").value = assessment?.status || "draft";
            indicatorRows.replaceChildren();
            (assessment?.performance_indicators?.length ? assessment.performance_indicators : indicatorDefaults)
                .forEach(addIndicator);
            ratingRows.replaceChildren();
            (assessment?.rating_scale?.length ? assessment.rating_scale : ratingDefaults)
                .forEach(row => addRating(row.value, row.label));
            saveAssessmentButton.textContent = editingAssessmentId
                ? "Save Changes" : "Create Assessment";
        }
        setAssessmentEditor(null);
        document.getElementById("soAddIndicator").addEventListener("click", () => addIndicator());
        document.getElementById("soAddRating").addEventListener("click", () => {
            const values = [...ratingRows.querySelectorAll(".so-rating-row input[type=number]")]
                .map(input => Number(input.value)).filter(Number.isFinite);
            const nextValue = values.length ? Math.max(...values) + 1 : 1;
            if (nextValue > 100) return notify("Rating scores must be between 0 and 100.");
            addRating(nextValue, "");
        });
        async function loadSection(sectionId) {
            section = sections.find(row => row.section_id === sectionId) || null;
            if (sectionSelect) sectionSelect.value = section?.section_id || "";
            window.syncEduMetricsWorkspaceSection?.(section?.section_id || "", section || undefined);
            if (sectionContext) {
                sectionContext.textContent = section
                    ? `${section.course_code} · ${section.course_title} · ${section.section_name} · ${section.academic_year_name || ""}`
                    : "Open this workspace from your assigned course.";
            }
            saveCoButton.disabled = !section;
            saveAssessmentButton.disabled = !section;
            if (addCoButton) addCoButton.disabled = !section;
            if (addAssessmentButton) addAssessmentButton.disabled = !section;
            if (status) status.textContent = section
                ? `${section.course_code} · ${section.course_title} · ${section.section_name} — loading outcomes...`
                : sections.length > 1
                    ? "Open this page from a specific assigned course section to load its outcomes."
                    : sections.length === 1
                        ? "Loading your assigned course..."
                        : "No course sections are assigned to your Faculty account.";
            if (coForm) coForm.hidden = true;
            if (assessmentForm) assessmentForm.hidden = true;
            document.getElementById("soCoCode").value = "";
            document.getElementById("soCoDescription").value = "";
            if (!section) {
                coRows.innerHTML = `<tr><td colspan="5">Open this workspace from an assigned course section to load outcomes.</td></tr>`;
                assessmentRows.innerHTML = `<tr><td colspan="5">Open this workspace from an assigned course section to load Student Outcomes.</td></tr>`;
                return;
            }
            try {
                const mapData = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`);
                outcomes = mapData.outcomes || [];
                mappings = mapData.mappings || [];
                studentOutcomes = mapData.student_outcomes || [];
                coRows.innerHTML = outcomes.length ? outcomes.map(row => {
                    const currentSoIds = new Set(mappings.filter(link => link.course_outcome_id === row.id).map(link => link.student_outcome_id));
                    const linkedOutcomes = studentOutcomes.filter(so => currentSoIds.has(so.id));
                    const alignOptions = studentOutcomes.filter(so => !currentSoIds.has(so.id));
                    const links = linkedOutcomes.map(so => `${so.code}: ${so.description}`).join("; ");
                    const alignmentEditor = alignOptions.length
                        ? `<details class="so-inline-map"><summary>+ Align another SO</summary><div class="so-inline-map-controls"><select aria-label="Choose an additional Student Outcome for ${esc(row.code)}" data-map-select="${esc(row.id)}"><option value="">Choose Student Outcome</option>${alignOptions.map(so => `<option value="${esc(so.id)}">${esc(so.code)} — ${esc(so.description)}</option>`).join("")}</select>${button("Add", "map-co", row.id)}</div></details>`
                        : studentOutcomes.length
                            ? `<span class="so-all-outcomes-aligned">All available SOs are aligned</span>`
                            : `<span class="so-no-outcomes">No Student Outcomes are available</span>`;
                    return `<tr><td>${esc(row.code)}</td><td>${esc(row.description)}</td><td>${esc(row.target_percentage ?? 70)}%</td><td><div class="so-aligned-outcomes">${links ? esc(links) : `<span class="so-no-outcomes">No SO aligned yet</span>`}</div>${alignmentEditor}</td><td>${button("Edit", "edit-co", row.id)} ${button("Delete", "delete-co", row.id)}</td></tr>`;
                }).join("") : `<tr><td colspan="5">No Course Outcomes. Add one above.</td></tr>`;
                const mappedSoIds = new Set(mappings.map(row => row.student_outcome_id));
                const soOptions = studentOutcomes.filter(row => mappedSoIds.has(row.id));
                outcomeSelect.innerHTML = `<option value="">Select a mapped SO</option>` + soOptions.map(row => `<option value="${esc(row.id)}">${esc(row.code)} — ${esc(row.description)}</option>`).join("");
                const alignSelect = document.getElementById("soCoAlignment");
                if (alignSelect) alignSelect.innerHTML = `<option value="">Choose an SO (optional)</option>` + studentOutcomes.map(row => `<option value="${esc(row.id)}">${esc(row.code)} — ${esc(row.description)}</option>`).join("");
                const data = await api(`/api/faculty/sections/${encodeURIComponent(section.section_id)}/so-assessments`);
                assessmentRows.innerHTML = (data.assessments || []).length ? data.assessments.map(row => {
                    const statusLabel = row.status === "open" ? "Active" :
                        row.status.charAt(0).toUpperCase() + row.status.slice(1);
                    return `<tr><td><strong>${esc(row.student_outcome?.code)} · ${esc(row.title)}</strong><small class="so-co-links">${esc(row.student_outcome?.description)}</small></td><td>${esc(row.due_date || "No due date")}</td><td>${row.response_count || 0}</td><td><span class="so-status-pill ${esc(row.status)}">${esc(statusLabel)}</span></td><td>${button("Responses", "responses", row.id)} ${button("Edit", "edit-assessment", row.id)} ${button("Delete", "delete-assessment", row.id)}</td></tr>`;
                }).join("") : `<tr><td colspan="5">No Student Outcome assessments for this section yet.</td></tr>`;
                if (status) status.textContent = "Course outcomes and Student Outcome assessments loaded.";
            } catch (error) {
                if (status) status.textContent = error.message;
                notify(error.message);
            }
        }
        addCoButton?.addEventListener("click", () => {
            if (!section) return notify("Select a section first.");
            if (coForm) coForm.hidden = !coForm.hidden;
            if (!coForm.hidden) document.getElementById("soCoCode").focus();
        });
        addAssessmentButton?.addEventListener("click", () => {
            if (!section) return notify("Select a section first.");
            if (!outcomeSelect.options.length || !outcomeSelect.value) {
                const mapped = studentOutcomes.some(so => mappings.some(link => link.student_outcome_id === so.id));
                if (!mapped) return notify("Add and align a Course Outcome with a Student Outcome before creating an assessment.");
            }
            const opening = assessmentForm.hidden;
            if (opening) setAssessmentEditor(null);
            if (assessmentForm) assessmentForm.hidden = !opening;
            if (!assessmentForm.hidden) outcomeSelect.focus();
        });
        saveCoButton.addEventListener("click", async () => {
            if (!section) return notify("Select a section first.");
            const data = { code: document.getElementById("soCoCode").value, description: document.getElementById("soCoDescription").value, target_percentage: Number(document.getElementById("soCoTarget").value) };
            try {
                const saved = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcomes`, { method: "POST", body: JSON.stringify(data) });
                const soId = document.getElementById("soCoAlignment").value;
                if (soId) {
                    const current = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`);
                    await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`, { method: "PUT", body: JSON.stringify({ mappings: [...(current.mappings || []), { course_outcome_id: saved.outcome.id, student_outcome_id: soId }] }) });
                }
                if (coForm) coForm.hidden = true;
                await loadSection(section.section_id);
                if (status) status.textContent = "Course Outcome saved.";
            }
            catch (error) { if (status) status.textContent = error.message; notify(error.message); }
        });
        saveAssessmentButton.addEventListener("click", async () => {
            if (!section) return notify("Select a section first.");
            const indicatorInputs = [...indicatorRows.querySelectorAll(".so-indicator-row input")];
            const indicators = indicatorInputs.map(input => input.value.trim());
            if (indicators.some(value => !value)) return notify("Complete or remove each blank performance indicator.");
            const ratingRowsData = [...ratingRows.querySelectorAll(".so-rating-row")].map(row => ({
                rawValue: row.querySelector('input[type="number"]').value.trim(),
                value: Number(row.querySelector('input[type="number"]').value),
                label: row.querySelector('input[type="text"]').value.trim()
            }));
            if (ratingRowsData.some(row => !row.rawValue || !row.label ||
                !Number.isInteger(row.value) || row.value < 0 || row.value > 100)) {
                return notify("Enter a whole-number score from 0 to 100 and a label for every rating level.");
            }
            const rating_scale = ratingRowsData.map(({ value, label }) => ({ value, label }));
            if (new Set(rating_scale.map(row => row.value)).size !== rating_scale.length) {
                return notify("Each rating level must have a unique score.");
            }
            const data = { student_outcome_id: outcomeSelect.value, title: document.getElementById("soAssessmentTitle").value, due_date: document.getElementById("soAssessmentDue").value || null, status: document.getElementById("soAssessmentStatus").value, performance_indicators: indicators, rating_scale };
            saveAssessmentButton.disabled = true;
            try {
                await api(editingAssessmentId
                    ? `/api/faculty/so-assessments/${encodeURIComponent(editingAssessmentId)}`
                    : `/api/faculty/sections/${encodeURIComponent(section.section_id)}/so-assessments`, {
                    method: editingAssessmentId ? "PUT" : "POST",
                    body: JSON.stringify(data)
                });
                if (assessmentForm) assessmentForm.hidden = true;
                setAssessmentEditor(null);
                await loadSection(section.section_id);
                if (status) status.textContent = "Student Outcome assessment saved.";
            } catch (error) { if (status) status.textContent = error.message; notify(error.message); }
            finally { saveAssessmentButton.disabled = !section; }
        });
        document.getElementById("soCancelAssessment").addEventListener("click", () => {
            if (assessmentForm) assessmentForm.hidden = true;
            setAssessmentEditor(null);
        });
        root.addEventListener("click", async event => {
            const control = event.target.closest("[data-action]");
            if (!control || !section) return;
            const { action, id } = control.dataset;
            try {
                if (action === "edit-co") {
                    const row = outcomes.find(item => item.id === id); if (!row) return;
                    const code = prompt("Course Outcome code", row.code); if (code === null) return;
                    const description = prompt("Course Outcome description", row.description); if (description === null) return;
                    const target = prompt("Target attainment percentage", row.target_percentage); if (target === null) return;
                    await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcomes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ code, description, target_percentage: Number(target) }) });
                } else if (action === "delete-co") {
                    if (!confirm("Delete this Course Outcome and its connected assessment data?")) return;
                    await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcomes/${encodeURIComponent(id)}`, { method: "DELETE" });
                } else if (action === "map-co") {
                    const soId = root.querySelector(`[data-map-select="${CSS.escape(id)}"]`)?.value;
                    if (!soId) return notify("Choose a Student Outcome to align.");
                    const current = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`);
                    const next = [...(current.mappings || []), { course_outcome_id: id, student_outcome_id: soId }];
                    await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`, { method: "PUT", body: JSON.stringify({ mappings: next }) });
                } else if (action === "delete-assessment") {
                    if (!confirm("Delete this SO self-assessment and submitted responses?")) return;
                    await api(`/api/faculty/so-assessments/${encodeURIComponent(id)}`, { method: "DELETE" });
                } else if (action === "edit-assessment") {
                    const row = (await api(`/api/faculty/sections/${encodeURIComponent(section.section_id)}/so-assessments`)).assessments.find(item => item.id === id);
                    if (!row) return;
                    setAssessmentEditor(row);
                    if (assessmentForm) assessmentForm.hidden = false;
                    document.getElementById("soTabStudentOutcomes").click();
                    document.getElementById("soAssessmentTitle").focus();
                } else if (action === "responses") {
                    const data = await api(`/api/faculty/so-assessments/${encodeURIComponent(id)}/responses`);
                    document.getElementById("soResponseLog").hidden = false;
                    document.getElementById("soResponseRows").innerHTML = data.responses.length ? data.responses.map(row => `<tr><td>${esc(row.student_number)}</td><td>${esc(row.student_name)}</td><td>${esc(row.program)}</td><td>${esc(row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "")}</td><td>${Object.entries(row.answers).map(([i, value]) => `${esc(data.performance_indicators[Number(i)] || `Indicator ${Number(i) + 1}`)}: ${esc((data.rating_scale.find(x => String(x.value) === String(value)) || {}).label || value)}`).join("<br>")}</td></tr>`).join("") : `<tr><td colspan="5">No responses submitted yet.</td></tr>`;
                    document.getElementById("soResponseLog").scrollIntoView({ behavior: "smooth", block: "start" }); return;
                }
                await loadSection(section.section_id);
                if (status) status.textContent = "Changes saved.";
            } catch (error) {
                if (status) status.textContent = error.message;
                notify(error.message);
            }
        });
        api("/api/faculty/sections").then(data => {
            sections = Array.isArray(data.sections) ? data.sections : [];
            if (sectionSelect) {
                sectionSelect.replaceChildren(new Option(
                    sections.length ? "Select course section" : "No assigned sections",
                    ""
                ));
                sections.forEach(row => sectionSelect.add(new Option(
                    [row.course_code, row.section_name, row.academic_year_name, row.term_name]
                        .filter(Boolean).join(" · "),
                    row.section_id
                )));
            }
            const requested = new URLSearchParams(window.location.search).get("section_id");
            const selected = sections.some(row => row.section_id === requested)
                ? requested
                : sections.length === 1 ? sections[0].section_id : "";
            if (sectionSelect) {
                sectionSelect.value = selected;
                sectionSelect.disabled = sections.length === 0;
                sectionSelect.addEventListener("change", () => loadSection(sectionSelect.value));
            }
            if (selected) loadSection(selected);
            else loadSection("");
        }).catch(error => {
            if (sectionSelect) {
                sectionSelect.replaceChildren(new Option("Unable to load sections", ""));
                sectionSelect.disabled = true;
            }
            if (status) status.textContent = error.message;
            notify(error.message);
        });
    }

    function initStudent() {
        const list = document.getElementById("pendingSOList");
        if (!list) return;
        const count = document.getElementById("pendingSOCount");
        const dueCount = document.getElementById("dueThisWeekCount");
        const availableSyllabusCount = document.getElementById("availableSyllabusCount");
        const courseFilter = document.getElementById("studentCourseSort");
        const escape = esc;
        let syllabusRows = [];
        function renderSyllabi() {
            const syllabusList = document.getElementById("studentSyllabusList");
            const emptySyllabus = document.getElementById("studentSyllabusEmpty");
            const visible = syllabusRows.filter(item =>
                !courseFilter?.value || item.course_id === courseFilter.value
            );
            if (syllabusList) {
                syllabusList.innerHTML = visible.map(item => `<div class="so-student-file-row"><div class="so-student-file-info"><div class="so-student-file-copy"><strong>${escape(item.course_code)} · ${escape(item.course_title)} · ${escape(item.section_name)}</strong><div>${escape(item.file_name)}</div><small>${escape(item.term_name)} ${escape(item.academic_year_name)}</small></div></div><div class="so-student-file-actions"><a class="so-student-view-btn" target="_blank" rel="noopener" href="${escape(item.signed_url)}">View syllabus</a><a class="so-student-download-btn" href="${escape(item.download_url || item.signed_url)}" target="_blank" rel="noopener">Download</a></div></div>`).join("");
                syllabusList.hidden = !visible.length;
            }
            if (emptySyllabus) emptySyllabus.hidden = visible.length > 0;
        }
        async function load() {
            try {
                const data = await api(studentSectionScopedUrl("/api/student/so-assessments"));
                const rows = data.assessments || [];
                if (count) count.textContent = rows.length;
                if (dueCount) dueCount.textContent = rows.filter(row => row.due_date && (new Date(row.due_date + "T00:00:00") - new Date()) / 86400000 <= 7).length;
                list.innerHTML = rows.map(row => `<article class="so-pending-item"><div class="so-pending-information"><h3 class="so-pending-title">${escape(row.student_outcome?.code)} · ${escape(row.title)}</h3><div class="so-pending-meta"><span>Due: ${escape(row.due_date || "No due date")}</span><span class="so-pending-status">${escape(row.course_code)} · ${escape(row.section_name)}</span></div><p>${escape(row.course_title)} · ${escape(row.academic_term)} ${escape(row.academic_year)}</p></div><div class="so-pending-course">${row.syllabus_url ? `<a href="${escape(row.syllabus_url)}" target="_blank" rel="noopener">View syllabus</a> · <a href="${escape(row.syllabus_download_url)}" target="_blank" rel="noopener">Download</a>` : "Syllabus unavailable"}</div><button type="button" class="so-start-assessment-btn" data-assessment="${escape(row.id)}">Complete self-assessment</button></article>`).join("");
                list.hidden = !rows.length;
                const empty = document.getElementById("pendingSOEmpty"); if (empty) empty.hidden = !!rows.length;
            } catch (error) {
                notify(error.message);
            }
            try {
                const syllabusData = await api(studentSectionScopedUrl("/api/student/syllabi"));
                syllabusRows = Array.isArray(syllabusData.syllabi) ? syllabusData.syllabi : [];
                if (availableSyllabusCount) availableSyllabusCount.textContent = String(syllabusRows.length);
                if (courseFilter) {
                    const previous = courseFilter.value;
                    const courses = [...new Map(syllabusRows.map(item => [
                        item.course_id,
                        `${item.course_code} · ${item.course_title}`
                    ])).entries()];
                    courseFilter.replaceChildren(new Option("All Courses", ""));
                    courses.forEach(([id, label]) => courseFilter.add(new Option(label, id)));
                    if (courses.some(([id]) => id === previous)) courseFilter.value = previous;
                }
                renderSyllabi();
            } catch (error) {
                notify(error.message);
            }
        }
        courseFilter?.addEventListener("change", renderSyllabi);
        list.addEventListener("click", async event => {
            const button = event.target.closest("[data-assessment]"); if (!button) return;
            try {
                const data = await api(studentSectionScopedUrl("/api/student/so-assessments"));
                const assessment = data.assessments.find(row => row.id === button.dataset.assessment); if (!assessment) return;
                const veil = document.createElement("div"); veil.className = "so-response-dialog-backdrop";
                veil.innerHTML = `<section class="so-response-dialog" role="dialog" aria-modal="true"><button type="button" class="so-response-close" aria-label="Close">×</button><p class="cw-eyebrow">${esc(assessment.course_code)} · ${esc(assessment.section_name)} · Due ${esc(assessment.due_date || "No due date")}</p><h2>${esc(assessment.student_outcome?.code)} · ${esc(assessment.title)}</h2><p>${esc(assessment.student_outcome?.description)}</p><form id="soStudentResponseForm">${assessment.performance_indicators.map((indicator, i) => `<fieldset><legend>${i + 1}. ${esc(indicator)}</legend>${assessment.rating_scale.map(option => `<label class="so-response-rating"><input required type="radio" name="rating-${i}" value="${esc(option.value)}"><span><strong>${esc(option.value)}.</strong> ${esc(option.label)}</span></label>`).join("")}</fieldset>`).join("")}<button class="sof-add-outcome-btn" type="submit">Submit assessment</button></form></section>`;
                document.body.appendChild(veil);
                const close = () => veil.remove(); veil.querySelector(".so-response-close").addEventListener("click", close); veil.addEventListener("click", event => { if (event.target === veil) close(); });
                veil.querySelector("form").addEventListener("submit", async submitEvent => {
                    submitEvent.preventDefault();
                    const answers = {};
                    assessment.performance_indicators.forEach((_, i) => { answers[String(i)] = veil.querySelector(`input[name="rating-${i}"]:checked`)?.value; });
                    try { await api(`/api/student/so-assessments/${encodeURIComponent(assessment.id)}/responses`, { method: "POST", body: JSON.stringify({ answers }) }); close(); notify("Your self-assessment was submitted."); await load(); }
                    catch (error) { notify(error.message); }
                });
            } catch (error) { notify(error.message); }
        });
        load();
    }

    function initOverview() {
        if (!document.getElementById("departmentCourseTableBody")) return;
        const ids = { academic_year_id: "deptSchoolYear", program_id: "deptProgram", course_id: "deptCourse", section_id: "deptSection" };
        const fields = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)]));
        const encodeOptions = (select, rows, label, current, placeholder) => {
            if (!select) return;
            select.innerHTML = `<option value="">${placeholder}</option>` + rows.map(row => `<option value="${esc(row.id)}">${esc(label(row))}</option>`).join("");
            if (current && Array.from(select.options).some(option => option.value === current)) select.value = current;
        };
        async function refresh() {
            try {
                const params = new URLSearchParams();
                Object.entries(fields).forEach(([key, field]) => { if (field?.value) params.set(key, field.value); });
                const data = await api(`/api/outcomes/overview?${params.toString()}`);
                const filters = data.filters || {};
                const yearValue = fields.academic_year_id?.value || "";
                const programValue = fields.program_id?.value || "";
                const courseValue = fields.course_id?.value || "";
                const sectionValue = fields.section_id?.value || "";
                encodeOptions(fields.academic_year_id, filters.academic_years || [], row => row.name, yearValue, "All Academic Years");
                encodeOptions(fields.program_id, filters.programs || [], row => `${row.code} · ${row.name}`, programValue, "All Programs");
                encodeOptions(fields.course_id, filters.courses || [], row => `${row.code} · ${row.title}`, courseValue, "All Courses");
                encodeOptions(fields.section_id, filters.sections || [], row => `${row.name} · ${row.course_id === courseValue ? "Selected course" : "Course section"}`, sectionValue, "All Sections");
                const metrics = data.metrics || {};
                [ ["totalStudents", metrics.students], ["totalFaculty", metrics.faculty], ["totalCourses", metrics.courses], ["totalSections", metrics.sections] ].forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value ?? 0; });
                const q = (document.getElementById("courseSearch")?.value || "").trim().toLowerCase();
                const courseRows = (data.courses || []).filter(row => `${row.course_code} ${row.course_title} ${row.section_name} ${row.faculty_name}`.toLowerCase().includes(q));
                document.getElementById("departmentCourseTableBody").innerHTML = courseRows.length ? courseRows.map(row => `<tr><td>${esc(row.course_code)}</td><td>${esc(row.course_title)}</td><td>${esc(row.program || "—")}</td><td>${esc(row.section_name)}</td><td>${esc(row.faculty_name)}</td><td>${row.student_count}</td><td>${row.completion_rate}%</td></tr>`).join("") : `<tr><td colspan="7">No course sections match these filters.</td></tr>`;
                const soQuery = (document.getElementById("soSummarySearch")?.value || "").trim().toLowerCase();
                const soRows = (data.so_summary || []).filter(row => `${row.so_code} ${row.description}`.toLowerCase().includes(soQuery));
                document.getElementById("soSummaryTableBody").innerHTML = soRows.length ? soRows.map(row => `<tr><td>${esc(row.so_code)}</td><td>${esc(row.description)}</td><td>${row.average_rating === null ? "—" : `${row.average_rating}% average attainment · ${row.responses} responses`}</td></tr>`).join("") : `<tr><td colspan="3">No SO responses match these filters.</td></tr>`;
                const responseQuery = (document.getElementById("studentResponseSearch")?.value || "").trim().toLowerCase();
                const responses = (data.responses || []).filter(row => `${row.student_name} ${row.student_number} ${row.program} ${row.course_code} ${row.section_name} ${row.so_code}`.toLowerCase().includes(responseQuery));
                document.getElementById("studentResponsesTableBody").innerHTML = responses.length ? responses.map(row => `<tr><td>${esc(row.student_name)}<small class="so-co-links">${esc(row.student_number)}</small></td><td>${esc(row.program)}</td><td>${esc(row.course_code)} · ${esc(row.course_title)}</td><td>${esc(row.section_name)}</td><td>${esc(row.so_code)} · ${esc(row.assessment_title)}</td><td>${esc(row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "")}</td><td><details><summary>View answers</summary>${Object.entries(row.rating_labels || {}).map(([i, value]) => `<p>Indicator ${Number(i) + 1}: ${esc(value)}</p>`).join("")}</details></td></tr>`).join("") : `<tr><td colspan="7">No SO responses match these filters.</td></tr>`;
                const coPanel = document.getElementById("soSummaryTableBody");
                if (coPanel && !document.getElementById("coSummaryTableBody")) {
                    const table = coPanel.closest("table").parentElement;
                    const wrapper = document.createElement("div"); wrapper.className = "sodh-table-wrap so-co-summary";
                    wrapper.innerHTML = `<h3>Course Outcome attainment</h3><table class="sodh-table"><thead><tr><th>Course Outcome</th><th>Attainment</th><th>Target</th><th>Review</th></tr></thead><tbody id="coSummaryTableBody"></tbody></table>`;
                    table.after(wrapper);
                }
                const coBody = document.getElementById("coSummaryTableBody");
                if (coBody) coBody.innerHTML = (data.co_summary || []).length ? data.co_summary.map(row => `<tr><td>${esc(row.code)} · ${esc(row.description)}</td><td>${row.attainment_percentage === null ? "Awaiting results" : `${row.attainment_percentage}%`}</td><td>${row.target_percentage}%</td><td>${row.flagged ? `<span class="so-status-pill closed">Needs CQI review</span>` : `<span class="so-status-pill open">On target</span>`}</td></tr>`).join("") : `<tr><td colspan="4">No Course Outcome attainment is available for these filters.</td></tr>`;
            } catch (error) { notify(error.message); }
        }
        Object.values(fields).forEach(field => field?.addEventListener("change", refresh));
        ["courseSearch", "soSummarySearch", "studentResponseSearch"].forEach(id => document.getElementById(id)?.addEventListener("input", refresh));
        document.querySelectorAll(".sodh-export-btn").forEach(button => button.addEventListener("click", () => {
            const active = document.querySelector(".sodh-tab-panel.active");
            const table = active?.querySelector("table");
            if (!table) return notify("There is no report table to export.");
            const csv = Array.from(table.rows).map(row => Array.from(row.cells).map(cell => `"${cell.innerText.replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`).join(",")).join("\r\n");
            const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = `outcomes-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
        }));
        refresh();
    }

    document.addEventListener("DOMContentLoaded", () => { initFaculty(); initStudent(); initOverview(); });
})();
