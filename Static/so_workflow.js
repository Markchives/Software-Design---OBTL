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

    function initFaculty() {
        const root = document.getElementById("soWorkflowManager");
        if (!root) return;
        const sectionSelect = document.getElementById("soFacultySection");
        const coRows = document.getElementById("soCoRows");
        const assessmentRows = document.getElementById("soAssessmentRows");
        const outcomeSelect = document.getElementById("soAssessmentOutcome");
        let sections = [];
        let section = null;
        let outcomes = [];
        let studentOutcomes = [];
        let mappings = [];
        const button = (text, action, id) => `<button class="so-workflow-action" type="button" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
        async function loadSection() {
            section = sections.find(row => row.section_id === sectionSelect.value) || null;
            document.getElementById("soCoCode").value = "";
            document.getElementById("soCoDescription").value = "";
            if (!section) return;
            try {
                const mapData = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`);
                outcomes = mapData.outcomes || [];
                mappings = mapData.mappings || [];
                studentOutcomes = mapData.student_outcomes || [];
                coRows.innerHTML = outcomes.length ? outcomes.map(row => {
                    const links = mappings.filter(link => link.course_outcome_id === row.id)
                        .map(link => (mapData.student_outcomes || []).find(so => so.id === link.student_outcome_id))
                        .filter(Boolean).map(so => `${so.code}: ${so.description}`).join("; ");
                    const currentSoIds = new Set(mappings.filter(link => link.course_outcome_id === row.id).map(link => link.student_outcome_id));
                    const alignOptions = studentOutcomes.filter(so => !currentSoIds.has(so.id));
                    return `<tr><td>${esc(row.code)}</td><td>${esc(row.description)}${links ? `<small class="so-co-links">Mapped SOs: ${esc(links)}</small>` : "<small class=\"so-co-links\">No SO mapping yet</small>"}</td><td>${esc(row.target_percentage)}%</td><td>${button("Edit", "edit-co", row.id)} ${button("Delete", "delete-co", row.id)}<div class="so-inline-map"><select aria-label="Select SO to align with ${esc(row.code)}" data-map-select="${esc(row.id)}"><option value="">Align an SO</option>${alignOptions.map(so => `<option value="${esc(so.id)}">${esc(so.code)}</option>`).join("")}</select>${button("Map", "map-co", row.id)}</div></td></tr>`;
                }).join("") : `<tr><td colspan="4">No Course Outcomes. Add one above.</td></tr>`;
                const mappedSoIds = new Set(mappings.map(row => row.student_outcome_id));
                const soOptions = studentOutcomes.filter(row => mappedSoIds.has(row.id));
                outcomeSelect.innerHTML = `<option value="">Select a mapped SO</option>` + soOptions.map(row => `<option value="${esc(row.id)}">${esc(row.code)} — ${esc(row.description)}</option>`).join("");
                const alignSelect = document.getElementById("soCoAlignment");
                if (alignSelect) alignSelect.innerHTML = `<option value="">Choose an SO (optional)</option>` + studentOutcomes.map(row => `<option value="${esc(row.id)}">${esc(row.code)} — ${esc(row.description)}</option>`).join("");
                const data = await api(`/api/faculty/sections/${encodeURIComponent(section.section_id)}/so-assessments`);
                assessmentRows.innerHTML = (data.assessments || []).length ? data.assessments.map(row => `<tr><td><strong>${esc(row.student_outcome?.code)} · ${esc(row.title)}</strong><small class="so-co-links">${esc(row.student_outcome?.description)}</small></td><td>${esc(row.due_date || "No due date")}</td><td><span class="so-status-pill ${esc(row.status)}">${esc(row.status)}</span></td><td>${row.response_count || 0} / ${row.student_count || 0}</td><td>${row.completion_rate || 0}%</td><td>${button("Responses", "responses", row.id)} ${button("Edit", "edit-assessment", row.id)} ${button("Delete", "delete-assessment", row.id)}</td></tr>`).join("") : `<tr><td colspan="6">No SO assessments for this section yet.</td></tr>`;
            } catch (error) { notify(error.message); }
        }
        sectionSelect.addEventListener("change", loadSection);
        document.getElementById("soSaveCo").addEventListener("click", async () => {
            if (!section) return notify("Select a section first.");
            const data = { code: document.getElementById("soCoCode").value, description: document.getElementById("soCoDescription").value, target_percentage: Number(document.getElementById("soCoTarget").value) };
            try {
                const saved = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcomes`, { method: "POST", body: JSON.stringify(data) });
                const soId = document.getElementById("soCoAlignment").value;
                if (soId) {
                    const current = await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`);
                    await api(`/api/faculty/courses/${encodeURIComponent(section.course_id)}/outcome-mappings`, { method: "PUT", body: JSON.stringify({ mappings: [...(current.mappings || []), { course_outcome_id: saved.outcome.id, student_outcome_id: soId }] }) });
                }
                await loadSection(); notify("Course Outcome saved.");
            }
            catch (error) { notify(error.message); }
        });
        document.getElementById("soSaveAssessment").addEventListener("click", async () => {
            if (!section) return notify("Select a section first.");
            const indicators = document.getElementById("soIndicators").value.split("\n").map(v => v.trim()).filter(Boolean);
            const rating_scale = document.getElementById("soRatingScale").value.split("\n").map(line => {
                const [value, ...label] = line.split("|");
                return { value: Number(value.trim()), label: label.join("|").trim() };
            }).filter(row => Number.isInteger(row.value) && row.label);
            const data = { student_outcome_id: outcomeSelect.value, title: document.getElementById("soAssessmentTitle").value, due_date: document.getElementById("soAssessmentDue").value || null, status: document.getElementById("soAssessmentStatus").value, performance_indicators: indicators, rating_scale };
            try { await api(`/api/faculty/sections/${encodeURIComponent(section.section_id)}/so-assessments`, { method: "POST", body: JSON.stringify(data) }); await loadSection(); notify("SO assessment saved."); }
            catch (error) { notify(error.message); }
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
                    const title = prompt("Assessment title", row.title); if (title === null) return;
                    const due_date = prompt("Due date (YYYY-MM-DD), blank for none", row.due_date || ""); if (due_date === null) return;
                    const status = prompt("Status: draft, open, or closed", row.status); if (status === null) return;
                    const performance_indicators = (row.performance_indicators || []).map((v, i) => prompt(`Performance indicator ${i + 1}`, v)).filter(v => v !== null);
                    if (performance_indicators.length !== row.performance_indicators.length) return;
                    await api(`/api/faculty/so-assessments/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ student_outcome_id: row.student_outcome_id, title, due_date: due_date || null, status, performance_indicators, rating_scale: row.rating_scale }) });
                } else if (action === "responses") {
                    const data = await api(`/api/faculty/so-assessments/${encodeURIComponent(id)}/responses`);
                    document.getElementById("soResponseLog").hidden = false;
                    document.getElementById("soResponseRows").innerHTML = data.responses.length ? data.responses.map(row => `<tr><td>${esc(row.student_number)}</td><td>${esc(row.student_name)}</td><td>${esc(row.program)}</td><td>${esc(row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "")}</td><td>${Object.entries(row.answers).map(([i, value]) => `${esc(data.performance_indicators[Number(i)] || `Indicator ${Number(i) + 1}`)}: ${esc((data.rating_scale.find(x => String(x.value) === String(value)) || {}).label || value)}`).join("<br>")}</td></tr>`).join("") : `<tr><td colspan="5">No responses submitted yet.</td></tr>`;
                    document.getElementById("soResponseLog").scrollIntoView({ behavior: "smooth", block: "start" }); return;
                }
                await loadSection();
            } catch (error) { notify(error.message); }
        });
        api("/api/faculty/sections").then(data => {
            sections = data.sections || [];
            sectionSelect.innerHTML = `<option value="">Select a section</option>` + sections.map(row => `<option value="${esc(row.section_id)}">${esc(row.course_code)} · ${esc(row.course_title)} · ${esc(row.section_name)} · ${esc(row.academic_year_name || "")}</option>`).join("");
        }).catch(error => notify(error.message));
    }

    function initStudent() {
        const list = document.getElementById("pendingSOList");
        if (!list) return;
        const count = document.getElementById("pendingSOCount");
        const dueCount = document.getElementById("dueThisWeekCount");
        const escape = esc;
        async function load() {
            try {
                const data = await api("/api/student/so-assessments");
                const rows = data.assessments || [];
                if (count) count.textContent = rows.length;
                if (dueCount) dueCount.textContent = rows.filter(row => row.due_date && (new Date(row.due_date + "T00:00:00") - new Date()) / 86400000 <= 7).length;
                list.innerHTML = rows.map(row => `<article class="so-pending-item"><div class="so-pending-information"><h3 class="so-pending-title">${escape(row.student_outcome?.code)} · ${escape(row.title)}</h3><div class="so-pending-meta"><span>Due: ${escape(row.due_date || "No due date")}</span><span class="so-pending-status">${escape(row.course_code)} · ${escape(row.section_name)}</span></div><p>${escape(row.course_title)} · ${escape(row.academic_term)} ${escape(row.academic_year)}</p></div><div class="so-pending-course">${row.syllabus_url ? `<a href="${escape(row.syllabus_url)}" target="_blank" rel="noopener">View syllabus</a> · <a href="${escape(row.syllabus_download_url)}" target="_blank" rel="noopener">Download</a>` : "Syllabus unavailable"}</div><button type="button" class="so-start-assessment-btn" data-assessment="${escape(row.id)}">Complete self-assessment</button></article>`).join("");
                list.hidden = !rows.length;
                const empty = document.getElementById("pendingSOEmpty"); if (empty) empty.hidden = !!rows.length;
                const syllabusData = await api("/api/student/syllabi");
                const syllabusList = document.getElementById("studentSyllabusList");
                const emptySyllabus = document.getElementById("studentSyllabusEmpty");
                const syllabi = syllabusData.syllabi || [];
                if (syllabusList) {
                    syllabusList.innerHTML = syllabi.map(item => `<div class="so-student-file-row"><div class="so-student-file-info"><div class="so-student-file-copy"><strong>${escape(item.course_code)} · ${escape(item.course_title)} · ${escape(item.section_name)}</strong><div>${escape(item.file_name)}</div></div></div><div class="so-student-file-actions"><a class="so-student-view-btn" target="_blank" rel="noopener" href="${escape(item.signed_url)}">View syllabus</a><a class="so-student-download-btn" href="${escape(item.download_url || item.signed_url)}" target="_blank" rel="noopener">Download PDF</a></div></div>`).join("");
                    syllabusList.hidden = !syllabi.length; if (emptySyllabus) emptySyllabus.hidden = !!syllabi.length;
                }
            } catch (error) { notify(error.message); }
        }
        list.addEventListener("click", async event => {
            const button = event.target.closest("[data-assessment]"); if (!button) return;
            try {
                const data = await api("/api/student/so-assessments");
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
