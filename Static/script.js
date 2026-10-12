/* WORKFLOW 8-STEP EXPLORER */
(function () {
    "use strict";
    const root = document.querySelector("#academic-workflow");
    if (!root) return;
    const steps = [
        [
            "Syllabus & Outcome Setup",
            "Define the course syllabus and align Course Outcomes (COs) with Student Outcomes (SOs).",
            "Create an aligned academic foundation.",
            "Faculty / Department Head"
        ],
        [
            "Multi-Tier Curriculum Mapping",
            "Connect activities, rubrics, quizzes, laboratories, and examinations to COs and SOs.",
            "Documented curriculum and assessment alignment.",
            "Faculty / Department Head"
        ],
        [
            "Class Roster Enrollment",
            "Organize student enrollment by course and section with structured roster management.",
            "An accurate enrolled-student roster.",
            "Faculty / Department Head"
        ],
        [
            "Raw Assessment Score Entry",
            "Encode earned points for quizzes, projects, laboratory work, and major examinations.",
            "Recorded assessment evidence for each student.",
            "Faculty"
        ],
        [
            "Attainment Calculation",
            "Review calculated CO and SO attainment against target percentage thresholds.",
            "Attainment summaries and identified learning gaps.",
            "Faculty / Department Head"
        ],
        [
            "CQI Action Planning",
            "Identify unmet outcomes and prepare targeted corrective or improvement actions.",
            "A documented continuous improvement action plan.",
            "Faculty / Department Head"
        ],
        [
            "Gradebook Locking",
            "Review, verify, and lock finalized grade records under authorized oversight.",
            "Verified and locked academic records.",
            "Faculty / Department Head"
        ],
        [
            "Compliance Report Printing",
            "Generate assessment, grading, syllabus, attainment, and CQI reports.",
            "Printable academic compliance and evidence reports.",
            "Department Head / Authorized Staff"
        ]
    ];
    const cards = Array.from(root.querySelectorAll("[data-wf8-step]"));
    let current = 0;

    function show(index) {
        current = (index + steps.length) % steps.length;
        const step = steps[current];
        if (
            !root.querySelector("#wf8DetailCount") ||
            !root.querySelector("#wf8DetailTitle") ||
            !root.querySelector("#wf8DetailDescription") ||
            !root.querySelector("#wf8DetailOutput") ||
            !root.querySelector("#wf8DetailRole")
        ) return;
        root.querySelector("#wf8DetailCount").textContent = "STEP " + String(current + 1).padStart(2, "0") + " OF 08";
        root.querySelector("#wf8DetailTitle").textContent = step[0];
        root.querySelector("#wf8DetailDescription").textContent = step[1];
        root.querySelector("#wf8DetailOutput").textContent = step[2];
        root.querySelector("#wf8DetailRole").textContent = step[3];
        cards.forEach((card, i) => {
            card.classList.toggle("is-active", i === current);
            card.setAttribute("aria-pressed", String(i === current))
        })
    }

            if (assignments.length === 1 && !courseSelect.value) {
                const assignment = assignments[0];
                courseSelect.value = assignment.course_id;
                courseSelect.dispatchEvent(new Event("change", { bubbles: true }));
                if (assignment.academic_year_id) {
                    yearSelect.value = assignment.academic_year_id;
                }
                sectionSelect.value = assignment.section_id;
                sectionSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }

    cards.forEach((card, i) => card.addEventListener("click", () => show(i)));
    const next = root.querySelector("#wf8Next");
    if (next) next.addEventListener("click", () => show(current + 1));
    if (cards.length) show(0)
})();

/* REQUIREMENT 3 — CLASS ROSTER FACULTY */
(function () {
    "use strict";
    const page = document.querySelector(".cr-faculty-page");
    if (!page)
        return;
    const body = document.getElementById("crfRosterBody");
    const search = document.getElementById("crfSearch");
    const sort = document.getElementById("crfSort");
    const category = document.getElementById("crfCategory");
    const empty = document.getElementById("crfEmpty");
    const importModal = document.getElementById("crfImportModal");
    const removeModal = document.getElementById("crfRemoveModal");
    let pendingRemoveRow = null;

    function setModal(modal, show) {
        if (!modal)
            return;
        modal.classList.toggle("show", show);
        modal.setAttribute("aria-hidden", show ? "false" : "true");
        document.body.classList.toggle("crf-modal-open", document.querySelector(".crf-modal.show") !== null);
    }

    function rosterRows() {
        return body ? Array.from(body.querySelectorAll("tr")) : [];
    }

    function renumber() {
        rosterRows().forEach(function (row, index) {
            if (row.cells[0])
                row.cells[0].textContent = String(index + 1);
        });
    }

    function renderRoster() {
        if (!body)
            return;
        const q = (search ? search.value : "").trim().toLowerCase();
        const filter = category ? category.value : "all";
        const mode = sort ? sort.value : "az";
        const rows = rosterRows();
        rows.sort(function (a, b) {
            const nameA = a.cells[2].textContent.trim().toLowerCase();
            const nameB = b.cells[2].textContent.trim().toLowerCase();
            if (mode === "za")
                return nameB.localeCompare(nameA);
            if (mode === "id")
                return a.cells[1].textContent.trim().localeCompare(b.cells[1].textContent.trim(), undefined, { numeric: true });
            return nameA.localeCompare(nameB);
        });
        rows.forEach(function (row) {
            const matchesSearch = row.textContent.toLowerCase().includes(q);
            const matchesCategory = filter === "all" || row.dataset.category === filter;
            row.hidden = !(matchesSearch && matchesCategory);
            body.appendChild(row);
        });
        renumber();
        if (empty)
            empty.hidden = rows.some(function (row) { return !row.hidden; });
    }

    function showImportStep(step) {
        document.querySelectorAll(".crf-import-screen").forEach(function (screen) {
            screen.classList.toggle("active", screen.dataset.screen === String(step));
        });
        document.querySelectorAll(".crf-step").forEach(function (item) {
            item.classList.toggle("active", Number(item.dataset.step) <= step);
        });
    }
    if (search)
        search.addEventListener("input", renderRoster);
    if (sort)
        sort.addEventListener("change", renderRoster);
    if (category)
        category.addEventListener("change", renderRoster);

    document.addEventListener("click", function (event) {
        const openImport = event.target.closest("#crfImportOpen");
        if (openImport) {
            event.preventDefault();
            event.stopPropagation();
            showImportStep(1);
            setModal(importModal, true);
            return;
        }
        if (event.target.closest("#crfSampleRoster")) {
            showImportStep(2);
            return;
        }
        if (event.target.closest("#crfChooseAnother")) {
            const file = document.getElementById("crfRosterFile");
            if (file)
                file.value = "";
            showImportStep(1);
            return;
        }
        if (event.target.closest("#crfConfirmImport")) {
            showImportStep(3);
            return;
        }
        if (event.target.closest("#crfImportDone")) {
            setModal(importModal, false);
            showImportStep(1);
            return;
        }
        const removeButton = event.target.closest(".crf-remove-btn");
        if (removeButton) {
            pendingRemoveRow = removeButton.closest("tr");
            const name = pendingRemoveRow && pendingRemoveRow.cells[2]
                ? pendingRemoveRow.cells[2].textContent.trim() : "this student";
            const target = document.getElementById("crfRemoveName");
            if (target)
                target.textContent = name;
            setModal(removeModal, true);
            return;
        }
        if (event.target.closest("#crfRemoveConfirm")) {
            if (pendingRemoveRow)
                pendingRemoveRow.remove();
            pendingRemoveRow = null;
            setModal(removeModal, false);
            renderRoster();
            return;
        }
        const close = event.target.closest("[data-crf-close]");
        if (close) {
            if (close.dataset.crfClose === "import")
                setModal(importModal, false);
            if (close.dataset.crfClose === "remove") {
                pendingRemoveRow = null;
                setModal(removeModal, false);
            }
            return;
        }
        if (event.target === importModal)
            setModal(importModal, false);
        if (event.target === removeModal) {
            pendingRemoveRow = null;
            setModal(removeModal, false);
        }
        if (event.target.closest("#crfDownload")) {
            const visible = rosterRows().filter(function (row) { return !row.hidden; });
            const lines = [["#", "Student ID", "Student Name", "Email", "Category", "Enrollment Status"]];
            visible.forEach(function (row) {
                lines.push(Array.from(row.cells).slice(0, 6).map(function (cell) {
                    return cell.textContent.trim();
                }));
            });
            const csv = lines.map(function (line) {
                return line.map(function (value) {
                    return '"' + String(value).replace(/"/g, '""') + '"';
                }).join(",");
            }).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "class-roster-COE232.csv";
            a.click();
            URL.revokeObjectURL(url);
        }
    });
    const rosterFile = document.getElementById("crfRosterFile");
    if (rosterFile) {
        rosterFile.addEventListener("change", function () {
            if (rosterFile.files && rosterFile.files.length)
                showImportStep(2);
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape")
            return;
        pendingRemoveRow = null;
        setModal(importModal, false);
        setModal(removeModal, false);
    });
    renderRoster();
})();

/* CM DEPT HEAD — CLEAN POPUP CONTROLLER */
(function () {
    "use strict";
    const page = document.querySelector(".cm-dept-head-page");
    if (!page)
        return;
    const reviewModal = document.getElementById("cmDeptAssessmentReviewModal");
    const actionModal = document.getElementById("cmDeptActionModal");

    function el(id) {
        return document.getElementById(id);
    }

    function clean(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function field(label, value, wide) {
        return '<div class="cm-dept-action-field' +
            (wide ? ' cm-dept-action-wide' : '') +
            '"><span>' + clean(label) + '</span><strong>' +
            clean(value || "—") + '</strong></div>';
    }

    function showReview(button) {
        const row = button.closest("tr");
        if (!row || !reviewModal)
            return;
        const mapped = Array.from(row.cells[3].querySelectorAll(".cm-co-badge"))
            .map(function (badge) {
                return badge.textContent.trim();
            })
            .join(" • ");
        el("cmDeptReviewAssessment").textContent = row.cells[0].textContent.trim();
        el("cmDeptReviewType").textContent = row.cells[1].textContent.trim();
        el("cmDeptReviewDate").textContent = row.cells[2].textContent.trim();
        el("cmDeptReviewCos").textContent = mapped || "—";
        reviewModal.dataset.reviewRowIndex = String(row.rowIndex);
        reviewModal.classList.add("show");
        reviewModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("cm-dept-modal-open");
    }

    function hideReview() {
        if (!reviewModal)
            return;
        reviewModal.classList.remove("show");
        reviewModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("cm-dept-modal-open");
    }

    function showAction(options) {
        if (!actionModal)
            return;
        el("cmDeptActionTitle").textContent = options.title || "Details";
        el("cmDeptActionSubtitle").textContent = options.subtitle || "";
        el("cmDeptActionSummary").innerHTML = options.summary || "";
        const note = el("cmDeptActionNote");
        note.innerHTML = options.note || "";
        note.hidden = !options.note;
        const form = el("cmDeptCqiForm");
        form.hidden = !options.showCqiForm;
        const textarea = el("cmDeptCqiAction");
        if (textarea)
            textarea.value = "";
        const confirm = el("cmDeptActionConfirm");
        confirm.textContent = options.confirmText || "Close";
        confirm.dataset.mode = options.mode || "close";
        confirm.dataset.rowIndex =
            options.rowIndex == null ? "" : String(options.rowIndex);
        actionModal.classList.add("show");
        actionModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("cm-dept-modal-open");
    }

    function hideAction() {
        if (!actionModal)
            return;
        actionModal.classList.remove("show");
        actionModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("cm-dept-modal-open");
    }
    page.addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button)
            return;
        let row;
        if (button.classList.contains("cm-dept-review-btn")) {
            event.preventDefault();
            showReview(button);
            return;
        }
        row = button.closest("tr");
        if (!row)
            return;
        if (button.classList.contains("cm-dept-view-syllabus-btn")) {
            event.preventDefault();
            const mapped = Array.from(row.cells[3].querySelectorAll(".cm-co-badge"))
                .map(function (badge) {
                    return badge.textContent.trim();
                })
                .join(" • ");
            showAction({
                title: "Syllabus Mapping View",
                subtitle: "Review the syllabus information connected to this assessment.",
                summary: field("ASSESSMENT", row.cells[0].textContent.trim()) +
                    field("TYPE", row.cells[1].textContent.trim()) +
                    field("DATE", row.cells[2].textContent.trim()) +
                    field("MAPPED CO(S)", mapped),
                note: "<strong>Syllabus reference:</strong> This assessment is linked to the approved course syllabus and its mapped Course Outcomes.",
                confirmText: "Close"
            });
            return;
        }
        if (button.classList.contains("cm-dept-view-btn")) {
            event.preventDefault();
            if (button.closest("#course-outcomes")) {
                const activities = Array.from(row.cells[2].querySelectorAll(".cm-dept-map-card")).map(function (item) {
                    return item.textContent.trim();
                }).join(" • ");
                const needsImprovement = row.cells[5].textContent.indexOf("Needs Improvement") !== -1;
                showAction({
                    title: "Course Outcome Review",
                    subtitle: "Review the selected Course Outcome and its class attainment.",
                    summary: field("CO NO.", row.cells[0].textContent.trim()) +
                        field("CLASS ATTAINMENT", row.cells[3].textContent.trim()) +
                        field("TARGET", row.cells[4].textContent.trim()) +
                        field("STATUS", row.cells[5].textContent.trim()) +
                        field("COURSE OUTCOME", row.cells[1].textContent.trim(), true) +
                        field("MAPPED ACTIVITIES", activities, true),
                    note: needsImprovement
                        ? "<strong>CQI basis:</strong> The class attainment is below the required 70% target."
                        : "<strong>Result:</strong> The Course Outcome meets the required attainment target.",
                    confirmText: "Close"
                });
                return;
            }
            if (button.closest("#students-attainment")) {
                showAction({
                    title: "Student Attainment Review",
                    subtitle: "Review the student's attainment across all Course Outcomes.",
                    summary: field("STUDENT ID", row.cells[1].textContent.trim()) +
                        field("STUDENT NAME", row.cells[2].textContent.trim()) +
                        field("STATUS", row.cells[8].textContent.trim()) +
                        field("CO1", row.cells[3].textContent.trim()) +
                        field("CO2", row.cells[4].textContent.trim()) +
                        field("CO3", row.cells[5].textContent.trim()) +
                        field("CO4", row.cells[6].textContent.trim()) +
                        field("CO5", row.cells[7].textContent.trim()),
                    note: "<strong>Review note:</strong> Scores below the required attainment level should be considered when reviewing CQI needs.",
                    confirmText: "Close"
                });
                return;
            }
        }
        if (button.classList.contains("cm-dept-cqi-basis-btn")) {
            event.preventDefault();
            showAction({
                title: "CQI Basis",
                subtitle: "Review why this Course Outcome requires improvement.",
                summary: field("CO NO.", row.cells[0].textContent.trim()) +
                    field("CLASS ATTAINMENT", row.cells[3].textContent.trim()) +
                    field("TARGET", row.cells[4].textContent.trim()) +
                    field("STATUS", row.cells[5].textContent.trim()),
                note: "<strong>CQI basis:</strong> The class attainment is below the required 70% target. Review the mapped activities and assessment evidence before planning an improvement action.",
                confirmText: "Close"
            });
            return;
        }
        if (button.classList.contains("cm-dept-review-mapping-btn")) {
            event.preventDefault();
            const sos = Array.from(row.cells[2].querySelectorAll(".cm-dept-so-card")).map(function (item) {
                return item.textContent.trim();
            }).join(" • ");
            showAction({
                title: "CO - SO Mapping Review",
                subtitle: "Verify the alignment of the Course Outcome with the selected Student Outcome(s).",
                summary: field("CO NO.", row.cells[0].textContent.trim()) +
                    field("ALIGNED SO(S)", sos) +
                    field("STATUS", row.cells[3].textContent.trim()) +
                    field("COURSE OUTCOME", row.cells[1].textContent.trim(), true),
                note: "<strong>Review note:</strong> Confirm that the selected SO alignment is appropriate for the Course Outcome before verification.",
                confirmText: "Verify Mapping",
                mode: "verify-coso",
                rowIndex: row.rowIndex
            });
            return;
        }
        if (button.classList.contains("cm-dept-review-co-btn")) {
            event.preventDefault();
            showAction({
                title: "Flagged Course Outcome Review",
                subtitle: "Review the attainment issue before creating a CQI action.",
                summary: field("CO NO.", row.cells[0].textContent.trim()) +
                    field("ATTAINMENT", row.cells[1].textContent.trim()) +
                    field("TARGET", row.cells[2].textContent.trim()) +
                    field("STATUS", row.cells[4].textContent.trim()) +
                    field("ISSUE", row.cells[3].textContent.trim(), true),
                note: "<strong>Review note:</strong> This Course Outcome is below the target and should be reviewed together with its mapped assessment evidence.",
                confirmText: "Close"
            });
            return;
        }
        if (button.classList.contains("cm-dept-create-cqi-btn")) {
            event.preventDefault();
            showAction({
                title: "Create CQI Action",
                subtitle: "Create a continuous quality improvement action for the flagged Course Outcome.",
                summary: field("CO NO.", row.cells[0].textContent.trim()) +
                    field("ATTAINMENT", row.cells[1].textContent.trim()) +
                    field("TARGET", row.cells[2].textContent.trim()) +
                    field("STATUS", row.cells[4].textContent.trim()) +
                    field("ISSUE", row.cells[3].textContent.trim(), true),
                note: "<strong>CQI basis:</strong> The recorded attainment is below the required 70% target.",
                showCqiForm: true,
                confirmText: "Save CQI",
                mode: "save-cqi",
                rowIndex: row.rowIndex
            });
        }
    });

    document.addEventListener("click", function (event) {
        if (event.target.closest("[data-close-dept-review]") ||
            event.target === reviewModal) {
            hideReview();
            return;
        }
        if (event.target.closest("[data-close-dept-action]") ||
            event.target === actionModal) {
            hideAction();
            return;
        }
        if (event.target.closest("#cmDeptVerifyMapping")) {
            const table = document.querySelector(".cm-dept-assessment-table");
            const row = table &&
                table.rows[Number(reviewModal.dataset.reviewRowIndex)];
            if (row) {
                const status = row.cells[4].querySelector(".cm-dept-status");
                if (status) {
                    status.textContent = "Verified";
                    status.classList.remove("review");
                    status.classList.add("verified");
                }
            }
            hideReview();
            return;
        }
        if (event.target.closest("#cmDeptActionConfirm")) {
            const confirm = el("cmDeptActionConfirm");
            const mode = confirm.dataset.mode;
            if (mode === "verify-coso") {
                const table = document.querySelector(".cm-dept-coso-table");
                const row = table &&
                    table.rows[Number(confirm.dataset.rowIndex)];
                if (row) {
                    const status = row.cells[3].querySelector(".cm-dept-status");
                    if (status) {
                        status.textContent = "Verified";
                        status.classList.remove("review");
                        status.classList.add("verified");
                    }
                }
            }
            if (mode === "save-cqi") {
                const textarea = el("cmDeptCqiAction");
                if (!textarea.value.trim()) {
                    textarea.focus();
                    return;
                }
                const table = document.querySelector(".cm-dept-cqi-table");
                const row = table &&
                    table.rows[Number(confirm.dataset.rowIndex)];
                if (row) {
                    const status = row.cells[4].querySelector(".cm-dept-status");
                    if (status) {
                        status.textContent = "CQI Created";
                        status.classList.remove("review", "required");
                        status.classList.add("verified");
                    }
                }
            }
            hideAction();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            hideReview();
            hideAction();
        }
    });
})();

/* CM FACULTY — COURSE OUTCOME POPUPS */
function getCourseOutcomeRowData(button) {
    const row = button.closest("tr");
    if (!row || !row.cells || row.cells.length < 7)
        return null;
    return {
        number: row.cells[0].textContent.trim(),
        description: row.cells[1].textContent.trim(),
        activities: Array.from(row.cells[2].querySelectorAll(".cm-co-badge"))
            .map(function (item) { return item.textContent.trim(); })
            .join(", "),
        attainment: row.cells[3].textContent.trim(),
        target: row.cells[4].textContent.trim(),
        status: row.cells[5].textContent.trim()
    };
}

function showCourseOutcomeModal(modal) {
    if (!modal)
        return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("cm-modal-open");
}

function hideCourseOutcomeModal(modal) {
    if (!modal)
        return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".cm-attainment-modal.show")) {
        document.body.classList.remove("cm-modal-open");
    }
}

function openCourseOutcomeView(button) {
    const data = getCourseOutcomeRowData(button);
    const modal = document.getElementById("courseOutcomeViewModal");
    if (!data || !modal)
        return;
    document.getElementById("coViewNumber").textContent = data.number;
    document.getElementById("coViewAttainment").textContent = data.attainment;
    document.getElementById("coViewTarget").textContent = data.target;
    document.getElementById("coViewStatus").textContent = data.status;
    document.getElementById("coViewDescription").textContent = data.description;
    document.getElementById("coViewActivities").textContent = data.activities || "—";
    showCourseOutcomeModal(modal);
}

function openCourseOutcomeCqi(button) {
    const data = getCourseOutcomeRowData(button);
    const modal = document.getElementById("courseOutcomeCqiModal");
    if (!data || !modal)
        return;
    document.getElementById("coCqiNumber").textContent = data.number;
    document.getElementById("coCqiAttainment").textContent = data.attainment;
    document.getElementById("coCqiReason").textContent =
        data.number + " has a class attainment of " + data.attainment +
        ", which is below the required 70% attainment target.";
    showCourseOutcomeModal(modal);
}

/* One delegated listener only — handles all Course Outcome View/CQI buttons. */
document.addEventListener("click", function (event) {
    const viewButton = event.target.closest(".cm-co-view-btn");
    if (viewButton) {
        event.preventDefault();
        event.stopPropagation();
        openCourseOutcomeView(viewButton);
        return;
    }
    const cqiButton = event.target.closest(".cm-co-cqi-btn");
    if (cqiButton) {
        event.preventDefault();
        event.stopPropagation();
        openCourseOutcomeCqi(cqiButton);
        return;
    }
    const closeButton = event.target.closest("[data-close-co-modal]");
    if (closeButton) {
        hideCourseOutcomeModal(document.getElementById(closeButton.getAttribute("data-close-co-modal")));
        return;
    }
    if (event.target.classList.contains("cm-attainment-modal")) {
        hideCourseOutcomeModal(event.target);
    }
});

/* EduMetrics - Academic Assessment & Grading System */
/** Get an element safely. */
function getElement(id) {
    return document.getElementById(id);
}

/** Check whether an element exists. */
function elementExists(id) {
    return getElement(id) !== null;
}

/** Open a modal. */
function setModalVisibility(modalId, visible) {
    const modal = getElement(modalId);
    if (!modal) return;

    modal.classList.toggle("show", visible);
    modal.setAttribute("aria-hidden", String(!visible));
}

/** Open a modal. */
function openModal(modalId) {
    setModalVisibility(modalId, true);
}

/** Close a modal. */
function closeModal(modalId) {
    setModalVisibility(modalId, false);
}

/* EMAIL VALIDATION */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* PASSWORD VALIDATION */
function validatePassword(password) {
    return {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
}

/** Check if password satisfies all requirements. */
function isStrongPassword(password) {
    const result = validatePassword(password);
    return (result.length &&
        result.uppercase &&
        result.lowercase &&
        result.number &&
        result.special);
}

/* PASSWORD SHOW / HIDE */
function togglePassword(inputId, button) {
    const input = getElement(inputId);
    if (!input) return;

    const showPassword = input.type === "password";
    input.type = showPassword ? "text" : "password";

    if (button) {
        button.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    }
}

/* LOGIN PASSWORD */
function toggleLoginPassword() {
    togglePassword("loginPassword", document.querySelector(".password-toggle"));
}

/* REGISTRATION PASSWORD */
function toggleSignupPassword(inputId, button) {
    togglePassword(inputId, button);
}

/* PASSWORD REQUIREMENTS */
function updatePasswordRequirement(elementId, passed, text) {
    const element = getElement(elementId);
    if (!element) {
        return;
    }
    element.textContent =
        (passed
            ? "✓ "
            : "○ ") +
        text;
    element.classList.toggle("requirement-passed", passed);
}

/** Update all password requirement indicators. */
function updatePasswordRequirements(password) {
    const result = validatePassword(password);
    updatePasswordRequirement("lengthRequirement", result.length, "8 or more characters");
    updatePasswordRequirement("uppercaseRequirement", result.uppercase, "At least one uppercase letter");
    updatePasswordRequirement("lowercaseRequirement", result.lowercase, "At least one lowercase letter");
    updatePasswordRequirement("numberRequirement", result.number, "At least one number");
    updatePasswordRequirement("specialRequirement", result.special, "At least one special character");
}

/* EMAIL MASKING */
function maskEmail(email) {
    if (!email) {
        return ("your email address");
    }
    const parts = email.split("@");
    if (parts.length !== 2) {
        return email;
    }
    const username = parts[0];
    const domain = parts[1];
    let maskedUsername;
    if (username.length <= 2) {
        maskedUsername =
            username.charAt(0) +
            "*".repeat(Math.max(username.length - 1, 1));
    }
    else {
        maskedUsername =
            username.substring(0, 2) +
            "*".repeat(Math.max(username.length - 2, 2));
    }
    return (maskedUsername +
        "@" +
        domain);
}

/* ROLE FORMATTING */
function formatRole(role) {
    const roleNames = {
        "student": "Student",
        "faculty": "Faculty",
        "department-head": "Department Head",
        "admin-security": "Admin & Security"
    };
    return (roleNames[role] ||
        role ||
        "User");
}

/* ROLE VALIDATION */
function isValidRole(role) {
    const validRoles = [
        "student",
        "faculty",
        "department-head",
        "admin-security"
    ];
    return validRoles.includes(role);
}


/* SOCIAL LOGIN / SIGNUP */
function socialLogin(provider) {
    /* SOCIAL LOGIN FLOW */
    const params = new URLSearchParams(window.location.search);
    let role = params.get("role") ||
        getSelectedRole() ||
        "student";

    if (!isValidRole(role)) {
        role = "student";
    }

    sessionStorage.setItem("verificationRole", role);
    saveSelectedRole(role);
    sessionStorage.setItem("verificationPurpose", "login");
    sessionStorage.setItem("verificationType", "login");

    /* GOOGLE / GMAIL LOGIN */
    if (provider === "Google") {
        sessionStorage.setItem("verificationProvider", "google");
        window.location.href =
            "/auth/google?role=" + encodeURIComponent(role);
        return;
    }

    /* MICROSOFT LOGIN */
    if (provider === "Microsoft") {
        sessionStorage.setItem("verificationProvider", "microsoft");
        window.location.href =
            "verification-ms-login.html";
        return;
    }

    /* Fallback for an unsupported provider. */
    showGenericModal(
        "Sign in unavailable",
        "Please select Google or Microsoft to continue.",
        "!"
    );
}


function socialSignup(provider) {
    showGenericModal("Coming soon", provider +
        " registration will be available once the authentication service is connected.", "!");
}

/* GENERIC MODAL */
function showGenericModal(title, message, icon = "!") {
    /* LOGIN MODAL */
    const loginModal = getElement("loginMessageModal");
    if (loginModal) {
        const titleElement = getElement("loginModalTitle");
        const messageElement = getElement("loginModalMessage");
        const iconElement = getElement("loginModalIcon");
        if (titleElement) {
            titleElement.textContent =
                title;
        }
        if (messageElement) {
            messageElement.textContent =
                message;
        }
        if (iconElement) {
            iconElement.textContent =
                icon;
        }
        openModal("loginMessageModal");
        return;
    }

    /* VERIFICATION MODAL */
    const verificationModal = getElement("verificationModal");
    if (verificationModal) {
        const titleElement = getElement("verificationModalTitle");
        const messageElement = getElement("verificationModalMessage");
        const iconElement = getElement("verificationModalIcon");
        if (titleElement) {
            titleElement.textContent =
                title;
        }
        if (messageElement) {
            messageElement.textContent =
                message;
        }
        if (iconElement) {
            iconElement.textContent =
                icon;
        }
        openModal("verificationModal");
        return;
    }

    /* TERMS MODAL */
    const termsModal = getElement("termsModal");
    if (termsModal) {
        const titleElement = termsModal.querySelector("h2");
        const paragraph = termsModal.querySelector("p");
        if (titleElement) {
            titleElement.textContent =
                title;
        }
        if (paragraph) {
            paragraph.textContent =
                message;
        }
        openModal("termsModal");
    }
}

/* LOGIN MODAL */
function showLoginModal(title, message, icon = "!") {
    const modal = getElement("loginMessageModal");
    if (!modal) {
        return;
    }
    const titleElement = getElement("loginModalTitle");
    const messageElement = getElement("loginModalMessage");
    const iconElement = getElement("loginModalIcon");
    if (titleElement) {
        titleElement.textContent =
            title;
    }
    if (messageElement) {
        messageElement.textContent =
            message;
    }
    if (iconElement) {
        iconElement.textContent =
            icon;
    }
    openModal("loginMessageModal");
}

function closeLoginModal() {
    closeModal("loginMessageModal");
}

/* VERIFICATION MODAL */
function showVerificationModal(title, message, icon = "!") {
    const modal = getElement("verificationModal");
    if (!modal) {
        showGenericModal(title, message, icon);
        return;
    }
    const titleElement = getElement("verificationModalTitle");
    const messageElement = getElement("verificationModalMessage");
    const iconElement = getElement("verificationModalIcon");
    if (titleElement) {
        titleElement.textContent =
            title;
    }
    if (messageElement) {
        messageElement.textContent =
            message;
    }
    if (iconElement) {
        iconElement.textContent =
            icon;
    }
    openModal("verificationModal");
}

function closeVerificationModal() {
    closeModal("verificationModal");
}

/* HEADER MESSAGE */
function showHeaderMessage(section) {
    showGenericModal(section, section +
        " options will be available once this section is connected.", "!");
}

/* FORGOT PASSWORD */
function handleForgotPassword(event) {
    if (event) {
        event.preventDefault();
    }
    window.location.href = "/forgot-password.html";
}

/* TERMS AND CONDITIONS */
function showTerms(event) {
    if (event) {
        event.preventDefault();
    }
    const modal = getElement("termsModal");
    if (!modal) {
        return;
    }
    const title = modal.querySelector("h2");
    const paragraph = modal.querySelector("p");
    if (title) {
        title.textContent =
            "Terms and Conditions";
    }
    if (paragraph) {
        paragraph.textContent =
            "By creating an EduMetrics account, you agree to follow the rules and policies established for the system. Your account information should be accurate and kept secure.";
    }
    openModal("termsModal");
}

function closeTerms() {
    closeModal("termsModal");
}

function acceptTerms() {
    const terms = getElement("termsAgreement");
    if (terms) {
        terms.checked =
            true;
    }
    closeTerms();
}

/* OTP HELPERS */
function getOtpInputs() {
    return Array.from(document.querySelectorAll(".otp-input"));
}

function clearOtpInputs() {
    const otpInputs = getOtpInputs();
    otpInputs.forEach(function (input) {
        input.value = "";
    });
    if (otpInputs.length > 0) {
        otpInputs[0].focus();
    }
}

function getOtpValue() {
    const otpInputs = getOtpInputs();
    return otpInputs
        .map(function (input) {
            return input.value;
        })
        .join("");
}

function setupOtpInputs() {
    const otpInputs = getOtpInputs();
    if (otpInputs.length === 0) {
        return;
    }
    otpInputs.forEach(function (input, index) {
        input.addEventListener("input", function (event) {
            let value = event.target.value;
            value =
                value.replace(/\D/g, "");
            if (value.length > 1) {
                value =
                    value.slice(-1);
            }
            event.target.value =
                value;
            if (value &&
                index <
                otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        input.addEventListener("keydown", function (event) {
            if (event.key ===
                "Backspace" &&
                input.value === "" &&
                index > 0) {
                otpInputs[index - 1].focus();
            }
            if (event.key ===
                "ArrowLeft" &&
                index > 0) {
                event.preventDefault();
                otpInputs[index - 1].focus();
            }
            if (event.key ===
                "ArrowRight" &&
                index <
                otpInputs.length - 1) {
                event.preventDefault();
                otpInputs[index + 1].focus();
            }
        });
        input.addEventListener("paste", function (event) {
            event.preventDefault();
            const pastedText = (event.clipboardData ||
                window.clipboardData)
                .getData("text")
                .replace(/\D/g, "");
            if (!pastedText) {
                return;
            }
            const digits = pastedText
                .slice(0, otpInputs.length)
                .split("");
            digits.forEach(function (digit, digitIndex) {
                if (otpInputs[digitIndex]) {
                    otpInputs[digitIndex].value =
                        digit;
                }
            });
            const focusIndex = Math.min(digits.length, otpInputs.length) - 1;
            if (focusIndex >= 0) {
                otpInputs[focusIndex].focus();
            }
        });
    });
}

/* VERIFICATION CODE */
function generateVerificationCode() {
    return String(Math.floor(100000 +
        Math.random() *
        900000));
}

function saveVerificationCode(code) {
    sessionStorage.setItem("verificationCode", code);
    sessionStorage.setItem("verificationCodeCreatedAt", String(Date.now()));
}

function getVerificationCode() {
    return (sessionStorage.getItem("verificationCode") || "");
}

function createVerificationCode() {
    const code = generateVerificationCode();
    saveVerificationCode(code);
    return code;
}

/* VERIFICATION TIMER */
let verificationTimerInterval = null;

function formatVerificationTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return (String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0"));
}

function startVerificationTimer(duration = 60) {
    const timerElement = getElement("verificationTimer");
    const resendButton = getElement("resendCodeButton");
    if (verificationTimerInterval) {
        clearInterval(verificationTimerInterval);
    }
    let remaining = duration;
    if (resendButton) {
        resendButton.disabled =
            true;
    }

    function updateTimer() {
        if (timerElement) {
            timerElement.textContent =
                formatVerificationTime(remaining);
        }
        if (remaining <= 0) {
            clearInterval(verificationTimerInterval);
            verificationTimerInterval =
                null;
            if (resendButton) {
                resendButton.disabled =
                    false;
            }
            return;
        }
        remaining -= 1;
    }
    updateTimer();
    verificationTimerInterval =
        setInterval(updateTimer, 1000);
}

/* RESEND VERIFICATION CODE */
function resendVerificationCode(event) {
    if (event) {
        event.preventDefault();
    }
    createVerificationCode();
    clearOtpInputs();
    startVerificationTimer(60);
    showVerificationModal("Code Resent", "A new verification code has been sent.", "✓");
}

/* OTP / VERIFICATION INITIALIZATION */
document.addEventListener("DOMContentLoaded", function () {
    setupOtpInputs();
});

/* OTP RESEND TIMER */
let eduMetricsCountdownInterval = null;

function startResendCountdown(seconds = 30) {
    const resendButton = getElement("resendButton");
    const resendTimer = getElement("resendTimer");
    if (!resendButton) {
        return;
    }
    clearInterval(eduMetricsCountdownInterval);
    let remaining = seconds;
    resendButton.disabled =
        true;
    if (resendTimer) {
        resendTimer.innerHTML =
            "Resend available in " +
            "<strong id=\"countdown\">" +
            remaining +
            "</strong>" +
            " seconds";
    }
    eduMetricsCountdownInterval =
        setInterval(function () {
            remaining--;
            const countdown = getElement("countdown");
            if (countdown) {
                countdown.textContent =
                    Math.max(remaining, 0);
            }
            if (remaining <= 0) {
                clearInterval(eduMetricsCountdownInterval);
                eduMetricsCountdownInterval =
                    null;
                resendButton.disabled =
                    false;
                if (resendTimer) {
                    resendTimer.innerHTML =
                        "<strong>You can now resend the code.</strong>";
                    resendTimer.style.setProperty("font-size", "18px", "important");
                    resendTimer.style.fontWeight =
                        "600";
                }
            }
        }, 1000);
}



/* RESEND LOGIN VERIFICATION CODE */
async function resendCode() {
    const resendButton = document.getElementById("resendButton");

    if (!resendButton || resendButton.disabled) {
        return;
    }

    const email = sessionStorage.getItem("verificationEmail");

    if (!email) {
        showVerificationModal(
            "Missing email",
            "Please return to login and try again.",
            "!"
        );
        return;
    }

    resendButton.disabled = true;

    try {
        const response = await fetch("/api/auth/login/resend-otp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email: email })
        });

        const result = await response.json();

        if (!response.ok) {
            showVerificationModal(
                "Resend failed",
                result.error || "Could not resend the verification code.",
                "!"
            );
            resendButton.disabled = false;
            return;
        }

        clearOtpInputs();
        startResendCountdown(30);

        showVerificationModal(
            "Code Resent",
            "Check your email for the new six-digit verification code.",
            "✓"
        );
    } catch (error) {
        showVerificationModal(
            "Resend failed",
            "Could not connect to the server. Please try again.",
            "!"
        );
        resendButton.disabled = false;
    }
}


/* SESSION STORAGE HELPERS */
function saveVerificationData(email, role, purpose) {
    sessionStorage.setItem("verificationEmail", email || "");
    sessionStorage.setItem("verificationRole", role || "");
    sessionStorage.setItem("verificationPurpose", purpose || "");
}

/** Clear verification-related session data. */
function clearVerificationData() {
    const keys = [
        "verificationEmail",
        "verificationRole",
        "verificationPurpose",
        "verificationProvider",
        "verificationCompleted",
        "verificationType",
        "verifiedEmail",
        "verifiedRole",
        "accountVerified"
    ];
    keys.forEach(function (key) {
        sessionStorage.removeItem(key);
    });
}

/* ROLE STORAGE */
function saveSelectedRole(role) {
    if (!role) {
        return;
    }
    sessionStorage.setItem("selectedRole", role);
}

function getSelectedRole() {
    return sessionStorage.getItem("selectedRole");
}

/** Restore saved role into a select element. */
function restoreSelectedRole(selectId) {
    const select = getElement(selectId);
    if (!select) {
        return;
    }
    const savedRole = getSelectedRole();
    if (!savedRole) {
        return;
    }
    const option = Array.from(select.options)
        .find(function (item) {
            return (item.value ===
                savedRole);
        });
    if (option) {
        select.value =
            savedRole;
    }
}

/* INFO MODAL - WEBSITE PAGE */
function openInfoModal(title, text, icon = "◇") {
    const modal = getElement("infoModal");
    if (!modal) {
        return;
    }
    const modalTitle = getElement("modalTitle");
    const modalText = getElement("modalText");
    const modalIcon = getElement("modalIcon");
    if (modalTitle) {
        modalTitle.textContent =
            title;
    }
    if (modalText) {
        modalText.textContent =
            text;
    }
    if (modalIcon) {
        modalIcon.textContent =
            icon;
    }
    openModal("infoModal");
}

function closeInfoModal() {
    closeModal("infoModal");
}

/* WEBSITE SUPPORT */
function showSupport() {
    window.location.href =
        "webpage/support.html";
}

/* WEBSITE SETTINGS */
function showSettings() {
    openInfoModal("Settings", "System settings will be available after you log in.", "⚙");
}

/* WEBSITE INFORMATION CARDS */
function handleInfoClick(event, type) {
    if (event) {
        event.preventDefault();
    }
    const content = {
        platform: {
            title: "Platform",
            text: "Explore the EduMetrics academic assessment and grading platform.",
            icon: "▣"
        },
        products: {
            title: "Products",
            text: "Explore tools for assessments, outcomes, and CQI analytics.",
            icon: "◇"
        },
        resources: {
            title: "Resources",
            text: "Access guides, manuals, and other EduMetrics resource materials.",
            icon: "▱"
        },
        about: {
            title: "About us",
            text: "Learn about the vision, mission, and commitment behind EduMetrics.",
            icon: "♧"
        }
    };
    const selected = content[type];
    if (!selected) {
        return;
    }
    openInfoModal(selected.title, selected.text, selected.icon);
}

/* REGISTRATION BACK BUTTON */
function initializeRegistrationBackButton() {
    const backButton = document.querySelector(".registration-back");
    if (!backButton) {
        return;
    }
    const params = new URLSearchParams(window.location.search);
    let role = params.get("role") ||
        getSelectedRole() ||
        "student";
    if (!isValidRole(role)) {
        role =
            "student";
    }
    saveSelectedRole(role);
    backButton.href =
        "login page.html?role=" +
        encodeURIComponent(role);
}

/* LOGIN ROLE FROM URL */
function initializeLoginRoleFromURL() {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get("role");
    if (!urlRole ||
        !isValidRole(urlRole)) {
        return;
    }
    saveSelectedRole(urlRole);
    const loginRole = getElement("loginRole");
    if (loginRole) {
        const option = Array.from(loginRole.options)
            .find(function (item) {
                return (item.value ===
                    urlRole);
            });
        if (option) {
            loginRole.value =
                urlRole;
        }
    }
    const loginRoleLabel = getElement("loginRoleLabel");
    if (loginRoleLabel) {
        loginRoleLabel.textContent =
            formatRole(urlRole);
    }
}

/* LOGIN VERIFICATION PAGE */
function initializeLoginVerificationPage() {
    const roleLabel = getElement("verificationRoleLabel") ||
        getElement("verificationHeaderRole");
    const emailLabel = getElement("verificationEmail");
    const verificationBackButton = getElement("verificationBackButton");
    const backToLoginLink = getElement("backToLoginLink");

    /*If none of these exist,
     this is not verification-login.html.*/
    if (!roleLabel &&
        !emailLabel &&
        !verificationBackButton &&
        !backToLoginLink) {
        return;
    }

    /* Verification role has first priority. */
    let role = sessionStorage.getItem("verificationRole") ||
        getSelectedRole() ||
        "student";
    if (!isValidRole(role)) {
        role =
            "student";
    }

    /* Keep both role values synchronized. */
    sessionStorage.setItem("verificationRole", role);
    saveSelectedRole(role);

    /* HEADER ROLE */
    if (roleLabel) {
        roleLabel.textContent =
            formatRole(role);
    }

    /* VERIFICATION EMAIL */
    const email = sessionStorage.getItem("verificationEmail") || "";
    if (emailLabel) {
        emailLabel.textContent =
            email ||
            "your email address";
    }

    /* BACK URL */
    const loginURL = "login page.html?role=" +
        encodeURIComponent(role);
    if (verificationBackButton) {
        verificationBackButton.href =
            loginURL;
    }
    if (backToLoginLink) {
        backToLoginLink.href =
            loginURL;
    }

    /* PAGE TITLE */
    document.title =
        "EduMetrics | " +
        formatRole(role) +
        " Verification";

    /* START RESEND TIMER */
    if (getElement("resendButton")) {
        startResendCountdown(30);
    }
}

/* LOGIN PAGE ROLE CHANGE */
function initializeLoginRoleChange() {
    const loginRole = getElement("loginRole");
    if (!loginRole) {
        return;
    }
    if (loginRole.dataset.roleInitialized ===
        "true") {
        return;
    }
    loginRole.dataset.roleInitialized =
        "true";
    loginRole.addEventListener("change", function () {
        saveSelectedRole(this.value);
        const loginRoleLabel = getElement("loginRoleLabel");
        if (loginRoleLabel) {
            loginRoleLabel.textContent =
                formatRole(this.value);
        }
    });
}

/* SIGNUP ROLE CHANGE */
function initializeSignupRoleChange() {
    const signupRole = getElement("signupRole");
    if (!signupRole) {
        return;
    }
    if (signupRole.dataset.roleInitialized ===
        "true") {
        return;
    }
    signupRole.dataset.roleInitialized =
        "true";
    signupRole.addEventListener("change", function () {
        saveSelectedRole(this.value);
    });
}

/* REGISTRATION PASSWORD REQUIREMENTS */
function initializeSignupPasswordRequirements() {
    const signupPassword = getElement("signupPassword");
    if (!signupPassword) {
        return;
    }
    if (signupPassword.dataset.requirementsInitialized ===
        "true") {
        return;
    }
    signupPassword.dataset.requirementsInitialized =
        "true";
    signupPassword.addEventListener("input", function () {
        updatePasswordRequirements(this.value);
    });
    updatePasswordRequirements(signupPassword.value);
}

/* GENERIC CLOSE MODAL EVENTS */
document.addEventListener("click", function (event) {
    /* INFO MODAL */
    const infoModal = getElement("infoModal");
    if (infoModal &&
        event.target ===
        infoModal) {
        closeInfoModal();
    }

    /* LOGIN MODAL */
    const loginModal = getElement("loginMessageModal");
    if (loginModal &&
        event.target ===
        loginModal) {
        closeLoginModal();
    }

    /* VERIFICATION MODAL */
    const verificationModal = getElement("verificationModal");
    if (verificationModal &&
        event.target ===
        verificationModal) {
        closeVerificationModal();
    }

    /* TERMS MODAL */
    const termsModal = getElement("termsModal");
    if (termsModal &&
        event.target ===
        termsModal) {
        closeTerms();
    }
});

/* ESCAPE KEY */
document.addEventListener("keydown", function (event) {
    if (event.key !==
        "Escape") {
        return;
    }
    closeInfoModal();
    closeLoginModal();
    closeVerificationModal();
    closeTerms();
});

/* INITIALIZE COMMON FEATURES */
document.addEventListener("DOMContentLoaded", function () {
    /* LOGIN ROLE FROM URL */
    initializeLoginRoleFromURL();

    /* REGISTRATION BACK BUTTON */
    initializeRegistrationBackButton();

    /* RESTORE LOGIN ROLE */
    restoreSelectedRole("loginRole");

    /* RESTORE SIGNUP ROLE */
    restoreSelectedRole("signupRole");

    /* LOGIN ROLE CHANGE */
    initializeLoginRoleChange();

    /* SIGNUP ROLE CHANGE */
    initializeSignupRoleChange();

    /* REGISTRATION PASSWORD REQUIREMENTS */
    initializeSignupPasswordRequirements();

    /* LOGIN VERIFICATION PAGE */
    initializeLoginVerificationPage();

    /* OTP INITIALIZATION */
    if (document.querySelector(".otp-input")) {
        setupOtpInputs();
    }
});

/* STUDENT OUTCOME TITLE FORMAT */
function formatStudentOutcomeTitle(value) {
    const text = String(value || "").trim();
    const match = text.match(/student outcome\s*\((a|b|c|d|e|f|g1|g2|h|i|j|k|l)\)/i);
    if (match) {
        return ("Self-Assessment and Reflection on Attainment of Student Outcome (" +
            match[1].toLowerCase() +
            ")");
    }
    return text;
}

function normalizeStoredStudentOutcomeTitles() {
    const storageKey = "eduMetricsStudentOutcomes";
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
        return;
    }
    try {
        const records = JSON.parse(raw);
        if (!Array.isArray(records)) {
            return;
        }
        let changed = false;
        records.forEach(function (record) {
            if (!record || typeof record !== "object") {
                return;
            }
            ["title", "name", "outcomeTitle", "studentOutcome"].forEach(function (key) {
                if (typeof record[key] === "string" &&
                    /student outcome\s*\(/i.test(record[key])) {
                    const formatted = formatStudentOutcomeTitle(record[key]);
                    if (formatted !== record[key]) {
                        record[key] = formatted;
                        changed = true;
                    }
                }
            });
        });
        if (changed) {
            localStorage.setItem(storageKey, JSON.stringify(records));
        }
    }
    catch (error) {
        console.warn("Unable to normalize stored Student Outcome titles.", error);
    }
}
normalizeStoredStudentOutcomeTitles();

/* SYLLABUS & OUTCOMES -STUDENT + FACULTY SHARED PAGE FUNCTIONS */
/* DATE HELPER */
function getFormattedDate() {
    return new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

/* FILE SIZE HELPER */
function formatFileSize(bytes) {
    if (!bytes) {
        return "0 MB";
    }
    const mb = bytes /
        (1024 * 1024);
    return mb.toFixed(2) + " MB";
}

/* SAFE SHOW / HIDE HELPERS */
function showElement(element) {
    if (!element) {
        return;
    }
    element.hidden = false;
}

function hideElement(element) {
    if (!element) {
        return;
    }
    element.hidden = true;
}

/* TABS-WORKS FOR STUDENT + FACULTY */
function initializeSyllabusOutcomeTabs() {
    const tabs = document.querySelectorAll(".sof-tab");
    if (!tabs.length) {
        return;
    }
    const panels = document.querySelectorAll(".sof-tab-panel");
    tabs.forEach(function (tab) {
        if (tab.dataset.tabInitialized ===
            "true") {
            return;
        }
        tab.dataset.tabInitialized =
            "true";
        tab.addEventListener("click", function () {
            const targetId = this.dataset.tab;
            if (!targetId) {
                return;
            }
            tabs.forEach(function (item) {
                item.classList.remove("active");
            });
            panels.forEach(function (panel) {
                panel.classList.remove("active");
            });
            this.classList.add("active");
            tabs.forEach(function (item) {
                item.setAttribute("aria-selected", String(item === tab));
            });
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add("active");
            }
        });
    });
}

/* COURSE SYLLABUS-FACULTY ONLY */
function initializeFacultySyllabus() {
    const syllabusFile = document.getElementById("syllabusFile");
    const syllabusLastUpdated = document.getElementById("syllabusLastUpdated");
    const facultySyllabusEmpty = document.getElementById("facultySyllabusEmpty");
    const facultySyllabusFileRow = document.getElementById("facultySyllabusFileRow");
    const syllabusFileName = document.getElementById("syllabusFileName");
    const syllabusFileSize = document.getElementById("syllabusFileSize");
    const viewSyllabusButton = document.getElementById("viewSyllabusButton");
    const downloadSyllabusButton = document.getElementById("downloadSyllabusButton");
    const syllabusMoreButton = document.getElementById("syllabusMoreButton");
    const syllabusFileMenu = document.getElementById("syllabusFileMenu");
    const deleteSyllabusOption = document.getElementById("deleteSyllabusOption");
    if (!syllabusFile) {
        return;
    }

    /* Prevent duplicate initialization. */
    if (syllabusFile.dataset.initialized ===
        "true") {
        return;
    }
    syllabusFile.dataset.initialized =
        "true";
    let currentSyllabusURL = null;

    /* CLOSE THREE-DOT MENU */
    function closeSyllabusMenu() {
        if (!syllabusFileMenu) {
            return;
        }
        syllabusFileMenu.hidden =
            true;
        if (syllabusMoreButton) {
            syllabusMoreButton.setAttribute("aria-expanded", "false");
        }
    }

    /* UPLOAD SYLLABUS */
    syllabusFile.addEventListener("change", function () {
        if (!this.files ||
            !this.files.length) {
            return;
        }
        const selectedFile = this.files[0];
        const isPDF = selectedFile.type ===
            "application/pdf" ||
            selectedFile.name
                .toLowerCase()
                .endsWith(".pdf");
        if (!isPDF) {
            alert("Please select a PDF file.");
            this.value = "";
            return;
        }
        if (currentSyllabusURL) {
            URL.revokeObjectURL(currentSyllabusURL);
        }
        currentSyllabusURL =
            URL.createObjectURL(selectedFile);
        if (syllabusFileName) {
            syllabusFileName.textContent =
                selectedFile.name;
        }
        if (syllabusFileSize) {
            syllabusFileSize.textContent =
                formatFileSize(selectedFile.size);
        }
        if (syllabusLastUpdated) {
            syllabusLastUpdated.textContent =
                "Last Updated: " +
                getFormattedDate();
        }
        hideElement(facultySyllabusEmpty);
        showElement(facultySyllabusFileRow);
        closeSyllabusMenu();
    });

    /* VIEW SYLLABUS */
    if (viewSyllabusButton) {
        viewSyllabusButton.addEventListener("click", function () {
            if (!currentSyllabusURL) {
                return;
            }
            window.open(currentSyllabusURL, "_blank");
        });
    }

    /* DOWNLOAD SYLLABUS */
    if (downloadSyllabusButton) {
        downloadSyllabusButton.addEventListener("click", function () {
            if (!currentSyllabusURL ||
                !syllabusFile.files ||
                !syllabusFile.files.length) {
                return;
            }
            const downloadLink = document.createElement("a");
            downloadLink.href =
                currentSyllabusURL;
            downloadLink.download =
                syllabusFile.files[0].name;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
        });
    }

    /* THREE DOTS */
    if (syllabusMoreButton &&
        syllabusFileMenu) {
        syllabusMoreButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            syllabusFileMenu.hidden =
                !syllabusFileMenu.hidden;
            syllabusMoreButton.setAttribute("aria-expanded", syllabusFileMenu.hidden
                ? "false"
                : "true");
        });
        syllabusFileMenu.addEventListener("click", function (event) {
            event.stopPropagation();
        });
    }

    /* DELETE SYLLABUS */
    if (deleteSyllabusOption) {
        deleteSyllabusOption.addEventListener("click", function () {
            closeSyllabusMenu();
            const confirmed = window.confirm("Are you sure you want to delete this syllabus?");
            if (!confirmed) {
                return;
            }
            if (currentSyllabusURL) {
                URL.revokeObjectURL(currentSyllabusURL);
                currentSyllabusURL =
                    null;
            }
            syllabusFile.value =
                "";
            if (syllabusFileName) {
                syllabusFileName.textContent =
                    "Course_Syllabus.pdf";
            }
            if (syllabusFileSize) {
                syllabusFileSize.textContent =
                    "0 MB";
            }
            if (syllabusLastUpdated) {
                syllabusLastUpdated.textContent =
                    "No syllabus uploaded";
            }
            hideElement(facultySyllabusFileRow);
            showElement(facultySyllabusEmpty);
        });
    }

    /* CLICK OUTSIDE */
    document.addEventListener("click", function (event) {
        if (syllabusMoreButton &&
            syllabusMoreButton.contains(event.target)) {
            return;
        }
        if (syllabusFileMenu &&
            syllabusFileMenu.contains(event.target)) {
            return;
        }
        closeSyllabusMenu();
    });

    /* ESC */
    document.addEventListener("keydown", function (event) {
        if (event.key ===
            "Escape") {
            closeSyllabusMenu();
        }
    });
}

/* FACULTY — SYLLABUS & OUTCOMES */
document.addEventListener("DOMContentLoaded", function () {
    initFacultySyllabusOutcomes();
});

function initFacultySyllabusOutcomes() {
    const page = document.querySelector(".so-faculty-page");
    if (!page) {
        return;
    }

    /* COMMON HELPERS */
    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function openModal(modal) {
        if (!modal) {
            return;
        }
        modal.hidden = false;
        modal.removeAttribute("hidden");
        document.body.classList.add("sof-modal-open");
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }
        modal.hidden = true;
        modal.setAttribute("hidden", "");
        const stillOpen = document.querySelector(".sof-outcome-modal:not([hidden]), " +
            ".sof-delete-modal:not([hidden])");
        if (!stillOpen) {
            document.body.classList.remove("sof-modal-open");
        }
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(value + "T00:00:00");
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    }

    function getTodayFormatted() {
        return new Date()
            .toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
            });
    }

    /* TABS */
    const tabs = document.querySelectorAll(".sof-tab");
    const tabPanels = document.querySelectorAll(".sof-tab-panel");
    tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            const targetId = this.dataset.tab;
            if (!targetId) {
                return;
            }
            tabs.forEach(function (item) {
                item.classList.remove("active");
            });
            tabPanels.forEach(function (panel) {
                panel.classList.remove("active");
            });
            this.classList.add("active");
            const target = document.getElementById(targetId);
            if (target) {
                target.classList.add("active");
            }
        });
    });

    /* COURSE SYLLABUS */
    const syllabusFile = document.getElementById("syllabusFile");
    const syllabusLastUpdated = document.getElementById("syllabusLastUpdated");
    const syllabusEmpty = document.getElementById("facultySyllabusEmpty");
    const syllabusFileRow = document.getElementById("facultySyllabusFileRow");
    const syllabusFileName = document.getElementById("syllabusFileName");
    const syllabusFileSize = document.getElementById("syllabusFileSize");
    const viewSyllabusButton = document.getElementById("viewSyllabusButton");
    const downloadSyllabusButton = document.getElementById("downloadSyllabusButton");
    const syllabusMoreButton = document.getElementById("syllabusMoreButton");
    const syllabusFileMenu = document.getElementById("syllabusFileMenu");
    const deleteSyllabusOption = document.getElementById("deleteSyllabusOption");
    const deleteSyllabusModal = document.getElementById("deleteSyllabusModal");
    const deleteSyllabusBackdrop = document.getElementById("deleteSyllabusBackdrop");
    const deleteSyllabusFileName = document.getElementById("deleteSyllabusFileName");
    const cancelDeleteSyllabus = document.getElementById("cancelDeleteSyllabus");
    const confirmDeleteSyllabus = document.getElementById("confirmDeleteSyllabus");
    let currentSyllabusURL = null;
    let currentSyllabusFile = null;

    /* SYLLABUS UPLOAD */
    if (syllabusFile) {
        syllabusFile.addEventListener("change", function () {
            if (!this.files ||
                !this.files.length) {
                return;
            }
            const file = this.files[0];
            const isPDF = file.type ===
                "application/pdf" ||
                file.name
                    .toLowerCase()
                    .endsWith(".pdf");
            if (!isPDF) {
                alert("Please upload a PDF file.");
                this.value =
                    "";
                return;
            }
            if (currentSyllabusURL) {
                URL.revokeObjectURL(currentSyllabusURL);
            }
            currentSyllabusFile =
                file;
            currentSyllabusURL =
                URL.createObjectURL(file);
            if (syllabusFileName) {
                syllabusFileName.textContent =
                    file.name;
            }
            if (syllabusFileSize) {
                syllabusFileSize.textContent =
                    formatFileSize(file.size);
            }
            if (syllabusLastUpdated) {
                syllabusLastUpdated.textContent =
                    "Last Updated: " +
                    getTodayFormatted();
            }
            if (syllabusEmpty) {
                syllabusEmpty.hidden =
                    true;
            }
            if (syllabusFileRow) {
                syllabusFileRow.hidden =
                    false;
            }
        });
    }

    /* VIEW SYLLABUS */
    if (viewSyllabusButton) {
        viewSyllabusButton.addEventListener("click", function () {
            if (!currentSyllabusURL) {
                alert("No syllabus has been uploaded.");
                return;
            }
            window.open(currentSyllabusURL, "_blank");
        });
    }

    /* DOWNLOAD SYLLABUS */
    if (downloadSyllabusButton) {
        downloadSyllabusButton.addEventListener("click", function () {
            if (!currentSyllabusURL ||
                !currentSyllabusFile) {
                alert("No syllabus has been uploaded.");
                return;
            }
            const link = document.createElement("a");
            link.href =
                currentSyllabusURL;
            link.download =
                currentSyllabusFile.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    }

    /* SYLLABUS MORE MENU */
    if (syllabusMoreButton &&
        syllabusFileMenu) {
        syllabusMoreButton.addEventListener("click", function (event) {
            event.stopPropagation();
            syllabusFileMenu.hidden =
                !syllabusFileMenu.hidden;
            syllabusMoreButton.setAttribute("aria-expanded", String(!syllabusFileMenu.hidden));
        });

        document.addEventListener("click", function (event) {
            if (!syllabusFileMenu.hidden &&
                !syllabusFileMenu.contains(event.target) &&
                !syllabusMoreButton.contains(event.target)) {
                syllabusFileMenu.hidden =
                    true;
                syllabusMoreButton.setAttribute("aria-expanded", "false");
            }
        });
    }

    /* OPEN DELETE SYLLABUS */
    if (deleteSyllabusOption) {
        deleteSyllabusOption.addEventListener("click", function () {
            if (syllabusFileMenu) {
                syllabusFileMenu.hidden =
                    true;
            }
            if (deleteSyllabusFileName) {
                deleteSyllabusFileName.textContent =
                    currentSyllabusFile
                        ? currentSyllabusFile.name
                        : "this syllabus";
            }
            openModal(deleteSyllabusModal);
        });
    }

    /* CANCEL DELETE SYLLABUS */
    if (cancelDeleteSyllabus) {
        cancelDeleteSyllabus.addEventListener("click", function () {
            closeModal(deleteSyllabusModal);
        });
    }
    if (deleteSyllabusBackdrop) {
        deleteSyllabusBackdrop.addEventListener("click", function () {
            closeModal(deleteSyllabusModal);
        });
    }

    /* CONFIRM DELETE SYLLABUS */
    if (confirmDeleteSyllabus) {
        confirmDeleteSyllabus.addEventListener("click", function () {
            if (currentSyllabusURL) {
                URL.revokeObjectURL(currentSyllabusURL);
            }
            currentSyllabusURL =
                null;
            currentSyllabusFile =
                null;
            if (syllabusFile) {
                syllabusFile.value =
                    "";
            }
            if (syllabusFileName) {
                syllabusFileName.textContent =
                    "Course_Syllabus.pdf";
            }
            if (syllabusFileSize) {
                syllabusFileSize.textContent =
                    "0 MB";
            }
            if (syllabusLastUpdated) {
                syllabusLastUpdated.textContent =
                    "No syllabus uploaded";
            }
            if (syllabusFileRow) {
                syllabusFileRow.hidden =
                    true;
            }
            if (syllabusEmpty) {
                syllabusEmpty.hidden =
                    false;
            }
            closeModal(deleteSyllabusModal);
        });
    }

    /* COURSE OUTCOME */
    const addCourseOutcomeButton = document.getElementById("addCourseOutcomeButton");
    const courseOutcomeModal = document.getElementById("courseOutcomeModal");
    const courseOutcomeBackdrop = document.getElementById("courseOutcomeBackdrop");
    const courseOutcomeModalTitle = document.getElementById("courseOutcomeModalTitle");
    const courseOutcomeModalSubtitle = document.getElementById("courseOutcomeModalSubtitle");
    const courseOutcomeSelect = document.getElementById("courseOutcomeExistingSelect");
    const courseOutcomeNumber = document.getElementById("courseOutcomeNumber");
    const courseOutcomeDescription = document.getElementById("courseOutcomeDescription");
    const courseOutcomeDescriptionPreview = document.getElementById("courseOutcomeDescriptionPreview");
    const courseOutcomeDescriptionPreviewText = document.getElementById("courseOutcomeDescriptionPreviewText");
    const cancelCourseOutcomeButton = document.getElementById("cancelCourseOutcomeButton");
    const saveCourseOutcomeButton = document.getElementById("saveCourseOutcomeButton");
    const courseOutcomesTableBody = document.getElementById("courseOutcomesTableBody");
    let editingCourseOutcomeRow = null;
    let deletingCourseOutcomeRow = null;

    /* COURSE OUTCOME SO HELPERS */
    function getAlignedSOOptions() {
        return Array.from(document.querySelectorAll("#courseOutcomeSoOptions .sof-so-option"));
    }

    function getSelectedAlignedSOs() {
        return Array.from(document.querySelectorAll("#courseOutcomeSoOptions .sof-so-option"))
            .filter(function (option) {
                const style = window.getComputedStyle(option);
                return (option.classList.contains("selected") ||
                    option.classList.contains("is-selected") ||
                    option.getAttribute("aria-pressed") === "true" ||
                    option.dataset.selected === "true" ||
                    style.backgroundColor === "rgb(0, 65, 121)");
            })
            .map(function (option) {
                return (option.dataset.so ||
                    option.value ||
                    option.textContent.trim());
            });
    }

    function clearAlignedSOs() {
        getAlignedSOOptions()
            .forEach(function (option) {
                option.classList.remove("selected", "is-selected");
                option.setAttribute("aria-pressed", "false");
            });
    }

    function setAlignedSOs(values) {
        const selectedValues = Array.isArray(values)
            ? values
            : [];
        getAlignedSOOptions()
            .forEach(function (option) {
                const value = option.dataset.so ||
                    option.value ||
                    option.textContent.trim();
                const selected = selectedValues.includes(value);
                option.classList.toggle("selected", selected);
                option.classList.toggle("is-selected", selected);
                option.setAttribute("aria-pressed", selected ? "true" : "false");
            });
    }

    /* SO BUTTON MULTI-SELECT */
    getAlignedSOOptions()
        .forEach(function (option) {
            if (option.dataset.soMultiSelectInitialized ===
                "true") {
                return;
            }
            option.dataset.soMultiSelectInitialized =
                "true";
            if (!option.hasAttribute("aria-pressed")) {
                option.setAttribute("aria-pressed", "false");
            }
            option.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                const selected = !this.classList.contains("selected");
                this.classList.toggle("selected", selected);
                this.classList.toggle("is-selected", selected);
                this.setAttribute("aria-pressed", selected ? "true" : "false");
            });
        });

    /* COURSE OUTCOME SELECT */
    if (courseOutcomeSelect) {
        courseOutcomeSelect.addEventListener("change", function () {
            const option = this.options[this.selectedIndex];
            if (!option ||
                !option.value) {
                if (courseOutcomeNumber) {
                    courseOutcomeNumber.value =
                        "";
                }
                if (courseOutcomeDescription) {
                    courseOutcomeDescription.value =
                        "";
                }
                if (courseOutcomeDescriptionPreview) {
                    courseOutcomeDescriptionPreview.hidden =
                        true;
                }
                if (courseOutcomeDescriptionPreviewText) {
                    courseOutcomeDescriptionPreviewText.textContent =
                        "";
                }
                return;
            }
            if (courseOutcomeNumber) {
                courseOutcomeNumber.value =
                    option.value;
            }
            if (courseOutcomeDescription) {
                courseOutcomeDescription.value =
                    option.dataset.description ||
                    "";
            }
        });
    }

    /* RESET COURSE OUTCOME FORM */
    function resetCourseOutcomeForm() {
        editingCourseOutcomeRow =
            null;
        if (courseOutcomeSelect) {
            courseOutcomeSelect.disabled =
                false;
            courseOutcomeSelect.value =
                "";
        }
        if (courseOutcomeNumber) {
            courseOutcomeNumber.value =
                "";
        }
        if (courseOutcomeDescription) {
            courseOutcomeDescription.value =
                "";
        }
        if (courseOutcomeDescriptionPreview) {
            courseOutcomeDescriptionPreview.hidden =
                true;
        }
        if (courseOutcomeDescriptionPreviewText) {
            courseOutcomeDescriptionPreviewText.textContent =
                "";
        }
        clearAlignedSOs();
        if (saveCourseOutcomeButton) {
            saveCourseOutcomeButton.textContent =
                "Save";
        }
    }

    /* OPEN ADD COURSE OUTCOME */
    if (addCourseOutcomeButton) {
        addCourseOutcomeButton.addEventListener("click", function () {
            resetCourseOutcomeForm();
            if (courseOutcomeModalTitle) {
                courseOutcomeModalTitle.textContent =
                    "Add Course Outcome";
            }
            if (courseOutcomeModalSubtitle) {
                courseOutcomeModalSubtitle.textContent =
                    "Select an existing course outcome and its aligned student outcomes.";
            }
            openModal(courseOutcomeModal);
        });
    }

    /* CLOSE COURSE OUTCOME */
    function closeCourseOutcomeForm() {
        closeModal(courseOutcomeModal);
        resetCourseOutcomeForm();
    }
    if (cancelCourseOutcomeButton) {
        cancelCourseOutcomeButton.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            closeCourseOutcomeForm();
        });
    }
    if (courseOutcomeBackdrop) {
        courseOutcomeBackdrop.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            closeCourseOutcomeForm();
        });
    }

    /* SAVE COURSE OUTCOME */
    if (saveCourseOutcomeButton) {
        saveCourseOutcomeButton.addEventListener("click", function (event) {
            event.preventDefault();
            const coNumber = courseOutcomeNumber
                ? courseOutcomeNumber.value.trim()
                : "";
            const description = courseOutcomeDescription
                ? courseOutcomeDescription.value.trim()
                : "";
            const alignedSOs = getSelectedAlignedSOs();
            if (!coNumber ||
                !description) {
                alert("Please select a Course Outcome.");
                return;
            }
            if (alignedSOs.length === 0) {
                alert("Please select at least one aligned Student Outcome.");
                return;
            }

            /* EDIT
               UPDATE EXISTING ROW ONLY*/
            if (editingCourseOutcomeRow) {
                const cells = editingCourseOutcomeRow
                    .querySelectorAll("td");
                editingCourseOutcomeRow.dataset.coNumber =
                    coNumber;
                editingCourseOutcomeRow.dataset.description =
                    description;
                editingCourseOutcomeRow.dataset.alignedSo =
                    JSON.stringify(alignedSOs);
                if (cells.length >= 3) {
                    cells[0].textContent =
                        coNumber;
                    cells[1].textContent =
                        description;
                    cells[2].textContent =
                        alignedSOs.join(", ");
                }
                closeCourseOutcomeForm();
                return;
            }

            /* PREVENT DUPLICATE CO */
            const duplicate = Array.from(courseOutcomesTableBody
                .querySelectorAll("tr"))
                .some(function (row) {
                    return (row.dataset.coNumber ===
                        coNumber);
                });
            if (duplicate) {
                alert(coNumber +
                    " has already been added.");
                return;
            }

            /* ADD NEW COURSE OUTCOME */
            const row = document.createElement("tr");
            row.dataset.coNumber =
                coNumber;
            row.dataset.description =
                description;
            row.dataset.alignedSo =
                JSON.stringify(alignedSOs);
            row.innerHTML = `
                            <td>
                                ${escapeHTML(coNumber)}
                            </td>
                            <td>
                                ${escapeHTML(description)}
                            </td>
                            <td>
                                ${escapeHTML(alignedSOs.join(", "))}
                            </td>
                            <td>
                                <div class="sof-row-actions">
                                    <button
                                        type="button"
                                        class="
                                            sof-edit-outcome-btn
                                            js-edit-course-outcome
                                        "
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        class="
                                            sof-delete-outcome-btn
                                            js-delete-course-outcome
                                        "
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        `;
            const emptyCourseOutcomeRow = courseOutcomesTableBody.querySelector(".sodh-empty-row");
            if (emptyCourseOutcomeRow) {
                emptyCourseOutcomeRow.remove();
            }
            courseOutcomesTableBody.appendChild(row);
            closeCourseOutcomeForm();
        });
    }

    /* COURSE OUTCOME TABLE ACTIONS */
    if (courseOutcomesTableBody) {
        courseOutcomesTableBody.addEventListener("click", function (event) {
            const editButton = event.target.closest(".js-edit-course-outcome");
            const deleteButton = event.target.closest(".js-delete-course-outcome");

            /* EDIT COURSE OUTCOME */
            if (editButton) {
                const row = editButton.closest("tr");
                if (!row) {
                    return;
                }
                editingCourseOutcomeRow =
                    row;
                const coNumber = row.dataset.coNumber ||
                    row.cells[0]
                        .textContent
                        .trim();
                const description = row.dataset.description ||
                    row.cells[1]
                        .textContent
                        .trim();
                let alignedSOs = [];
                try {
                    alignedSOs =
                        JSON.parse(row.dataset.alignedSo ||
                            "[]");
                }
                catch (error) {
                    alignedSOs =
                        row.cells[2]
                            .textContent
                            .split(",")
                            .map(function (item) {
                                return item.trim();
                            })
                            .filter(Boolean);
                }
                if (courseOutcomeSelect) {
                    courseOutcomeSelect.value =
                        coNumber;

                    /*
                     Editing an existing CO should update
                     that CO instead of selecting another
                     CO and accidentally creating a new one.
                     */
                    courseOutcomeSelect.disabled =
                        true;
                }
                if (courseOutcomeNumber) {
                    courseOutcomeNumber.value =
                        coNumber;
                }
                if (courseOutcomeDescription) {
                    courseOutcomeDescription.value =
                        description;
                }
                setAlignedSOs(alignedSOs);
                if (courseOutcomeModalTitle) {
                    courseOutcomeModalTitle.textContent =
                        "Edit Course Outcome";
                }
                if (courseOutcomeModalSubtitle) {
                    courseOutcomeModalSubtitle.textContent =
                        "Update the selected course outcome details below.";
                }
                if (saveCourseOutcomeButton) {
                    saveCourseOutcomeButton.textContent =
                        "Update";
                }
                openModal(courseOutcomeModal);
                return;
            }

            /* DELETE COURSE OUTCOME */
            if (deleteButton) {
                const row = deleteButton.closest("tr");
                if (!row) {
                    return;
                }
                deletingCourseOutcomeRow =
                    row;
                const deleteModal = document.getElementById("deleteCourseOutcomeModal");
                const deleteName = document.getElementById("deleteCourseOutcomeName");
                if (deleteName) {
                    deleteName.textContent =
                        row.dataset.coNumber ||
                        row.cells[0]
                            .textContent
                            .trim();
                }
                openModal(deleteModal);
            }
        });
    }

    /* DELETE COURSE OUTCOME MODAL */
    const deleteCourseOutcomeModal = document.getElementById("deleteCourseOutcomeModal");
    const deleteCourseOutcomeBackdrop = document.getElementById("deleteCourseOutcomeBackdrop");
    const cancelDeleteCourseOutcome = document.getElementById("cancelDeleteCourseOutcome");
    const confirmDeleteCourseOutcome = document.getElementById("confirmDeleteCourseOutcome");

    function closeDeleteCourseOutcome() {
        deletingCourseOutcomeRow =
            null;
        closeModal(deleteCourseOutcomeModal);
    }
    if (cancelDeleteCourseOutcome) {
        cancelDeleteCourseOutcome.addEventListener("click", closeDeleteCourseOutcome);
    }
    if (deleteCourseOutcomeBackdrop) {
        deleteCourseOutcomeBackdrop.addEventListener("click", closeDeleteCourseOutcome);
    }
    if (confirmDeleteCourseOutcome) {
        confirmDeleteCourseOutcome.addEventListener("click", function () {
            if (deletingCourseOutcomeRow) {
                deletingCourseOutcomeRow.remove();
            }
            const remainingCourseOutcomeRows = courseOutcomesTableBody
                ? courseOutcomesTableBody.querySelectorAll("tr[data-co-number]")
                : [];
            if (courseOutcomesTableBody &&
                remainingCourseOutcomeRows.length === 0 &&
                !courseOutcomesTableBody.querySelector(".sodh-empty-row")) {
                const emptyRow = document.createElement("tr");
                emptyRow.className =
                    "sodh-empty-row sof-outcome-empty-row";
                emptyRow.innerHTML = `
                                <td colspan="4">
                                    <strong>No course outcome uploaded</strong>
                                    Course outcomes will appear here once uploaded.
                                </td>
                            `;
                courseOutcomesTableBody.appendChild(emptyRow);
            }
            deletingCourseOutcomeRow =
                null;
            closeModal(deleteCourseOutcomeModal);
        });
    }

    /* STUDENT OUTCOME */
    const studentOutcomeStorageKey = "eduMetricsStudentOutcomes";
    const addStudentOutcomeButton = document.getElementById("addStudentOutcomeButton");
    const studentOutcomeModal = document.getElementById("studentOutcomeModal");
    const studentOutcomeBackdrop = document.getElementById("studentOutcomeModalBackdrop");
    const studentOutcomeModalTitle = document.getElementById("studentOutcomeModalTitle");
    const studentOutcomeModalSubtitle = document.getElementById("studentOutcomeModalSubtitle");
    const studentOutcomeSelect = document.getElementById("studentOutcomeSelect");
    const studentOutcomeDueDate = document.getElementById("studentOutcomeDueDate");
    const studentOutcomeStatus = document.getElementById("studentOutcomeStatus");
    const cancelStudentOutcomeButton = document.getElementById("cancelStudentOutcomeButton");
    const saveStudentOutcomeButton = document.getElementById("saveStudentOutcomeButton");
    const studentOutcomeTableBody = document.getElementById("studentOutcomeTableBody");
    const studentOutcomeEmptyState = document.getElementById("studentOutcomeEmptyState");
    const facultyStudentOutcomeCount = document.getElementById("facultyStudentOutcomeCount");
    const facultyActiveOutcomeCount = document.getElementById("facultyActiveOutcomeCount");
    const deleteStudentOutcomeModal = document.getElementById("deleteStudentOutcomeModal");
    const deleteStudentOutcomeBackdrop = document.getElementById("deleteStudentOutcomeBackdrop");
    const deleteStudentOutcomeName = document.getElementById("deleteStudentOutcomeName");
    const cancelDeleteStudentOutcome = document.getElementById("cancelDeleteStudentOutcome");
    const confirmDeleteStudentOutcome = document.getElementById("confirmDeleteStudentOutcome");
    let editingStudentOutcomeId = null;
    let deletingStudentOutcomeId = null;

    function getStudentOutcomeTitle(code) {
        return ("SELF-ASSESSMENT AND REFLECTION ON ATTAINMENT OF STUDENT OUTCOME (" +
            code +
            ")");
    }

    function getStudentOutcomeLink(code) {
        return ("assessment/so-" +
            code +
            ".html");
    }

    function getStoredStudentOutcomes() {
        try {
            const stored = localStorage.getItem(studentOutcomeStorageKey);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed)
                ? parsed
                : [];
        }
        catch (error) {
            console.error("Unable to load Student Outcomes:", error);
            return [];
        }
    }

    function saveStoredStudentOutcomes(outcomes) {
        try {
            localStorage.setItem(studentOutcomeStorageKey, JSON.stringify(outcomes));
            window.dispatchEvent(new CustomEvent("eduMetricsStudentOutcomesUpdated", {
                detail: outcomes
            }));
            return true;
        }
        catch (error) {
            console.error("Unable to save Student Outcomes:", error);
            alert("Unable to save the Student Outcome. Please open EduMetrics through your local server instead of opening the HTML file directly.");
            return false;
        }
    }

    function getStudentOutcomeStatusClass(status) {
        switch (status) {
            case "Active":
                return "sof-status-active";
            case "Closed":
                return "sof-status-closed";
            case "Archived":
                return "sof-status-archived";
            default:
                return "sof-status-draft";
        }
    }

    function resetStudentOutcomeForm() {
        editingStudentOutcomeId =
            null;
        if (studentOutcomeSelect) {
            studentOutcomeSelect.value =
                "";
            studentOutcomeSelect.disabled =
                false;
        }
        if (studentOutcomeDueDate) {
            studentOutcomeDueDate.value =
                "";
        }
        if (studentOutcomeStatus) {
            studentOutcomeStatus.value =
                "Active";
        }
        if (studentOutcomeModalTitle) {
            studentOutcomeModalTitle.textContent =
                "Upload Student Outcome";
        }
        if (studentOutcomeModalSubtitle) {
            studentOutcomeModalSubtitle.textContent =
                "Select the Student Outcome to assign, set its due date, and choose its status.";
        }
        if (saveStudentOutcomeButton) {
            saveStudentOutcomeButton.textContent =
                "Upload";
        }
    }

    function updateStudentOutcomeSummary(outcomes) {
        if (facultyStudentOutcomeCount) {
            facultyStudentOutcomeCount.textContent =
                outcomes.length;
        }
        if (facultyActiveOutcomeCount) {
            facultyActiveOutcomeCount.textContent =
                outcomes.filter(function (outcome) {
                    return (outcome.status ===
                        "Active");
                }).length;
        }
    }

    function renderStoredStudentOutcomes() {
        if (!studentOutcomeTableBody) {
            return;
        }
        const outcomes = getStoredStudentOutcomes();
        studentOutcomeTableBody.innerHTML =
            "";
        if (outcomes.length === 0) {
            studentOutcomeTableBody.innerHTML = `
                        <tr class="sodh-empty-row sof-outcome-empty-row">
                            <td colspan="5">
                                <div class="sodh-empty-state">
                                    <strong>No student outcome uploaded</strong>
                                    <span>Student outcomes will appear here once uploaded.</span>
                                </div>
                            </td>
                        </tr>
                    `;
            updateStudentOutcomeSummary(outcomes);
            return;
        }
        outcomes.forEach(function (outcome) {
            const row = document.createElement("tr");
            row.dataset.id =
                outcome.id;
            row.innerHTML = `
                            <td>
                                <strong class="sof-outcome-name">
                                    ${escapeHTML(outcome.title)}
                                </strong>
                            </td>
                            <td>${escapeHTML(formatDate(outcome.dueDate))}</td>
                            <td>${Number(outcome.responses) || 0}</td>
                            <td>
                                <span class="sof-status-pill ${getStudentOutcomeStatusClass(outcome.status)}">
                                    ${escapeHTML(outcome.status)}
                                </span>
                            </td>
                            <td>
                                <div class="sof-row-actions">
                                    <button type="button" class="sof-row-action-btn sof-view-outcome-btn" data-id="${escapeHTML(outcome.id)}">View</button>
                                    <button type="button" class="sof-row-action-btn sof-edit-outcome-btn" data-id="${escapeHTML(outcome.id)}">Edit</button>
                                    <button type="button" class="sof-row-action-btn sof-delete-outcome-btn" data-id="${escapeHTML(outcome.id)}">Delete</button>
                                </div>
                            </td>
                        `;
            studentOutcomeTableBody.appendChild(row);
        });
        if (studentOutcomeEmptyState) {
            studentOutcomeEmptyState.hidden =
                outcomes.length > 0;
        }
        updateStudentOutcomeSummary(outcomes);
    }

    function closeStudentOutcomeForm() {
        if (studentOutcomeModal) {
            studentOutcomeModal.hidden = true;
            studentOutcomeModal.setAttribute("hidden", "");
            studentOutcomeModal.classList.remove("show", "active", "open");
            studentOutcomeModal.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("sof-modal-open");
        document.body.style.overflow = "";
        resetStudentOutcomeForm();
    }
    if (addStudentOutcomeButton) {
        addStudentOutcomeButton.addEventListener("click", function () {
            resetStudentOutcomeForm();
            openModal(studentOutcomeModal);
        });
    }
    if (cancelStudentOutcomeButton) {
        cancelStudentOutcomeButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeStudentOutcomeForm();
        });
    }
    if (studentOutcomeBackdrop) {
        studentOutcomeBackdrop.addEventListener("click", function (event) {
            if (event.target === studentOutcomeBackdrop) {
                closeStudentOutcomeForm();
            }
        });
    }
    if (saveStudentOutcomeButton) {
        saveStudentOutcomeButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (saveStudentOutcomeButton.disabled) {
                return;
            }
            const code = studentOutcomeSelect
                ? studentOutcomeSelect.value.trim()
                : "";
            const dueDate = studentOutcomeDueDate
                ? studentOutcomeDueDate.value
                : "";
            const status = studentOutcomeStatus
                ? studentOutcomeStatus.value
                : "Active";
            if (!code) {
                alert("Please select a Student Outcome.");
                return;
            }
            if (!dueDate) {
                alert("Please select a due date.");
                return;
            }
            saveStudentOutcomeButton.disabled = true;
            try {
                const selectedOption = studentOutcomeSelect &&
                    studentOutcomeSelect.selectedIndex >= 0
                    ? studentOutcomeSelect.options[studentOutcomeSelect.selectedIndex]
                    : null;
                const title = selectedOption &&
                    selectedOption.textContent.trim()
                    ? formatStudentOutcomeTitle(selectedOption.textContent.trim())
                    : formatStudentOutcomeTitle(getStudentOutcomeTitle(code));
                const facultyCourse = document.getElementById("facultyCourse");
                const facultySection = document.getElementById("facultySection");
                const facultyTerm = document.getElementById("facultyTerm");
                const facultyYear = document.getElementById("facultyYear");
                const course = facultyCourse
                    ? facultyCourse.value
                    : "";
                const courseLabel = facultyCourse &&
                    facultyCourse.selectedIndex >= 0
                    ? facultyCourse.options[facultyCourse.selectedIndex].textContent.trim()
                    : "";
                const section = facultySection
                    ? facultySection.value
                    : "";
                const academicTerm = facultyTerm
                    ? facultyTerm.value
                    : "";
                const schoolYear = facultyYear
                    ? facultyYear.value
                    : "";
                const outcomes = getStoredStudentOutcomes();
                if (editingStudentOutcomeId) {
                    const index = outcomes.findIndex(function (item) {
                        return (item.id ===
                            editingStudentOutcomeId);
                    });
                    if (index !== -1) {
                        outcomes[index] = {
                            ...outcomes[index],
                            code: code,
                            title: title,
                            dueDate: dueDate,
                            status: status,
                            course: course,
                            courseLabel: courseLabel,
                            section: section,
                            academicTerm: academicTerm,
                            schoolYear: schoolYear,
                            link: getStudentOutcomeLink(code)
                        };
                    }
                }
                else {
                    outcomes.push({
                        id: "so-" +
                            Date.now(),
                        code: code,
                        title: title,
                        dueDate: dueDate,
                        status: status,
                        responses: 0,
                        course: course,
                        courseLabel: courseLabel,
                        section: section,
                        academicTerm: academicTerm,
                        schoolYear: schoolYear,
                        link: getStudentOutcomeLink(code),
                        createdAt: new Date().toISOString()
                    });
                }
                if (!saveStoredStudentOutcomes(outcomes)) {
                    return;
                }
                renderStoredStudentOutcomes();
                closeStudentOutcomeForm();
            }
            catch (error) {
                console.error("Unable to save Student Outcome:", error);
                alert("Unable to save the Student Outcome. Please check the browser console.");
            }
            finally {
                saveStudentOutcomeButton.disabled = false;
            }
        });
    }
    if (studentOutcomeTableBody) {
        studentOutcomeTableBody.addEventListener("click", function (event) {
            const viewButton = event.target.closest(".sof-view-outcome-btn");
            const editButton = event.target.closest(".sof-edit-outcome-btn");
            const deleteButton = event.target.closest(".sof-delete-outcome-btn");
            const outcomes = getStoredStudentOutcomes();
            if (viewButton) {
                const outcome = outcomes.find(function (item) {
                    return (item.id ===
                        viewButton.dataset.id);
                });
                if (outcome && outcome.link) {
                    window.location.href =
                        outcome.link;
                }
                return;
            }
            if (editButton) {
                const outcome = outcomes.find(function (item) {
                    return (item.id ===
                        editButton.dataset.id);
                });
                if (!outcome) {
                    return;
                }
                editingStudentOutcomeId =
                    outcome.id;
                if (studentOutcomeSelect) {
                    studentOutcomeSelect.value =
                        outcome.code;
                    studentOutcomeSelect.disabled =
                        true;
                }
                if (studentOutcomeDueDate) {
                    studentOutcomeDueDate.value =
                        outcome.dueDate || "";
                }
                if (studentOutcomeStatus) {
                    studentOutcomeStatus.value =
                        outcome.status || "Active";
                }
                if (studentOutcomeModalTitle) {
                    studentOutcomeModalTitle.textContent =
                        "Edit Student Outcome";
                }
                if (studentOutcomeModalSubtitle) {
                    studentOutcomeModalSubtitle.textContent =
                        "Update the due date or status of this Student Outcome.";
                }
                if (saveStudentOutcomeButton) {
                    saveStudentOutcomeButton.textContent =
                        "Save Changes";
                }
                openModal(studentOutcomeModal);
                return;
            }
            if (deleteButton) {
                const outcome = outcomes.find(function (item) {
                    return (item.id ===
                        deleteButton.dataset.id);
                });
                if (!outcome) {
                    return;
                }
                deletingStudentOutcomeId =
                    outcome.id;
                if (deleteStudentOutcomeName) {
                    deleteStudentOutcomeName.textContent =
                        outcome.title;
                }
                openModal(deleteStudentOutcomeModal);
            }
        });
    }

    function closeDeleteStudentOutcome() {
        deletingStudentOutcomeId =
            null;
        closeModal(deleteStudentOutcomeModal);
    }
    if (cancelDeleteStudentOutcome) {
        cancelDeleteStudentOutcome.addEventListener("click", closeDeleteStudentOutcome);
    }
    if (deleteStudentOutcomeBackdrop) {
        deleteStudentOutcomeBackdrop.addEventListener("click", closeDeleteStudentOutcome);
    }
    if (confirmDeleteStudentOutcome) {
        confirmDeleteStudentOutcome.addEventListener("click", function () {
            if (!deletingStudentOutcomeId) {
                return;
            }
            const outcomes = getStoredStudentOutcomes()
                .filter(function (outcome) {
                    return (outcome.id !==
                        deletingStudentOutcomeId);
                });
            saveStoredStudentOutcomes(outcomes);
            closeDeleteStudentOutcome();
            renderStoredStudentOutcomes();
        });
    }

    window.addEventListener("storage", function (event) {
        if (event.key ===
            studentOutcomeStorageKey) {
            renderStoredStudentOutcomes();
        }
    });
    renderStoredStudentOutcomes();

    /* ESCAPE KEY */
    document.addEventListener("keydown", function (event) {
        if (event.key !==
            "Escape") {
            return;
        }
        if (courseOutcomeModal &&
            !courseOutcomeModal.hidden) {
            closeCourseOutcomeForm();
            return;
        }
        if (studentOutcomeModal &&
            !studentOutcomeModal.hidden) {
            closeStudentOutcomeForm();
            return;
        }
        if (deleteCourseOutcomeModal &&
            !deleteCourseOutcomeModal.hidden) {
            closeDeleteCourseOutcome();
            return;
        }
        if (deleteStudentOutcomeModal &&
            !deleteStudentOutcomeModal.hidden) {
            closeDeleteStudentOutcome();
            return;
        }
        if (deleteSyllabusModal &&
            !deleteSyllabusModal.hidden) {
            closeModal(deleteSyllabusModal);
        }
    });

    /* INITIAL PAGE STATE */
    tabPanels.forEach(function (panel) {
        panel.classList.toggle("active", panel.id ===
            "syllabus");
    });
    tabs.forEach(function (tab) {
        tab.classList.toggle("active", tab.dataset.tab ===
            "syllabus");
    });
}

/* STUDENT PENDING STUDENT OUTCOMES */
document.addEventListener("DOMContentLoaded", function () {
    const page = document.querySelector(".so-student-page");
    const pendingSOList = document.getElementById("pendingSOList");
    const pendingSOEmpty = document.getElementById("pendingSOEmpty");
    if (!page || !pendingSOList || !pendingSOEmpty) {
        return;
    }
    const storageKey = "eduMetricsStudentOutcomes";
    const pendingCourseFilter = document.getElementById("pendingSOCourseFilter");
    const pendingSOCount = document.getElementById("pendingSOCount");
    const dueThisWeekCount = document.getElementById("dueThisWeekCount");

    function getStudentOutcomes() {
        try {
            const stored = localStorage.getItem(storageKey);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed)
                ? parsed
                : [];
        }
        catch (error) {
            console.error("Unable to load Student Outcomes:", error);
            return [];
        }
    }

    function escapeStudentSOHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatStudentSODueDate(value) {
        if (!value) {
            return "Pending";
        }
        const date = new Date(value + "T00:00:00");
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    }

    function isDueWithinSevenDays(value) {
        if (!value) {
            return false;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(value + "T00:00:00");
        const lastDay = new Date(today);
        lastDay.setDate(lastDay.getDate() + 7);
        return (dueDate >= today &&
            dueDate <= lastDay);
    }

    function getActiveStudentOutcomes() {
        return getStudentOutcomes()
            .filter(function (outcome) {
                return (outcome.status ===
                    "Active");
            })
            .map(function (outcome) {
                return {
                    ...outcome,

                    /*
                     * CHANGE THIS LATER:
                     * Replace this sample course with the course
                     * saved by the backend/faculty assignment.
                     * For now, every uploaded SO is Software Design.
                     */
                    course: outcome.course ||
                        ""
                };
            });
    }

    function updateStudentSOSummary(outcomes) {
        if (pendingSOCount) {
            pendingSOCount.textContent =
                outcomes.length;
        }
        if (dueThisWeekCount) {
            dueThisWeekCount.textContent =
                outcomes.filter(function (outcome) {
                    return isDueWithinSevenDays(outcome.dueDate);
                }).length;
        }
    }

    function populatePendingCourseFilter(outcomes) {
        if (!pendingCourseFilter) {
            return;
        }
        const selectedValue = pendingCourseFilter.value;
        const courses = [
            ...new Set(outcomes.map(function (outcome) {
                return outcome.course;
            }))
        ];
        pendingCourseFilter.innerHTML = "";
        const allCoursesOption = document.createElement("option");
        allCoursesOption.value = "";
        allCoursesOption.textContent =
            "All Courses";
        pendingCourseFilter.appendChild(allCoursesOption);
        courses
            .filter(function (course) {
                return Boolean(course);
            })
            .forEach(function (course) {
                const option = document.createElement("option");
                option.value =
                    course;
                option.textContent =
                    course;
                pendingCourseFilter.appendChild(option);
            });
        if (selectedValue &&
            Array.from(pendingCourseFilter.options).some(function (option) {
                return (option.value ===
                    selectedValue);
            })) {
            pendingCourseFilter.value =
                selectedValue;
        }
    }

    function renderPendingStudentOutcomes() {
        const activeOutcomes = getActiveStudentOutcomes();
        populatePendingCourseFilter(activeOutcomes);
        const selectedCourse = pendingCourseFilter
            ? pendingCourseFilter.value
            : "";
        const filteredOutcomes = activeOutcomes.filter(function (outcome) {
            return (!selectedCourse ||
                outcome.course ===
                selectedCourse);
        });
        pendingSOList.innerHTML =
            "";
        filteredOutcomes.forEach(function (outcome) {
            const item = document.createElement("article");
            item.className =
                "so-pending-item";
            item.innerHTML = `
                            <div class="so-pending-information">
                                <h3 class="so-pending-title">${escapeStudentSOHTML(outcome.title)}</h3>
                                <div class="so-pending-meta">
                                    <span class="so-pending-due">Due: ${escapeStudentSOHTML(formatStudentSODueDate(outcome.dueDate))}</span>
                                    <span class="so-pending-status">Pending</span>
                                </div>
                            </div>

                            <div class="so-pending-course">
                                ${escapeStudentSOHTML(outcome.course)}
                            </div>

                            <button
                                type="button"
                                class="so-start-assessment-btn"
                                data-link="${escapeStudentSOHTML(outcome.link || "")}"
                            >
                                <span>Complete Self-Assessment</span>
                                <span class="so-assessment-arrow" aria-hidden="true">→</span>
                            </button>
                        `;
            pendingSOList.appendChild(item);
        });
        pendingSOList.hidden =
            filteredOutcomes.length === 0;
        pendingSOEmpty.hidden =
            filteredOutcomes.length > 0;
        if (filteredOutcomes.length === 0 &&
            selectedCourse !== "") {
            pendingSOEmpty.innerHTML = `
                        <h3>No self-assessments for this course</h3>
                        <p>Select another course to view its assigned Student Outcomes.</p>
                    `;
        }
        updateStudentSOSummary(activeOutcomes);
    }
    pendingSOList.addEventListener("click", function (event) {
        const button = event.target.closest(".so-start-assessment-btn");
        if (!button) {
            return;
        }
        const link = button.dataset.link;
        if (link) {
            window.location.href =
                link;
        }
    });
    if (pendingCourseFilter) {
        pendingCourseFilter.addEventListener("change", renderPendingStudentOutcomes);
    }

    window.addEventListener("storage", function (event) {
        if (event.key === storageKey) {
            renderPendingStudentOutcomes();
        }
    });

    window.addEventListener("eduMetricsStudentOutcomesUpdated", renderPendingStudentOutcomes);
    renderPendingStudentOutcomes();
});

/* DEPARTMENT HEAD SYLLABUS & OUTCOMES */
document.addEventListener("DOMContentLoaded", function () {
    const tabs = document.querySelectorAll(".sodh-tab");
    const panels = document.querySelectorAll(".sodh-tab-panel");
    if (!tabs.length || !panels.length) {
        return;
    }
    tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            const targetId = this.dataset.tab;
            if (!targetId) {
                return;
            }
            tabs.forEach(function (item) {
                item.classList.remove("active");
            });
            panels.forEach(function (panel) {
                panel.classList.remove("active");
            });
            this.classList.add("active");
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add("active");
            }
        });
    });
    const responseStorageKey = "eduMetricsSOResponses";
    const outcomeStorageKey = "eduMetricsStudentOutcomes";
    const soSummaryTableBody = document.getElementById("soSummaryTableBody");
    const studentResponsesTableBody = document.getElementById("studentResponsesTableBody");
    const soSummarySearch = document.getElementById("soSummarySearch");
    const studentResponseSearch = document.getElementById("studentResponseSearch");

    function readArray(key) {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed)
                ? parsed
                : [];
        }
        catch (error) {
            return [];
        }
    }

    function safeText(value) {
        return String(value === undefined ||
            value === null
            ? ""
            : value);
    }

    function escapeDeptHTML(value) {
        return safeText(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalize(value) {
        return safeText(value)
            .trim()
            .toLowerCase();
    }

    function selectedFilter(id) {
        const field = document.getElementById(id);
        return field
            ? normalize(field.value)
            : "";
    }

    function responseMatchesFilters(response) {
        const info = response.studentInformation ||
            {};
        const schoolYear = selectedFilter("schoolYearFilter");
        const program = selectedFilter("programFilter");
        const course = selectedFilter("courseFilter");
        const section = selectedFilter("sectionFilter");
        return ((!schoolYear ||
            normalize(info.schoolYear) ===
            schoolYear) &&
            (!program ||
                normalize(info.program) ===
                program) &&
            (!course ||
                normalize(info.course) ===
                course) &&
            (!section ||
                normalize(info.section) ===
                section));
    }

    function getFilteredResponses() {
        return readArray(responseStorageKey).filter(responseMatchesFilters);
    }

    function emptySummaryRow() {
        return `
                    <tr class="sodh-empty-row">
                        <td colspan="3">
                            <strong>No SO results yet</strong>
                            Student Outcome attainment results
                            will appear here once assessment
                            data is available.
                        </td>
                    </tr>
                `;
    }

    function emptyStudentRow() {
        return `
                    <tr class="sodh-empty-row">
                        <td colspan="7">
                            <strong>No student responses yet</strong>
                            Student responses will appear here
                            once assessment responses are available.
                        </td>
                    </tr>
                `;
    }

    function renderSOSummary() {
        if (!soSummaryTableBody) {
            return;
        }
        const query = soSummarySearch
            ? normalize(soSummarySearch.value)
            : "";
        const responses = getFilteredResponses();
        const groups = {};
        responses.forEach(function (response) {
            const so = safeText(response.studentOutcome).toLowerCase();
            const answers = response.answers || {};
            const descriptions = Array.isArray(response.indicatorDescriptions)
                ? response.indicatorDescriptions
                : [];
            Object.keys(answers).forEach(function (answerKey) {
                const indicatorMatch = answerKey.match(/(\d+)$/);
                const indicatorNumber = indicatorMatch
                    ? Number(indicatorMatch[1])
                    : 0;
                const description = descriptions[Math.max(indicatorNumber - 1, 0)] ||
                    ("Performance Indicator " +
                        indicatorNumber);
                const groupKey = so +
                    "|" +
                    indicatorNumber +
                    "|" +
                    description;
                if (!groups[groupKey]) {
                    groups[groupKey] = {
                        so: so,
                        indicatorNumber: indicatorNumber,
                        description: description,
                        total: 0,
                        count: 0
                    };
                }
                const score = Number(answers[answerKey]);
                if (Number.isFinite(score) &&
                    score > 0) {
                    groups[groupKey].total +=
                        score;
                    groups[groupKey].count +=
                        1;
                }
            });
        });
        const rows = Object.values(groups)
            .filter(function (group) {
                if (!query) {
                    return true;
                }
                const haystack = ("SO (" +
                    group.so +
                    ") " +
                    group.indicatorNumber +
                    " " +
                    group.description).toLowerCase();
                return haystack.includes(query);
            })
            .sort(function (a, b) {
                if (a.so !== b.so) {
                    return a.so.localeCompare(b.so);
                }
                return (a.indicatorNumber -
                    b.indicatorNumber);
            });
        if (!rows.length) {
            /* Keep the demo rows already written in so-dept-head.html.
               Once real SO response data exists, the rows below will
               automatically be replaced by computed attainment data. */
            return;
        }
        soSummaryTableBody.innerHTML =
            rows.map(function (group) {
                const average = group.count
                    ? (group.total /
                        group.count)
                    : 0;

                /* Ratings are 1-3.
                   Convert the average rating to a 0-100 attainment rate. */
                const attainment = Math.max(0, Math.min(100, (average /
                    3) * 100));
                const percent = Math.round(attainment);
                return `
                                <tr>
                                    <td>
                                        <span class="sodh-so-code">
                                            SO (${escapeDeptHTML(group.so)})
                                            - ${group.indicatorNumber}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="sodh-so-description">
                                            ${escapeDeptHTML(group.description)}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="sodh-attainment">
                                            <div
                                                class="sodh-attainment-track"
                                                aria-label="Attainment ${percent}%"
                                            >
                                                <span
                                                    class="sodh-attainment-fill"
                                                    style="--attainment:${percent}%"
                                                ></span>
                                            </div>
                                            <span class="sodh-attainment-value">
                                                ${percent}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            `;
            }).join("");
    }

    function getAssignedSOCount(course) {
        const outcomes = readArray(outcomeStorageKey);
        const courseName = normalize(course);
        const courseOutcomes = outcomes.filter(function (outcome) {
            const outcomeCourse = normalize(outcome.course);
            return (!courseName ||
                !outcomeCourse ||
                outcomeCourse ===
                courseName);
        });
        const uniqueCodes = new Set(courseOutcomes.map(function (outcome) {
            return normalize(outcome.code ||
                outcome.studentOutcome ||
                (safeText(outcome.title).match(/outcome\s*\((g1|g2|[a-l])\)/i) || [])[1] ||
                outcome.id);
        }).filter(Boolean));
        return uniqueCodes.size;
    }

    function renderStudentResponses() {
        if (!studentResponsesTableBody) {
            return;
        }
        const query = studentResponseSearch
            ? normalize(studentResponseSearch.value)
            : "";
        const responses = getFilteredResponses();
        const students = {};
        responses.forEach(function (response) {
            const info = response.studentInformation ||
                {};
            const key = [
                normalize(info.studentName) || "student",
                normalize(info.course) || "course",
                normalize(info.section) || "section"
            ].join("|");
            if (!students[key]) {
                students[key] = {
                    info: info,
                    completed: new Set()
                };
            }
            if (response.studentOutcome) {
                students[key].completed.add(normalize(response.studentOutcome));
            }
        });
        const rows = Object.values(students)
            .filter(function (student) {
                if (!query) {
                    return true;
                }
                const info = student.info || {};
                const haystack = [
                    info.studentName,
                    info.program,
                    info.course,
                    info.section
                ].join(" ")
                    .toLowerCase();
                return haystack.includes(query);
            });
        if (!rows.length) {
            /* Keep the demo student rows already written in
               so-dept-head.html until real response data exists. */
            return;
        }
        studentResponsesTableBody.innerHTML =
            rows.map(function (student) {
                const info = student.info || {};
                const completed = student.completed.size;
                const assigned = getAssignedSOCount(info.course);
                const total = Math.max(assigned, completed);
                const percent = total > 0
                    ? Math.round((completed /
                        total) * 100)
                    : 0;
                const isComplete = total > 0 &&
                    completed >= total;
                const status = isComplete
                    ? "Complete"
                    : "Incomplete";
                const statusClass = isComplete
                    ? "complete"
                    : "incomplete";
                return `
                                <tr>
                                    <td>
                                        <strong>
                                            ${escapeDeptHTML(info.studentName || "—")}
                                        </strong>
                                    </td>
                                    <td>
                                        ${escapeDeptHTML(info.program || "—")}
                                    </td>
                                    <td>
                                        ${escapeDeptHTML(info.course || "—")}
                                    </td>
                                    <td>
                                        ${escapeDeptHTML(info.section || "—")}
                                    </td>
                                    <td>
                                        <span class="sodh-progress-text">
                                            ${completed} / ${total}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="sodh-completion">
                                            <div class="sodh-completion-track">
                                                <span
                                                    class="sodh-completion-fill"
                                                    style="--completion:${percent}%"
                                                ></span>
                                            </div>
                                            <span class="sodh-completion-value">
                                                ${percent}%
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="sodh-response-status ${statusClass}">
                                            ${status}
                                        </span>
                                    </td>
                                </tr>
                            `;
            }).join("");
    }

    function renderDepartmentHeadSOData() {
        renderSOSummary();
        renderStudentResponses();
    }
    [
        "schoolYearFilter",
        "departmentFilter",
        "programFilter",
        "courseFilter",
        "sectionFilter"
    ].forEach(function (id) {
        const field = document.getElementById(id);
        if (field) {
            field.addEventListener("change", renderDepartmentHeadSOData);
        }
    });
    if (soSummarySearch) {
        soSummarySearch.addEventListener("input", renderSOSummary);
    }
    if (studentResponseSearch) {
        studentResponseSearch.addEventListener("input", renderStudentResponses);
    }

    window.addEventListener("storage", function (event) {
        if (event.key ===
            responseStorageKey ||
            event.key ===
            outcomeStorageKey) {
            renderDepartmentHeadSOData();
        }
    });
    renderDepartmentHeadSOData();
});

/* STUDENT OUTCOME SELF-ASSESSMENT — SHARED SO(A-L) */
document.addEventListener("DOMContentLoaded", function () {
    const assessmentPage = document.querySelector("body.soa-page");
    const nextButton = document.getElementById("soaNextButton");
    if (!assessmentPage || !nextButton) {
        return;
    }
    const ratingInputs = document.querySelectorAll('.soa-rating-option input[type="radio"]');
    const totalScoreElement = document.getElementById("soaTotalScore");
    const percentageElement = document.getElementById("soaPercentage");
    const message = document.getElementById("soaMessage");
    const indicatorNames = Array.from(ratingInputs)
        .map(function (input) {
            return input.name;
        })
        .filter(function (name, index, names) {
            return name && names.indexOf(name) === index;
        });
    const numberOfIndicators = indicatorNames.length;
    const maximumScore = numberOfIndicators * 3;
    const fileName = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();
    const soMatch = fileName.match(/^so-(g1|g2|[a-l])\.html$/);
    const currentSO = soMatch
        ? soMatch[1]
        : "a";

    function calculateScore() {
        let total = 0;
        indicatorNames.forEach(function (name) {
            const selected = document.querySelector('input[name="' + name + '"]:checked');
            if (selected) {
                total += Number(selected.value);
            }
        });
        const percentage = maximumScore > 0
            ? (total / maximumScore) * 100
            : 0;
        if (totalScoreElement) {
            totalScoreElement.textContent =
                total + " / " + maximumScore;
        }
        if (percentageElement) {
            percentageElement.textContent =
                total === 0
                    ? "0%"
                    : percentage.toFixed(2) + "%";
        }
        return total;
    }

    function assessmentComplete() {
        return indicatorNames.every(function (name) {
            return Boolean(document.querySelector('input[name="' + name + '"]:checked'));
        });
    }

    function getStudentInformation() {
        const fields = {
            studentName: "soaStudentName",
            program: "soaProgram",
            course: "soaCourse",
            section: "soaSection",
            semester: "soaSemester",
            schoolYear: "soaSchoolYear"
        };
        const information = {};
        Object.keys(fields).forEach(function (key) {
            const field = document.getElementById(fields[key]);
            information[key] =
                field
                    ? (field.value ||
                        field.textContent ||
                        "").trim()
                    : "";
        });
        return information;
    }
    ratingInputs.forEach(function (input) {
        input.addEventListener("change", function () {
            calculateScore();
            if (message) {
                message.classList.remove("show");
            }
        });
    });
    nextButton.addEventListener("click", function () {
        if (!assessmentComplete()) {
            if (message) {
                message.classList.add("show");
                message.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
            return;
        }
        const answers = {};
        let total = 0;
        indicatorNames.forEach(function (name, index) {
            const selected = document.querySelector('input[name="' + name + '"]:checked');
            const score = Number(selected.value);
            answers["indicator" + (index + 1)] = score;
            total += score;
        });
        const indicatorDescriptions = Array.from(document.querySelectorAll(".soa-question")).map(function (question) {
            const title = question.querySelector(".soa-question-title");
            if (!title) {
                return "";
            }
            const clone = title.cloneNode(true);
            const number = clone.querySelector(".soa-question-number");
            if (number) {
                number.remove();
            }
            return clone.textContent
                .replace(/\s+/g, " ")
                .trim();
        });
        const assessmentData = {
            studentOutcome: currentSO,
            studentInformation: getStudentInformation(),
            answers: answers,
            indicatorDescriptions: indicatorDescriptions,
            totalScore: total,
            maximumScore: maximumScore,
            percentage: maximumScore > 0
                ? Number(((total / maximumScore) *
                    100).toFixed(2))
                : 0
        };
        sessionStorage.setItem("currentSOAssessment", JSON.stringify(assessmentData));
        window.location.href =
            "page-2.html?so=" +
            encodeURIComponent(currentSO);
    });
    calculateScore();
});

/* STUDENT OUTCOME REFLECTION — SHARED PAGE 2 */
document.addEventListener("DOMContentLoaded", function () {
    const answer1 = document.getElementById("reflectionAnswer1");
    const answer2 = document.getElementById("reflectionAnswer2");
    const submitButton = document.getElementById("reflectionSubmitButton");
    const backButton = document.getElementById("reflectionBackButton");
    if (!answer1 ||
        !answer2 ||
        !submitButton ||
        !backButton) {
        return;
    }
    const params = new URLSearchParams(window.location.search);
    const currentSO = params.get("so") || "a";
    const validStudentOutcomes = [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g1",
        "g2",
        "h",
        "i",
        "j",
        "k",
        "l"
    ];
    const dateInput = document.getElementById("reflectionDate");
    const message = document.getElementById("reflectionMessage");
    const form = document.getElementById("reflectionForm");
    const success = document.getElementById("reflectionSuccess");
    const actions = document.getElementById("reflectionActions");
    const signatureCanvas = document.getElementById("studentSignature");
    const clearSignatureButton = document.getElementById("clearSignatureButton");
    let signatureContext = null;
    let isDrawing = false;
    let hasSignature = false;
    backButton.addEventListener("click", function () {
        if (currentSO &&
            validStudentOutcomes.includes(currentSO)) {
            window.location.href =
                "so-" + currentSO + ".html";
            return;
        }
        window.location.href =
            "../so-student.html";
    });

    function hideMessage() {
        const dateComplete = !dateInput || dateInput.value;
        const signatureComplete = !signatureCanvas || hasSignature;
        if (answer1.value.trim() &&
            answer2.value.trim() &&
            dateComplete &&
            signatureComplete &&
            message) {
            message.classList.remove("show");
        }
    }
    answer1.addEventListener("input", hideMessage);
    answer2.addEventListener("input", hideMessage);
    if (dateInput) {
        dateInput.addEventListener("input", hideMessage);
    }
    if (signatureCanvas) {
        signatureContext =
            signatureCanvas.getContext("2d");

        function resizeSignatureCanvas() {
            const rect = signatureCanvas.getBoundingClientRect();
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            signatureCanvas.width =
                rect.width * ratio;
            signatureCanvas.height =
                rect.height * ratio;
            signatureContext.setTransform(ratio, 0, 0, ratio, 0, 0);
            signatureContext.lineWidth = 2;
            signatureContext.lineCap = "round";
            signatureContext.lineJoin = "round";
            signatureContext.strokeStyle =
                "#173B5C";
        }

        function getSignaturePosition(event) {
            const rect = signatureCanvas.getBoundingClientRect();
            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
        }
        signatureCanvas.addEventListener("pointerdown", function (event) {
            const position = getSignaturePosition(event);
            isDrawing = true;
            signatureContext.beginPath();
            signatureContext.moveTo(position.x, position.y);
            signatureCanvas.setPointerCapture(event.pointerId);
        });
        signatureCanvas.addEventListener("pointermove", function (event) {
            if (!isDrawing) {
                return;
            }
            const position = getSignaturePosition(event);
            signatureContext.lineTo(position.x, position.y);
            signatureContext.stroke();
            hasSignature = true;
            hideMessage();
        });
        signatureCanvas.addEventListener("pointerup", function (event) {
            isDrawing = false;
            if (signatureCanvas.hasPointerCapture(event.pointerId)) {
                signatureCanvas.releasePointerCapture(event.pointerId);
            }
        });
        signatureCanvas.addEventListener("pointercancel", function () {
            isDrawing = false;
        });
        if (clearSignatureButton) {
            clearSignatureButton.addEventListener("click", function () {
                signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
                hasSignature = false;
            });
        }
        resizeSignatureCanvas();
    }
    submitButton.addEventListener("click", function () {
        const firstAnswer = answer1.value.trim();
        const secondAnswer = answer2.value.trim();
        const selectedDate = dateInput
            ? dateInput.value
            : "";
        const missingDate = dateInput && !selectedDate;
        const missingSignature = signatureCanvas && !hasSignature;
        if (!firstAnswer ||
            !secondAnswer ||
            missingDate ||
            missingSignature) {
            if (message) {
                message.classList.add("show");
                message.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
            return;
        }
        let assessmentData = {};
        const storedAssessment = sessionStorage.getItem("currentSOAssessment");
        if (storedAssessment) {
            try {
                assessmentData =
                    JSON.parse(storedAssessment);
            }
            catch (error) {
                assessmentData = {};
            }
        }
        assessmentData.studentOutcome =
            currentSO;
        assessmentData.reflection = {
            bestPerformanceIndicator: firstAnswer,
            weakestPerformanceIndicator: secondAnswer,
            signature: signatureCanvas
                ? signatureCanvas.toDataURL("image/png")
                : "",
            date: selectedDate,
            submittedAt: new Date().toISOString()
        };
        sessionStorage.setItem("completedSOAssessment", JSON.stringify(assessmentData));

        /* CHANGE THIS LATER:
           Replace localStorage with backend/API storage.
           The Department Head page reads this frontend data for now. */
        const responseStorageKey = "eduMetricsSOResponses";
        let storedResponses = [];
        try {
            const stored = localStorage.getItem(responseStorageKey);
            const parsed = stored
                ? JSON.parse(stored)
                : [];
            storedResponses =
                Array.isArray(parsed)
                    ? parsed
                    : [];
        }
        catch (error) {
            storedResponses = [];
        }
        const studentInfo = assessmentData.studentInformation ||
            {};
        const responseId = [
            (studentInfo.studentName ||
                "student").trim().toLowerCase(),
            (studentInfo.course ||
                "course").trim().toLowerCase(),
            currentSO
        ].join("|");
        assessmentData.responseId =
            responseId;
        assessmentData.completedAt =
            new Date().toISOString();
        const existingIndex = storedResponses.findIndex(function (response) {
            return (response.responseId ===
                responseId);
        });
        if (existingIndex >= 0) {
            storedResponses[existingIndex] =
                assessmentData;
        }
        else {
            storedResponses.push(assessmentData);
        }
        localStorage.setItem(responseStorageKey, JSON.stringify(storedResponses));
        if (form) {
            form.style.display = "none";
        }
        if (actions) {
            actions.style.display = "none";
        }
        if (success) {
            success.classList.add("show");
        }
    });
});

/* SUPPORT PAGE */
document.addEventListener("DOMContentLoaded", function () {
    const supportSearch = getElement("supportSearch");
    const supportCards = Array.from(document.querySelectorAll(".support-topic-card"));
    const supportNoResults = getElement("supportNoResults");
    const supportReportCard = getElement("supportReportCard");
    const supportReportForm = getElement("supportReportForm");
    const supportFormMessage = getElement("supportFormMessage");
    if (supportSearch) {
        supportSearch.addEventListener("input", function () {
            const query = supportSearch.value
                .trim()
                .toLowerCase();
            let visibleCount = 0;
            supportCards.forEach(function (card) {
                const searchableText = (card.dataset.supportSearch ||
                    card.textContent ||
                    "").toLowerCase();
                const matches = !query ||
                    searchableText.includes(query);
                card.hidden =
                    !matches;
                if (matches) {
                    visibleCount += 1;
                }
            });
            if (supportNoResults) {
                supportNoResults.hidden =
                    visibleCount !== 0;
            }
        });
    }
    document.querySelectorAll(".support-topic-link").forEach(function (button) {
        button.addEventListener("click", function () {
            const topic = button.dataset.supportTopic;
            if (topic ===
                "report-problem") {
                if (supportReportCard) {
                    supportReportCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
                return;
            }
            const topicMessages = {
                "getting-started": "Getting Started guides will contain account setup, verification, and navigation instructions.",
                "account-login": "Account & Login help covers sign in, email verification, passwords, and account access.",
                "using-edumetrics": "Using EduMetrics guides cover syllabus, CO/SO assessments, grading, workflow, and course tools."
            };
            showGenericModal("Support", topicMessages[topic] ||
                "Support information will be available here.", "?");
        });
    });
    if (supportReportForm) {
        supportReportForm.addEventListener("submit", function (event) {
            event.preventDefault();
            if (supportFormMessage) {
                supportFormMessage.textContent =
                    "Your report is ready to be connected to the support backend.";
            }
        });
    }
});

/* KEEP RENDERED STUDENT OUTCOME TITLES IN TITLE CASE */
function normalizeRenderedStudentOutcomeTitles() {
    const elements = document.querySelectorAll("#studentOutcomeTableBody td, " +
        "#pendingSOList strong, " +
        "#pendingSOList h3, " +
        "#pendingSOList .so-pending-title");
    elements.forEach(function (element) {
        if (element &&
            /student outcome\s*\(/i.test(element.textContent || "")) {
            const currentText = element.textContent;
            const formattedText = formatStudentOutcomeTitle(currentText);
            if (currentText !== formattedText) {
                element.textContent =
                    formattedText;
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    normalizeRenderedStudentOutcomeTitles();
    const observer = new MutationObserver(normalizeRenderedStudentOutcomeTitles);
    const facultyTable = document.getElementById("studentOutcomeTableBody");
    const studentList = document.getElementById("pendingSOList");
    [facultyTable, studentList].forEach(function (target) {
        if (target) {
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }
    });
});

/* SO Student Course Filters */
function ensureSOStudentCourseFilters() {
    const courseFilters = [
        document.getElementById("studentCourseSort"),
        document.getElementById("pendingSOCourseFilter")
    ];
    courseFilters.forEach(function (select) {
        if (!select) {
            return;
        }
        const existingAllCourses = Array.from(select.options).find(function (option) {
            return option.textContent.trim().toLowerCase() === "all courses";
        });
        if (!existingAllCourses) {
            const allCoursesOption = document.createElement("option");
            allCoursesOption.value = "";
            allCoursesOption.textContent = "All Courses";
            select.insertBefore(allCoursesOption, select.firstChild);
        }
        if (!select.value) {
            select.value = "";
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    ensureSOStudentCourseFilters();
});

/* CURRICULUM MAPPING STUDENT */
document.addEventListener("DOMContentLoaded", function () {
    const page = document.querySelector(".cm-student-main");
    if (!page)
        return;
    const tabs = page.querySelectorAll(".cm-tab");
    const panels = page.querySelectorAll(".cm-tab-panel");
    tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            const target = tab.dataset.cmTab;
            tabs.forEach(function (item) {
                item.classList.toggle("active", item === tab);
            });
            panels.forEach(function (panel) {
                panel.classList.toggle("active", panel.id === target);
            });
        });
    });
});

/* FACULTY -> STUDENT COURSE SYLLABUS SHARED FRONTEND STORAGE */
(function () {
    const facultyPage = document.querySelector(".so-faculty-page");
    const facultySection = document.getElementById("facultySection");

    async function requestJson(url, options) {
        const response = await fetch(url, Object.assign({
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        }, options || {}));
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            throw new Error(data.error || "Syllabus request failed.");
        }
        return data;
    }

    function getSelectedSectionId() {
        return facultySection ? facultySection.value.trim() : "";
    }

    async function saveSharedSyllabus(file) {
        const sectionId = getSelectedSectionId();
        if (!sectionId) {
            throw new Error("Select an assigned course section first.");
        }
        const formData = new FormData();
        formData.append("syllabus", file);
        const data = await requestJson(
            "/api/faculty/syllabi/" + encodeURIComponent(sectionId),
            { method: "POST", body: formData }
        );
        return data.syllabus;
    }

    async function deleteSharedSyllabus() {
        const sectionId = getSelectedSectionId();
        if (!sectionId) {
            throw new Error("Select an assigned course section first.");
        }
        return requestJson(
            "/api/faculty/syllabi/" + encodeURIComponent(sectionId),
            { method: "DELETE" }
        );
    }

    async function getSharedSyllabi() {
        const data = await requestJson("/api/student/syllabi");
        return (Array.isArray(data.syllabi) ? data.syllabi : []).map(function (item) {
            return {
                courseKey: item.course_id,
                courseName: item.course_code + " - " + item.course_title,
                sectionName: item.section_name,
                academicYearName: item.academic_year_name,
                fileName: item.file_name,
                uploadedAt: item.uploaded_at,
                signedUrl: item.signed_url
            };
        });
    }

    function showFacultySyllabus(syllabus) {
        const empty = document.getElementById("facultySyllabusEmpty");
        const row = document.getElementById("facultySyllabusFileRow");
        const name = document.getElementById("syllabusFileName");
        const size = document.getElementById("syllabusFileSize");
        const updated = document.getElementById("syllabusLastUpdated");
        const view = document.getElementById("viewSyllabusButton");
        const download = document.getElementById("downloadSyllabusButton");

        if (!syllabus) {
            if (empty) empty.hidden = false;
            if (row) row.hidden = true;
            if (view) delete view.dataset.signedUrl;
            if (download) delete download.dataset.signedUrl;
            return;
        }

        if (empty) empty.hidden = true;
        if (row) row.hidden = false;
        if (name) name.textContent = syllabus.file_name;
        if (size) size.textContent = "Stored in Supabase";
        if (updated && syllabus.uploaded_at) {
            updated.textContent = "Last Updated: " + new Date(syllabus.uploaded_at).toLocaleString();
        }
        if (view) view.dataset.signedUrl = syllabus.signed_url;
        if (download) download.dataset.signedUrl = syllabus.signed_url;
    }

    async function loadFacultySyllabus() {
        const sectionId = getSelectedSectionId();
        if (!facultyPage || !sectionId) {
            return;
        }
        try {
            const data = await requestJson(
                "/api/faculty/syllabi/" + encodeURIComponent(sectionId)
            );
            showFacultySyllabus(data.syllabus);
        } catch (error) {
            console.error("Unable to load faculty syllabus:", error);
        }
    }

    function renderStudentSyllabusRow(record) {
        const row = document.createElement("div");
        row.className = "so-student-file-row";
        row.dataset.course = record.courseKey;
        const info = document.createElement("div");
        info.className = "so-student-file-info";
        const copy = document.createElement("div");
        copy.className = "so-student-file-copy";
        const course = document.createElement("span");
        course.className = "so-student-syllabus-course";
        course.textContent = record.courseName || "Course";
        const name = document.createElement("strong");
        name.textContent = record.fileName || "Course_Syllabus.pdf";
        const meta = document.createElement("div");
        meta.className = "so-student-file-meta";
        meta.innerHTML = "<span>PDF</span><span>•</span><span></span>";
        meta.lastElementChild.textContent = record.sectionName +
            (record.academicYearName ? " - " + record.academicYearName : "");
        copy.appendChild(course);
        copy.appendChild(name);
        copy.appendChild(meta);
        info.appendChild(copy);
        const actions = document.createElement("div");
        actions.className = "so-student-file-actions";
        const viewButton = document.createElement("button");
        viewButton.className = "so-student-view-btn";
        viewButton.type = "button";
        viewButton.innerHTML = '<img src="../../Static/images/content/view-blue.png" alt="" class="so-action-icon"><span>View Syllabus</span>';
        const downloadButton = document.createElement("button");
        downloadButton.className = "so-student-download-btn";
        downloadButton.type = "button";
        downloadButton.innerHTML = '<img src="../../Static/images/content/download.png" alt="" class="so-action-icon"><span>Download PDF</span>';
        viewButton.addEventListener("click", function () {
            if (!record.signedUrl)
                return;
            window.open(record.signedUrl, "_blank", "noopener");
        });
        downloadButton.addEventListener("click", function () {
            if (!record.signedUrl)
                return;
            const link = document.createElement("a");
            link.href = record.signedUrl;
            link.download = record.fileName || "Course_Syllabus.pdf";
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
        actions.appendChild(viewButton);
        actions.appendChild(downloadButton);
        row.appendChild(info);
        row.appendChild(actions);
        return row;
    }

    async function renderStudentSharedSyllabi() {
        const page = document.querySelector(".so-student-page:not(.so-faculty-page)");
        const list = document.getElementById("studentSyllabusList");
        const empty = document.getElementById("studentSyllabusEmpty");
        const filter = document.getElementById("studentCourseSort");
        const count = document.getElementById("availableSyllabusCount");
        if (!page || !list || !empty) {
            return;
        }
        try {
            const records = await getSharedSyllabi();
            if (filter) {
                const previous = filter.value;
                filter.innerHTML = '<option value="">All Courses</option>';
                records.forEach(function (record) {
                    const option = document.createElement("option");
                    option.value = record.courseKey;
                    option.textContent = record.courseName || record.courseKey;
                    filter.appendChild(option);
                });
                if (Array.from(filter.options).some(function (option) { return option.value === previous; })) {
                    filter.value = previous;
                }
            }
            const activeCourse = filter ? filter.value : "";
            const finalRecords = records.filter(function (record) {
                return !activeCourse || record.courseKey === activeCourse;
            });
            list.innerHTML = "";
            finalRecords.forEach(function (record) {
                list.appendChild(renderStudentSyllabusRow(record));
            });
            list.hidden = finalRecords.length === 0;
            empty.hidden = finalRecords.length > 0;
            if (count) {
                count.textContent = String(records.length);
            }
        }
        catch (error) {
            console.error("Unable to load shared course syllabi:", error);
            const heading = empty.querySelector("h3");
            const message = empty.querySelector("p");
            if (heading) heading.textContent = "Syllabi could not be loaded";
            if (message) message.textContent = "Refresh the page or sign in again to retry.";
        }
    }

    document.addEventListener("change", async function (event) {
        if (event.target && event.target.id === "syllabusFile") {
            const file = event.target.files && event.target.files[0];
            if (!file)
                return;
            const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
            if (!isPDF) {
                window.alert("Please choose a PDF syllabus.");
                return;
            }
            try {
                const syllabus = await saveSharedSyllabus(file);
                showFacultySyllabus(syllabus);
            } catch (error) {
                console.error("Unable to share syllabus with students:", error);
                window.alert(error.message || "Syllabus upload failed.");
            }
        }
    }, true);

    document.addEventListener("click", async function (event) {
        const viewButton = event.target.closest("#viewSyllabusButton");
        const downloadButton = event.target.closest("#downloadSyllabusButton");
        const targetButton = viewButton || downloadButton;
        if (targetButton && targetButton.dataset.signedUrl) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (viewButton) {
                window.open(targetButton.dataset.signedUrl, "_blank", "noopener");
            } else {
                const link = document.createElement("a");
                link.href = targetButton.dataset.signedUrl;
                link.download = document.getElementById("syllabusFileName")?.textContent || "Course_Syllabus.pdf";
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            return;
        }

        const button = event.target && event.target.closest
            ? event.target.closest("#confirmDeleteSyllabus")
            : null;
        const deleteOption = event.target.closest("#deleteSyllabusOption");
        if (!button && !deleteOption)
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (deleteOption && !window.confirm("Are you sure you want to delete this syllabus?")) {
            return;
        }
        try {
            await deleteSharedSyllabus();
            showFacultySyllabus(null);
            const modal = document.getElementById("deleteSyllabusModal");
            if (modal) {
                modal.classList.remove("show");
                modal.setAttribute("aria-hidden", "true");
            }
        } catch (error) {
            console.error("Unable to remove shared syllabus:", error);
            window.alert(error.message || "Syllabus could not be deleted.");
        }
    }, true);

    document.addEventListener("DOMContentLoaded", function () {
        const filter = document.getElementById("studentCourseSort");
        if (filter && filter.dataset.sharedSyllabusInitialized !== "true") {
            filter.dataset.sharedSyllabusInitialized = "true";
            filter.addEventListener("change", renderStudentSharedSyllabi);
        }
        renderStudentSharedSyllabi();
        loadFacultySyllabus();
    });
    if (facultySection) facultySection.addEventListener("change", loadFacultySyllabus);
})();

(function () {
    const empty = document.getElementById("studentCoursesEmpty");
    const list = document.getElementById("studentCoursesList");
    if (!empty || !list) {
        return;
    }

    function showEmptyState(title, message) {
        empty.querySelector("h3").textContent = title;
        empty.querySelector("p").textContent = message;
        empty.hidden = false;
        list.hidden = true;
    }

    fetch("/api/student/courses", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
    })
        .then(async function (response) {
            const contentType = response.headers.get("content-type") || "";
            if (!response.ok || !contentType.includes("application/json")) {
                throw new Error("Student courses could not be loaded.");
            }
            return response.json();
        })
        .then(function (data) {
            if (!data.profile_complete) {
                showEmptyState(
                    "Student profile not set up",
                    "A student profile is required before courses can be assigned."
                );
                return;
            }

            const courses = Array.isArray(data.courses) ? data.courses : [];
            if (!courses.length) {
                showEmptyState(
                    "No active enrollments",
                    "Your courses will appear here after you are enrolled in a section."
                );
                return;
            }

            list.replaceChildren();
            courses.forEach(function (course) {
                const row = document.createElement("div");
                row.className = "so-course-enrollment-row";

                const info = document.createElement("div");
                info.className = "so-course-enrollment-info";

                const title = document.createElement("strong");
                title.textContent = course.course_code + " - " + course.course_title;

                const details = document.createElement("span");
                details.textContent = [course.section_name, course.academic_year_name]
                    .filter(Boolean)
                    .join(" - ");

                const status = document.createElement("span");
                status.className = "so-course-enrollment-status";
                status.textContent = "Active";

                info.append(title, details);
                row.append(info, status);
                list.appendChild(row);
            });

            empty.hidden = true;
            list.hidden = false;
        })
        .catch(function (error) {
            console.error("Unable to load student courses:", error);
            showEmptyState(
                "Courses could not be loaded",
                "Refresh the page or sign in again to retry."
            );
        });
})();

(function () {
    const courseSelect = document.getElementById("facultyCourse");
    const sectionSelect = document.getElementById("facultySection");
    const yearSelect = document.getElementById("facultyYear");
    const termSelect = document.getElementById("facultyTerm");
    const status = document.getElementById("facultyAssignmentStatus");

    if (!courseSelect || !sectionSelect || !yearSelect) {
        return;
    }

    sectionSelect.disabled = true;
    yearSelect.disabled = true;

    let assignments = [];

    function setOptions(select, placeholder, options) {
        select.replaceChildren(new Option(placeholder, ""));
        options.forEach(function (item) {
            select.add(new Option(item.label, item.value));
        });
    }

    function selectedCourseAssignments() {
        return assignments.filter(function (item) {
            return item.course_id === courseSelect.value;
        });
    }

    function refreshSections() {
        const selectedYear = yearSelect.value;
        const matchingSections = selectedCourseAssignments().filter(function (item) {
            return !selectedYear || item.academic_year_id === selectedYear;
        });

        setOptions(
            sectionSelect,
            matchingSections.length ? "Select Section" : "No sections available",
            matchingSections.map(function (item) {
                const yearLabel = item.academic_year_name
                    ? " - " + item.academic_year_name
                    : "";
                return {
                    value: item.section_id,
                    label: item.section_name + yearLabel
                };
            })
        );
        sectionSelect.disabled = matchingSections.length === 0;
    }

    courseSelect.addEventListener("change", function () {
        const years = new Map();
        selectedCourseAssignments().forEach(function (item) {
            if (item.academic_year_id && item.academic_year_name) {
                years.set(item.academic_year_id, item.academic_year_name);
            }
        });

        setOptions(yearSelect, "Select School Year", Array.from(years, function (entry) {
            return { value: entry[0], label: entry[1] };
        }));
        yearSelect.disabled = years.size === 0;
        refreshSections();
    });

    yearSelect.addEventListener("change", refreshSections);

    sectionSelect.addEventListener("change", function () {
        const selected = assignments.find(function (item) {
            return item.section_id === sectionSelect.value;
        });
        if (selected && selected.academic_year_id) {
            yearSelect.value = selected.academic_year_id;
        }
    });

    if (termSelect) {
        setOptions(termSelect, "Academic terms not configured", []);
        termSelect.disabled = true;
    }

    fetch("/api/faculty/sections", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
    })
        .then(async function (response) {
            const contentType = response.headers.get("content-type") || "";
            if (!response.ok || !contentType.includes("application/json")) {
                throw new Error("Course assignments could not be loaded.");
            }
            return response.json();
        })
        .then(function (data) {
            assignments = Array.isArray(data.sections) ? data.sections : [];
            const courses = new Map();
            assignments.forEach(function (item) {
                courses.set(item.course_id, item.course_code + " - " + item.course_title);
            });

            setOptions(courseSelect, courses.size ? "Select Course" : "No assigned courses", Array.from(courses, function (entry) {
                return { value: entry[0], label: entry[1] };
            }));
            courseSelect.disabled = courses.size === 0;

            if (assignments.length === 1 && !courseSelect.value) {
                const assignment = assignments[0];
                courseSelect.value = assignment.course_id;
                courseSelect.dispatchEvent(new Event("change", { bubbles: true }));
                if (assignment.academic_year_id) {
                    yearSelect.value = assignment.academic_year_id;
                }
                sectionSelect.value = assignment.section_id;
                sectionSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }

            if (status) {
                status.textContent = courses.size
                    ? ""
                    : "No course sections are assigned to your faculty account yet.";
            }
        })
        .catch(function (error) {
            console.error(error);
            courseSelect.disabled = true;
            sectionSelect.disabled = true;
            yearSelect.disabled = true;
            setOptions(courseSelect, "Unable to load courses", []);
            if (status) {
                status.textContent = "Could not load course assignments. Refresh the page or sign in again.";
            }
        });
})();

(function () {
    const modal = document.getElementById('assessmentModal');
    const openBtn = document.getElementById('openAssessmentModal');

    if (!modal) return;

    const closeBtn = document.getElementById('closeAssessmentModal');
    const cancelBtn = document.getElementById('cancelAssessmentModal');
    const form = document.getElementById('assessmentForm');
    const tbody = document.getElementById('facultyAssessmentMappingBody');
    const coError = document.getElementById('assessmentCoError');
    const deleteModal = document.getElementById('deleteConfirmModal');
    const deleteMessage = document.getElementById('deleteConfirmMessage');
    const cancelDeleteBtn = document.getElementById('cancelDeleteAssessment');
    const confirmDeleteBtn = document.getElementById('confirmDeleteAssessment');
    const scoreModal = document.getElementById('scoreModal');
    const closeScoreBtn = document.getElementById('closeScoreModal');
    const cancelScoreBtn = document.getElementById('cancelScoreModal');
    const saveScoresBtn = document.getElementById('saveScoresBtn');
    const scoreAssessmentName = document.getElementById('scoreAssessmentName');
    const scoreMappedCos = document.getElementById('scoreMappedCos');
    const scoreMean = document.getElementById('scoreMean');
    const scoreTableBody = document.getElementById('scoreTableBody');

    // This script only applies to the faculty curriculum mapping page.
    if (!modal || !openBtn || !closeBtn || !cancelBtn || !form) return;

    let rowToDelete = null;
    let rowToEdit = null;

    function openModal() {
        rowToEdit = null;
        form.reset();
        coError.textContent = '';
        document.getElementById('assessmentModalTitle').textContent = 'Add Assessment';
        document.getElementById('assessmentCoHelper').textContent = 'Select one or more COs.';
        form.querySelector('.cm-assessment-save-btn').textContent = 'Add Assessment';
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cm-modal-open');
        document.getElementById('assessmentName').focus();
    }

    function closeModal() {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('cm-modal-open');
        form.reset();
        coError.textContent = '';
    }
    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal)
            closeModal();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('show'))
            closeModal();
    });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const selected = [...form.querySelectorAll('input[name="assessmentCO"]:checked')];
        if (!selected.length) {
            coError.textContent = 'Please select at least one course outcome.';
            return;
        }
        coError.textContent = '';
        const name = document.getElementById('assessmentName').value.trim();
        const type = document.getElementById('assessmentType').value;
        const dateValue = document.getElementById('assessmentDate').value;
        const date = dateValue
            ? new Date(dateValue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
        const coBadges = selected.map(item => '<span class="cm-co-badge">' + item.value + '</span>').join(' ');
        const rowHtml = '<td>' + name + '</td>' +
            '<td><span class="cm-type-badge">' + type + '</span></td>' +
            '<td>' + date + '</td>' +
            '<td>' + coBadges + '</td>' +
            '<td><button type="button" class="cm-view-score-btn">View Score</button></td>' +
            '<td><div class="cm-row-actions">' +
            '<button type="button" class="cm-action-btn cm-edit-btn">✎ Edit</button>' +
            '<button type="button" class="cm-action-btn cm-delete-btn">🗑 Delete</button>' +
            '</div></td>';
        if (rowToEdit) {
            rowToEdit.innerHTML = rowHtml;
            rowToEdit = null;
        }
        else {
            const row = document.createElement('tr');
            row.innerHTML = rowHtml;
            tbody.appendChild(row);
        }
        closeModal();
    });
    tbody.addEventListener('click', function (e) {
        const viewBtn = e.target.closest('.cm-view-score-btn');
        if (viewBtn) {
            const row = viewBtn.closest('tr');
            scoreAssessmentName.textContent = row.cells[0].textContent.trim();
            scoreMappedCos.textContent = [...row.cells[3].querySelectorAll('.cm-co-badge')].map(item => item.textContent.trim()).join(' • ');
            const scoreStudentCount = document.getElementById('scoreStudentCount');
            if (scoreStudentCount) {
                scoreStudentCount.textContent = String(scoreTableBody.querySelectorAll('tr').length);
            }
            recalculateScores();
            scoreModal.classList.add('show');
            scoreModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('cm-modal-open');
            return;
        }
        const editBtn = e.target.closest('.cm-edit-btn');
        if (editBtn) {
            rowToEdit = editBtn.closest('tr');
            const cells = rowToEdit.cells;
            document.getElementById('assessmentName').value = cells[0].textContent.trim();
            const type = cells[1].textContent.trim();
            document.getElementById('assessmentType').value = type === 'Laboratory' ? 'Laboratory Experiment' : type;
            const parsedDate = new Date(cells[2].textContent.trim());
            if (!Number.isNaN(parsedDate.getTime())) {
                const y = parsedDate.getFullYear();
                const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const d = String(parsedDate.getDate()).padStart(2, '0');
                document.getElementById('assessmentDate').value = y + '-' + m + '-' + d;
            }
            const mapped = [...cells[3].querySelectorAll('.cm-co-badge')].map(b => b.textContent.trim());
            form.querySelectorAll('input[name="assessmentCO"]').forEach(input => input.checked = mapped.includes(input.value));
            coError.textContent = '';
            document.getElementById('assessmentModalTitle').textContent = 'Edit Assessment';
            document.getElementById('assessmentCoHelper').textContent = 'Choose the CO(s) mapped to this assessment.';
            form.querySelector('.cm-assessment-save-btn').textContent = 'Save Changes';
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('cm-modal-open');
            const firstCo = form.querySelector('input[name="assessmentCO"]');
            if (firstCo) {
                firstCo.focus();
            }
            return;
        }
        const deleteBtn = e.target.closest('.cm-delete-btn');
        if (!deleteBtn)
            return;
        rowToDelete = deleteBtn.closest('tr');
        const assessmentName = rowToDelete.cells[0].textContent.trim();
        deleteMessage.textContent = 'Are you sure you want to delete ' + assessmentName + '?';
        deleteModal.classList.add('show');
        deleteModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cm-modal-open');
    });

    function recalculateScores() {
        const inputs = [...scoreTableBody.querySelectorAll('.cm-raw-score-input')];
        let total = 0;
        inputs.forEach(input => {
            let value = Number(input.value);
            if (!Number.isFinite(value))
                value = 0;
            value = Math.max(0, Math.min(100, value));
            input.value = value;
            input.closest('tr').querySelector('.cm-score-percent').textContent = Math.round(value) + '%';
            total += value;
        });
        scoreMean.textContent = (inputs.length ? Math.round(total / inputs.length) : 0) + '%';
    }

    function closeScoreModal() {
        scoreModal.classList.remove('show');
        scoreModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('cm-modal-open');
    }
    scoreTableBody.addEventListener('input', function (e) {
        if (e.target.classList.contains('cm-raw-score-input'))
            recalculateScores();
    });
    closeScoreBtn.addEventListener('click', closeScoreModal);
    cancelScoreBtn.addEventListener('click', closeScoreModal);
    saveScoresBtn.addEventListener('click', function () {
        recalculateScores();
        closeScoreModal();
    });
    scoreModal.addEventListener('click', function (e) {
        if (e.target === scoreModal)
            closeScoreModal();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && scoreModal.classList.contains('show'))
            closeScoreModal();
    });

    function closeDeleteModal() {
        deleteModal.classList.remove('show');
        deleteModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('cm-modal-open');
        rowToDelete = null;
    }
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', function (e) {
        if (e.target === deleteModal)
            closeDeleteModal();
    });
    confirmDeleteBtn.addEventListener('click', function () {
        if (rowToDelete)
            rowToDelete.remove();
        closeDeleteModal();
    });

    document.addEventListener('keydown', function (e) {
        if (
            e.key === 'Escape' &&
            deleteModal.classList.contains('show')
        )
            closeDeleteModal();
    });
})();

/* CM FACULTY — STUDENT ATTAINMENT VIEW + CQI BASIS */
(function () {
    const body = document.getElementById('facultyStudentsAttainmentBody');
    const detailModal = document.getElementById('attainmentDetailModal');
    const cqiModal = document.getElementById('cqiBasisModal');
    if (!body || !detailModal || !cqiModal)
        return;
    const coNames = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];

    function rowData(row) {
        const cells = row.cells;
        const scores = coNames.map((co, index) => ({ co: co, value: parseInt(cells[index + 3].textContent, 10) || 0 }));
        return { id: cells[1].textContent.trim(), name: cells[2].textContent.trim(), status: cells[8].textContent.trim(), scores: scores };
    }

    function openAttainmentModal(modal) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cm-modal-open');
    }

    function closeAttainmentModal(modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.cm-attainment-modal.show'))
            document.body.classList.remove('cm-modal-open');
    }

    function scoreRows(scores, onlyCqi) {
        return scores
            .filter(item => !onlyCqi || item.value <= 59)
            .map(item => '<div class="cm-attainment-detail-row">' +
                '<strong>' + item.co + '</strong>' +
                '<span>' + item.value + '%</span>' +
                '<em class="' + (item.value <= 59 ? 'needs' : 'met') + '">' + (item.value <= 59 ? 'CQI Basis' : 'Met') + '</em>' +
                '</div>')
            .join('');
    }
    body.addEventListener('click', function (event) {
        const view = event.target.closest('.cm-attainment-view-btn');
        const cqi = event.target.closest('.cm-cqi-basis-btn');
        if (!view && !cqi)
            return;
        const data = rowData(event.target.closest('tr'));
        if (view) {
            document.getElementById('attainmentStudentId').textContent = data.id;
            document.getElementById('attainmentStudentName').textContent = data.name;
            document.getElementById('attainmentStudentStatus').textContent = data.status;
            document.getElementById('attainmentCoDetails').innerHTML = scoreRows(data.scores, false);
            openAttainmentModal(detailModal);
            return;
        }
        document.getElementById('cqiStudentId').textContent = data.id;
        document.getElementById('cqiStudentName').textContent = data.name;
        const failed = data.scores.filter(item => item.value <= 59);
        document.getElementById('cqiBasisDetails').innerHTML = failed.length
            ? scoreRows(failed, true)
            : '<div class="cm-cqi-empty">No CO is at 59% or below.</div>';
        openAttainmentModal(cqiModal);
    });
    document.querySelectorAll('[data-close-attainment]').forEach(button =>
        button.addEventListener('click', function () {
            closeAttainmentModal(document.getElementById(button.dataset.closeAttainment));
        })
    );
    [detailModal, cqiModal].forEach(modal => modal.addEventListener('click', function (event) {
        if (event.target === modal)
            closeAttainmentModal(modal);
    }));

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            [detailModal, cqiModal].forEach(modal => {
                if (modal.classList.contains('show'))
                    closeAttainmentModal(modal);
            });
        }
    });
})();

/* REQUIREMENT 3 — CLASS ROSTER STUDENT */
(function () {
    "use strict";
    const page = document.querySelector(".cr-student-page");
    if (!page)
        return;
    const body = document.getElementById("crRosterBody");
    const search = document.getElementById("crSearch");
    const sort = document.getElementById("crSort");
    const empty = document.getElementById("crEmpty");
    if (!body || !search || !sort)
        return;
    const originalRows = Array.from(body.querySelectorAll("tr"));

    function renumber(rows) {
        rows.forEach(function (row, index) {
            if (row.cells[0])
                row.cells[0].textContent = String(index + 1);
        });
    }

    function renderRoster() {
        const query = search.value.trim().toLowerCase();
        const mode = sort.value;
        const rows = originalRows.filter(function (row) {
            return row.textContent.toLowerCase().includes(query);
        });
        rows.sort(function (a, b) {
            const nameA = a.cells[1].textContent.trim().toLowerCase();
            const nameB = b.cells[1].textContent.trim().toLowerCase();
            if (mode === "za")
                return nameB.localeCompare(nameA);
            if (mode === "id") {
                return a.cells[0].textContent.trim().localeCompare(b.cells[0].textContent.trim(), undefined, { numeric: true });
            }
            return nameA.localeCompare(nameB);
        });
        body.replaceChildren();
        rows.forEach(function (row) {
            body.appendChild(row);
        });
        renumber(rows);
        if (empty)
            empty.hidden = rows.length !== 0;
    }
    search.addEventListener("input", renderRoster);
    sort.addEventListener("change", renderRoster);
    renderRoster();
})();

/* WEBSITE LOGIN ROLE DROPDOWN */
(function () {
    "use strict";

    function initializeWebsiteLoginDropdown() {
        const dropdown = document.getElementById("loginDropdown");
        const button = document.getElementById("loginDropdownButton");
        const menu = document.getElementById("loginDropdownMenu");
        if (!dropdown || !button || !menu) return;

        function setOpen(open) {
            dropdown.classList.toggle("open", open);
            menu.classList.toggle("show", open);
            button.setAttribute("aria-expanded", String(open));
        }

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            setOpen(!menu.classList.contains("show"));
        });

        document.addEventListener("click", function (event) {
            if (!dropdown.contains(event.target)) setOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && menu.classList.contains("show")) {
                setOpen(false);
                button.focus();
            }
        });

        menu.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () { setOpen(false); });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWebsiteLoginDropdown);
    } else {
        initializeWebsiteLoginDropdown();
    }
})();

/* RESOURCES — GUIDES, BLOGS, BROCHURES, FILTERS, AND POPUPS */
(function () {
    "use strict";

    const guides = [
        ["What are COs and SOs?", "Course Outcomes identify what students should demonstrate in a particular course. Student Outcomes represent broader competencies developed across a program.", "How alignment works", "A syllabus defines COs, learning activities help students practice them, and assessments collect evidence of attainment.", "What to check", "Confirm that every assessed outcome has suitable evidence and that activities match the intended level of learning."],
        ["Build an outcome map", "Begin with a Course Outcome, then identify the related Student Outcome(s) and the activities that measure learning.", "Use varied evidence", "Quizzes can check understanding; laboratory work, projects, and rubrics can demonstrate application and performance.", "Review mapping quality", "Look for unmapped outcomes, activities without clear learning purposes, and outcomes measured by only one weak assessment."],
        ["Understand grade visibility", "Draft grades are working records. Unpublished grades may be entered but are not yet released to students. Published grades are visible according to system permissions.", "Review before publishing", "Check assessment completeness, grading accuracy, and the applicable approval or verification process.", "Keep outcomes distinct", "A course grade summarizes performance, while outcome attainment focuses on evidence for specific competencies."],
        ["Turn evidence into CQI", "Continuous Quality Improvement starts by identifying an outcome that needs attention and examining its supporting assessment evidence.", "Plan a targeted response", "Adjust learning activities, assessment instructions, resources, or support based on the actual learning gap.", "Close the loop", "Document the action, assign responsibility, and compare attainment in the next assessment cycle."],
        ["Eight connected stages", "The workflow begins with syllabus and outcome setup, followed by curriculum mapping, roster enrollment, and raw assessment score entry.", "Measure and respond", "Attainment calculations reveal learning gaps; CQI planning translates those findings into improvement actions.", "Finalize evidence", "Gradebook verification and locking precede compliance reporting and the preparation of supporting records."],
        ["Choose the right workspace", "Students review their courses, available syllabi, published academic information, and outcome-related learning evidence.", "Faculty responsibilities", "Faculty manage class rosters, assessment activities, mapping, scores, and attainment review.", "Department Head oversight", "Department Heads examine consolidated results, review mapping, monitor attainment, and support CQI and compliance reporting."]
    ];

    const articles = [
        ["Why grades need context", "A final grade condenses many assessments into one number, but it cannot fully explain which competencies a student has demonstrated.", "Outcome attainment helps faculty identify strengths and gaps at the CO or SO level.", "Together, grades and outcome evidence support clearer feedback and more meaningful instructional decisions."],
        ["Mapping with purpose", "Curriculum mapping is more than attaching an outcome label to every activity.", "Useful mapping asks whether an assessment genuinely measures the stated skill and whether students have opportunities to practice it.", "Review gaps and overlaps regularly so alignment remains meaningful across courses and sections."],
        ["Responding to low attainment", "An outcome below target is a signal to investigate, not an automatic judgment about students or teaching.", "Review assessment design, task difficulty, student work, and instructional support before choosing an intervention.", "Document the planned change and evaluate whether the next cycle shows improvement."],
        ["From scores to decisions", "Raw scores become more useful when they are connected to assessments, Course Outcomes, and Student Outcomes.", "Patterns across activities can reveal where learning is strong and where evidence is insufficient.", "Faculty and academic leaders can use these patterns to prioritize follow-up and maintain traceable records."]
    ];

    const brochureTopics = [
        "Discover EduMetrics", "EduMetrics Assessment Workflow Brochure",
        "Course Outcomes & Student Outcomes", "Curriculum Mapping & Assessment Evidence",
        "Attainment & Continuous Quality Improvement", "Grades, Reporting & Academic Records"
    ];

    function initializeResources() {
        const page = document.querySelector(".rr-page");
        if (!page || page.dataset.resourcesInitialized === "true") return;
        page.dataset.resourcesInitialized = "true";

        const dialog = document.getElementById("rrDialog");
        if (!dialog) return;

        const panel = dialog.querySelector(".rr-dialog-panel");
        const title = dialog.querySelector("#rrDialogTitle");
        const label = dialog.querySelector("#rrDialogLabel");
        const content = dialog.querySelector("#rrDialogContent");
        const search = page.querySelector("#rrSearch");
        const cards = Array.from(page.querySelectorAll("#rrGuides .rr-card"));
        const filters = Array.from(page.querySelectorAll(".rr-filters [data-role]"));
        const empty = page.querySelector("#rrEmpty");
        let selectedRole = "all";
        let opener = null;

        function filterGuides() {
            const query = search ? search.value.trim().toLowerCase() : "";
            let visibleCount = 0;

            cards.forEach(function (card) {
                const roles = (card.dataset.roles || "all").split(/\s+/);
                const searchable = (card.dataset.search || card.textContent).toLowerCase();
                const matchesRole = selectedRole === "all" || roles.includes("all") || roles.includes(selectedRole);
                const visible = matchesRole && searchable.includes(query);
                card.hidden = !visible;
                if (visible) visibleCount++;
            });

            if (empty) empty.hidden = visibleCount > 0;
        }

        function closeDialog() {
            dialog.hidden = true;
            dialog.style.display = "none";
            document.body.classList.remove("rr-dialog-open");
            if (opener && opener.isConnected) opener.focus();
        }

        function openDialog(button, type, index) {
            const card = button.closest("article, .resources-brochure-card");
            const heading = card ? card.querySelector("h3") : null;
            const paragraphs = type === "guide" ? guides[index] : type === "blog" ? articles[index] : null;
            const name = heading ? heading.textContent.trim() : (brochureTopics[index] || "EduMetrics Resource");

            title.textContent = name;
            label.textContent = type === "guide" ? "LEARNING GUIDE" : type === "blog" ? "EDUMETRICS BLOG" : "BROCHURE PREVIEW";
            content.replaceChildren();

            if (paragraphs) {
                for (let i = 0; i < paragraphs.length; i += 2) {
                    const section = document.createElement("section");
                    const subtitle = document.createElement("h3");
                    const paragraph = document.createElement("p");
                    subtitle.textContent = paragraphs[i];
                    paragraph.textContent = paragraphs[i + 1] || "";
                    section.append(subtitle, paragraph);
                    content.appendChild(section);
                }
            } else {
                const description = card ? card.querySelector(".resources-brochure-copy p") : null;
                const paragraph = document.createElement("p");
                paragraph.textContent = description ? description.textContent.trim() : "Explore this EduMetrics resource topic.";
                content.appendChild(paragraph);
                const notice = document.createElement("p");
                notice.textContent = "This brochure topic is a preview. A dedicated brochure page has not yet been linked.";
                content.appendChild(notice);
            }

            opener = button;
            dialog.hidden = false;
            dialog.style.display = "grid";
            document.body.classList.add("rr-dialog-open");
            (panel || dialog).focus();
        }

        if (search) search.addEventListener("input", filterGuides);
        filters.forEach(function (button) {
            button.addEventListener("click", function () {
                selectedRole = button.dataset.role || "all";
                filters.forEach(function (item) {
                    const active = item === button;
                    item.classList.toggle("active", active);
                    item.setAttribute("aria-pressed", String(active));
                });
                filterGuides();
            });
        });

        page.addEventListener("click", function (event) {
            const button = event.target.closest("[data-guide], [data-brochure]");
            if (button && page.contains(button)) {
                event.preventDefault();
                const type = button.hasAttribute("data-guide") ? "guide" : button.hasAttribute("data-blog") ? "blog" : "brochure";
                const index = Number(button.dataset[type]);
                openDialog(button, type, index);
                return;
            }

            const viewAll = event.target.closest("#rrViewAll");
            if (viewAll) {
                const extra = page.querySelector("#rrExtra");
                if (!extra) return;
                extra.hidden = !extra.hidden;
                viewAll.textContent = extra.hidden ? "View 3 more articles ↓" : "Show fewer articles ↑";
                viewAll.setAttribute("aria-label", extra.hidden ? "Show three more blog articles" : "Hide additional blog articles");
                viewAll.setAttribute("aria-expanded", String(!extra.hidden));
            }
        });

        dialog.addEventListener("click", function (event) {
            if (event.target.closest("[data-rr-close]")) closeDialog();
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !dialog.hidden) closeDialog();
        });

        filterGuides();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeResources, { once: true });
    } else {
        initializeResources();
    }
})();

/* WORKFLOW — CQI STORY MODAL */
(function () {
    "use strict";

    const dialog = document.getElementById("wfStoryDialog");
    const openButton = document.getElementById("wfStoryOpen");
    if (!dialog || !openButton) return;

    openButton.addEventListener("click", function () {
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        } else {
            dialog.setAttribute("open", "");
        }
    });

    ["wfStoryClose", "wfStoryDone"].forEach(function (id) {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener("click", function () {
                if (dialog.close) dialog.close();
                else dialog.removeAttribute("open");
            });
        }
    });

    dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
            if (typeof dialog.close === "function") dialog.close();
            else dialog.removeAttribute("open");
        }
    });
})();

/* RESOURCES: BLOG CAROUSEL */
(function () {
    "use strict";

    function initializeBlogCarousel() {
        const carousel = document.getElementById("rrBlogCarousel");
        if (!carousel || carousel.dataset.initialized === "true") return;

        const slides = Array.from(carousel.querySelectorAll("[data-blog-slide]"));
        const previousButton = document.getElementById("rrBlogPrev");
        const nextButton = document.getElementById("rrBlogNext");
        const status = document.getElementById("rrCarouselStatus");

        if (!slides.length || !previousButton || !nextButton || !status) return;

        carousel.dataset.initialized = "true";
        const total = slides.reduce((count, slide) => count + slide.querySelectorAll(".rr-card").length, 0);
        let currentSlide = 0;

        function showSlide(index) {
            currentSlide = Math.max(0, Math.min(index, slides.length - 1));

            slides.forEach(function (slide, slideIndex) {
                slide.hidden = slideIndex !== currentSlide;
            });

            previousButton.disabled = currentSlide === 0;
            nextButton.disabled = currentSlide === slides.length - 1;

            const first = slides.slice(0, currentSlide).reduce(function (count, slide) {
                return count + slide.querySelectorAll(".rr-card").length;
            }, 0) + 1;
            const last = first + slides[currentSlide].querySelectorAll(".rr-card").length - 1;
            status.textContent = first + "–" + last + " of " + total;
        }

        previousButton.addEventListener("click", function () {
            showSlide(currentSlide - 1);
        });

        nextButton.addEventListener("click", function () {
            showSlide(currentSlide + 1);
        });

        showSlide(0);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeBlogCarousel);
    } else {
        initializeBlogCarousel();
    }
})();


/* Set the dashboard role only after the existing OTP verification completes.
   This is UI routing for the local prototype, not server-side authorization. */
(function () {
    if (sessionStorage.getItem('verificationCompleted') !== 'true') return;
    const role = sessionStorage.getItem('verifiedRole') || sessionStorage.getItem('verificationRole');
    const normalized = role === 'department-head' ? 'dept-head' : role;
    if (['student', 'faculty', 'dept-head'].includes(normalized)) {
        sessionStorage.setItem('edumetricsRole', normalized);
    }
})();

/* MERGED DASHBOARD: STUDENT / FACULTY / DEPARTMENT HEAD */
(function () {
    // Login must set sessionStorage.edumetricsRole before navigating here.
    // ?role=... is supported for direct preview and development.
    const allowed = ['student', 'faculty', 'dept-head'];
    const query = new URLSearchParams(location.search).get('role');
    const normalize = v => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'depthead': 'dept-head', 'head': 'dept-head' }[v] || v);
    const role = normalize(sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('verifiedRole') || query || 'student');
    const selected = allowed.includes(role) ? role : 'student';
    if (!sessionStorage.getItem('edumetricsRole') && sessionStorage.getItem('verificationCompleted') === 'true') sessionStorage.setItem('edumetricsRole', selected);
    const tpl = document.getElementById('dashboard-template-' + selected);
    document.getElementById('dashboardRoleContent').appendChild(tpl.content.cloneNode(true));
    if (selected !== 'student') {
        const nav = document.getElementById('nav-template-' + selected);
        document.querySelector('.so-nav').replaceWith(nav.content.cloneNode(true));
    }
    const names = { student: ['Student', 'Student'], faculty: ['Prof. Maria', 'Faculty'], 'dept-head': ['Department Head', 'Department Head'] };
    const user = document.querySelector('.so-user-info');
    user.querySelector('strong').textContent = names[selected][0];
    user.querySelector('span').textContent = names[selected][1];
    document.title = names[selected][1] + ' Dashboard | EduMetrics';
    document.body.dataset.dashboardRole = selected;
})();

/* Dashboard interactions: filter, reactions, comments and reader */
(function () {
    const filter = document.getElementById('sdCourseFilter');
    const feed = document.getElementById('sdPosts');
    if (!feed) return;
    const posts = Array.from(feed.querySelectorAll('.sd-post'));
    const empty = document.getElementById('sdEmpty');
    const reader = document.getElementById('sdReader');
    const readerContent = document.getElementById('sdReaderContent');
    const readerMeta = document.getElementById('sdReaderMeta');
    const closeReaderButton = document.getElementById('sdReaderClose');
    let readerFontSize = 18;
    let previousFocus = null;
    const storageKey = 'edumetrics-dashboard-interactions-v1';
    let state = {};
    try { state = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) { state = {}; }
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { } }
    function dataFor(id) {
        if (!state[id] || typeof state[id] !== 'object') state[id] = { liked: false, comments: [] };
        if (!Array.isArray(state[id].comments)) state[id].comments = [];
        return state[id];
    }
    function updateReaction(post) {
        const data = dataFor(post.dataset.postId);
        const button = post.querySelector('[data-action="react"]');
        button.setAttribute('aria-pressed', String(Boolean(data.liked)));
        button.querySelector('span').textContent = data.liked ? 'Liked' : 'Like';
    }
    function renderComments(post) {
        const list = post.querySelector('.sd-comment-list');
        list.replaceChildren();
        const comments = dataFor(post.dataset.postId).comments;
        if (!comments.length) {
            const hint = document.createElement('div');
            hint.className = 'sd-comment';
            hint.textContent = 'No comments yet. Be the first to comment.';
            list.append(hint);
        }
        comments.forEach(function (entry) {
            const item = document.createElement('div');
            item.className = 'sd-comment';
            const name = document.createElement('strong');
            name.textContent = 'You';
            const content = document.createElement('span');
            content.textContent = entry;
            item.append(name, content);
            list.append(item);
        });
        const count = post.querySelector('[data-action="comments"]');
        count.querySelector('span').textContent = 'Comment' + (comments.length ? ' (' + comments.length + ')' : '');
    }
    posts.forEach(function (post) { updateReaction(post); renderComments(post); });
    filter.addEventListener('change', function () {
        let visible = 0;
        posts.forEach(function (post) {
            const show = filter.value === 'all' || post.dataset.course === filter.value;
            post.hidden = !show;
            if (show) visible++;
        });
        empty.hidden = visible !== 0;
        feed.scrollTop = 0;
    });
    function stopSpeech() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    function closeReader() {
        stopSpeech();
        reader.hidden = true;
        document.body.style.overflow = '';
        if (previousFocus) previousFocus.focus();
    }
    function openReader(post) {
        previousFocus = document.activeElement;
        const author = post.querySelector('.sd-post-author strong').textContent;
        const course = post.querySelector('.sd-post-author small').textContent;
        const title = post.querySelector('.sd-post-body strong').textContent;
        const message = post.querySelector('.sd-post-body p').textContent;
        const attachment = post.querySelector('.sd-attachment');
        readerContent.replaceChildren();
        const heading = document.createElement('h3');
        heading.textContent = title;
        const body = document.createElement('p');
        body.textContent = message;
        readerContent.append(heading, body);
        if (attachment) {
            const file = document.createElement('p');
            file.textContent = 'Attachment: ' + attachment.textContent.trim();
            readerContent.append(file);
        }
        readerMeta.textContent = author + ' · ' + course;
        readerFontSize = 18;
        readerContent.style.fontSize = readerFontSize + 'px';
        reader.hidden = false;
        document.body.style.overflow = 'hidden';
        closeReaderButton.focus();
    }
    feed.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const post = button.closest('.sd-post');
        const action = button.dataset.action;
        if (action === 'react') {
            const data = dataFor(post.dataset.postId);
            data.liked = !data.liked;
            updateReaction(post);
            save();
        } else if (action === 'comments') {
            const panel = post.querySelector('.sd-comments');
            panel.hidden = !panel.hidden;
            if (!panel.hidden) post.querySelector('.sd-comment-input').focus();
        } else if (action === 'reader') {
            openReader(post);
        }
    });
    feed.addEventListener('submit', function (event) {
        const form = event.target.closest('.sd-comment-form');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('.sd-comment-input');
        const value = input.value.trim();
        if (!value) return;
        const post = form.closest('.sd-post');
        dataFor(post.dataset.postId).comments.push(value.slice(0, 500));
        save();
        input.value = '';
        renderComments(post);
        input.focus();
    });
    closeReaderButton.addEventListener('click', closeReader);
    reader.addEventListener('click', function (event) { if (event.target === reader) closeReader(); });
    document.addEventListener('keydown', function (event) {
        if (reader.hidden) return;
        if (event.key === 'Escape') closeReader();
        if (event.key === 'Tab') {
            const controls = Array.from(reader.querySelectorAll('button'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    document.getElementById('sdReaderLarger').addEventListener('click', function () {
        readerFontSize = Math.min(30, readerFontSize + 2);
        readerContent.style.fontSize = readerFontSize + 'px';
    });
    document.getElementById('sdReaderSmaller').addEventListener('click', function () {
        readerFontSize = Math.max(14, readerFontSize - 2);
        readerContent.style.fontSize = readerFontSize + 'px';
    });
    document.getElementById('sdReaderSpeak').addEventListener('click', function () {
        if (!('speechSynthesis' in window)) { alert('Read aloud is not supported by this browser.'); return; }
        stopSpeech();
        const utterance = new SpeechSynthesisUtterance(readerMeta.textContent + '. ' + readerContent.innerText);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    });
    document.getElementById('sdReaderStop').addEventListener('click', stopSpeech);
})();

/* Department Head Class Roster: Add / Update / Import / Export */
(() => {
    const root = document.querySelector('.cr-dept-head-page'); if (!root) return; const $ = id => document.getElementById(id); let data = Array.from({ length: 31 }, (_, i) => ({ id: `2023-${String(11111 + i).padStart(5, '0')}`, name: ['Angel S. Villanueva', 'Bea M. Santos', 'Carl P. Reyes', 'Dana L. Cruz', 'Ella P. Ramos', 'Francis D. Garcia'][i % 6], email: `student${i + 1}@students.national-u.edu.ph`, section: ['COE232', 'COE231', 'COE233'][i % 3], faculty: i % 4 === 0 ? 'Prof. Maria Santos' : 'Engr. J. T. Leonen', category: ['Registered', 'Regular', 'Late Enrollee', 'Transferee'][i % 4], status: i < 21 ? 'Enrolled' : 'Not Enrolled' })); const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); const filtered = () => { let q = $('crdhSearch').value.trim().toLowerCase(), f = $('crdhFaculty').value, c = $('crdhCategory').value, s = $('crdhSection').value; return data.filter(x => (!q || [x.id, x.name, x.email].some(v => v.toLowerCase().includes(q))) && (f === 'All Faculty' || x.faculty === f) && (c === 'All Students' || x.category === c) && (s === 'All Sections' || x.section === s)).sort((a, b) => $('crdhSort').value === 'id' ? a.id.localeCompare(b.id) : $('crdhSort').value === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)); }; function render() { const rows = filtered(); $('crdhRows').innerHTML = rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.id)}</td><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.section)}</td><td>${esc(x.faculty)}</td><td><span class="crf-category">${esc(x.category)}</span></td><td><span class="crf-status ${x.status === 'Enrolled' ? 'enrolled' : 'pending'}">${esc(x.status)}</span></td><td><div class="crdh-actions"><button class="crdh-update" data-id="${esc(x.id)}">Update</button><button class="crdh-remove" data-id="${esc(x.id)}">Remove</button></div></td></tr>`).join('') || '<tr><td colspan="9">No matching students.</td></tr>'; $('crdhCount').textContent = `Showing ${rows.length} of ${data.length} demo records`; $('crdhTotal').textContent = data.length; $('crdhEnrolled').textContent = data.filter(x => x.status === 'Enrolled').length; $('crdhCourseTitle').textContent = $('crdhCourse').value === 'All Courses' ? 'Software Design - Lab' : $('crdhCourse').value; } ['crdhSearch', 'crdhFaculty', 'crdhCategory', 'crdhSort', 'crdhSection', 'crdhCourse', 'crdhSchoolYear', 'crdhDepartment', 'crdhProgram'].forEach(id => $(id).addEventListener('input', render)); $('crdhRows').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return; const i = data.findIndex(x => x.id === b.dataset.id); if (i < 0) return; if (b.classList.contains('crdh-update')) { openModal('update', data[i]); return; } else if (confirm('Remove this demo student record?')) { data.splice(i, 1); $('crdhNote').textContent = 'Demo record removed.'; } render(); }); const modal = $('crdhModal'), form = $('crdhRecordForm'); let editId = null; let previousFocus = null;
    function openModal(mode, record) {
        previousFocus = document.activeElement; editId = mode === 'update' ? record.id : null;
        form.reset(); $('crdhModalError').hidden = true;
        $('crdhModalTitle').textContent = editId ? 'Update Roster Record' : 'Add Roster Record';
        $('crdhModalSubmit').textContent = editId ? 'Save Changes' : 'Add Record';
        if (record) { for (const key of ['id', 'name', 'email', 'category', 'course', 'section', 'faculty', 'status']) if (form.elements[key]) form.elements[key].value = record[key] || (key === 'course' ? 'Software Design - Lab' : ''); }
        form.elements.id.disabled = !!editId; modal.hidden = false; modal.classList.add('show'); document.body.style.overflow = 'hidden';
        (editId ? form.elements.name : form.elements.id).focus();
    }
    function closeModal() { modal.hidden = true; modal.classList.remove('show'); document.body.style.overflow = ''; editId = null; if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
    $('crdhAdd').addEventListener('click', () => openModal('add'));
    $('crdhModalClose').addEventListener('click', closeModal);
    $('crdhModalCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (modal.hidden) return; if (e.key === 'Escape') closeModal(); if (e.key === 'Tab') { const nodes = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')].filter(x => x.offsetParent !== null); const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } });
    form.addEventListener('submit', e => {
        e.preventDefault(); if (!form.reportValidity()) return;
        const get = k => form.elements[k].value.trim();
        const item = { id: editId || get('id'), name: get('name'), email: get('email'), category: get('category'), course: get('course'), section: get('section'), faculty: get('faculty'), status: get('status') };
        const error = $('crdhModalError');
        if (!editId && data.some(x => x.id === item.id)) { error.textContent = 'Student ID already exists. Please enter a unique ID.'; error.hidden = false; return; }
        if (editId) { const index = data.findIndex(x => x.id === editId); if (index < 0) return; data[index] = { ...data[index], ...item }; }
        else data.push(item);
        $('crdhNote').textContent = editId ? 'Demo roster record updated.' : 'Demo roster record added.';
        closeModal(); render();
    });
    $('crdhDownload').addEventListener('click', () => { const keys = ['id', 'name', 'email', 'section', 'faculty', 'category', 'status']; const csv = [keys.join(','), ...filtered().map(x => keys.map(k => '"' + String(x[k]).replace(/"/g, '""') + '"').join(','))].join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'department-roster.csv'; a.click(); URL.revokeObjectURL(url); }); $('crdhImport').addEventListener('click', () => $('crdhFile').click()); $('crdhFile').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; const text = await file.text(); const lines = text.trim().split(/\r?\n/).slice(1); let count = 0; for (const line of lines) { const cols = line.split(',').map(v => v.trim().replace(/^"|"$/g, '')); if (cols.length < 2 || !cols[0] || data.some(x => x.id === cols[0])) continue; data.push({ id: cols[0], name: cols[1], email: cols[2] || '', section: cols[3] || 'COE232', faculty: cols[4] || 'Engr. J. T. Leonen', category: cols[5] || 'Registered', status: cols[6] === 'Enrolled' ? 'Enrolled' : 'Not Enrolled' }); count++; } $('crdhNote').textContent = `Imported ${count} demo records. CSV parser supports simple rows (not quoted commas).`; e.target.value = ''; render(); }); render();
})();

(function initRaDepartmentHeadTabs() {
    function setup() {
        // Tabs are handled by the existing shared .sodh-tab / data-tab handler.
        if (!document.getElementById('ra-review-table')) return;

        const rows = Array.from(document.querySelectorAll('#ra-review-table tbody tr'));
        const search = document.getElementById('ra-search');
        const status = document.getElementById('ra-status-filter');
        const course = document.getElementById('ra-course');
        const faculty = document.getElementById('ra-faculty');
        function filter() {
            const q = (search?.value || '').toLowerCase();
            const st = status?.value || '';
            const c = course?.value || '';
            const f = faculty?.value || '';
            rows.forEach(row => {
                row.hidden = !(row.textContent.toLowerCase().includes(q)
                    && (!st || row.dataset.status === st)
                    && (!c || row.dataset.course === c)
                    && (!f || row.dataset.faculty === f));
            });
        }
        [search, status, course, faculty].forEach(el => {
            if (el) el.addEventListener(el === search ? 'input' : 'change', filter);
        });
        const dialog = document.getElementById('ra-dialog');
        document.querySelectorAll('[data-view],[data-query]').forEach(button => {
            button.addEventListener('click', () => {
                if (!dialog || typeof dialog.showModal !== 'function') return;
                const query = button.dataset.query;
                const title = document.getElementById('ra-dialog-title');
                const body = document.getElementById('ra-dialog-body');
                if (!title || !body) return;
                title.textContent = query ? 'Faculty Query (Demo)' : 'Assessment Scores (View Only)';
                body.textContent = query
                    ? `Prepare a query for ${query.split('|')[1]} regarding ${query.split('|')[0]}. Sending requires a backend connection.`
                    : `${button.dataset.view}: detailed student scores will appear here when connected to assessment records.`;
                dialog.showModal();
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup, { once: true });
    } else {
        setup();
    }
})();
document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.ac-tab');
    const panels = { scores: document.getElementById('ac-scores'), attainment: document.getElementById('ac-attainment') };
    tabs.forEach(tab => tab.addEventListener('click', () => {
        tabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); });
        Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== tab.dataset.acTab; });
    }));
    const search = document.getElementById('ac-score-search');
    const type = document.getElementById('ac-score-type');
    const sort = document.getElementById('ac-score-sort');
    const body = document.getElementById('ac-score-rows');
    const rows = [...body.querySelectorAll('tr')];
    const update = () => {
        const term = search.value.trim().toLowerCase();
        const selectedType = type.value;
        const order = sort.value;
        const ordered = [...rows].sort((a, b) => order === 'assessment' ? a.cells[0].textContent.localeCompare(b.cells[0].textContent) : order === 'oldest' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date));
        let visible = 0;
        ordered.forEach(row => { const show = row.textContent.toLowerCase().includes(term) && (selectedType === 'all' || row.dataset.type === selectedType); row.hidden = !show; if (show) visible++; body.appendChild(row); });
        document.getElementById('ac-score-empty').hidden = visible !== 0;
    };
    [search, type, sort].forEach(el => el.addEventListener(el === search ? 'input' : 'change', update));
});

// Faculty Courses: page-scoped creation; demo-only until a backend is connected.
(function () { function init() { const dialog = document.getElementById('fcCreateDialog'), form = document.getElementById('fcCreateForm'), grid = document.getElementById('facultyCourseGrid'); if (!dialog || !form || !grid) return; const open = document.getElementById('fcOpenCreate'); const close = () => dialog.close(); open?.addEventListener('click', () => dialog.showModal()); document.getElementById('fcCloseCreate')?.addEventListener('click', close); document.getElementById('fcCancelCreate')?.addEventListener('click', close); dialog.addEventListener('click', e => { if (e.target === dialog) close() }); form.addEventListener('submit', e => { e.preventDefault(); if (!form.reportValidity()) return; const data = new FormData(form), code = String(data.get('code')).trim(), title = String(data.get('title')).trim(), section = String(data.get('section')).trim(), term = String(data.get('term')); if (!code || !title || !section) return; const article = document.createElement('article'); article.className = 'sc-course-card'; const top = document.createElement('div'); top.className = 'sc-card-top'; const icon = document.createElement('span'); icon.className = 'sc-course-icon'; icon.textContent = code.slice(0, 2).toUpperCase(); const status = document.createElement('span'); status.className = 'sc-enrolled'; status.textContent = 'NEW COURSE'; top.append(icon, status); const body = document.createElement('div'); body.className = 'sc-course-body'; const label = document.createElement('span'); label.className = 'sc-course-code'; label.textContent = code + ' · ' + term; const heading = document.createElement('h2'); heading.textContent = title; const info = document.createElement('p'); info.className = 'sc-faculty'; info.textContent = 'Assigned faculty · You'; const sec = document.createElement('p'); sec.className = 'sc-section'; sec.textContent = 'Section ' + section; body.append(label, heading, info, sec); const bottom = document.createElement('div'); bottom.className = 'sc-card-bottom'; const note = document.createElement('div'); note.className = 'sc-progress-top'; note.textContent = '0 enrolled students · Demo'; bottom.append(note); article.append(top, body, bottom); grid.prepend(article); const count = document.getElementById('facultyCourseCount'); if (count) count.textContent = String(grid.children.length).padStart(2, '0'); form.reset(); close() }) } if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init() })();
