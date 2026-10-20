/* AC Faculty: accessible attainment / assessment input tabs and breakdown */
(function () {
    function initAcFaculty() {
        const root = document.querySelector('.ac-faculty-page');
        if (!root || root.dataset.acFacultyInitialized === 'true') return;
        root.dataset.acFacultyInitialized = 'true';
        const tabs = Array.from(root.querySelectorAll('.ac-co-tabs [role="tab"]'));
        function activateTab(tab) {
            if (!tab) return;
            tabs.forEach(function (item) {
                const selected = item === tab;
                item.classList.toggle('active', selected);
                item.classList.toggle('is-active', selected);
                item.setAttribute('aria-selected', String(selected));
                item.tabIndex = selected ? 0 : -1;
                const panel = root.querySelector('#' + item.getAttribute('aria-controls'));
                if (panel) {
                    panel.hidden = !selected;
                    // Some shared faculty CSS overrides [hidden] with display rules.
                    panel.style.setProperty('display', selected ? 'block' : 'none', 'important');
                    panel.setAttribute('aria-hidden', String(!selected));
                }
            });
        }
        tabs.forEach(function (tab, index) {
            tab.setAttribute('type', 'button');
            tab.addEventListener('click', function () { activateTab(tab); });
            tab.addEventListener('keydown', function (event) {
                if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                activateTab(tabs[next]); tabs[next].focus();
            });
        });
        activateTab(tabs.find(function (tab) { return tab.getAttribute('aria-selected') === 'true'; }) || tabs[0]);

        const modal = root.querySelector('#ac-co-breakdown');
        const content = root.querySelector('#ac-co-breakdown-content');
        const closeButton = root.querySelector('.ac-co-dialog-close');
        const heading = root.querySelector('#ac-dialog-title');
        if (!modal || !content) return;
        // Keep the overlay outside the workspace scroll/stacking context.
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        let previousFocus = null;
        function closeModal() {
            if (modal.hidden) return;
            modal.hidden = true;
            document.body.classList.remove('ac-breakdown-open');
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        }
        document.addEventListener('click', function (event) {
            const button = event.target.closest('.ac-faculty-page .ac-co-action[data-co]');
            if (!button) return;
            event.stopImmediatePropagation();
            event.preventDefault();
            const row = button.closest('tr');
            if (!row) return;
            const cells = row.cells;
            const co = button.dataset.co;
            const description = cells[1]?.textContent.trim() || '';
            const attainment = cells[3]?.textContent.trim() || '';
            const target = cells[4]?.textContent.trim() || '';
            const status = cells[5]?.textContent.trim() || '';
            const assessments = [...cells[2].querySelectorAll('.ac-co-chip')].map(chip => chip.textContent.trim());
            heading.textContent = co + ' — Attainment Breakdown';
            content.replaceChildren();
            const intro = document.createElement('p');
            intro.className = 'ac-breakdown-description';
            intro.textContent = description;
            content.appendChild(intro);
            const grid = document.createElement('div');
            grid.className = 'ac-breakdown-grid';
            [['Calculated Attainment', attainment], ['Target', target], ['Status', status]].forEach(([label, value]) => {
                const item = document.createElement('div');
                item.className = 'ac-breakdown-stat';
                const small = document.createElement('span'); small.textContent = label;
                const strong = document.createElement('strong'); strong.textContent = value;
                item.append(small, strong); grid.appendChild(item);
            });
            content.appendChild(grid);
            const title = document.createElement('h3'); title.textContent = 'Assessments Contributing';
            content.appendChild(title);
            const list = document.createElement('ul'); list.className = 'ac-breakdown-assessments';
            assessments.forEach(name => {
                const item = document.createElement('li'); item.textContent = name;
                list.appendChild(item);
            });
            content.appendChild(list);
            const note = document.createElement('p'); note.className = 'ac-breakdown-note';
            note.textContent = 'Assessment weights and individual contribution calculations are not available in this demo.';
            content.appendChild(note);
            previousFocus = button;
            modal.hidden = false;
            document.body.classList.add('ac-breakdown-open');
            closeButton?.focus();
        }, true);
        closeButton?.addEventListener('click', closeModal);
        modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
        document.addEventListener('keydown', function (event) {
            if (modal.hidden) return;
            if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
            if (event.key === 'Tab') {
                const focusable = [...modal.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
                if (!focusable.length) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAcFaculty);
    else initAcFaculty();
})();



/* RP FACULTY — report index, previews, downloads and filters. */
(function () {
    'use strict';
    if (!document.querySelector('.rp-faculty-page')) return;
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const reports = {
        'SYL-COE232-2026': ['Course Syllabus Matrix', 'Approved syllabus and course outcome alignment.', ['Course: Software Design – Lab (COE232)', 'CO/SO alignment and assessment mapping', 'Syllabus status: Verified']],
        'GM-COE232-2026': ['Class Master Grading Sheet', 'Master grading sheet from the approved locked gradebook.', ['Course: Software Design – Lab (COE232)', 'Gradebook status: Locked', 'Detailed student grade records require authorized backend access.']],
        'CQI-COE232-2026': ['Automated CQI Action Report', 'Approved continuous quality improvement actions.', ['Unmet Course Outcome evidence', 'Interventions and action plans', 'Expected improvements and follow-up measures']]
    };
    const rows = () => Array.from(document.querySelectorAll('#rpRows tr'));
    const info = row => ({ id: row.dataset.id, type: row.dataset.type, status: row.dataset.status, course: row.cells[1]?.innerText.trim() || '', owner: row.cells[2]?.innerText.trim() || '', updated: row.cells[3]?.innerText.trim() || '', description: row.cells[5]?.innerText.trim() || '' });
    let selected = null;
    function preview(row) {
        selected = row;
        const d = info(row), r = reports[d.id] || [d.type, d.description, []];
        $('rpDialogTitle').textContent = r[0];
        $('rpDialogBody').innerHTML = '<p class="rp-preview-intro">' + esc(r[1]) + '</p><div class="rp-preview-meta">' + [['Report ID', d.id], ['Course / Section', d.course], ['Owner', d.owner], ['Updated', d.updated], ['Status', d.status]].map(([a, b]) => '<div class="rp-preview-field"><span>' + esc(a) + '</span><strong>' + esc(b) + '</strong></div>').join('') + '</div><section class="rp-preview-section"><h3>Report Contents</h3><ul class="rp-preview-bullet">' + r[2].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></section><p class="rp-preview-note">Demo preview only. Not an official academic document.</p>';
        const dialog = $('rpDialog'); if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
        if (!dialog.open) dialog.showModal();
    }
    function downloadFile(filename, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    function download(row) { const d = info(row), r = reports[d.id] || [d.type, d.description, []]; const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r[0]) + '</title><style>body{font:16px Arial;max-width:820px;margin:40px auto;color:#004179;line-height:1.6;padding:24px}header{border-bottom:5px solid #f4c300}h2{background:#ffedb3;padding:10px}</style></head><body><header><h1>EduMetrics — ' + esc(r[0]) + '</h1></header><p>' + esc(r[1]) + '</p><p><b>Report ID:</b> ' + esc(d.id) + '</p><p><b>Course:</b> ' + esc(d.course) + '</p><p><b>Owner:</b> ' + esc(d.owner) + '</p><p><b>Status:</b> ' + esc(d.status) + '</p><h2>Report Contents</h2><ul>' + r[2].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><p>Demo only — not an official academic record.</p></body></html>'; downloadFile(d.id + '-demo-report.html', html, 'text/html;charset=utf-8'); }
    function filter() { const q = ($('rpSearch')?.value || '').toLowerCase().trim(), type = $('rpType')?.value || 'all', status = $('rpStatus')?.value || 'all'; let visible = 0; rows().forEach(row => { const ok = row.textContent.toLowerCase().includes(q) && (type === 'all' || row.dataset.type === type) && (status === 'all' || row.dataset.status === status); row.hidden = !ok; if (ok) visible++; }); if ($('rpEmpty')) $('rpEmpty').hidden = visible > 0; }
    document.addEventListener('click', e => { const button = e.target.closest('button'); if (!button) return; const row = button.closest('#rpRows tr'); if (row && (button.matches('.rp-view,.rp-download'))) { e.preventDefault(); if (button.matches('.rp-view')) preview(row); else download(row); return; } if (button.id === 'rpClose' || button.id === 'rpDone') { $('rpDialog').close(); return; } if (button.id === 'rpDialogDownload' && selected) { download(selected); return; } if (button.id === 'rpExport') { const head = ['Report ID', 'Report Type', 'Course / Section', 'Owner', 'Updated', 'Status', 'Description']; const data = [head, ...rows().filter(r => !r.hidden).map(r => { const d = info(r); return [d.id, d.type, d.course, d.owner, d.updated, d.status, d.description] })]; downloadFile('faculty-compliance-report-index.csv', data.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv;charset=utf-8'); } }, true);
    document.addEventListener('input', e => { if (e.target.id === 'rpSearch') filter() }, true);
    document.addEventListener('change', e => { if (e.target.id === 'rpType' || e.target.id === 'rpStatus') filter() }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', filter, { once: true }); else filter();
})();

/* RP STUDENT — reliable, standalone delegated report actions (shared script.js) */
(function () {
    'use strict';
    const content = {
        'STU-SO-014': ['Student Outcome Statement Summary', 'Student Outcomes describe the competencies expected from the BS Computer Engineering program.', ['Program: BS Computer Engineering', 'Section reference: COE232', 'Published Student Outcome statements and individual attainment records will appear when connected to the institution.']],
        'STU-SYL-014': ['Course Syllabus Matrix', 'A course-level overview of syllabus topics and Course Outcome alignment.', ['CO1 — Apply fundamental software engineering principles.', 'CO2 — Design and analyze software requirements.', 'CO3 — Apply advanced software design patterns.', 'CO4 — Implement and test software solutions in a laboratory environment.']],
        'STU-CQI-014': ['CQI Action Report', 'Student-visible Continuous Quality Improvement actions for the selected course.', ['Review the latest course announcements and improvement activities.', 'Use assigned resources to improve below-target outcomes.', 'Approved institutional CQI action details require backend integration.']]
    };
    const byId = id => document.getElementById(id);
    const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function record(row) {
        const c = row.cells;
        return { id: row.dataset.id || '', type: row.dataset.type || '', course: c[1]?.querySelector('strong')?.textContent.trim() || '', section: c[1]?.querySelector('small')?.textContent.trim() || '', owner: c[2]?.textContent.trim() || '', updated: c[3]?.textContent.trim() || '', status: row.dataset.status || '', description: c[5]?.textContent.trim() || '' };
    }
    function report(row) {
        const d = record(row), details = content[d.id] || [d.type, d.description, []];
        return { d, title: details[0], intro: details[1], items: details[2] };
    }
    let activeRow = null;
    function getDialog() {
        let dialog = byId('rpDialog');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'rpDialog'; dialog.className = 'rp-dialog';
            dialog.innerHTML = '<div class="rp-dialog-top"><h2 id="rpDialogTitle">Report Preview</h2><button type="button" id="rpClose" aria-label="Close preview">×</button></div><div id="rpDialogBody"></div><div class="rp-dialog-actions"><button type="button" class="rp-outline-btn" id="rpDialogDownload">Download Report</button><button type="button" class="rp-primary-btn" id="rpDone">Close</button></div>';
        }
        if (dialog.parentNode !== document.body) document.body.appendChild(dialog);
        return dialog;
    }
    function openPreview(row) {
        const dialog = getDialog(), r = report(row);
        activeRow = row;
        const title = byId('rpDialogTitle'), body = byId('rpDialogBody');
        if (!title || !body) return;
        title.textContent = r.title;
        body.innerHTML = '<p class="rp-preview-intro">' + safe(r.intro) + '</p><div class="rp-preview-meta">' +
            [['Report ID', r.d.id], ['Course / Program', r.d.course], ['Section', r.d.section], ['Owner / Scope', r.d.owner], ['Updated', r.d.updated], ['Status', r.d.status]].map(([label, value]) => '<div class="rp-preview-field"><span>' + safe(label) + '</span><strong>' + safe(value) + '</strong></div>').join('') +
            '</div><section class="rp-preview-section"><h3>Report Contents</h3><div class="rp-preview-section-content"><ul class="rp-preview-bullet">' + r.items.map(item => '<li>' + safe(item) + '</li>').join('') + '</ul></div></section><p class="rp-preview-note">Demo preview only — not an official academic record.</p>';
        dialog.removeAttribute('hidden');
        if (!dialog.open) {
            try { dialog.showModal(); } catch (_) { dialog.setAttribute('open', ''); }
        }
    }
    function closePreview() {
        const dialog = byId('rpDialog'); if (!dialog) return;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
    }
    function save(name, contents, type) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    function download(row) {
        const r = report(row);
        const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + safe(r.title) + '</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:36px auto;padding:24px;color:#063e73;line-height:1.6}header{border-bottom:5px solid #f4c300;padding-bottom:14px}h1{font-size:27px}h2{background:#fff0b7;padding:12px}li{margin:10px 0}.note{background:#eff6ff;padding:14px;border-left:4px solid #00477f}</style></head><body><header><strong>EduMetrics · Compliance Reports</strong><h1>' + safe(r.title) + '</h1><p>' + safe(r.intro) + '</p></header><p><strong>Report ID:</strong> ' + safe(r.d.id) + '</p><p><strong>Course:</strong> ' + safe(r.d.course) + ' · ' + safe(r.d.section) + '</p><p><strong>Owner / Scope:</strong> ' + safe(r.d.owner) + '</p><p><strong>Updated:</strong> ' + safe(r.d.updated) + '</p><h2>Report Contents</h2><ul>' + r.items.map(item => '<li>' + safe(item) + '</li>').join('') + '</ul><p class="note">Illustrative demo report only. Not an official certified academic record.</p></body></html>';
        save(r.d.id + '-demo-report.html', html, 'text/html;charset=utf-8');
    }
    function filter() {
        const body = byId('rpRows'); if (!body) return;
        const query = (byId('rpSearch')?.value || '').toLowerCase().trim();
        const type = byId('rpType')?.value || 'all', status = byId('rpStatus')?.value || 'all';
        let shown = 0;
        [...body.rows].forEach(row => { const d = record(row); const match = (row.textContent + ' ' + d.id).toLowerCase().includes(query) && (type === 'all' || type === d.type) && (status === 'all' || status === d.status); row.hidden = !match; if (match) shown++; });
        if (byId('rpEmpty')) byId('rpEmpty').hidden = shown > 0;
    }
    // Attach at document level: works regardless of when the page loads or where the buttons sit.
    document.addEventListener('click', event => {
        if (!document.body.classList.contains('rp-student-page')) return;
        const button = event.target.closest('button'); if (!button) return;
        const row = button.closest('#rpRows tr');
        if (row && (button.classList.contains('rp-view') || button.classList.contains('rp-download'))) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (button.classList.contains('rp-view')) openPreview(row); else download(row);
            return;
        }
        if (button.id === 'rpClose' || button.id === 'rpDone') { event.preventDefault(); closePreview(); }
        if (button.id === 'rpDialogDownload' && activeRow) { event.preventDefault(); download(activeRow); }
        if (button.id === 'rpExport') {
            event.preventDefault(); const rows = [...document.querySelectorAll('#rpRows tr')].filter(row => !row.hidden);
            const columns = [['Report ID', 'Type', 'Course', 'Section', 'Owner', 'Updated', 'Status', 'Description'], ...rows.map(row => { const d = record(row); return [d.id, d.type, d.course, d.section, d.owner, d.updated, d.status, d.description]; })];
            save('student-compliance-report-index.csv', columns.map(c => c.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv;charset=utf-8');
        }
    }, true);
    document.addEventListener('input', event => { if (event.target.id === 'rpSearch') filter(); }, true);
    document.addEventListener('change', event => { if (['rpType', 'rpStatus'].includes(event.target.id)) filter(); }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && byId('rpDialog')?.open) closePreview(); });
    function initialize() {
        document.querySelectorAll('.rp-student-page #rpRows .rp-actions button.rp-view, .rp-student-page #rpRows .rp-actions button.rp-download').forEach(button => {
            button.disabled = false;
            button.removeAttribute('aria-disabled');
        });
        filter();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
})();

/* AC Department Head: Gradebook navigation and tab controller (early, independent). */
(function () {
    "use strict";
    function activateGradebook(showGradebook) {
        var root = document.querySelector(".ac-dept-head-page");
        if (!root) return;
        var tabs = [document.getElementById("acDhTabAttainment"), document.getElementById("acDhTabApproval")];
        var panels = [document.getElementById("acDhPanelAttainment"), document.getElementById("acDhPanelApproval")];
        if (tabs.some(function (x) { return !x; }) || panels.some(function (x) { return !x; })) return;
        var selected = showGradebook ? 1 : 0;
        tabs.forEach(function (tab, i) {
            var active = i === selected;
            tab.classList.toggle("active", active);
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
            panels[i].hidden = !active;
            panels[i].setAttribute("aria-hidden", String(!active));
            panels[i].style.setProperty("display", active ? "block" : "none", "important");
        });
    }
    document.addEventListener("click", function (event) {
        var target = event.target.closest("#acDhTabApproval, #acDhTabAttainment, [data-ac-gradebook-link]");
        if (!target || !document.querySelector(".ac-dept-head-page")) return;
        // Sidebar Gradebook is a real page link; do not intercept navigation.
        if (target.hasAttribute("data-ac-gradebook-link")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        var gradebook = target.id === "acDhTabApproval";
        activateGradebook(gradebook);

    }, true);
    function initial() {
        if (location.hash === "#gradebook-approval") activateGradebook(true);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initial);
    else initial();
    window.addEventListener("hashchange", initial);
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

/* CQI Department Head — single evidence/review controller */
(function () {
    function initCQIDepartmentHead() {
        var page = document.querySelector('.cqi-dept-head-page');
        if (!page) return;
        var table = page.querySelector('#cqiDhTable');
        if (!table || !table.tBodies.length) return;
        var rows = Array.from(table.tBodies[0].rows);
        var search = page.querySelector('#cqiDhSearch');
        var course = page.querySelector('#cqiDhCourse');
        var status = page.querySelector('#cqiDhStatus');
        var topCourse = page.querySelector('#cqiDhCourseTop');
        var topSection = page.querySelector('#cqiDhSection');
        var dialog = page.querySelector('#cqiDhDialog');
        var details = page.querySelector('#cqiDhDialogDetails');
        var feedbackPanel = page.querySelector('#cqiDhFeedbackPanel');
        var mainActions = page.querySelector('#cqiDhMainActions');
        var notes = page.querySelector('#cqiDhReviewNotes');
        var validation = page.querySelector('#cqiDhValidation');
        var selected = null;
        function apply() {
            var term = search.value.trim().toLowerCase();
            var visible = 0;
            rows.forEach(function (row) {
                var match = (!term || (row.textContent + ' ' + row.dataset.id + ' ' + row.dataset.faculty).toLowerCase().includes(term)) &&
                    (!course.value || row.dataset.course === course.value) &&
                    (!status.value || row.dataset.status === status.value) &&
                    (!topCourse || !topCourse.value || row.dataset.course === topCourse.value) &&
                    (!topSection || !topSection.value || row.dataset.section === topSection.value);
                row.hidden = !match;
                if (match) visible++;
            });
            var empty = page.querySelector('#cqiDhEmpty');
            if (empty) empty.hidden = visible !== 0;
        }
        [search, course, status, topCourse, topSection].filter(Boolean).forEach(function (el) {
            el.addEventListener(el === search ? 'input' : 'change', apply);
        });
        var reviewStorageKey = 'edumetrics-cqi-dept-reviews-v1';
        function loadReviews() {
            try {
                var saved = JSON.parse(localStorage.getItem(reviewStorageKey) || '{}');
                rows.forEach(function (row) {
                    var state = saved[row.dataset.id];
                    if (!state) return;
                    if (state.status) row.dataset.status = state.status;
                    if (state.feedback) row.dataset.reviewNotes = state.feedback;
                    var badge = row.querySelector('.cqi-dh-status');
                    if (badge && state.status) {
                        badge.textContent = state.status;
                        badge.className = 'cqi-dh-status ' + state.status.toLowerCase().replace(/\s+/g, '-');
                    }
                });
            } catch (error) { /* Ignore disabled storage. */ }
        }
        function saveReview(row) {
            try {
                var saved = JSON.parse(localStorage.getItem(reviewStorageKey) || '{}');
                saved[row.dataset.id] = { status: row.dataset.status, feedback: row.dataset.reviewNotes || '' };
                localStorage.setItem(reviewStorageKey, JSON.stringify(saved));
            } catch (error) { /* Demo still works for this page load. */ }
        }
        function updateCounts() {
            [['cqiDhTotal', rows.length], ['cqiDhReview', rows.filter(function (r) { return r.dataset.status === 'Submitted'; }).length],
            ['cqiDhApproved', rows.filter(function (r) { return r.dataset.status === 'Approved'; }).length],
            ['cqiDhOngoing', rows.filter(function (r) { return r.dataset.status === 'Ongoing'; }).length]].forEach(function (item) {
                var el = page.querySelector('#' + item[0]);
                if (el) el.textContent = item[1];
            });
        }
        function closeDialog() {
            if (dialog.open && typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
        }
        function setReviewMode(enabled) {
            feedbackPanel.hidden = !enabled;
            mainActions.hidden = enabled;
            validation.hidden = true;
            if (enabled) notes.focus();
        }
        function addDetail(label, value) {
            var item = document.createElement('div');
            var full = ['Outcome Concern', 'Expected Improvement', 'Previous Review Feedback', 'Supporting Evidence'].includes(label);
            item.className = 'cqi-dh-detail' + (full ? ' cqi-dh-detail-wide' : '');
            var heading = document.createElement('span');
            heading.className = 'cqi-dh-detail-label';
            heading.textContent = label;
            var content = document.createElement('p');
            content.className = 'cqi-dh-detail-value';
            content.textContent = value || 'Not provided';
            item.append(heading, content);
            details.appendChild(item);
        }
        table.addEventListener('click', function (event) {
            var button = event.target.closest('button[data-action="evidence"]');
            if (!button) return;
            selected = button.closest('tr');
            if (!selected) return;
            var data = selected.dataset;
            details.replaceChildren();
            addDetail('CQI ID', data.id);
            addDetail('Course / Section', data.course + ' · ' + data.section);
            addDetail('Faculty', data.faculty);
            addDetail('CO Attainment', data.co + ' · ' + data.attainment + ' (Target ≥ ' + data.target + ')');
            addDetail('Outcome Concern', data.note);
            addDetail('Expected Improvement', data.goal);
            addDetail('Current Status', data.status);
            if (data.reviewNotes) addDetail('Previous Review Feedback', data.reviewNotes);
            addDetail('Supporting Evidence', 'No evidence files are connected in this demo.');
            notes.value = data.reviewNotes || '';
            setReviewMode(false);
            var editable = data.status === 'Submitted';
            page.querySelector('#cqiDhReviewAction').disabled = !editable;
            page.querySelector('#cqiDhApprove').disabled = !editable;
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        });
        function setStatus(next) {
            if (!selected) return;
            selected.dataset.status = next;
            var badge = selected.querySelector('.cqi-dh-status');
            if (badge) { badge.textContent = next; badge.className = 'cqi-dh-status ' + next.toLowerCase().replace(/\s+/g, '-'); }
            saveReview(selected);
            updateCounts();
            apply();
            closeDialog();
        }
        page.querySelector('#cqiDhReviewAction').addEventListener('click', function () { setReviewMode(true); });
        page.querySelector('#cqiDhBack').addEventListener('click', function () { setReviewMode(false); });
        page.querySelector('#cqiDhReturn').addEventListener('click', function () {
            if (!selected) return;
            var feedback = notes.value.trim();
            if (!feedback) { validation.hidden = false; notes.focus(); return; }
            selected.dataset.reviewNotes = feedback;
            setStatus('For Revision');
        });
        page.querySelector('#cqiDhApprove').addEventListener('click', function () { setStatus('Approved'); });
        ['cqiDhClose', 'cqiDhX'].forEach(function (id) { page.querySelector('#' + id).addEventListener('click', closeDialog); });
        dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
        loadReviews();
        updateCounts();
        apply();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCQIDepartmentHead);
    else initCQIDepartmentHead();
})();

/* CQI FACULTY — scoped CRUD demo controller (one initializer) */
(function () {
    'use strict';
    const page = document.querySelector('.cqi-faculty-page');
    if (!page) return;
    const $ = id => document.getElementById(id);
    const body = $('cqiFacultyRows'), modal = $('cqiFacultyModal'), deleteModal = $('cqiFacultyDeleteModal');
    const search = $('cqiFacultySearch'), status = $('cqiFacultyStatus'), feedback = $('cqiFacultyFeedback');
    let current = null, pendingDelete = null, returnFocus = null;
    const fields = { id: 'cqifId', course: 'cqifCourse', section: 'cqifSection', co: 'cqifCo', attainment: 'cqifAttainment', target: 'cqifTarget', note: 'cqifNote', goal: 'cqifGoal', status: 'cqifStatus' };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function show(which) { returnFocus = document.activeElement; which.hidden = false; document.body.style.overflow = 'hidden'; (which.querySelector('input,button'))?.focus(); }
    function close() { modal.hidden = true; deleteModal.hidden = true; document.body.style.overflow = ''; returnFocus?.focus(); }
    function updateSummary() {
        const rows = Array.from(body.rows);
        const below = new Set(rows.filter(row => {
            const value = parseFloat(row.dataset.attainment), target = parseFloat(row.dataset.target);
            return Number.isFinite(value) && Number.isFinite(target) && value < target;
        }).map(row => row.dataset.co));
        $('cqifDraftCount').textContent = String(rows.filter(row => row.dataset.status === 'draft').length);
        $('cqifBelowCount').textContent = String(below.size);
        $('cqifReviewCount').textContent = String(rows.filter(row => row.dataset.status === 'submitted').length);
    }
    function filter() { updateSummary(); const q = search.value.trim().toLowerCase(), s = status.value; let count = 0; Array.from(body.rows).forEach(row => { const ok = (!q || (row.textContent + ' ' + row.dataset.course + ' ' + row.dataset.section + ' ' + row.dataset.note).toLowerCase().includes(q)) && (s === 'all' || row.dataset.status === s); row.hidden = !ok; if (ok) count++; }); $('cqiFacultyEmpty').hidden = count > 0; }
    function edit(row) { current = row; Object.entries(fields).forEach(([key, id]) => { $(id).value = row ? row.dataset[key] || '' : key === 'status' ? 'draft' : ''; }); $('cqiFacultyModalTitle').textContent = row ? 'Edit CQI Plan' : 'Create CQI Plan'; show(modal); }
    function rowMarkup(d) { const state = d.status === 'submitted' ? 'Submitted' : 'Draft'; return '<td><strong>' + esc(d.id) + '</strong></td><td><strong>' + esc(d.co) + '</strong></td><td><strong>' + esc(d.attainment) + '</strong><small>Target ≥ ' + esc(d.target) + '</small></td><td>' + esc(d.note) + '</td><td>' + esc(d.goal) + '</td><td><span class="cqi-faculty-status is-' + esc(d.status) + '">' + state + '</span></td><td><div class="cqi-faculty-row-actions"><button type="button" data-cqif-edit><span aria-hidden="true">✎</span> Edit</button><button type="button" class="cqi-faculty-delete" data-cqif-delete><span aria-hidden="true">🗑</span> Delete</button></div></td>'; }
    $('cqiFacultyCreate').addEventListener('click', () => edit(null));
    body.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const row = b.closest('tr'); if (b.matches('[data-cqif-edit]')) edit(row); else if (b.matches('[data-cqif-delete]')) { pendingDelete = row; $('cqifDeleteName').textContent = row.dataset.id; show(deleteModal); } });
    $('cqiFacultyForm').addEventListener('submit', e => {
        e.preventDefault(); const d = {}; Object.entries(fields).forEach(([key, id]) => d[key] = $(id).value.trim()); if (!d.id || !d.course || !d.section || !d.co || !d.goal || !d.note || !d.attainment || !d.target) return;
        const collision = Array.from(body.rows).some(r => r !== current && r.dataset.id.toLowerCase() === d.id.toLowerCase()); if (collision) { $('cqifId').setCustomValidity('CQI ID already exists'); $('cqifId').reportValidity(); return; } $('cqifId').setCustomValidity('');
        const row = current || body.insertRow(); Object.entries(d).forEach(([key, value]) => row.dataset[key] = value); row.innerHTML = rowMarkup(d); feedback.textContent = current ? 'CQI plan updated in this demo.' : 'CQI plan created in this demo.'; close(); filter();
    });
    $('cqifId').addEventListener('input', () => { $('cqifId').setCustomValidity(''); });
    $('cqifDeleteConfirm').addEventListener('click', () => { if (pendingDelete) { pendingDelete.remove(); pendingDelete = null; feedback.textContent = 'CQI plan deleted from this demo.'; } close(); filter(); });
    document.querySelectorAll('[data-cqif-close]').forEach(b => b.addEventListener('click', close));
    [modal, deleteModal].forEach(m => m.addEventListener('click', e => { if (e.target === m) close(); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && (!modal.hidden || !deleteModal.hidden)) close(); });
    search.addEventListener('input', filter); status.addEventListener('change', filter); filter();
})();

/* CQI STUDENT — one scoped controller for search, status filter and read-only action modal. */
(function () {
    "use strict";
    const page = document.querySelector(".cqi-student-page");
    if (!page) return;
    const search = page.querySelector("#cqiStudentSearch");
    const status = page.querySelector("#cqiStudentStatus");
    const rows = Array.from(page.querySelectorAll("#cqiStudentRows tr"));
    const empty = page.querySelector("#cqiStudentEmpty");
    const modal = page.querySelector("#cqiStudentModal");
    let previousFocus = null;
    function filterRows() {
        const query = search.value.trim().toLowerCase();
        const selected = status.value;
        let visible = 0;
        rows.forEach(row => {
            const matches = row.textContent.toLowerCase().includes(query) &&
                (selected === "all" || row.dataset.status === selected);
            row.hidden = !matches;
            if (matches) visible++;
        });
        empty.hidden = visible > 0;
    }
    function closeModal() {
        if (modal.hidden) return;
        modal.hidden = true;
        document.body.style.overflow = "";
        if (previousFocus) previousFocus.focus();
    }
    function openModal(row) {
        const fields = {
            cqiDetailId: row.dataset.id,
            cqiDetailCourse: row.dataset.course + " · " + row.dataset.section,
            cqiDetailCo: row.dataset.co,
            cqiDetailGoal: row.dataset.goal,
            cqiDetailBasis: row.dataset.basis,
            cqiDetailPlan: row.dataset.plan
        };
        Object.entries(fields).forEach(([id, value]) => {
            const target = page.querySelector("#" + id);
            if (target) target.textContent = value || "—";
        });
        previousFocus = document.activeElement;
        modal.hidden = false;
        document.body.style.overflow = "hidden";
        modal.querySelector(".cqi-student-close").focus();
    }
    search.addEventListener("input", filterRows);
    status.addEventListener("change", filterRows);
    page.addEventListener("click", event => {
        const view = event.target.closest("[data-cqi-view]");
        if (view) {
            const row = view.closest("tr");
            if (row) openModal(row);
            return;
        }
        if (event.target.closest("[data-cqi-close]") || event.target === modal) closeModal();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.hidden) closeModal();
    });
    filterRows();
})();


/* SHARED CM STUDENT ATTAINMENT MODAL — both faculty and department head */
(function () {
    const page = document.querySelector('.cm-faculty-page, .cm-dept-head-page');
    if (!page) return;
    let overlay = null, previousFocus = null;
    const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (previousFocus) previousFocus.focus();
    }
    function open(row) {
        const cells = row.cells;
        const scores = (row.dataset.coScores || '').split(',').map(Number).filter(Number.isFinite);
        const known = scores.length;
        const met = scores.filter(v => v >= 70).length;
        const average = known ? Math.round(scores.reduce((a, b) => a + b, 0) / known) : null;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'cm-outcome-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.cm-outcome-close')) close(); });
            document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) close(); });
        }
        const rows = Array.from({ length: 10 }, (_, i) => {
            const value = scores[i], available = i < known;
            const status = !available ? 'Not recorded' : value >= 70 ? 'Met' : 'Needs Improvement';
            return '<div class="cm-outcome-detail-item"><strong>CO' + (i + 1) + '</strong>' +
                '<span class="cm-outcome-track"><span class="cm-outcome-fill" style="width:' + (available ? value : 0) + '%"></span></span>' +
                '<strong>' + (available ? value + '%' : '—') + '</strong><em>' + status + '</em></div>';
        }).join('');
        overlay.innerHTML = '<section class="cm-outcome-dialog" role="dialog" aria-modal="true" aria-labelledby="cmOutcomeTitle">' +
            '<div class="cm-outcome-modal-head"><div><h2 id="cmOutcomeTitle">Student Outcome Attainment</h2>' +
            '<p><strong>' + escapeHtml(cells[2].textContent.trim()) + '</strong> · ' + escapeHtml(cells[1].textContent.trim()) +
            ' · ' + escapeHtml(row.dataset.course || 'Course not specified') + ' · ' + escapeHtml(row.dataset.section || 'Section not specified') +
            '</p></div><button type="button" class="cm-outcome-close" aria-label="Close">×</button></div>' +
            '<div class="cm-outcome-metrics"><div class="cm-outcome-metric"><small>Average (recorded COs)</small><strong>' + (average === null ? '—' : average + '%') + '</strong></div>' +
            '<div class="cm-outcome-metric"><small>Outcomes Met</small><strong>' + met + '/10</strong></div>' +
            '<div class="cm-outcome-metric"><small>Recorded Outcomes</small><strong>' + known + '/10</strong></div></div>' +
            '<div class="cm-outcome-detail-list">' + rows + '</div>' +
            '<p class="cm-outcome-note">Demo data currently contains CO1–CO5 only. CO6–CO10 are shown as not recorded; the average excludes missing outcomes. Met threshold: 70%.</p></section>';
        previousFocus = document.activeElement;
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        overlay.querySelector('.cm-outcome-close').focus();
    }
    // Capture prevents older generic View handlers from opening a second modal.
    document.addEventListener('click', e => {
        const btn = e.target.closest('.cm-outcome-detail-trigger');
        if (!btn) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const row = btn.closest('tr');
        if (row) open(row);
    }, true);
})();

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
            "/auth/microsoft?role=" + encodeURIComponent(role);
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
    // One accessible controller for Course List, SO Summary and Student Responses.
    // Keep existing data-tab IDs and panels intact.
    function activateSoTab(tab) {
        const targetId = tab.dataset.tab || tab.getAttribute('aria-controls');
        const targetPanel = targetId && document.getElementById(targetId);
        if (!targetPanel || !Array.from(panels).includes(targetPanel)) return;
        tabs.forEach(function (item) {
            const active = item === tab;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', String(active));
            item.tabIndex = active ? 0 : -1;
        });
        panels.forEach(function (panel) {
            const active = panel === targetPanel;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
            panel.setAttribute('aria-hidden', String(!active));
        });
    }
    tabs.forEach(function (tab) {
        if (!tab.hasAttribute('role')) tab.setAttribute('role', 'tab');
        if (tab.tagName !== 'BUTTON' && tab.tagName !== 'A') tab.tabIndex = 0;
        tab.addEventListener('click', function (event) {
            event.preventDefault();
            activateSoTab(tab);
        });
        tab.addEventListener('keydown', function (event) {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Enter' || event.key === ' ') { activateSoTab(tab); return; }
            const index = Array.from(tabs).indexOf(tab);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
                (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            activateSoTab(tabs[next]);
            tabs[next].focus();
        });
    });
    activateSoTab(Array.from(tabs).find(tab => tab.classList.contains('active')) || tabs[0]);
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
    const list = document.getElementById("studentCoursesList") ||
        document.getElementById("studentCourseGrid");
    if (!list) {
        return;
    }

    function showEmptyState(title, message) {
        list.replaceChildren();

        if (empty) {
            empty.querySelector("h3").textContent = title;
            empty.querySelector("p").textContent = message;
            empty.hidden = false;
            list.hidden = true;
            return;
        }

        const state = document.createElement("div");
        state.className = "sc-empty-state";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const description = document.createElement("p");
        description.textContent = message;
        state.append(heading, description);
        list.appendChild(state);
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

            const heroCount = document.querySelector(".sc-hero-count strong");
            if (heroCount) {
                heroCount.textContent = String(courses.length).padStart(2, "0");
            }

            if (empty) {
                empty.hidden = true;
            }
            list.hidden = false;
            list.replaceChildren();
            courses.forEach(function (course) {
                const card = document.createElement("article");
                card.className = "sc-course-card";
                card.dataset.courseId = course.enrollment_id;

                const top = document.createElement("div");
                top.className = "sc-card-top";
                const icon = document.createElement("span");
                icon.className = "sc-course-icon";
                icon.textContent = String(course.course_code || "").slice(0, 2);
                const status = document.createElement("span");
                status.className = "sc-enrolled";
                status.textContent = String(course.enrollment_status || "active").toUpperCase();
                top.append(icon, status);

                const body = document.createElement("div");
                body.className = "sc-course-body";
                const code = document.createElement("span");
                code.className = "sc-course-code";
                code.textContent = course.course_code || "Course";
                const title = document.createElement("h2");
                title.textContent = course.course_title || "Untitled course";
                const section = document.createElement("p");
                section.className = "sc-section";
                section.textContent = [course.section_name, course.academic_year_name]
                    .filter(Boolean)
                    .join(" - ");
                body.append(code, title, section);

                const bottom = document.createElement("div");
                bottom.className = "sc-card-bottom";
                bottom.textContent = "Enrolled course";

                card.append(top, body, bottom);
                list.appendChild(card);
            });
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

        let closingAnimation;
        function setOpen(open) {
            if (closingAnimation) { closingAnimation.cancel(); closingAnimation = null; }
            if (open) {
                dropdown.classList.add("open");
                menu.classList.add("show");
                if (!matchMedia('(prefers-reduced-motion: reduce)').matches) menu.animate(
                    [{ opacity: 0, transform: 'translateY(-9px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
                    { duration: 210, easing: 'cubic-bezier(.2,.8,.2,1)' });
            } else if (menu.classList.contains("show") && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                closingAnimation = menu.animate(
                    [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-7px)' }],
                    { duration: 150, easing: 'ease-in' });
                closingAnimation.onfinish = () => { dropdown.classList.remove("open"); menu.classList.remove("show"); closingAnimation = null; };
            } else { dropdown.classList.remove("open"); menu.classList.remove("show"); }
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
    const normalizeRole = value => ({
        'dept-head': 'department-head',
        'department_head': 'department-head',
        'depthead': 'department-head',
        'head': 'department-head',
        'department-head': 'department-head'
    }[value] || value);
    const normalized = normalizeRole(role);
    if (['student', 'faculty', 'department-head'].includes(normalized)) {
        sessionStorage.setItem('edumetricsRole', normalized);
    }
})();

/* MERGED DASHBOARD: STUDENT / FACULTY / DEPARTMENT HEAD */
(function () {
    // Login must set sessionStorage.edumetricsRole before navigating here.
    // ?role=... is supported for direct preview and development.
    const allowed = ['student', 'faculty', 'department-head'];
    const query = new URLSearchParams(location.search).get('role');
    const normalize = v => ({
        'department-head': 'department-head',
        'department_head': 'department-head',
        'dept-head': 'department-head',
        'depthead': 'department-head',
        'head': 'department-head',
        'admin': 'admin-security',
        'admin-security': 'admin-security',
        'admin_security': 'admin-security'
    }[v] || v);
    const serverRole = document.body.dataset.dashboardRole;
    const role = normalize((serverRole || query || sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('verifiedRole') || 'student').toString().trim().toLowerCase());
    const selected = allowed.includes(role) ? role : 'student';
    if (!sessionStorage.getItem('edumetricsRole') && sessionStorage.getItem('verificationCompleted') === 'true') sessionStorage.setItem('edumetricsRole', selected);
    const dashboardContent = document.getElementById('dashboardRoleContent');
    if (!dashboardContent) return;
    const templateRole = selected === 'department-head' ? 'dept-head' : selected;
    const tpl = document.getElementById('dashboard-template-' + templateRole);
    if (!tpl) return;
    dashboardContent.appendChild(tpl.content.cloneNode(true));
    if (selected !== 'student') {
        const nav = document.getElementById('nav-template-' + templateRole);
        document.querySelector('.so-nav').replaceWith(nav.content.cloneNode(true));
    }
    const names = { student: ['Student', 'Student'], faculty: ['Faculty', 'Faculty'], 'department-head': ['Department Head', 'Department Head'] };
    const user = document.querySelector('.so-user-info');
    user.querySelector('strong').textContent = names[selected][0];
    user.querySelector('span').textContent = names[selected][1];
    document.title = names[selected][1] + ' Dashboard | EduMetrics';
    document.body.dataset.dashboardRole = selected;
    // Keep the preview role when navigating to shared main pages.
    sessionStorage.setItem('edumetricsRole', selected);
    sessionStorage.setItem('userRole', selected);
})();


/* Shared profile menu: dashboard and account settings use the existing avatar. */
(function () {
    function initAccountMenu() {
        const area = document.querySelector('.so-topbar .so-user-area');
        if (!area || area.querySelector('.so-account-menu')) return;
        const avatar = area.querySelector('.so-avatar');
        if (!avatar) return;
        avatar.setAttribute('role', 'button');
        avatar.setAttribute('tabindex', '0');
        avatar.setAttribute('aria-label', 'Open profile menu');
        avatar.setAttribute('aria-haspopup', 'true');
        avatar.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('div');
        menu.className = 'so-account-menu';
        menu.hidden = true;
        const profile = document.createElement('a');
        const templatesRoot = window.location.pathname.split('/Templates/')[0];
        const currentFile = decodeURIComponent(window.location.pathname).split('/').pop().toLowerCase();
        const normalizeMenuRole = value => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'admin-security': 'admin' }[value] || value);
        const roleFromPage = /(?:^|-)admin(?:\.html)?$/.test(currentFile.replace(/\.html$/, '')) || document.body.classList.contains('cm-admin-page') || /-admin-page/.test(document.body.className)
            ? 'admin'
            : /-dept-head(?:\.html)?$/.test(currentFile) ? 'dept-head'
                : /-faculty(?:\.html)?$/.test(currentFile) ? 'faculty'
                    : '';
        const menuRole = normalizeMenuRole(roleFromPage || new URLSearchParams(location.search).get('role') || sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || document.body.dataset.role || 'student');
        if (roleFromPage) {
            sessionStorage.setItem('edumetricsRole', roleFromPage);
            sessionStorage.setItem('userRole', roleFromPage);
        }
        const accountUrl = new URL(window.location.pathname.includes('/Templates/')
            ? templatesRoot + '/Templates/main/account-settings.html'
            : '/account-settings', window.location.origin);
        accountUrl.searchParams.set('role', menuRole);
        profile.href = accountUrl.href;
        profile.textContent = 'Profile';
        const logout = document.createElement('a');
        logout.href = '/logout';
        logout.textContent = 'Log Out';
        menu.append(profile, logout);
        area.appendChild(menu);
        const roleDisplayNames = {
            student: 'Student',
            faculty: 'Faculty',
            'department-head': 'Department Head',
            'admin-security': 'Admin'
        };
        const photoRoleNames = {
            student: 'student',
            faculty: 'faculty',
            'department-head': 'dept-head',
            'admin-security': 'admin'
        };
        function applyHeaderProfile(account) {
            if (!account || !roleDisplayNames[account.role]) {
                throw new Error('The account profile response is invalid.');
            }
            const info = area.querySelector('.so-user-info');
            const name = info?.querySelector('strong');
            const roleLabel = info?.querySelector('span');
            if (name && account.full_name) name.textContent = account.full_name;
            if (roleLabel) roleLabel.textContent = roleDisplayNames[account.role];

            const photoKey = 'edumetrics-' + photoRoleNames[account.role] + '-profile-photo';
            let photoData = '';
            try {
                photoData = localStorage.getItem(photoKey) || '';
            } catch (storageError) {
                console.warn('Unable to read the saved profile photo.', storageError);
            }
            if (photoData) {
                let avatarPhoto = avatar.querySelector('.account-avatar-photo');
                if (!avatarPhoto) {
                    avatarPhoto = document.createElement('img');
                    avatarPhoto.className = 'account-avatar-photo';
                    avatarPhoto.alt = '';
                    avatarPhoto.setAttribute('aria-hidden', 'true');
                    avatar.appendChild(avatarPhoto);
                }
                avatarPhoto.src = photoData;
                avatar.querySelectorAll(':scope > :not(.account-avatar-photo)').forEach(child => {
                    child.hidden = true;
                });
            }
        }
        const profileEmail = (
            sessionStorage.getItem('verificationEmail') ||
            sessionStorage.getItem('verifiedEmail') ||
            sessionStorage.getItem('edumetrics-current-profile-email') ||
            ''
        ).trim().toLowerCase();
        const cachedProfileKey = profileEmail
            ? 'edumetrics-profile-cache:' + profileEmail
            : '';
        if (cachedProfileKey) {
            try {
                const cachedProfile = sessionStorage.getItem(cachedProfileKey);
                if (cachedProfile) applyHeaderProfile(JSON.parse(cachedProfile));
            } catch (cacheError) {
                console.warn('Unable to load the cached account profile.', cacheError);
                sessionStorage.removeItem(cachedProfileKey);
            }
        }
        async function loadHeaderProfile() {
            try {
                const response = await fetch('/api/account/profile', {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin'
                });
                if (response.redirected) return;
                if (!response.ok) {
                    throw new Error('Authenticated profile data is unavailable.');
                }
                if (!response.headers.get('content-type')?.includes('application/json')) {
                    throw new Error('The account profile response is not valid JSON.');
                }
                const result = await response.json();
                const account = result.profile;
                applyHeaderProfile(account);
                const accountEmail = String(account.email || '').trim().toLowerCase();
                if (accountEmail) {
                    sessionStorage.setItem('edumetrics-current-profile-email', accountEmail);
                    sessionStorage.setItem(
                        'edumetrics-profile-cache:' + accountEmail,
                        JSON.stringify(account)
                    );
                }
            } catch (error) {
                console.error('Unable to load the signed-in user header profile:', error);
            }
        }
        loadHeaderProfile();
        let menuAnimation;
        function close() {
            if (menu.hidden) return;
            if (menuAnimation) menuAnimation.cancel();
            avatar.setAttribute('aria-expanded', 'false');
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) { menu.hidden = true; return; }
            menuAnimation = menu.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 140, easing: 'ease-in' });
            menuAnimation.onfinish = () => { menu.hidden = true; menuAnimation = null; };
        }
        function toggle() {
            const show = avatar.getAttribute('aria-expanded') !== 'true';
            if (!show) { close(); return; }
            if (menuAnimation) { menuAnimation.cancel(); menuAnimation = null; }
            menu.hidden = false;
            avatar.setAttribute('aria-expanded', 'true');
            if (!matchMedia('(prefers-reduced-motion: reduce)').matches) menu.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
        }
        avatar.addEventListener('click', function (event) { event.stopPropagation(); toggle(); });
        avatar.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
        });
        document.addEventListener('click', function (event) { if (!area.contains(event.target)) close(); });
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
        logout.addEventListener('click', async function (event) {
            event.preventDefault();



            const normalizeRole = (value) => {
                const role = (value || '').toLowerCase();

                if (role === 'admin') return 'admin-security';
                if (role === 'dept-head' || role === 'department_head') {
                    return 'department-head';
                }

                return role;
            };

            const role = normalizeRole(
                sessionStorage.getItem('edumetricsRole') ||
                sessionStorage.getItem('userRole') ||
                sessionStorage.getItem('verifiedRole') ||
                sessionStorage.getItem('verificationRole') ||
                new URLSearchParams(window.location.search).get('role') ||
                'student'
            );



            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
            } catch (error) {
                console.error('Logout request failed:', error);
            } finally {
                sessionStorage.removeItem('edumetricsRole');
                sessionStorage.removeItem('userRole');
                sessionStorage.removeItem('verifiedRole');
                sessionStorage.removeItem('verifiedEmail');
                sessionStorage.removeItem('verificationEmail');
                sessionStorage.removeItem('edumetrics-current-profile-email');
                Object.keys(sessionStorage)
                    .filter(key => key.startsWith('edumetrics-profile-cache:'))
                    .forEach(key => sessionStorage.removeItem(key));

                window.location.href =
                    '/login%20page.html?role=' + encodeURIComponent(role);
            }
        });

    }
    function initAccountSettings() {
        const page = document.querySelector('.account-settings-page');
        if (!page) return;
        const normalize = value => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'depthead': 'dept-head', 'admin-security': 'admin' }[value] || value);
        const params = new URLSearchParams(location.search);
        const raw = params.get('role') || sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || sessionStorage.getItem('verifiedRole') || page.dataset.role || 'student';
        const role = normalize(raw.toLowerCase());
        const selected = ['student', 'faculty', 'dept-head', 'admin'].includes(role) ? role : 'student';
        const roleNames = { student: 'Student', faculty: 'Faculty', 'dept-head': 'Department Head', admin: 'Admin' };
        const label = roleNames[selected];
        sessionStorage.setItem('edumetricsRole', selected);
        sessionStorage.setItem('userRole', selected);
        page.dataset.role = selected;
        page.dataset.dashboardRole = selected;

        if (selected === 'admin') {
            const template = document.getElementById('account-admin-shell');
            if (template) {
                const nodes = template.content.cloneNode(true);
                ['.so-topbar', '.so-sidebar'].forEach(selector => {
                    const current = page.querySelector(selector);
                    const replacement = nodes.querySelector(selector);
                    if (current && replacement) current.replaceWith(replacement);
                });
            }
        } else if (selected !== 'student') {
            const template = document.getElementById('nav-template-' + selected);
            const current = page.querySelector('.so-sidebar .so-nav');
            if (template && current) current.replaceWith(template.content.cloneNode(true));
        }
        const info = page.querySelector('.so-user-info');
        if (info) {
            const heading = info.querySelector('strong');
            const subtitle = info.querySelector('span');
            if (heading) heading.textContent = selected === 'admin' ? 'System Administrator' : label;
            if (subtitle) subtitle.textContent = label;
        }
        const nav = page.querySelector('.so-sidebar .so-nav');
        if (nav) {
            nav.querySelectorAll('a[href]').forEach(a => {
                const url = new URL(a.getAttribute('href'), location.href);
                const path = decodeURIComponent(url.pathname).toLowerCase();
                const file = path.split('/').pop();
                if (file === 'dashboard.html') {
                    url.pathname = selected === 'admin'
                        ? '/requirement 2/cm-admin.html'
                        : '/main/dashboard.html';
                    if (selected !== 'admin') url.searchParams.set('role', selected);
                    else url.search = '';
                    a.href = url.href;
                } else if (file === 'courses.html' || file === 'courses-faculty.html') {
                    if (selected !== 'admin' && selected !== 'dept-head') {
                        url.pathname = selected === 'faculty'
                            ? '/main/courses-faculty.html'
                            : '/main/courses.html';
                        url.search = '';
                        a.href = url.href;
                    }
                } else if (['platform.html', 'resources.html', 'about us.html'].includes(file)) {
                    url.pathname = '/main/' + file;
                    url.searchParams.set('role', selected);
                    a.href = url.href;
                } else if (path.includes('/requirement ')) {
                    url.pathname = path;
                    url.search = '';
                    a.href = url.href;
                } else if (file === 'account-approvals.html') {
                    url.pathname = '/account-approvals.html';
                    url.search = '';
                    a.href = url.href;
                }
                a.classList.remove('active', 'sd-active');
                a.removeAttribute('aria-current');
            });
        }
        const idLabel = page.querySelector('#accountIdLabel');
        if (idLabel) idLabel.textContent = selected === 'student' ? 'Student ID' : selected === 'admin' ? 'Admin ID' : 'Employee ID';
        const programLabel = page.querySelector('#accountProgramLabel');
        if (programLabel) programLabel.textContent = selected === 'student' ? 'Program' : selected === 'admin' ? 'Account Type' : 'Department';
        const accountDataMessage = page.querySelector('#accountDataMessage');
        const accountFields = {
            accountFullName: page.querySelector('#accountFullName'),
            accountStudentId: page.querySelector('#accountStudentId'),
            accountProgram: page.querySelector('#accountProgram'),
            accountDetailEmail: page.querySelector('#accountDetailEmail')
        };
        async function loadAccountProfile() {
            try {
                const response = await fetch('/api/account/profile', {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin'
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Account details could not be loaded.');
                }
                const profile = result.profile;
                const values = {
                    accountFullName: profile.full_name,
                    accountStudentId: profile.id_number,
                    accountProgram: profile.affiliation,
                    accountDetailEmail: profile.email
                };
                Object.entries(values).forEach(([id, value]) => {
                    if (accountFields[id]) accountFields[id].textContent = value || 'Not available';
                });
                const accountName = page.querySelector('#accountName');
                if (accountName) {
                    accountName.textContent = profile.full_name || label + ' Account';
                }
                const userHeading = page.querySelector('.so-user-info strong');
                if (userHeading && profile.full_name) userHeading.textContent = profile.full_name;
                if (accountDataMessage) accountDataMessage.textContent = '';
            } catch (error) {
                Object.values(accountFields).forEach(field => {
                    if (field) field.textContent = 'Not available';
                });
                if (accountDataMessage) {
                    accountDataMessage.textContent = error.message || 'Account details could not be loaded.';
                }
            }
        }
        loadAccountProfile();
        page.querySelectorAll('[data-account-role-label]').forEach(el => { el.textContent = label; });
        document.dispatchEvent(new Event('edumetrics:nav-ready'));
        const photoInput = page.querySelector('#accountPhotoInput');
        const photo = page.querySelector('#accountProfileImage');
        const photoMessage = page.querySelector('#accountPhotoMessage');
        const photoKey = 'edumetrics-' + selected + '-profile-photo';
        function showPhoto(data) {
            if (!photo || !data) return;
            photo.src = data;
            photo.hidden = false;
            page.querySelector('.so-topbar .so-avatar .sd-icon-placeholder')?.setAttribute('hidden', '');
            const avatar = page.querySelector('.so-topbar .so-avatar');
            if (avatar) {
                let avatarPhoto = avatar.querySelector('.account-avatar-photo');
                if (!avatarPhoto) { avatarPhoto = document.createElement('img'); avatarPhoto.className = 'account-avatar-photo'; avatar.appendChild(avatarPhoto); }
                avatarPhoto.src = data;
            }
        }
        try { showPhoto(localStorage.getItem(photoKey)); } catch (_) { }
        photoInput?.addEventListener('change', () => {
            const file = photoInput.files?.[0];
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
                photoMessage.textContent = 'Choose a JPG, PNG or WebP image up to 1 MB.';
                photoInput.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                try { localStorage.setItem(photoKey, String(reader.result)); showPhoto(String(reader.result)); photoMessage.textContent = 'Profile photo saved in this browser.'; }
                catch (_) { photoMessage.textContent = 'Unable to save photo in this browser.'; }
            };
            reader.readAsDataURL(file);
        });
        const form = page.querySelector('#changePasswordForm');
        page.querySelectorAll('[data-account-password-toggle]').forEach(button => button.addEventListener('click', () => {
            const field = button.parentElement.querySelector('input');
            field.type = field.type === 'password' ? 'text' : 'password';
            button.setAttribute('aria-label', (field.type === 'password' ? 'Show' : 'Hide') + ' password');
        }));
        form?.addEventListener('submit', event => {
            event.preventDefault();
            const current = form.elements.currentPassword.value;
            const next = form.elements.newPassword.value;
            const confirm = form.elements.confirmPassword.value;
            const message = page.querySelector('#passwordMessage');
            if (!current || !next || !confirm) message.textContent = 'Complete all password fields.';
            else if (next !== confirm) message.textContent = 'New password and confirmation do not match.';
            else if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(next)) message.textContent = 'Use at least 8 characters with a letter, number, and special character.';
            else message.textContent = 'Password changes require the connected Flask backend. No changes were saved.';
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAccountSettings);
        document.addEventListener('DOMContentLoaded', initAccountMenu);
    } else { initAccountSettings(); initAccountMenu(); }
    // Role-aware information pages replace their header after DOMContentLoaded.
    // Rebind the menu to the new avatar once the replacement is complete.
    document.addEventListener('edumetrics:profile-shell-ready', initAccountMenu);
})();

/* Shared main-page navigation and active indicator (single source of truth). */
(function () {
    function addDepartmentHeadAccountRequests() {
        const normalizeAccountRequestLinks = root => {
            if (!root) return;
            root.querySelectorAll('a.so-nav-item').forEach(link => {
                if (link.textContent.trim() === 'Account Requests') {
                    link.href = '/account-approvals.html';
                }
            });
        };
        const addLink = nav => {
            if (!nav) return;
            normalizeAccountRequestLinks(nav);
            const existingLink = nav.querySelector('[data-account-approval-nav]') ||
                [...nav.querySelectorAll('a.so-nav-item')]
                    .find(link => link.textContent.trim() === 'Account Requests');
            if (existingLink) {
                existingLink.dataset.accountApprovalNav = 'true';
                if (location.pathname.toLowerCase().endsWith('/account-approvals.html')) {
                    existingLink.classList.add('active');
                    existingLink.setAttribute('aria-current', 'page');
                }
                return;
            }
            const link = document.createElement('a');
            link.className = 'so-nav-item';
            link.href = '/account-approvals.html';
            link.textContent = 'Account Requests';
            link.dataset.accountApprovalNav = 'true';
            if (location.pathname.toLowerCase().endsWith('/account-approvals.html')) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            }
            const dashboardLink = [...nav.querySelectorAll(':scope > a.so-nav-item')]
                .find(item => item.textContent.trim() === 'Dashboard' || item.textContent.trim() === 'Home');
            nav.insertBefore(link, dashboardLink ? dashboardLink.nextSibling : nav.firstChild);
        };

        document.querySelectorAll('.so-sidebar nav').forEach(nav => {
            normalizeAccountRequestLinks(nav);
            if (nav.getAttribute('aria-label') === 'Department Head navigation') {
                addLink(nav);
            }
        });
        document.querySelectorAll('template').forEach(template => {
            template.content.querySelectorAll('nav').forEach(nav => {
                normalizeAccountRequestLinks(nav);
                if (nav.getAttribute('aria-label') === 'Department Head navigation') {
                    addLink(nav);
                }
            });
        });
    }

    document.addEventListener('edumetrics:nav-ready', addDepartmentHeadAccountRequests);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addDepartmentHeadAccountRequests, { once: true });
    } else {
        addDepartmentHeadAccountRequests();
    }
})();

(function () {
    function initRoleNavigation() {
        const path = decodeURIComponent(location.pathname).toLowerCase();
        if (!path.includes('/templates/main/')) return;
        const current = path.split('/').pop();
        const pages = ['dashboard.html', 'courses.html', 'courses-faculty.html', 'hidden-courses.html', 'hidden-courses-faculty.html', 'platform.html', 'resources.html', 'about us.html'];
        if (!pages.includes(current)) return;
        const normalize = value => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'depthead': 'dept-head' }[value] || value);
        const urlRole = new URLSearchParams(location.search).get('role');
        const stored = sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || '';
        const role = normalize((urlRole || stored || 'student').toLowerCase());
        if (!['student', 'faculty', 'dept-head'].includes(role)) return;
        sessionStorage.setItem('edumetricsRole', role);
        sessionStorage.setItem('userRole', role);
        const nav = document.querySelector('.so-sidebar .so-nav');
        if (!nav) return;
        // Department Head does not have My Courses; Student and Faculty retain theirs.
        if (role === 'dept-head') {
            [...nav.querySelectorAll(':scope > a.so-nav-item')].filter(a => a.textContent.trim() === 'My Courses').forEach(a => a.remove());
        }
        nav.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#')) return;
            const target = new URL(href, location.href);
            const file = decodeURIComponent(target.pathname).split('/').pop().toLowerCase();
            if (file === 'dashboard.html') target.searchParams.set('role', role);
            else if (['courses.html', 'courses-faculty.html'].includes(file)) {
                if (role === 'dept-head') return;
                target.pathname = target.pathname.replace(/[^/]+$/, role === 'faculty' ? 'courses-faculty.html' : 'courses.html');
            } else if (['platform.html', 'resources.html', 'about us.html'].includes(file)) {
                target.pathname = target.pathname.replace(/\/webpage\//i, '/main/');
                target.searchParams.set('role', role);
            } else return;
            link.href = target.href;
        });
        const activeFile = current.startsWith('hidden-courses') ? (role === 'faculty' ? 'courses-faculty.html' : 'courses.html') : current;
        nav.querySelectorAll(':scope > a.so-nav-item').forEach(link => {
            const file = decodeURIComponent(new URL(link.href, location.href).pathname).split('/').pop().toLowerCase();
            const active = file === activeFile;
            link.classList.toggle('active', active);
            link.classList.toggle('sd-active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        // Workflow indicator is reserved for Department Head requirement pages.
        nav.querySelectorAll('.so-nav-group summary.so-nav-item').forEach(summary => {
            summary.classList.remove('active', 'sd-active');
            summary.removeAttribute('aria-current');
        });
    }
    document.addEventListener('edumetrics:nav-ready', initRoleNavigation);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRoleNavigation);
    else initRoleNavigation();
})();

/* Dashboard posts: one shared composer for Faculty and Department Head previews. */
(function () {
    const root = document.getElementById('dashboardRoleContent');
    const role = document.body.dataset.dashboardRole;
    const allowed = role === 'faculty' || role === 'dept-head';
    if (!root || !allowed) return;
    const feed = document.getElementById('sdPosts');
    const empty = document.getElementById('sdEmpty');
    const overlay = document.getElementById('sdComposeOverlay');
    const form = document.getElementById('sdComposeForm');
    const trigger = root.querySelector('[data-create-post]');
    if (!feed || !overlay || !form || !trigger) return;
    const key = 'edumetrics-dashboard-posts-v1-' + role;
    let posts = [];
    try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) posts = saved; } catch (_) { }
    function render() {
        feed.replaceChildren();
        posts.forEach(function (post) {
            const card = document.createElement('article'); card.className = 'sd-post sd-created-post';
            const author = document.createElement('div'); author.className = 'sd-post-author';
            const by = document.createElement('div');
            const name = document.createElement('strong'); name.textContent = role === 'faculty' ? 'Faculty' : 'Department Head';
            const date = document.createElement('small'); date.textContent = post.date || '';
            by.append(name, date); author.append(by);
            const body = document.createElement('div'); body.className = 'sd-post-body';
            const title = document.createElement('strong'); title.textContent = post.title;
            const message = document.createElement('p'); message.textContent = post.message;
            body.append(title, message); card.append(author, body); feed.append(card);
        });
        empty.hidden = posts.length > 0;
    }
    function close() { overlay.hidden = true; document.body.classList.remove('sd-compose-open'); trigger.focus(); }
    trigger.addEventListener('click', function () { overlay.hidden = false; document.body.classList.add('sd-compose-open'); document.getElementById('sdComposeSubject').focus(); });
    document.getElementById('sdComposeClose').addEventListener('click', close);
    document.getElementById('sdComposeCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) close(); });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const title = document.getElementById('sdComposeSubject').value.trim();
        const message = document.getElementById('sdComposeMessage').value.trim();
        if (!title || !message) return;
        posts.unshift({ title: title, message: message, date: new Date().toLocaleString() });
        try { localStorage.setItem(key, JSON.stringify(posts)); } catch (_) { }
        form.reset(); render(); close();
    });
    render();
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


/* AC faculty tabs and score filters — retained from GitHub version. */
document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('ac-score-search');
    const type = document.getElementById('ac-score-type');
    const sort = document.getElementById('ac-score-sort');
    const body = document.getElementById('ac-score-rows');
    if (!search || !type || !sort || !body) return;
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


// Faculty Courses: create and restore demo courses in this browser only.
(function () {
    function init() {
        if (!document.body.classList.contains('faculty-courses-page')) return;
        const dialog = document.getElementById('fcCreateDialog');
        const form = document.getElementById('fcCreateForm');
        const grid = document.getElementById('facultyCourseGrid');
        const open = document.getElementById('fcmOpenCreate');
        if (!dialog || !form || !grid || !open) return;
        const storageKey = 'edumetrics-faculty-demo-courses-v1';
        let courses = [];
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(stored)) courses = stored.filter(item => item && typeof item.code === 'string' && typeof item.title === 'string');
        } catch (_) { /* Browser storage unavailable. */ }
        function render() {
            grid.querySelectorAll('[data-fc-demo-course]').forEach(node => node.remove());
            const empty = document.getElementById('fcmEmpty');
            if (empty) empty.hidden = courses.length > 0 || grid.querySelector('.sc-course-card') !== null;
            courses.forEach(course => {
                const card = document.createElement('article'); card.className = 'sc-course-card';
                card.dataset.fcDemoCourse = 'true';
                const top = document.createElement('div'); top.className = 'sc-card-top';
                const symbol = document.createElement('span'); symbol.className = 'sc-course-icon'; symbol.textContent = course.code.slice(0, 2).toUpperCase();
                const status = document.createElement('span'); status.className = 'sc-enrolled'; status.textContent = 'NEW COURSE';
                top.append(symbol, status);
                const body = document.createElement('div'); body.className = 'sc-course-body';
                const code = document.createElement('span'); code.className = 'sc-course-code'; code.textContent = course.code;
                const name = document.createElement('h2'); name.textContent = course.title;
                const note = document.createElement('p'); note.className = 'sc-faculty'; note.textContent = 'Assigned faculty · You';
                body.append(code, name, note);
                const bottom = document.createElement('div'); bottom.className = 'sc-card-bottom';
                const summary = document.createElement('div'); summary.className = 'sc-progress-top'; summary.textContent = '0 enrolled students · Demo';
                bottom.append(summary); card.append(top, body, bottom); grid.append(card);
            });
            const count = document.getElementById('facultyCourseCount');
            if (count) count.textContent = String(grid.querySelectorAll('.sc-course-card').length).padStart(2, '0');
        }
        const close = () => { if (dialog.open) dialog.close(); };
        open.addEventListener('click', () => { form.reset(); dialog.showModal(); form.elements.code.focus(); });
        document.getElementById('fcCloseCreate')?.addEventListener('click', close);
        document.getElementById('fcCancelCreate')?.addEventListener('click', close);
        dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const code = form.elements.code.value.trim();
            const title = form.elements.title.value.trim();
            if (!code || !title) return;
            if (courses.some(course => course.code.toLowerCase() === code.toLowerCase())) {
                form.elements.code.setCustomValidity('This course code already exists.');
                form.elements.code.reportValidity(); return;
            }
            courses.push({ code, title });
            try { localStorage.setItem(storageKey, JSON.stringify(courses)); } catch (_) { /* Session-only if storage unavailable. */ }
            render(); close();
        });
        form.elements.code.addEventListener('input', () => form.elements.code.setCustomValidity(''));
        render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();

/* Shared calendar: reuse the existing header popup on every role/page. */
(function () {
    'use strict';
    let opened = null;
    const pad = n => String(n).padStart(2, '0');
    function close() {
        if (!opened) return;
        opened.popup.hidden = true;
        opened.wrap.appendChild(opened.popup);
        opened.button.setAttribute('aria-expanded', 'false');
        opened = null;
    }
    function place() {
        if (!opened) return;
        const r = opened.button.getBoundingClientRect();
        opened.popup.style.left = Math.max(8, Math.min(r.right - 224, innerWidth - 232)) + 'px';
        const height = opened.popup.getBoundingClientRect().height || 260;
        opened.popup.style.top = (r.bottom + 8 + height <= innerHeight ? r.bottom + 8 : Math.max(8, r.top - height - 8)) + 'px';
    }
    function draw(popup, year, month) {
        const input = popup.querySelector('input[type="date"]');
        const selected = input?.value || '';
        const first = new Date(year, month, 1).getDay();
        const days = new Date(year, month + 1, 0).getDate();
        const head = document.createElement('div'); head.className = 'edu-calendar-head';
        const title = document.createElement('strong');
        title.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        head.append(title);
        [-1, 1].forEach(step => {
            const arrow = document.createElement('button'); arrow.type = 'button';
            arrow.className = 'edu-calendar-arrow'; arrow.textContent = step < 0 ? '‹' : '›';
            arrow.setAttribute('aria-label', step < 0 ? 'Previous month' : 'Next month');
            arrow.addEventListener('click', () => draw(popup, year + Math.floor((month + step) / 12), (month + step + 12) % 12));
            head.append(arrow);
        });
        const grid = document.createElement('div'); grid.className = 'edu-calendar-grid';
        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => {
            const label = document.createElement('span'); label.className = 'edu-calendar-weekday'; label.textContent = day; grid.append(label);
        });
        for (let i = 0; i < Math.ceil((first + days) / 7) * 7; i++) {
            const date = new Date(year, month, i - first + 1);
            const value = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
            const day = document.createElement('button'); day.type = 'button'; day.className = 'edu-calendar-day';
            day.textContent = date.getDate();
            if (date.getMonth() !== month) day.classList.add('outside');
            if (value === selected) day.classList.add('selected');
            day.addEventListener('click', () => { if (input) { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); } close(); });
            grid.append(day);
        }
        popup.replaceChildren(input, head, grid);
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('.edu-header-calendar-btn');
        if (!button) { if (opened && !opened.popup.contains(event.target)) close(); return; }
        event.preventDefault();
        if (opened?.button === button) { close(); return; }
        close();
        const popup = button.closest('.edu-header-calendar-wrap')?.querySelector('.edu-header-calendar-popup');
        if (!popup) return;
        const input = popup.querySelector('input[type="date"]');
        const now = new Date();
        if (input && !input.value) input.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        const date = input?.value ? new Date(input.value + 'T12:00:00') : now;
        draw(popup, date.getFullYear(), date.getMonth());
        const wrap = button.closest('.edu-header-calendar-wrap');
        document.body.appendChild(popup);
        popup.hidden = false; button.setAttribute('aria-expanded', 'true'); opened = { popup, button, wrap }; place();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
})();

/* Page-specific initialization moved from HTML: no inline JavaScript. */

/* ra-faculty.html.txt */
function initRawAssessmentFaculty() {
    /* Frontend demonstration only: saved scores are held in this browser session, not a backend. */
    (() => {
        const students = [['2026-COE-001', 'Angel S. Villanueva'], ['2026-COE-002', 'Bea M. Santos'], ['2026-COE-003', 'Carl P. Reyes'], ['2026-COE-004', 'Dana L. Cruz'], ['2026-COE-005', 'Ella R. Garcia'], ['2026-COE-006', 'Francis D. Lim'], ['2026-COE-007', 'Gina A. Ramos'], ['2026-COE-008', 'Hannah P. Tan']];
        const assessments = { quiz1: { max: 20, co: 'CO1', date: 'Oct. 3, 2026', scores: [18, 17, 16, 15, 19, 14, 18, 17] }, quiz2: { max: 20, co: 'CO2', date: 'Oct. 10, 2026', scores: [null, null, null, null, null, null, null, null] }, lab1: { max: 50, co: 'CO1, CO2', date: 'Sept. 19, 2026', scores: [42, 45, 40, 38, 47, 41, 44, 46] }, midterm: { max: 100, co: 'CO1–CO3', date: 'Oct. 20, 2026', scores: [null, null, null, null, null, null, null, null] } };
        const $ = id => document.getElementById(id), selector = $('rafAssessment'), body = $('rafRows');
        if (!selector || !body) return;
        let saved = false;
        function render() {
            const a = assessments[selector.value], q = $('rafSearch').value.trim().toLowerCase(), sort = $('rafSort').value;
            $('rafMaxLabel').textContent = a.max; $('rafMaxInput').value = a.max; $('rafCO').textContent = a.co; $('rafDate').textContent = a.date;
            const entered = a.scores.filter(v => v !== null);
            $('rafMaximum').textContent = entered.length ? (entered.reduce((sum, v) => sum + v, 0) / entered.length / a.max * 100).toFixed(1) + '%' : '—';
            $('rafEntered').textContent = a.scores.filter(v => v !== null).length; $('rafStudents').textContent = students.length;
            let indices = students.map((_, i) => i).filter(i => (students[i].join(' ')).toLowerCase().includes(q));
            indices.sort((i, j) => sort === 'za' ? students[j][1].localeCompare(students[i][1]) : sort === 'high' ? (a.scores[j] ?? -1) - (a.scores[i] ?? -1) : sort === 'low' ? (a.scores[i] ?? Infinity) - (a.scores[j] ?? Infinity) : students[i][1].localeCompare(students[j][1]));
            body.replaceChildren();
            indices.forEach((i, n) => {
                const tr = document.createElement('tr'); const [id, name] = students[i], v = a.scores[i];
                tr.innerHTML = `<td>${n + 1}</td><td><span class="raf-id">${id}</span></td><td class="raf-student-name"></td><td><input class="raf-score-input" type="number" min="0" max="${a.max}" step="0.01" aria-label="Raw points for ${name}" value="${v ?? ''}"></td><td class="raf-percentage">${v === null ? '—' : (v / a.max * 100).toFixed(1) + '%'}</td><td><span class="sodh-status ${v === null ? 'in-progress' : 'complete'}">${v === null ? 'Pending' : 'Entered'}</span></td>`;
                tr.querySelector('.raf-student-name').textContent = name;
                tr.querySelector('input').addEventListener('input', e => {
                    const value = e.target.value.trim(), num = Number(value);
                    if (value !== '' && (!Number.isFinite(num) || num < 0 || num > a.max)) { e.target.setCustomValidity(`Enter a score from 0 to ${a.max}`); e.target.reportValidity(); return; }
                    e.target.setCustomValidity(''); a.scores[i] = value === '' ? null : num;
                    tr.querySelector('.raf-percentage').textContent = value === '' ? '—' : (num / a.max * 100).toFixed(1) + '%';
                    const status = tr.querySelector('.sodh-status'); status.className = 'sodh-status ' + (value === '' ? 'in-progress' : 'complete'); status.textContent = value === '' ? 'Pending' : 'Entered';
                    $('rafEntered').textContent = a.scores.filter(v => v !== null).length;
                    const entered = a.scores.filter(v => v !== null);
                    $('rafMaximum').textContent = entered.length ? (entered.reduce((sum, v) => sum + v, 0) / entered.length / a.max * 100).toFixed(1) + '%' : '—';
                    saved = false; $('rafMessage').textContent = 'Unsaved changes';
                }); body.append(tr);
            });
            $('rafEmpty').hidden = indices.length > 0;
        }
        $('rafMaxInput').addEventListener('change', event => {
            const assessment = assessments[selector.value];
            const next = Number(event.target.value);
            if (!Number.isFinite(next) || next <= 0 || next > 10000) {
                event.target.setCustomValidity('Enter a total score greater than 0 and at most 10,000.');
                event.target.reportValidity();
                return;
            }
            if (assessment.scores.some(score => score !== null && score > next)) {
                event.target.setCustomValidity('Total score cannot be less than an existing student score.');
                event.target.reportValidity();
                return;
            }
            event.target.setCustomValidity('');
            assessment.max = next;
            saved = false;
            $('rafMessage').textContent = 'Total score updated for this assessment. Unsaved changes.';
            render();
        });
        selector.addEventListener('change', () => { saved = false; $('rafMessage').textContent = ''; render(); });
        $('rafSearch').addEventListener('input', render); $('rafSort').addEventListener('change', render);
        $('rafSave').addEventListener('click', () => {
            if (body.querySelector('input:invalid')) { body.querySelector('input:invalid').reportValidity(); return; }
            saved = true; $('rafMessage').textContent = 'Demo scores saved for this session only. Connect a backend to save permanently.';
        });
        render();
    })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRawAssessmentFaculty, { once: true });
else initRawAssessmentFaculty();

/* so-faculty(20261012-150030).html.txt */
document.addEventListener("DOMContentLoaded", function () {
    const courseOutcomeBody = document.getElementById("courseOutcomesTableBody");
    if (!courseOutcomeBody) return;
    function styleAlignedSOs() {
        courseOutcomeBody.querySelectorAll("tr:not(.sof-outcome-empty-row)").forEach(function (row) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 3) return;
            const alignedCell = cells[2];
            if (alignedCell.querySelector(".sof-aligned-so")) return;
            const values = alignedCell.textContent.split(",").map(value => value.trim()).filter(Boolean);
            if (!values.length) return;
            alignedCell.replaceChildren();
            values.forEach(function (value) {
                const pill = document.createElement("span");
                pill.className = "sof-aligned-so";
                pill.textContent = value;
                alignedCell.appendChild(pill);
            });
        });
    }
    styleAlignedSOs();
    new MutationObserver(styleAlignedSOs).observe(courseOutcomeBody, { childList: true, subtree: true });
});

/* ra-student(1).html.txt */
document.addEventListener("DOMContentLoaded", function () {
    /* Demo-only filtering. Backend must provide authenticated student records and release flags. */
    (function () {
        const tbody = document.getElementById('raRows');
        const search = document.getElementById('raSearch');
        const type = document.getElementById('raType');
        const sort = document.getElementById('raSort');
        if (!tbody || !search || !type || !sort) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        function render() {
            const query = search.value.trim().toLowerCase();
            const filtered = rows.filter(row => row.textContent.toLowerCase().includes(query) && (type.value === 'all' || row.dataset.type === type.value));
            filtered.sort((a, b) => sort.value === 'name' ? a.cells[0].textContent.localeCompare(b.cells[0].textContent) : sort.value === 'oldest' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date));
            tbody.replaceChildren(...filtered);
            document.getElementById('raEmpty').hidden = filtered.length !== 0;
        }
        [search, type, sort].forEach(el => el.addEventListener(el === search ? 'input' : 'change', render));
        render();
    })();
});

/* AC Student: attainment search, release filter and sort. */
(function () {
    function init() {
        const body = document.getElementById('ac-attainment-rows');
        const search = document.getElementById('ac-attainment-search');
        const release = document.getElementById('ac-attainment-release');
        const sort = document.getElementById('ac-attainment-sort');
        if (!body || !search || !release || !sort) return;
        const rows = Array.from(body.querySelectorAll('tr'));
        function update() {
            const term = search.value.trim().toLowerCase();
            const filter = release.value;
            const ordered = rows.slice().sort((a, b) => {
                if (sort.value === 'course') return a.cells[0].textContent.localeCompare(b.cells[0].textContent);
                if (sort.value === 'outcome') return a.cells[1].textContent.localeCompare(b.cells[1].textContent, undefined, { numeric: true });
                return rows.indexOf(a) - rows.indexOf(b);
            });
            let count = 0;
            ordered.forEach(row => {
                const status = row.cells[4].textContent.trim().toLowerCase();
                const visible = row.textContent.toLowerCase().includes(term) && (filter === 'all' || status === filter);
                row.hidden = !visible;
                if (visible) count++;
                body.appendChild(row);
            });
            const empty = document.getElementById('ac-attainment-empty');
            if (empty) empty.hidden = count !== 0;
        }
        search.addEventListener('input', update);
        release.addEventListener('change', update);
        sort.addEventListener('change', update);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* AC DEPARTMENT HEAD — independent tab, filter and assessment controller */
(function () {
    "use strict";
    function initAcDepartmentHead() {
        const page = document.querySelector(".ac-dept-head-page");
        if (!page || page.dataset.acDhInitialized === "true") return;
        const byId = id => page.querySelector("#" + id);
        const tabs = [byId("acDhTabAttainment"), byId("acDhTabApproval")];
        const panels = [byId("acDhPanelAttainment"), byId("acDhPanelApproval")];
        if (tabs.some(tab => !tab) || panels.some(panel => !panel)) return;
        page.dataset.acDhInitialized = "true";
        function activate(index) {
            tabs.forEach((tab, i) => {
                const selected = i === index;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
                tab.tabIndex = selected ? 0 : -1;
                panels[i].hidden = !selected;
                panels[i].setAttribute("aria-hidden", String(!selected));
                panels[i].style.setProperty("display", selected ? "block" : "none", "important");
            });
        }
        tabs.forEach((tab, index) => {
            tab.addEventListener("click", event => { event.preventDefault(); activate(index); });
            tab.addEventListener("keydown", event => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                activate(next);
                tabs[next].focus();
            });
        });
        const search = byId("acDhSearch");
        const course = byId("acDhCourse");
        const section = byId("acDhSection");
        const department = byId("acDhDepartment");
        const program = byId("acDhProgram");
        const year = byId("acDhYear");
        const attainmentRows = [...byId("acDhAttainmentRows").rows];
        const approvalRows = [...byId("acDhApprovalRows").rows];
        function filterRows() {
            const term = search.value.trim().toLowerCase();
            const courseValue = course.value;
            const sectionValue = section.value;
            function apply(rows) {
                let visible = 0;
                rows.forEach(row => {
                    const matches = (!term || row.textContent.toLowerCase().includes(term)) &&
                        (!courseValue || row.dataset.course === courseValue) &&
                        (!sectionValue || row.dataset.section === sectionValue);
                    row.hidden = !matches;
                    if (matches) visible++;
                });
                return visible;
            }
            const visibleAttainment = apply(attainmentRows);
            const visibleApproval = apply(approvalRows);
            byId("acDhEmptyAttainment").hidden = visibleAttainment !== 0;
            byId("acDhEmptyApproval").hidden = visibleApproval !== 0;
            const filtered = attainmentRows.filter(row => !row.hidden);
            byId("acDhTotal").textContent = String(filtered.length);
            byId("acDhMet").textContent = String(filtered.filter(row => row.dataset.status === "met").length);
            byId("acDhBelow").textContent = String(filtered.filter(row => row.dataset.status === "below").length);
        }
        [search, course, section].forEach(input => input.addEventListener(input === search ? "input" : "change", filterRows));
        byId("acDhReset").addEventListener("click", () => {
            search.value = "";
            course.value = "";
            section.value = "";
            department.value = "";
            program.value = "";
            year.selectedIndex = 0;
            filterRows();
        });
        const dialog = byId("acDhDialog");
        page.addEventListener("click", event => {
            const button = event.target.closest(".ac-dh-view");
            if (!button || !button.closest("#acDhAttainmentRows")) return;
            const row = button.closest("tr");
            byId("acDhDialogTitle").textContent = row.dataset.co + " — Assessment Breakdown";
            byId("acDhDialogDetails").textContent =
                row.dataset.course + " · " + row.dataset.section + "\n" +
                "Faculty: " + row.dataset.faculty + "\n\n" +
                row.dataset.assessments + "\n\n" +
                "These are illustrative assessment inputs, not verified gradebook records.";
            if (typeof dialog.showModal === "function") dialog.showModal();
        });
        [byId("acDhDialogClose"), byId("acDhDialogDone")].forEach(button => button.addEventListener("click", () => dialog.close()));
        dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
        activate(window.location.hash === "#gradebook-approval" ? 1 : 0);
        filterRows();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAcDepartmentHead);
    else initAcDepartmentHead();
})();



/* Requirement 08 — Department Head Compliance Reports (scoped; shared script.js) */
(function () {
    'use strict';
    function init() {
        const page = document.querySelector('.rp-dept-head-page');
        if (!page) return;
        const $ = id => document.getElementById(id);
        const rows = Array.from(page.querySelectorAll('#rpDhRows tr'));
        const dialog = $('rpDhDialog');
        let selected = null;
        const details = {
            'SYL-COE232-2026': ['Approved syllabus and course-outcome / student-outcome mapping.', 'Includes approved syllabus structure, CO/SO alignment, and assessment mapping.'],
            'GM-COE232-2026': ['Approved and locked gradebook summary.', 'Includes authorized class master grading records; individual student grades are not exposed in this demo.'],
            'CQI-COE232-2026': ['Approved Continuous Quality Improvement action summary.', 'Includes unmet Course Outcome evidence, interventions, and expected improvements.']
        };
        const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        function get(row) { const c = row.cells; return { id: row.dataset.id, type: row.dataset.type, course: c[1].querySelector('strong').textContent.trim(), section: c[1].querySelector('small').textContent.trim(), owner: c[2].textContent.trim(), updated: c[3].textContent.trim(), status: row.dataset.status, description: c[5].textContent.trim() }; }
        function apply() { const q = $('rpDhSearch').value.trim().toLowerCase(), type = $('rpDhType').value, status = $('rpDhStatus').value, year = $('rpDhYear').value, department = $('rpDhDepartment').value, program = $('rpDhProgram').value, course = $('rpDhCourse').value, section = $('rpDhSection').value; let count = 0; rows.forEach(r => { const ok = (!q || r.textContent.toLowerCase().includes(q)) && (type === 'all' || r.dataset.type === type) && (status === 'all' || r.dataset.status === status) && (year === r.dataset.year) && (department === 'all' || r.dataset.department === department) && (program === 'all' || r.dataset.program === program) && (course === 'all' || r.dataset.course === course) && (section === 'all' || r.dataset.section === section); r.hidden = !ok; if (ok) count++; }); $('rpDhEmpty').hidden = count !== 0; }
        ['rpDhSearch', 'rpDhType', 'rpDhStatus', 'rpDhYear', 'rpDhDepartment', 'rpDhProgram', 'rpDhCourse', 'rpDhSection'].forEach(id => $(id).addEventListener(id === 'rpDhSearch' ? 'input' : 'change', apply));
        function previewMarkup(row) { const d = get(row), extra = details[d.id] || [d.description, '']; return '<p>' + esc(extra[0]) + '</p><dl>' + [['Report ID', d.id], ['Report Type', d.type], ['Course', d.course], ['Section', d.section], ['Faculty / Owner', d.owner], ['Updated', d.updated], ['Status', d.status], ['Scope', 'Department Head · authorized records']].map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl><h3>Report Details</h3><p>' + esc(extra[1]) + '</p><p><em>Demonstration report only. Official records require backend authorization.</em></p>'; }
        function open(row) { selected = row; $('rpDhDialogTitle').textContent = get(row).type; $('rpDhDialogBody').innerHTML = previewMarkup(row); dialog.showModal(); }
        function close() { if (dialog.open) dialog.close(); }
        function htmlReport(row) { const d = get(row), extra = details[d.id] || [d.description, '']; return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(d.type) + '</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:30px auto;padding:20px;color:#004179}h1{border-bottom:5px solid #f4c300;padding-bottom:14px}dt{font-weight:bold;margin-top:12px}dd{margin:3px 0 10px}</style></head><body><h1>EduMetrics · ' + esc(d.type) + '</h1><p>' + esc(extra[0]) + '</p><dl>' + [['Report ID', d.id], ['Course', d.course], ['Section', d.section], ['Owner', d.owner], ['Updated', d.updated], ['Status', d.status]].map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl><h2>Report Details</h2><p>' + esc(extra[1]) + '</p><p>Demo only — not an official academic record.</p></body></html>'; }
        function downloadBlob(name, data, type) { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
        function download(row) { downloadBlob(get(row).id + '-demo-report.html', htmlReport(row), 'text/html;charset=utf-8'); }
        function print(row) { const w = window.open('', '_blank'); if (!w) { alert('Please allow pop-ups to print the report.'); return; } w.document.open(); w.document.write(htmlReport(row)); w.document.close(); w.focus(); w.print(); }
        page.addEventListener('click', e => { const b = e.target.closest('[data-rpdh-action]'); if (!b) return; const row = b.closest('tr'); if (!row) return; e.preventDefault(); if (b.dataset.rpdhAction === 'view') open(row); if (b.dataset.rpdhAction === 'download') download(row); if (b.dataset.rpdhAction === 'print') print(row); });
        $('rpDhClose').addEventListener('click', close); $('rpDhDone').addEventListener('click', close);
        $('rpDhDialogDownload').addEventListener('click', () => { if (selected) download(selected); });
        $('rpDhDialogPrint').addEventListener('click', () => { if (selected) print(selected); });
        dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
        $('rpDhExport').addEventListener('click', () => { const columns = [['Report ID', 'Report Type', 'Course', 'Section', 'Owner', 'Updated', 'Status', 'Description'], ...rows.filter(r => !r.hidden).map(r => { const d = get(r); return [d.id, d.type, d.course, d.section, d.owner, d.updated, d.status, d.description]; })]; downloadBlob('department-head-compliance-index.csv', columns.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv;charset=utf-8'); });
        apply();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();


/* Requirement 7 — GL Department Head: scoped interactive prototype. */
(function () {
    'use strict';
    function init() {
        const page = document.querySelector('.gl-dept-head-page'); if (!page) return;
        const $ = id => document.getElementById(id), rows = [...$('glRows').rows], dialog = $('glDialog'); let active = null, mode = 'review';
        const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        function state(row) { return { id: row.dataset.id, course: row.cells[0].querySelector('small').textContent.split('2026')[0].trim(), section: row.dataset.course, faculty: row.dataset.faculty, students: row.dataset.students, assessments: row.dataset.assessments, check: row.dataset.check, grades: row.dataset.grades, mapping: row.dataset.mapping, attainment: row.dataset.attainment, status: row.dataset.status }; }
        function counts() { $('glPending').textContent = rows.filter(r => ['For Verification', 'Draft'].includes(r.dataset.status)).length; $('glLocked').textContent = rows.filter(r => r.dataset.status === 'Locked').length; $('glIssues').textContent = rows.filter(r => r.dataset.check !== 'clean').length; }
        function filter() { const q = $('glSearch').value.toLowerCase().trim(), course = $('glCourse').value, section = $('glSection').value, department = $('glDepartment').value, program = $('glProgram').value; let n = 0; rows.forEach(r => { const ok = (!q || r.textContent.toLowerCase().includes(q)) && (!course || r.dataset.course === course) && (!section || r.dataset.course === section) && (!department || department === 'Engineering') && (!program || program === 'BS CpE'); r.hidden = !ok; if (ok) n++; }); $('glCount').textContent = n + ' gradebook(s)'; $('glEmpty').hidden = n > 0; }
        function details(items) { return '<div class="gl-detail-grid">' + items.map(([k, v]) => '<div class="gl-detail"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('') + '</div>'; }
        function btn(text, kind, action) { return '<button type="button" class="gl-btn ' + kind + '" data-gl-dialog="' + action + '">' + text + '</button>'; }
        function show(row, action) {
            active = row; mode = action; const d = state(row); let title = '', content = '', actions = btn('Close', 'gl-outline', 'close'); if (action === 'review') { title = 'Gradebook Review Details'; content = details([['Gradebook / Course', d.id + ' · ' + d.course], ['Section / Faculty', d.section + ' · ' + d.faculty], ['Academic Year / Students', '2026–2027 · ' + d.students + ' students'], ['Assessments', d.assessments + ' assessments'], ['Raw Scores', d.grades], ['Calculated Grades', d.grades === 'Complete' ? 'Verified' : 'Pending'], ['CO/SO Mappings', d.mapping], ['Attainment', d.attainment]]) + '<div class="gl-notice">Data validation: ' + (d.check === 'clean' ? '0 missing scores, 0 incomplete assessments, 0 invalid entries, 0 unmapped CO/SO records.' : '2 missing scores, 1 incomplete assessment, 0 invalid entries, 1 unmapped CO/SO record.') + '</div><h3>Audit history</h3><div class="gl-notice">Submitted for verification · ' + esc(d.faculty) + ' · Oct 12, 2026</div>'; }
            if (action === 'verify') { title = 'Verify Gradebook'; content = details([['Gradebook', d.id + ' · ' + d.course], ['Section / Faculty', d.section + ' · ' + d.faculty], ['Raw Scores / Grades', d.grades], ['CO/SO / Attainment', d.mapping + ' / ' + d.attainment]]) + '<div class="gl-notice">Confirm student records, raw scores, grade calculations, assessment weights, CO/SO mappings and attainment. Any unresolved issues block verification.</div><label for="glReason">Verification remarks</label><textarea id="glReason" placeholder="Record checks performed and verification notes…"></textarea><p id="glDialogError" class="gl-error" hidden></p>'; actions = btn('Cancel', 'gl-outline', 'close') + btn('Mark Verified', 'gl-gold', 'confirm'); }
            if (action === 'reopen') { title = 'Reopen Locked Gradebook'; content = details([['Locked Gradebook', d.id + ' · ' + d.course]]) + '<div class="gl-notice">Reopening allows corrections and changes the status to Reopened. The gradebook must be re-verified before it can be locked again.</div><label for="glReason">Required reason for reopening</label><textarea id="glReason" placeholder="Explain why reopening is necessary…"></textarea><p id="glDialogError" class="gl-error" hidden></p>'; actions = btn('Cancel', 'gl-outline', 'close') + btn('Reopen Gradebook', 'gl-red-outline', 'confirm'); }
            if (action === 'lock') { title = 'Confirm Gradebook Lock'; content = '<p>Lock <strong>' + esc(d.id) + '</strong>? The gradebook will be marked read-only in this prototype. Only a verified record without unresolved issues can be locked.</p><div class="gl-notice">This action will be recorded in the locking history. Corrections require an authorized reopening reason.</div>'; actions = btn('Cancel', 'gl-outline', 'close') + btn('Confirm Lock', 'gl-gold', 'confirm'); }
            $('glDialogTitle').textContent = title; $('glDialogContent').innerHTML = content; $('glDialogActions').innerHTML = actions; if (!dialog.open) dialog.showModal();
        }
        function close() { if (dialog.open) dialog.close(); }
        function updateRow(row, status) { row.dataset.status = status; const badge = row.querySelector('.gl-row-status'); badge.textContent = status; badge.className = 'gl-pill gl-row-status ' + (['Verified', 'Locked'].includes(status) ? 'gl-green' : status === 'For Verification' ? 'gl-yellow' : 'gl-muted'); const action = row.querySelector('.gl-actions'); const type = status === 'Locked' ? 'reopen' : status === 'Verified' ? 'lock' : 'verify'; action.querySelector('[data-gl-action]:last-child').outerHTML = btn(status === 'Locked' ? 'Reopen' : status === 'Verified' ? 'Lock' : 'Verify', type === 'reopen' ? 'gl-red-outline' : type === 'lock' ? 'gl-outline' : 'gl-gold', type).replace('data-gl-dialog', 'data-gl-action'); }
        function history(row, action, remark) { const d = state(row), tr = document.createElement('tr');[d.id, action, 'Department Head', new Date().toLocaleString(), remark || '—'].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td) }); $('glHistory').prepend(tr); }
        function approved() { const list = rows.filter(r => ['Locked', 'Verified'].includes(r.dataset.status)); $('glApprovedList').innerHTML = list.length ? list.map(r => '<p><strong>' + esc(r.dataset.id) + '</strong> — ' + esc(r.dataset.status) + '</p>').join('') : '<p>No approved gradebooks yet.</p>'; }
        $('glRows').addEventListener('click', e => { const button = e.target.closest('button[data-gl-action]'); if (button) show(button.closest('tr'), button.dataset.glAction); });
        dialog.addEventListener('click', e => { const button = e.target.closest('button[data-gl-dialog]'); if (!button) return; if (button.dataset.glDialog === 'close') { close(); return; } if (!active) return; const d = state(active), remark = $('glReason')?.value.trim() || ''; let next = ''; if (mode === 'verify') { if (d.check !== 'clean' || d.grades !== 'Complete' || d.mapping !== 'Verified' || d.attainment !== 'Verified') { const el = $('glDialogError'); el.hidden = false; el.textContent = 'Verification blocked: resolve missing or incomplete data, grades, mappings and attainment first.'; return; } next = 'Verified'; } else if (mode === 'lock') { if (d.status !== 'Verified' || d.check !== 'clean') return; next = 'Locked'; } else if (mode === 'reopen') { if (!remark) { const el = $('glDialogError'); el.hidden = false; el.textContent = 'Please provide a reason for reopening.'; return; } next = 'Reopened'; } if (next) { updateRow(active, next); history(active, next, remark); counts(); filter(); approved(); close(); } });
        $('glDialogX').addEventListener('click', close); dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
        page.querySelectorAll('[data-gl-tab]').forEach(tab => tab.addEventListener('click', () => { page.querySelectorAll('[data-gl-tab]').forEach(t => { const yes = t === tab; t.classList.toggle('active', yes); t.setAttribute('aria-selected', String(yes)); }); page.querySelectorAll('[data-gl-panel]').forEach(p => p.hidden = p.dataset.glPanel !== tab.dataset.glTab); approved(); }));
        $('glSearch').addEventListener('input', filter);['glCourse', 'glSection', 'glDepartment', 'glProgram', 'glYear'].forEach(id => $(id).addEventListener('change', filter)); $('glReset').addEventListener('click', () => { $('glSearch').value = '';['glCourse', 'glSection', 'glDepartment', 'glProgram'].forEach(id => $(id).value = ''); filter(); });
        $('glExport')?.addEventListener('click', () => { const data = [['Gradebook', 'Course', 'Faculty', 'Students', 'Assessments', 'Status'], ...rows.map(r => { const d = state(r); return [d.id, d.section, d.faculty, d.students, d.assessments, d.status] })]; const csv = data.map(a => a.map(s => '"' + String(s).replace(/"/g, '""') + '"').join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'gradebook-locking-index.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
        counts(); filter(); approved();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();


/* Shared Department Head navigation and calendar. */
(function () {
    'use strict'; function init() {
        if (!document.body.classList.contains('dept-head-unified')) return;
        const page = decodeURIComponent(location.pathname).split('/').pop().toLowerCase();
        document.querySelectorAll('.so-subnav a[href]').forEach(a => { let u; try { u = new URL(a.getAttribute('href'), location.href) } catch { return } const yes = decodeURIComponent(u.pathname).split('/').pop().toLowerCase() === page; a.classList.toggle('active', yes); if (yes) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current') });
        document.querySelectorAll('.so-nav-group details').forEach(d => { const s = d.querySelector('summary'); if (!s) return; const sync = () => s.setAttribute('aria-expanded', String(d.open)); sync(); d.addEventListener('toggle', sync) });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

/* Logged-in main information pages: reuse role-specific navigation and header. */
(function () {
    function initLoggedInInfoPage() {
        const page = document.querySelector('.ed-platform-page, .ed-resources-inside-page, .ed-about-inside-page');
        if (!page) return;
        // Select the signed-in role before changing any shared page shell.
        const normalize = value => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'depthead': 'dept-head' }[value] || value);
        const requested = new URLSearchParams(location.search).get('role');
        const stored = sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || sessionStorage.getItem('verifiedRole');
        const role = normalize((requested || stored || 'student').toLowerCase());
        if (role === 'admin') {
            page.querySelectorAll('a[href]').forEach(function (link) {
                const target = new URL(link.getAttribute('href'), location.href);
                const filename = decodeURIComponent(target.pathname).split('/').pop().toLowerCase();
                if (/^blog[1-6]\.html$|^brochure[1-6]\.html$/.test(filename) ||
                    ['platform.html', 'resources.html', 'about us.html'].includes(filename)) {
                    target.searchParams.set('role', 'admin');
                    link.href = target.href;
                }
            });
        }
        if (role === 'admin') { sessionStorage.setItem('edumetricsRole', 'admin'); sessionStorage.setItem('userRole', 'admin'); const shell = document.getElementById('ed-admin-shell'); if (shell) { const nodes = shell.content.cloneNode(true);['.so-topbar', '.so-header-lines', '.so-sidebar'].forEach(selector => { const current = page.querySelector(selector), replacement = nodes.querySelector(selector); if (current && replacement) current.replaceWith(replacement); }); page.querySelectorAll('.so-sidebar a[href]').forEach(link => { const target = new URL(link.getAttribute('href'), location.href); if (['platform.html', 'resources.html', 'about us.html'].includes(decodeURIComponent(target.pathname).split('/').pop().toLowerCase())) { target.searchParams.set('role', 'admin'); link.href = target.href; } }); } document.dispatchEvent(new Event('edumetrics:profile-shell-ready')); return; }
        const selected = ['student', 'faculty', 'dept-head'].includes(role) ? role : 'student';
        sessionStorage.setItem('edumetricsRole', selected);
        sessionStorage.setItem('userRole', selected);
        // Carry the selected role into resource detail URLs instead of relying on stale session state.
        page.querySelectorAll('a[href]').forEach(function (link) {
            const target = new URL(link.getAttribute('href'), location.href);
            const filename = decodeURIComponent(target.pathname).split('/').pop().toLowerCase();
            if (/^blog[1-6]\.html$|^brochure[1-6]\.html$/.test(filename) ||
                ['platform.html', 'resources.html', 'about us.html', 'dashboard.html'].includes(filename)) {
                target.searchParams.set('role', selected);
                link.href = target.href;
            }
        });
        const template = document.getElementById('nav-template-' + selected);
        const current = page.querySelector('.so-sidebar .so-nav');
        if (template && current) current.replaceWith(template.content.cloneNode(true));
        const pathname = decodeURIComponent(location.pathname).split('/').pop().toLowerCase();
        page.querySelectorAll('.so-sidebar .so-nav > a[href]').forEach(link => {
            const target = new URL(link.getAttribute('href'), location.href);
            const active = decodeURIComponent(target.pathname).split('/').pop().toLowerCase() === pathname;
            link.classList.toggle('sd-active', active);
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const label = selected === 'dept-head' ? 'Department Head' : selected === 'faculty' ? 'Faculty' : 'Student';
        const info = page.querySelector('.so-user-info');
        if (info) {
            const name = info.querySelector('strong');
            const subtitle = info.querySelector('span');
            if (name) name.textContent = label;
            if (subtitle) subtitle.textContent = label;
        }
        page.dataset.dashboardRole = selected;
        document.dispatchEvent(new Event('edumetrics:nav-ready'));
        document.dispatchEvent(new Event('edumetrics:profile-shell-ready'));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLoggedInInfoPage);
    else initLoggedInInfoPage();
})();


/* Shared logged-in article and brochure shell; reuse the existing Resources header/sidebar. */
(function () {
    async function initSharedResourceDetail() {
        const body = document.body;
        if ((!body.classList.contains('blog-page') && !body.classList.contains('brochure-page')) || body.dataset.blogLayoutReady) return;
        const normalize = value => ({ 'department-head': 'dept-head', 'department_head': 'dept-head', 'depthead': 'dept-head' }[value] || value);
        const params = new URLSearchParams(location.search);
        const stored = sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || sessionStorage.getItem('verifiedRole') || '';
        const role = normalize((params.get('role') || stored).toLowerCase());
        if (!['student', 'faculty', 'dept-head', 'admin'].includes(role)) return;
        sessionStorage.setItem('edumetricsRole', role);
        sessionStorage.setItem('userRole', role);
        const originalMain = body.querySelector('main.blog-main, main.brochure-main');
        const originalHeader = body.querySelector('header.site-header');
        if (!originalMain || !originalHeader) return;
        const resourcesUrl = new URL('../../main/resources.html', location.href);
        resourcesUrl.searchParams.set('role', role);
        let source;
        try {
            const response = await fetch(resourcesUrl.href, { credentials: 'same-origin' });
            if (!response.ok) return;
            source = new DOMParser().parseFromString(await response.text(), 'text/html');
        } catch (_) { return; }
        const sourceBody = source.body;
        const topbar = sourceBody.querySelector('.so-topbar');
        const lines = sourceBody.querySelector('.so-header-lines');
        const sidebar = sourceBody.querySelector('.so-sidebar');
        if (!topbar || !lines || !sidebar) return;
        // Resolve existing Resources assets and links before moving its shell into this page.
        [topbar, sidebar].forEach(root => root.querySelectorAll('[src],[href]').forEach(node => {
            ['src', 'href'].forEach(attr => {
                const value = node.getAttribute(attr);
                if (value && !value.startsWith('#') && !/^(?:[a-z]+:|\/\/)/i.test(value)) node.setAttribute(attr, new URL(value, resourcesUrl).href);
            });
        }));
        if (role === 'admin') {
            const template = source.getElementById('ed-admin-shell');
            if (template) {
                const fragment = template.content.cloneNode(true);
                ['.so-topbar', '.so-header-lines', '.so-sidebar'].forEach(selector => {
                    const old = sourceBody.querySelector(selector);
                    const fresh = fragment.querySelector(selector);
                    if (old && fresh) old.replaceWith(fresh);
                });
            }
        } else {
            const template = source.getElementById('nav-template-' + role);
            const nav = sidebar.querySelector('.so-nav');
            if (template && nav) nav.replaceWith(template.content.cloneNode(true));
        }
        const finalTopbar = sourceBody.querySelector('.so-topbar');
        const finalLines = sourceBody.querySelector('.so-header-lines');
        const finalSidebar = sourceBody.querySelector('.so-sidebar');
        if (!finalTopbar || !finalLines || !finalSidebar) return;
        [finalTopbar, finalSidebar].forEach(root => root.querySelectorAll('[src],[href]').forEach(node => {
            ['src', 'href'].forEach(attr => {
                const value = node.getAttribute(attr);
                if (value && !value.startsWith('#') && !/^(?:[a-z]+:|\/\/)/i.test(value)) node.setAttribute(attr, new URL(value, resourcesUrl).href);
            });
        }));
        const dashboard = new URL(role === 'admin' ? '../requirement 2/cm-admin.html' : 'dashboard.html', resourcesUrl);
        if (role !== 'admin') dashboard.searchParams.set('role', role);
        finalSidebar.querySelectorAll('a[href]').forEach(link => {
            const file = decodeURIComponent(new URL(link.href, location.href).pathname).split('/').pop().toLowerCase();
            if (file === 'dashboard.html' || (role === 'admin' && /^(dashboard|cm-admin)\.html$/.test(file))) link.href = dashboard.href;
            if (['platform.html', 'resources.html', 'about us.html'].includes(file)) {
                const target = new URL(link.href, location.href);
                target.searchParams.set('role', role);
                link.href = target.href;
            }
            const active = file === 'resources.html';
            link.classList.toggle('active', active);
            link.classList.toggle('sd-active', active);
            if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
        const roleName = { 'student': 'Student', 'faculty': 'Faculty', 'dept-head': 'Department Head', 'admin': 'Admin' }[role];
        const info = finalTopbar.querySelector('.so-user-info');
        if (info) {
            const name = info.querySelector('strong');
            const label = info.querySelector('span');
            if (name) name.textContent = roleName;
            if (label) label.textContent = roleName;
        }
        const breadcrumb = body.querySelector('.workflow-breadcrumb-wrap');
        if (breadcrumb) {
            const links = breadcrumb.querySelectorAll('a');
            if (links.length === 1) links[0].href = resourcesUrl.href;
            else {
                if (links[0]) links[0].href = dashboard.href;
                if (links[1]) links[1].href = resourcesUrl.href;
            }
            originalMain.prepend(breadcrumb);
        }
        originalMain.querySelectorAll('a[href]').forEach(link => {
            const target = new URL(link.getAttribute('href'), location.href);
            const file = decodeURIComponent(target.pathname).split('/').pop().toLowerCase();
            if (file === 'resources.html' || /^blog[1-6]\.html$|^brochure[1-6]\.html$/.test(file)) {
                target.searchParams.set('role', role);
                link.href = target.href;
            }
        });
        const shell = document.createElement('div');
        shell.className = 'so-shell';
        const main = document.createElement('main');
        main.className = 'so-main ed-platform-main ed-inside-main ed-blog-main';
        while (originalMain.firstChild) main.appendChild(originalMain.firstChild);
        shell.append(finalSidebar, main);
        originalMain.replaceWith(shell);
        originalHeader.remove();
        body.querySelector('footer.workflow-footer')?.remove();
        body.prepend(finalTopbar, finalLines);
        body.classList.add('so-student-page', 'ed-dashboard-page', 'ed-inside-page', 'ed-blog-inside');
        body.dataset.dashboardRole = role;
        body.dataset.blogLayoutReady = 'true';
        document.dispatchEvent(new Event('edumetrics:profile-shell-ready'));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSharedResourceDetail, { once: true });
    else initSharedResourceDetail();
})();

/* Admin module behavior — shared script, one controller per page. */
/* CM Admin — frontend page controller */
(function () {
    function init() {
        if (!document.body.classList.contains("cm-admin-page")) return;

        (() => {
            'use strict';
            const users = [{ name: 'System Administrator', email: 'admin@edumetrics.edu', role: 'Admin', department: 'System', scope: 'System-wide', status: 'Active', login: 'Sep. 30, 2026 01:32' }, { name: 'Dr. Maria L. Santos', email: 'maria.santos@edumetrics.edu', role: 'Department Head', department: 'Engineering', scope: 'Department-wide', status: 'Active', login: 'Sep. 30, 2026 01:20' }, { name: 'Jeffrey T. Leonen', email: 'jeffrey.leonen@edumetrics.edu', role: 'Faculty', department: 'Engineering', scope: 'Assigned Courses', status: 'Active', login: 'Sep. 29, 2026 16:44' }, { name: 'Angel S. Villanueva', email: 'angel.villanueva@edumetrics.edu', role: 'Student', department: 'Engineering', scope: 'Own Student Records', status: 'Active', login: 'Sep. 29, 2026 15:12' }, { name: 'Former Faculty Account', email: 'former.faculty@edumetrics.edu', role: 'Faculty', department: 'Engineering', scope: 'Assigned Courses', status: 'Suspended', login: 'Sep. 12, 2026 09:21' }];
            const logs = [['Sep. 30, 2026 01:34:44', 'SECURITY', 'System Administrator', 'Access Control', 'Updated role permissions', 'SEC-00421'], ['Sep. 30, 2026 01:20:17', 'INFO', 'Dr. Maria L. Santos', 'Curriculum Mapping', 'Verified CO-SO mapping', 'MAP-COE232-003'], ['Sep. 29, 2026 16:44:03', 'INFO', 'Jeffrey T. Leonen', 'Assessment Entry', 'Updated raw assessment scores', 'ASM-COE232-014'], ['Sep. 29, 2026 14:26:28', 'WARNING', 'System', 'Attainment', 'CO below target', 'CO-COE232-003'], ['Sep. 29, 2026 14:17:10', 'ERROR', 'System', 'CQI Planning', 'CQI record creation failed', 'CQI-COE232-003'], ['Sep. 29, 2026 16:50:19', 'SECURITY', 'System Administrator', 'User Management', 'Suspended account', 'U-118']];
            const sessions = [{ name: 'System Administrator', role: 'Admin', device: 'Chrome · Windows', ip: '10.20.1.12', login: '01:32', activity: '01:44' }, { name: 'Dr. Maria L. Santos', role: 'Department Head', device: 'Edge · Windows', ip: '10.20.2.41', login: '01:20', activity: '01:43' }, { name: 'Jeffrey T. Leonen', role: 'Faculty', device: 'Chrome · Windows', ip: '10.20.3.18', login: '16:44', activity: '16:59' }];
            const $ = id => document.getElementById(id); const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            function notice(title, msg) { $('dialogTitle').textContent = title; $('dialogText').textContent = msg; $('detailDialog').showModal() }
            function tab(name) { document.querySelectorAll('.cm-admin-page [data-tab]').forEach(b => { const active = b.dataset.tab === name; b.setAttribute('aria-selected', String(active)); b.classList.toggle('active', active) }); document.querySelectorAll('.cm-admin-page [data-panel]').forEach(p => { const active = p.dataset.panel === name; p.hidden = !active; p.classList.toggle('active', active) }) }
            function renderUsers() { const dept = $('department').value, role = $('role').value, status = $('status').value; const filtered = users.filter(u => (!dept || u.department === dept) && (!role || u.role === role) && (!status || u.status === status)); $('usersBody').innerHTML = filtered.map((u) => `<tr><td><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></td><td><span class="cm-pill blue">${esc(u.role)}</span></td><td>${esc(u.department)}</td><td>${esc(u.scope)}</td><td><span class="cm-pill ${u.status === 'Active' ? '' : 'red'}">${u.status}</span></td><td>${esc(u.login)}</td><td><div class="sodh-toolbar-actions"><button type="button" class="sodh-export-btn" data-manage="${users.indexOf(u)}">Manage Access</button>${u.role === 'Admin' ? '' : `<button type="button" class="sodh-export-btn" data-toggle="${users.indexOf(u)}">${u.status === 'Active' ? 'Suspend' : 'Reactivate'}</button>`}</div></td></tr>`).join('') || '<tr><td colspan="7" class="cm-empty">No matching users.</td></tr>'; $('activeCount').textContent = users.filter(u => u.status === 'Active').length }
            function renderLogs() { const query = $('logSearch').value.toLowerCase(), level = $('logLevel').value, module = $('module').value; const rows = logs.filter(r => (!level || r[1] === level) && (!module || r[3] === module) && (!query || r.join(' ').toLowerCase().includes(query))); $('logsBody').innerHTML = rows.map(r => `<tr><td>${esc(r[0])}</td><td><span class="cm-pill ${r[1] === 'ERROR' ? 'red' : r[1] === 'WARNING' ? 'warn' : r[1] === 'SECURITY' ? 'blue' : ''}">${esc(r[1])}</span></td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td><span class="cm-pill blue">${esc(r[5])}</span></td><td><button class="cm-btn sodh-export-btn cm-record-action" data-log="${logs.indexOf(r)}">View Details</button></td></tr>`).join('') || '<tr><td colspan="7" class="cm-empty">No matching audit records.</td></tr>' }
            function renderSessions() { $('sessionsBody').innerHTML = sessions.map((s, i) => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.role)}</td><td>${esc(s.device)}</td><td>${esc(s.ip)}</td><td>${esc(s.login)}</td><td>${esc(s.activity)}</td><td><button class="cm-btn sodh-export-btn cm-record-action cm-record-danger" data-terminate="${i}">Terminate</button></td></tr>`).join('') || '<tr><td colspan="7" class="cm-empty">No active sessions.</td></tr>'; $('sessionCount').textContent = sessions.length + ' Active' }
            function exportCsv() { const rows = [['Timestamp', 'Level', 'User', 'Module', 'Action', 'Record ID'], ...logs]; const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'edumetrics-audit-records.csv'; a.click(); URL.revokeObjectURL(url) }
            document.addEventListener('click', e => { const b = e.target.closest('button,a[data-tab-link]'); if (!b) return; if (b.matches('[data-tab],[data-tab-go],[data-tab-link]')) { if (b.tagName === 'A') e.preventDefault(); tab(b.dataset.tab || b.dataset.tabGo || b.dataset.tabLink) } if (b.dataset.info) { const [title, ...rest] = b.dataset.info.split('|'); notice(title, rest.join('|')) } if (b.dataset.manage !== undefined) { const u = users[+b.dataset.manage]; notice('Manage Access — ' + u.name, 'Role: ' + u.role + '\nAccess scope: ' + u.scope + '\n\nThis prototype is read-only for permission editing.') } if (b.dataset.toggle !== undefined) { const u = users[+b.dataset.toggle]; u.status = u.status === 'Active' ? 'Suspended' : 'Active'; renderUsers(); notice('Account Status Updated', u.name + ' is now ' + u.status + '. Frontend demonstration only.') } if (b.dataset.log !== undefined) { const r = logs[+b.dataset.log]; notice('Audit Record ' + r[5], r.join('\n')) } if (b.dataset.terminate !== undefined) { const s = sessions.splice(+b.dataset.terminate, 1)[0]; renderSessions(); notice('Session Terminated', s.name + ' session removed from the prototype view.') } });
            $('closeDialog').addEventListener('click', () => $('detailDialog').close()); $('addUser').addEventListener('click', () => notice('Add User', 'User creation will be connected to the backend. This frontend prototype does not create real accounts.')); $('exportLogs').addEventListener('click', exportCsv); $('refreshLogs').addEventListener('click', renderLogs);['department', 'role', 'status'].forEach(id => $(id).addEventListener('change', renderUsers)); $('module').addEventListener('change', renderLogs); $('logSearch').addEventListener('input', renderLogs); $('logLevel').addEventListener('change', renderLogs); renderUsers(); renderLogs(); renderSessions(); tab('security');
        })();

    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

/* AC Admin — frontend page controller */
(function () {
    function init() {
        if (!document.body.classList.contains("ac-admin-page")) return;

        (() => {
            const tabs = [...document.querySelectorAll('.ac-tab')];
            const panels = [...document.querySelectorAll('.ac-panel')];
            const dept = document.getElementById('acDepartment');
            const status = document.getElementById('acStatus');
            const search = document.getElementById('acSearch');
            const courseRows = [...document.querySelectorAll('#acCourseTable tbody tr')];
            const deptRows = [...document.querySelectorAll('#acDepartmentTable tbody tr')];
            const input = document.getElementById('acThresholdInput');
            const current = document.getElementById('acCurrentThreshold');
            const bar = document.getElementById('acThresholdBar');
            let threshold = 70;
            function showTab(id) {
                tabs.forEach(tab => { const selected = tab.dataset.tab === id; tab.setAttribute('aria-selected', String(selected)); tab.classList.toggle('active', selected); tab.tabIndex = selected ? 0 : -1; });
                panels.forEach(panel => panel.hidden = panel.id !== 'panel-' + id);
            }
            tabs.forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
            function applyFilters() {
                const selected = dept.value;
                const selectedStatus = status.value;
                const q = search.value.toLowerCase().trim();
                let visible = 0;
                courseRows.forEach(row => {
                    const score = Number(row.dataset.attain);
                    const match = (!selected || row.dataset.dept === selected) && (!selectedStatus || (selectedStatus === 'on' ? score >= threshold : score < threshold)) && row.textContent.toLowerCase().includes(q);
                    row.hidden = !match; if (match) visible++;
                    const badge = row.querySelector('.ac-pill:not(.source)');
                    badge.className = 'ac-pill ' + (score >= threshold ? 'good' : 'bad');
                    badge.textContent = score >= threshold ? 'On Target' : 'Below Target';
                    row.cells[5].textContent = threshold + '%';
                });
                deptRows.forEach(row => { row.hidden = !!selected && row.dataset.dept !== selected; });
                document.getElementById('acResultCount').textContent = visible + ' result(s)';
                document.getElementById('acCourseEmpty').hidden = visible !== 0;
                document.getElementById('acDeptEmpty').hidden = deptRows.some(row => !row.hidden);
            }
            [dept, status, search].forEach(el => el.addEventListener(el === search ? 'input' : 'change', applyFilters));
            const deptDialog = document.getElementById('acDeptDialog');
            const deptDialogTitle = document.getElementById('acDeptDialogTitle');
            const deptDialogSummary = document.getElementById('acDeptDialogSummary');
            const deptDialogCourses = document.getElementById('acDeptDialogCourses');
            let detailDepartment = '';
            document.querySelectorAll('#acDepartmentTable [data-department]').forEach(button => button.addEventListener('click', () => {
                const row = button.closest('tr');
                if (!row || !deptDialog) return;
                detailDepartment = button.dataset.department;
                deptDialogTitle.textContent = detailDepartment + ' — Attainment Details';
                deptDialogSummary.replaceChildren();
                [['Programs', row.cells[1].textContent.trim()], ['Total COs', row.cells[3].textContent.trim()], ['Average Attainment', row.cells[6].querySelector('strong')?.textContent.trim() || '—']].forEach(([label, value]) => {
                    const card = document.createElement('div');
                    const caption = document.createElement('small'); caption.textContent = label;
                    const number = document.createElement('strong'); number.textContent = value;
                    card.append(caption, number); deptDialogSummary.append(card);
                });
                deptDialogCourses.replaceChildren();
                const matches = courseRows.filter(course => course.dataset.dept === detailDepartment);
                matches.forEach(course => {
                    const item = document.createElement('div'); item.className = 'ac-dialog-course';
                    const name = document.createElement('strong'); name.textContent = course.cells[1].textContent.trim().replace(/\s+/g, ' ');
                    const detail = document.createElement('small'); detail.textContent = course.cells[3].textContent.trim().replace(/\s+/g, ' ') + ' · ' + course.cells[4].textContent.trim() + ' attainment';
                    item.append(name, detail); deptDialogCourses.append(item);
                });
                if (!matches.length) { const empty = document.createElement('p'); empty.textContent = 'No individual course records are available in this demo for this department.'; deptDialogCourses.append(empty); }
                deptDialog.showModal();
            }));
            ['acDeptDialogClose', 'acDeptDialogDismiss'].forEach(id => document.getElementById(id)?.addEventListener('click', () => deptDialog.close()));
            deptDialog?.addEventListener('click', event => { if (event.target === deptDialog) deptDialog.close(); });
            document.getElementById('acDeptDialogViewCourses')?.addEventListener('click', () => {
                dept.value = detailDepartment; showTab('courses'); applyFilters(); deptDialog.close();
            });
            document.getElementById('acCancel').addEventListener('click', () => { input.value = threshold; document.getElementById('acSaveMessage').textContent = ''; });
            document.getElementById('acThresholdForm').addEventListener('submit', e => { e.preventDefault(); const value = Number(input.value); if (!Number.isInteger(value) || value < 1 || value > 100) { document.getElementById('acSaveMessage').textContent = 'Enter a whole number from 1 to 100.'; return; } threshold = value; current.textContent = value + '%'; bar.style.width = value + '%'; document.getElementById('acSaveMessage').textContent = 'Threshold updated for this page preview only.'; applyFilters(); });
            document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => { const table = document.getElementById(button.dataset.export === 'departments' ? 'acDepartmentTable' : 'acCourseTable'); const lines = [...table.rows].filter(row => !row.hidden).map(row => [...row.cells].slice(0, button.dataset.export === 'departments' ? -1 : undefined).map(cell => '"' + cell.innerText.replaceAll('"', '""').replaceAll('\n', ' ').trim() + '"').join(',')); const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'edumetrics-' + button.dataset.export + '-attainment.csv'; a.click(); URL.revokeObjectURL(url); }));
            applyFilters();
        })();

    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

/* CQI Admin — frontend page controller */
(function () {
    function init() {
        if (!document.body.classList.contains("cqi-admin-page")) return;

        (() => { const records = [["CQI-COE232-003", "Computer Engineering", "Software Design \u2013 Lab", "Jeffrey T. Leonen", "CO3 \u2022 66%", "Supplemental lab sessions and quiz revisions", "In Progress", "Oct 12, 2026"], ["CQI-COE233-001", "Computer Engineering", "Computer Networks", "Maria L. Santos", "CO2 \u2022 62%", "Guided routing practice and formative checks", "Pending Approval", "Oct 13, 2026"], ["CQI-IT234-001", "Information Technology", "Database Systems", "Ryan P. Cruz", "CO2 \u2022 68%", "Additional SQL practice modules", "Completed", "Oct 10, 2026"], ["CQI-ECE234-004", "Electronics Engineering", "Signals and Systems", "Roxanne D. Cruz", "CO4 \u2022 65%", "Worked examples and weekly feedback", "Returned", "Oct 11, 2026"], ["CQI-ME231-003", "Mechanical Engineering", "Engineering Mechanics", "Daniel R. Tan", "CO2 \u2022 61%", "Concept review and additional problem sets", "Approved", "Oct 9, 2026"]]; const tabs = [...document.querySelectorAll('.cqi-tab')]; tabs.forEach(tab => tab.addEventListener('click', () => { tabs.forEach(t => { const active = t === tab; t.setAttribute('aria-selected', String(active)); t.classList.toggle('active', active); document.getElementById('panel-' + t.dataset.tab).hidden = !active; }); })); const rows = [...document.querySelectorAll('#registerTable tbody tr')]; const filters = ['deptFilter', 'programFilter', 'statusFilter', 'registerSearch'].map(id => document.getElementById(id)); function filter() { let count = 0, progress = 0, pending = 0; rows.forEach(row => { const [dept, program, status, search] = filters.map(x => x.value.trim().toLowerCase()); const ok = (!dept || row.dataset.dept.toLowerCase() === dept) && (!program || row.dataset.dept.toLowerCase() === program) && (!status || row.dataset.status.toLowerCase() === status) && (!search || row.textContent.toLowerCase().includes(search)); row.hidden = !ok; if (ok) { count++; if (['In Progress', 'Completed'].includes(row.dataset.status)) progress++; if (row.dataset.status === 'Pending Approval') pending++; } }); document.getElementById('resultCount').textContent = count + ' record(s)'; document.getElementById('totalPlans').textContent = count; document.getElementById('progressPlans').textContent = progress; document.getElementById('pendingPlans').textContent = pending; } filters.forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', filter)); document.querySelectorAll('[data-record]').forEach(b => b.addEventListener('click', () => { const r = records[+b.dataset.record]; document.getElementById('recordDetails').textContent = 'CQI ID: ' + r[0] + '\nDepartment / Course: ' + r[1] + ' – ' + r[2] + '\nFaculty Owner: ' + r[3] + '\nCO Attainment: ' + r[4] + ' (Target 70%)\nIntervention: ' + r[5] + '\nStatus: ' + r[6] + '\nLast updated: ' + r[7]; document.getElementById('recordDialog').showModal(); })); document.getElementById('addCategory').addEventListener('click', () => document.getElementById('categoryDialog').showModal()); document.querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close())); document.getElementById('categoryForm').addEventListener('submit', e => { e.preventDefault(); const name = document.getElementById('categoryName').value.trim(); if (!name) return; const tr = document.createElement('tr'); const a = document.createElement('td'), d = document.createElement('td'), n = document.createElement('td'), s = document.createElement('td'), act = document.createElement('td'); a.textContent = name; d.textContent = 'Custom intervention category'; n.textContent = '0'; s.innerHTML = '<span class="cqi-pill" data-cat-status>Active</span>'; act.innerHTML = '<button class="cqi-btn" data-toggle-category>Toggle Status</button>'; tr.append(a, d, n, s, act); document.querySelector('#categoryTable tbody').append(tr); document.getElementById('categoryDialog').close(); e.target.reset(); }); document.getElementById('categoryTable').addEventListener('click', e => { if (!e.target.matches('[data-toggle-category]')) return; const pill = e.target.closest('tr').querySelector('[data-cat-status]'); const inactive = pill.textContent === 'Active'; pill.textContent = inactive ? 'Inactive' : 'Active'; pill.classList.toggle('red', inactive); }); document.getElementById('savePermissions').addEventListener('click', () => alert('Permissions saved for this frontend prototype only.')); document.getElementById('exportRegister').addEventListener('click', () => { const csv = [['CQI ID', 'Department', 'Course', 'Faculty', 'CO / Attainment', 'Intervention', 'Status', 'Last Updated'], ...records].map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'cqi-admin-register.csv'; a.click(); URL.revokeObjectURL(url); }); })();

    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

/* GL Admin — frontend page controller */
(function () {
    function init() {
        if (!document.body.classList.contains("gl-admin-page")) return;

        const sections = [...document.querySelectorAll('[data-panel]')]; document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach(b => { b.setAttribute('aria-selected', String(b === button)); b.classList.toggle('active', b === button) }); sections.forEach(s => s.hidden = s.dataset.panel !== button.dataset.tab) })); document.querySelectorAll('.gl-admin-query,.gl-admin-level').forEach(input => input.addEventListener('input', () => { const panel = input.closest('[data-panel]'); const q = (panel.querySelector('.gl-admin-query')?.value || '').toLowerCase(); const level = (panel.querySelector('.gl-admin-level')?.value || '').toLowerCase(); panel.querySelectorAll('tbody tr').forEach(row => { const t = row.innerText.toLowerCase(); row.hidden = !(t.includes(q) && t.includes(level)) }) })); document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => { const panel = button.closest('[data-panel]'); const lines = [...panel.querySelectorAll('tr')].filter(r => !r.hidden).map(r => [...r.querySelectorAll('th,td')].map(c => '"' + c.innerText.replaceAll('"', '""').replaceAll('\n', ' ') + '"').join(',')); const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'edumetrics-' + panel.dataset.panel + '-sample.csv'; a.click(); URL.revokeObjectURL(url) })); const modal = document.getElementById('glDialog'); document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => { const cells = [...button.closest('tr').cells]; document.getElementById('glDialogTitle').textContent = button.dataset.detail.startsWith('reset') ? 'Password Reset Request' : 'Operation Details'; const labels = button.dataset.detail.startsWith('reset') ? ['Request ID', 'User', 'Requested At', 'Verification', 'Status', 'Reviewed By'] : ['Timestamp', 'Actor', 'Operation', 'Module', 'Record ID', 'Result']; document.getElementById('glDialogBody').replaceChildren(...cells.slice(0, labels.length).map((cell, i) => { const box = document.createElement('div'); const small = document.createElement('small'); small.textContent = labels[i]; const strong = document.createElement('strong'); strong.textContent = cell.innerText; box.append(small, strong); return box })); modal.hidden = false })); document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true)); modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true }); document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

/* RP Admin — frontend page controller */
(function () {
    function init() {
        if (!document.body.classList.contains("rp-admin-page")) return;

        (() => { 'use strict'; const tabs = document.querySelectorAll('.rp-admin-tab'), panels = { library: document.getElementById('panel-library'), permissions: document.getElementById('panel-permissions'), settings: document.getElementById('panel-settings') }; tabs.forEach(b => b.addEventListener('click', () => { tabs.forEach(t => { t.setAttribute('aria-selected', String(t === b)); t.classList.toggle('active', t === b) }); Object.entries(panels).forEach(([name, p]) => p.hidden = name !== b.dataset.tab) })); const rows = [...document.querySelectorAll('#reportRows tr')], search = document.getElementById('search'), type = document.getElementById('typeFilter'), status = document.getElementById('statusFilter'); function filter() { const q = search.value.trim().toLowerCase(); rows.forEach(r => { r.hidden = !(r.textContent.toLowerCase().includes(q) && (!type.value || r.dataset.type === type.value) && (!status.value || r.dataset.status === status.value)) }) } search.addEventListener('input', filter); type.addEventListener('change', filter); status.addEventListener('change', filter); const modal = document.getElementById('modal'), content = document.getElementById('modalContent'), title = document.getElementById('modalTitle'), confirm = document.getElementById('modalConfirm'), toast = document.getElementById('toast'); function notice(s) { toast.textContent = s; toast.hidden = false; setTimeout(() => toast.hidden = true, 3000) } function close() { modal.hidden = true } document.getElementById('modalClose').onclick = close; modal.addEventListener('click', e => { if (e.target === modal) close() }); document.addEventListener('keydown', e => { if (e.key === 'Escape') close() }); function getRow(id) { return rows.find(r => r.cells[0].innerText.includes(id)) } document.querySelector('#reportRows').addEventListener('click', e => { const b = e.target.closest('button[data-action]'); if (!b) return; const id = b.dataset.id, row = getRow(id); if (!row) return; if (b.dataset.action === 'download') { const data = ['Report ID,Course,Owner,Updated,Status,Description', [id, row.cells[1].innerText.replace(/\n/g, ' '), row.cells[2].innerText, row.cells[3].innerText, row.dataset.status, row.cells[5].innerText].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')].join('\n'); download(id + '.csv', data); return } title.textContent = b.dataset.action === 'review' ? 'Review / Verification' : 'Compliance Report Details'; content.innerHTML = '<dl><dt>Report ID</dt><dd></dd><dt>Course</dt><dd></dd><dt>Owner</dt><dd></dd><dt>Status</dt><dd></dd></dl>' + (b.dataset.action === 'review' ? '<label style="font-size:12px">Review notes<textarea id="reviewNotes" placeholder="Record notes for review or verification..."></textarea></label>' : ''); const dd = content.querySelectorAll('dd');[id, row.cells[1].innerText, row.cells[2].innerText, row.dataset.status].forEach((v, i) => dd[i].textContent = v); confirm.hidden = b.dataset.action !== 'review'; confirm.onclick = () => { notice('Review recorded for ' + id + ' (frontend only).'); close() }; modal.hidden = false }); function download(name, data) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } document.getElementById('exportList').onclick = () => { const data = ['Report ID,Course,Owner,Updated,Status,Description', ...rows.filter(r => !r.hidden).map(r => [r.cells[0].innerText, r.cells[1].innerText, r.cells[2].innerText, r.cells[3].innerText, r.dataset.status, r.cells[5].innerText].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n'); download('compliance-report-index.csv', data) }; document.getElementById('settingsForm').addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; sessionStorage.setItem('rpAdminSettings', JSON.stringify({ header: f.elements.namedItem("header").checked, date: f.elements.namedItem("date").checked, students: f.elements.namedItem("students").checked, footer: f.elements.namedItem("footer").value })); notice('Document settings saved in this browser.') }); })();

    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

/* Password recovery pages: one scoped controller, no duplicate auth handlers. */
(function () {
    function initPasswordRecovery() {
        if (!document.body.classList.contains('auth-reset-page')) return;
        const role = new URLSearchParams(location.search).get('role') || sessionStorage.getItem('verificationRole') || 'student';
        const label = document.getElementById('loginRoleLabel');
        if (label) label.textContent = ({ student: 'Student', faculty: 'Faculty', 'dept-head': 'Department Head', 'department-head': 'Department Head', 'admin-security': 'Admin & Security' })[role] || 'Student';
        const back = document.getElementById('resetBackLink');
        if (back) back.href += '?role=' + encodeURIComponent(role);
        document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', function () {
            const field = document.getElementById(button.dataset.togglePassword);
            if (!field) return;
            field.type = field.type === 'password' ? 'text' : 'password';
            button.setAttribute('aria-label', field.type === 'password' ? 'Show password' : 'Hide password');
        }));
        const message = document.getElementById('resetFormMessage');
        function feedback(value, success) { if (message) { message.textContent = value; message.classList.toggle('is-success', !!success); } }
        const forgot = document.getElementById('forgotPasswordForm');
        if (forgot) forgot.addEventListener('submit', async function (event) {
            event.preventDefault();
            const email = document.getElementById('resetEmail').value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return feedback('Enter a valid email address.');
            sessionStorage.setItem('verificationEmail', email);
            sessionStorage.setItem('verificationRole', role);
            sessionStorage.setItem('verificationPurpose', 'password_reset');
            feedback('Email saved. Verification delivery requires the connected backend.', true);
        });
        const reset = document.getElementById('resetPasswordForm');
        if (reset) reset.addEventListener('submit', function (event) {
            event.preventDefault();
            const password = document.getElementById('newPassword').value;
            const confirm = document.getElementById('confirmPassword').value;
            if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) return feedback('Password must have 8+ characters, a letter, number, and special character.');
            if (password !== confirm) return feedback('Passwords do not match.');
            feedback('Password validated. Saving requires a verified reset token and backend.', true);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPasswordRecovery);
    else initPasswordRecovery();
})();

/* Registration page: role-aware fields, API options and validation (shared). */
(function () {
  if (!document.getElementById("registrationForm")) return;


        /* ROLE */
        const registrationParams =
            new URLSearchParams(
                window.location.search
            );

        const validRegistrationRoles = [
            "student",
            "faculty",
            "department-head",
            "admin-security"
        ];

        const registrationRoleNames = {
            "student":
                "Student",

            "faculty":
                "Faculty",

            "department-head":
                "Department Head",

            "admin-security":
                "Admin & Security"

        };

        const requestedRegistrationRole =
            registrationParams.get("role") ||
            sessionStorage.getItem("selectedRole") ||
            "student";

        let currentRegistrationRole =
            validRegistrationRoles.includes(
                requestedRegistrationRole
            )
                ? requestedRegistrationRole
                : "student";

        const registrationHeaderRole =
            document.getElementById(
                "registrationHeaderRole"
            );

        let registrationOptionsRequest = 0;

        function resetSelect(select, placeholderText) {
            if (!select) return;
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.disabled = true;
            placeholder.selected = true;
            placeholder.textContent = placeholderText;
            select.replaceChildren(placeholder);
        }

        async function loadRegistrationOptions(role) {
            const select = document.getElementById("department");
            const error = document.getElementById("departmentError");
            const studentDepartment = document.getElementById("studentDepartment");
            const studentDepartmentError = document.getElementById("studentDepartmentError");
            if (!select) return;

            const requestId = ++registrationOptionsRequest;
            resetSelect(select, role === "student" ? "Select Program" : "Select College");
            select.disabled = role === "student";
            if (error) error.textContent = "";
            if (studentDepartmentError) studentDepartmentError.textContent = "";

            if (role === "admin-security") return;

            try {
                if (role === "student") {
                    resetSelect(studentDepartment, "Select College");
                    studentDepartment.disabled = true;
                }
                const response = await fetch(
                    "/api/registration-options/" + encodeURIComponent(role),
                    { headers: { Accept: "application/json" }, credentials: "same-origin" }
                );
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Registration options could not be loaded.");
                }
                if (requestId !== registrationOptionsRequest) return;

                const optionsSelect = role === "student" ? studentDepartment : select;
                (result.options || []).forEach(item => {
                    optionsSelect.add(new Option(item.label, role === "student" ? item.id : item.value));
                });

                if (!result.options || !result.options.length) {
                    throw new Error("No options are configured for this role yet.");
                }
                if (role === "student") studentDepartment.disabled = false;
                else select.disabled = false;
            } catch (requestError) {
                if (requestId === registrationOptionsRequest && error) {
                    if (role === "student" && studentDepartmentError) {
                        studentDepartmentError.textContent = requestError.message;
                    } else {
                        error.textContent = requestError.message;
                    }
                }
            }
        }

        async function loadStudentPrograms(departmentId) {
            const select = document.getElementById("department");
            const error = document.getElementById("departmentError");
            const requestId = ++registrationOptionsRequest;
            resetSelect(select, departmentId ? "Loading programs..." : "Select Program");
            select.disabled = true;
            if (error) error.textContent = "";
            if (!departmentId) return;

            try {
                const response = await fetch(
                    "/api/registration-options/student/" +
                    encodeURIComponent(departmentId) + "/programs",
                    { headers: { Accept: "application/json" }, credentials: "same-origin" }
                );
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Programs could not be loaded.");
                }
                if (requestId !== registrationOptionsRequest) return;
                resetSelect(select, "Select Program");
                (result.options || []).forEach(item => {
                    select.add(new Option(item.label, item.id));
                });
                if (!result.options || !result.options.length) {
                    throw new Error("No programs are configured for this college yet.");
                }
                select.disabled = false;
            } catch (requestError) {
                if (requestId === registrationOptionsRequest && error) {
                    error.textContent = requestError.message;
                }
            }
        }

        function updateRegistrationRole(role) {
            currentRegistrationRole =
                validRegistrationRoles.includes(role)
                    ? role
                    : "student";

            /* UPDATE ROLE IN HEADER */
            if (registrationHeaderRole) {
                registrationHeaderRole.textContent =
                    registrationRoleNames[
                    currentRegistrationRole
                    ];
            }

            /* UPDATE ROLE-SPECIFIC REGISTRATION FIELDS */
            const roleIdNumber =
                document.getElementById(
                    "idNumber"
                );

            const roleDepartment =
                document.getElementById(
                    "department"
                );
            const studentDepartmentGroup = document.getElementById("studentDepartmentGroup");
            const departmentSelectGroup = document.getElementById("departmentSelectGroup");
            const studentDepartment = document.getElementById("studentDepartment");
            const roleDepartmentGroup = roleDepartment
                ? roleDepartment.closest(".form-group")
                : null;
            const departmentRequired =
                currentRegistrationRole !== "admin-security";

            if (roleDepartmentGroup) {
                roleDepartmentGroup.hidden = !departmentRequired;
            }
            if (roleDepartment) {
                roleDepartment.required = departmentRequired;
            }
            if (studentDepartmentGroup) {
                studentDepartmentGroup.hidden = currentRegistrationRole !== "student";
            }
            if (studentDepartment) {
                studentDepartment.required = currentRegistrationRole === "student";
            }
            if (departmentSelectGroup) {
                departmentSelectGroup.hidden =
                    currentRegistrationRole === "admin-security";
            }
            if (roleDepartment) {
                roleDepartment.setAttribute(
                    "aria-label",
                    currentRegistrationRole === "student" ? "Program" : "Department"
                );
            }


            if (currentRegistrationRole === "student") {
                if (roleIdNumber) {
                    roleIdNumber.placeholder =
                        "Student ID Number";
                }
                if (roleDepartment) {
                    roleDepartment.placeholder =
                        "Program";
                }
            }

            else if (
                currentRegistrationRole === "faculty" ||
                currentRegistrationRole === "department-head"
            ) {

                if (roleIdNumber) {
                    roleIdNumber.placeholder =
                        "Employee ID Number";
                }

                if (roleDepartment) {
                    roleDepartment.placeholder =
                        "Department";
                }
            }

            else if (
                currentRegistrationRole === "admin-security"
            ) {

                if (roleIdNumber) {
                    roleIdNumber.placeholder =
                        "Employee ID Number";
                }

                if (roleDepartment) {
                    roleDepartment.placeholder =
                        "Role";
                }
            }

            sessionStorage.setItem(
                "selectedRole",
                currentRegistrationRole
            );

            document.title =
                "EduMetrics | " +
                registrationRoleNames[
                currentRegistrationRole
                ] +
                " Registration";

            loadRegistrationOptions(currentRegistrationRole);

        }

        updateRegistrationRole(
            currentRegistrationRole
        );

        /* FORM ELEMENTS */
        const registrationForm =
            document.getElementById(
                "registrationForm"
            );

        const firstName =
            document.getElementById(
                "firstName"
            );

        const lastName =
            document.getElementById(
                "lastName"
            );

        const idNumber =
            document.getElementById(
                "idNumber"
            );

        const department =
            document.getElementById(
                "department"
            );
        const studentDepartment =
            document.getElementById("studentDepartment");

        if (studentDepartment) {
            studentDepartment.addEventListener("change", () => {
                clearRegistrationError(studentDepartment, "studentDepartmentError");
                loadStudentPrograms(studentDepartment.value);
            });
        }
        if (department) {
            department.addEventListener("change", () => {
                clearRegistrationError(department, "departmentError");
            });
        }

        const signupEmail =
            document.getElementById(
                "signupEmail"
            );

        const signupPassword =
            document.getElementById(
                "signupPassword"
            );

        const confirmPassword =
            document.getElementById(
                "confirmPassword"
            );

        const termsAgreement =
            document.getElementById(
                "termsAgreement"
            );

        /* EMAIL VALIDATION*/
        function validRegistrationEmail(email) {
            return (
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            ).test(email);
        }

        /* PASSWORD VALIDATION*/
        function validateRegistrationPassword(
            password
        ) {
            return {
                length:
                    password.length >= 8,
                uppercase:
                    /[A-Z]/.test(password),
                lowercase:
                    /[a-z]/.test(password),
                number:
                    /[0-9]/.test(password),
                special:
                    /[^A-Za-z0-9]/.test(password)
            };
        }

        /* PASS REQUIREMENTS */
        const lengthRequirement =
            document.getElementById(
                "lengthRequirement"
            );

        const uppercaseRequirement =
            document.getElementById(
                "uppercaseRequirement"
            );

        const lowercaseRequirement =
            document.getElementById(
                "lowercaseRequirement"
            );

        const numberRequirement =
            document.getElementById(
                "numberRequirement"
            );

        const specialRequirement =
            document.getElementById(
                "specialRequirement"
            );

        /* UPDATE PASSWORD */
        function updateRequirement(
            element,
            passed,
            text
        ) {
            if (!element) {
                return;
            }

            if (passed) {

                element.textContent =
                    "✓ " + text;

                element.classList.add(
                    "requirement-passed"
                );
            }
            else {
                element.textContent =
                    "○ " + text;

                element.classList.remove(
                    "requirement-passed"
                );
            }
        }

        /* LIVE PASSWORD REQ */
        function updatePasswordRequirements() {
            const result =
                validateRegistrationPassword(
                    signupPassword.value
                );

            updateRequirement(
                lengthRequirement,
                result.length,
                "8 or more characters"
            );

            updateRequirement(
                uppercaseRequirement,
                result.uppercase,
                "At least one uppercase letter"
            );

            updateRequirement(
                lowercaseRequirement,
                result.lowercase,
                "At least one lowercase letter"
            );

            updateRequirement(
                numberRequirement,
                result.number,
                "At least one number"
            );

            updateRequirement(
                specialRequirement,
                result.special,
                "At least one special character"
            );

        }

        signupPassword.addEventListener(
            "input",
            updatePasswordRequirements
        );

        /* PASSWORD SHOW/HIDE */
        function toggleRegistrationPassword(
            inputId,
            button
        ) {
            const input =
                document.getElementById(
                    inputId
                );

            if (!input) {
                return;
            }

            if (
                input.type === "password"
            ) {
                input.type =
                    "text";
                button.setAttribute(
                    "aria-label",
                    "Hide password"
                );
            }
            else {
                input.type =
                    "password";

                button.setAttribute(
                    "aria-label",
                    "Show password"
                );
            }
        }

        /* ERROR */
        function setRegistrationError(
            input,
            errorId,
            message
        ) {
            const error =
                document.getElementById(
                    errorId
                );

            if (input) {

                input.classList.add(
                    "input-error"
                );
            }

            if (error) {
                error.textContent =
                    message;
            }
        }

        function clearRegistrationError(
            input,
            errorId
        ) {

            const error =
                document.getElementById(
                    errorId
                );

            if (input) {
                input.classList.remove(
                    "input-error"
                );
            }

            if (error) {
                error.textContent =
                    "";
            }
        }

        function clearRegistrationErrors() {
            clearRegistrationError(
                firstName,
                "firstNameError"
            );

            clearRegistrationError(
                lastName,
                "lastNameError"
            );

            clearRegistrationError(
                idNumber,
                "idNumberError"
            );

            clearRegistrationError(
                department,
                "departmentError"
            );
            clearRegistrationError(
                studentDepartment,
                "studentDepartmentError"
            );

            clearRegistrationError(
                signupEmail,
                "signupEmailError"
            );

            clearRegistrationError(
                signupPassword,
                "signupPasswordError"
            );

            clearRegistrationError(
                confirmPassword,
                "confirmPasswordError"
            );

            const termsError =
                document.getElementById(
                    "termsError"
                );

            if (termsError) {
                termsError.textContent =
                    "";
            }
        }

        /* CLEAR FIELD ERROR */
        firstName.addEventListener(
            "input",
            function () {
                clearRegistrationError(
                    firstName,
                    "firstNameError"
                );
            }
        );
        lastName.addEventListener(
            "input",
            function () {

                clearRegistrationError(
                    lastName,
                    "lastNameError"
                );
            }
        );

        idNumber.addEventListener(
            "input",
            function () {

                clearRegistrationError(
                    idNumber,
                    "idNumberError"
                );
            }
        );

        document.getElementById("department").addEventListener(
            "change",
            function () {
                clearRegistrationError(
                    document.getElementById("department"),
                    "departmentError"
                );
            }
        );

        signupEmail.addEventListener(
            "input",
            function () {
                clearRegistrationError(
                    signupEmail,
                    "signupEmailError"
                );
            }
        );

        signupPassword.addEventListener(
            "input",
            function () {

                clearRegistrationError(
                    signupPassword,
                    "signupPasswordError"
                );
            }
        );

        confirmPassword.addEventListener(
            "input",
            function () {
                clearRegistrationError(
                    confirmPassword,
                    "confirmPasswordError"
                );
            }
        );

        termsAgreement.addEventListener(
            "change",
            function () {

                const termsError =
                    document.getElementById(
                        "termsError"
                    );

                if (termsError) {
                    termsError.textContent =
                        "";
                }
            }
        );

        /* SUBMIT */
        registrationForm.addEventListener(
            "submit",
            async function (event) {
                event.preventDefault();
                clearRegistrationErrors();
                const first =
                    firstName.value.trim();
                const last =
                    lastName.value.trim();
                const accountId =
                    idNumber.value.trim();
                const currentDepartmentField =
                    document.getElementById("department");

                const selectedProgramId =
                    currentRegistrationRole === "student" && currentDepartmentField
                        ? currentDepartmentField.value.trim()
                        : "";
                const selectedDepartment =
                    currentRegistrationRole === "student" && currentDepartmentField && selectedProgramId
                        ? currentDepartmentField.selectedOptions[0]?.textContent.trim() || ""
                        : currentDepartmentField
                        ? currentDepartmentField.value.trim()
                        : "";
                const selectedDepartmentId =
                    currentRegistrationRole === "student" && studentDepartment
                        ? studentDepartment.value.trim()
                        : "";

                const email =
                    signupEmail.value.trim();
                const password =
                    signupPassword.value;
                const confirmation =
                    confirmPassword.value;
                const passwordResult =
                    validateRegistrationPassword(
                        password
                    );

                let formIsValid =
                    true;

                /* FIRST NAME */
                if (!first) {
                    setRegistrationError(
                        firstName,
                        "firstNameError",
                        "First name is required."
                    );

                    formIsValid =
                        false;
                }

                /* LAST NAME */
                if (!last) {
                    setRegistrationError(
                        lastName,
                        "lastNameError",
                        "Last name is required."
                    );

                    formIsValid =
                        false;
                }

                /* ID NUMBER */
                if (!accountId) {
                    const idNumberLabel =
                        currentRegistrationRole === "student"
                            ? "Student ID number"
                            : "Employee ID number";

                    setRegistrationError(
                        idNumber,
                        "idNumberError",
                        idNumberLabel + " is required."
                    );

                    formIsValid =
                        false;
                }

                /* DEPARTMENT / PROGRAM */
                if (currentRegistrationRole === "student" && !selectedDepartmentId) {
                    setRegistrationError(
                        studentDepartment,
                        "studentDepartmentError",
                        "Select your college."
                    );
                    formIsValid = false;
                }

                if (
                    currentRegistrationRole !== "admin-security" &&
                    !selectedDepartment
                ) {
                    let secondaryFieldLabel =
                        "Program";
                    if (
                        currentRegistrationRole === "faculty" ||
                        currentRegistrationRole === "department-head"
                    ) {
                        secondaryFieldLabel =
                            "Department";
                    }

                    else if (
                        currentRegistrationRole === "admin-security"
                    ) {
                        secondaryFieldLabel =
                            "Role";
                    }

                    setRegistrationError(
                        currentDepartmentField,
                        "departmentError",
                        secondaryFieldLabel + " is required."
                    );

                    formIsValid =
                        false;
                }

                /* EMAIL */
                if (!email) {
                    setRegistrationError(
                        signupEmail,
                        "signupEmailError",
                        "Email is required."
                    );
                    formIsValid =
                        false;
                }
                else if (
                    !validRegistrationEmail(
                        email
                    )
                ) {
                    setRegistrationError(
                        signupEmail,
                        "signupEmailError",
                        "Enter a valid email address."
                    );
                    formIsValid =
                        false;
                }

                /* PASSWORD */
                if (!password) {
                    setRegistrationError(
                        signupPassword,
                        "signupPasswordError",
                        "Password is required."
                    );
                    formIsValid =
                        false;
                }
                else if (
                    !passwordResult.length ||
                    !passwordResult.uppercase ||
                    !passwordResult.lowercase ||
                    !passwordResult.number ||
                    !passwordResult.special
                ) {

                    setRegistrationError(
                        signupPassword,
                        "signupPasswordError",
                        "Password does not meet all requirements."
                    );

                    formIsValid =
                        false;
                }

                /* CONFIRM PASSWORD */
                if (!confirmation) {

                    setRegistrationError(
                        confirmPassword,
                        "confirmPasswordError",
                        "Please confirm your password."
                    );
                    formIsValid =
                        false;
                }
                else if (
                    password !== confirmation
                ) {
                    setRegistrationError(
                        confirmPassword,
                        "confirmPasswordError",
                        "Passwords do not match."
                    );
                    formIsValid =
                        false;
                }

                /* TERMS */
                if (
                    !termsAgreement.checked
                ) {
                    const termsError =
                        document.getElementById(
                            "termsError"
                        );
                    if (termsError) {
                        termsError.textContent =
                            "Please agree to the Terms and Conditions.";

                    }
                    formIsValid =
                        false;
                }

                /* STOP WHEN INVALID */
                if (!formIsValid) {
                    return;
                }

                /* SAVE TEMPORARY REGISTRATION DETAILS */
                sessionStorage.setItem("signupFirstName", first);
                sessionStorage.setItem("signupLastName", last);
                sessionStorage.setItem("signupIdNumber", accountId);
                sessionStorage.setItem("signupDepartment", selectedDepartment);
                sessionStorage.setItem("signupDepartmentId", selectedDepartmentId);
                sessionStorage.setItem("signupProgramId", selectedProgramId);
                sessionStorage.setItem("verificationEmail", email);
                sessionStorage.setItem("verificationRole", currentRegistrationRole);
                sessionStorage.setItem("verificationPurpose", "signup");

                /* REQUEST REAL EMAIL VERIFICATION FROM FLASK */
                const submitButton = registrationForm.querySelector(
                    'button[type="submit"]'
                );

                if (submitButton) {
                    submitButton.disabled = true;
                }

                try {
                    const response = await fetch(
                        "/api/auth/register",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                firstName: first,
                                lastName: last,
                                idNumber: accountId,
                                department: selectedDepartment,
                                departmentId: selectedDepartmentId,
                                programId: selectedProgramId,
                                email: email,
                                password: password,
                                role: currentRegistrationRole
                            })
                        }
                    );

                    const result = await response.json();

                    if (!response.ok) {
                        const error = new Error(
                            result.error || "Registration could not be completed."
                        );
                        error.isExistingAccount =
                            response.status === 409 &&
                            result.error === "Account Already Exists";
                        throw error;
                    }

                    sessionStorage.setItem("verificationEmail", email);
                    sessionStorage.setItem("verificationPurpose", "signup");
                    sessionStorage.setItem("verificationType", "signup");

                    window.location.href = "/verification-signup.html";

                } catch (error) {
                    openRegistrationModal();

                    if (registrationModalTitle) {
                        registrationModalTitle.textContent =
                            error.isExistingAccount
                                ? "Account Already Exists"
                                : "Registration Error";
                    }

                    if (registrationModalMessage) {
                        registrationModalMessage.textContent =
                            error.message ||
                            "Could not connect to the authentication server.";
                    }
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                }
                /*PASSWORD IS NOT SAVED IN
                    sessionStorage.*/

            }
        );


        /* MODAL*/
        const registrationModal =
            document.getElementById(
                "registrationModal"
            );
        const registrationModalTitle =
            document.getElementById(
                "registrationModalTitle"
            );
        const registrationModalMessage =
            document.getElementById(
                "registrationModalMessage"
            );
        const registrationModalButton =
            document.getElementById(
                "registrationModalButton"
            );

        /* OPEN MODAL */
        function openRegistrationModal() {
            if (!registrationModal) {
                return;
            }
            registrationModal.classList.add(
                "show"
            );
            registrationModal.setAttribute(
                "aria-hidden",
                "false"
            );
        }

        /* CLODE MODAL */
        function closeRegistrationModal() {
            if (!registrationModal) {
                return;
            }
            registrationModal.classList.remove(
                "show"
            );
            registrationModal.setAttribute(
                "aria-hidden",
                "true"
            );
        }

        /* TERMS */
        function showTerms(event) {
            if (event) {
                event.preventDefault();
            }
            registrationModalTitle.textContent =
                "Terms and Conditions";
            registrationModalMessage.textContent =
                "By creating an EduMetrics account, " +
                "you agree to follow the rules and " +
                "policies established for the system.";
            registrationModalButton.textContent =
                "I Understand";
            openRegistrationModal();
        }

        /* ACCEPT TERMS */
        function acceptRegistrationTerms() {
            termsAgreement.checked =
                true;
            const termsError =
                document.getElementById(
                    "termsError"
                );

            if (termsError) {
                termsError.textContent =
                    "";
            }
            closeRegistrationModal();
        }

        /* SETTING MESSAGE */
        function showRegistrationMessage(
            title,
            message
        ) {
            registrationModalTitle.textContent =
                title;
            registrationModalMessage.textContent =
                message;
            registrationModalButton.textContent =
                "Close";
            openRegistrationModal();
        }

        /* CLICK OUTSIDE MODAL */
        registrationModal.addEventListener(
            "click",
            function (event) {
                if (
                    event.target ===
                    registrationModal
                ) {
                    closeRegistrationModal();
                }
            }
        );

        /* ESC CLOSE*/
        document.addEventListener(
            "keydown",
            function (event) {
                if (
                    event.key === "Escape"
                ) {

                    closeRegistrationModal();
                }
            }
        );
    

        // Bind registration actions in the shared script; no inline HTML handlers.
        document.querySelector('.registration-page .header-action')?.addEventListener('click', () =>
            showRegistrationMessage('Support', 'Support options will be available once this section is connected.'));
        document.querySelectorAll('.registration-page .password-toggle').forEach(button => {
            button.addEventListener('click', () => {
                const input = button.closest('.input-wrapper')?.querySelector('input[type="password"], input[type="text"]');
                if (input) toggleRegistrationPassword(input.id, button);
            });
        });
        document.querySelector('.registration-page .terms-option a')?.addEventListener('click', showTerms);
        document.querySelector('.registration-page .registration-modal-close')?.addEventListener('click', closeRegistrationModal);
        document.getElementById('registrationModalButton')?.addEventListener('click', () => {
            if (registrationModalButton.textContent.trim() === 'Close') closeRegistrationModal();
            else acceptRegistrationTerms();
        });

})();

/* Account Approvals: pending requests and reviewer decisions. */
(function () {
  "use strict";
  function initApprovalWorkspace() {
    const page = document.querySelector('body.approval-workspace-page');
    if (!page || page.dataset.workspaceInitialized) return;
    page.dataset.workspaceInitialized = 'true';
    const rawRole = (page.dataset.reviewerRole || '').toLowerCase();
    const queryRole = (new URLSearchParams(location.search).get('role') || '').toLowerCase();
    const savedRole = (sessionStorage.getItem('edumetricsRole') || sessionStorage.getItem('userRole') || '').toLowerCase();
    const chosenRole = [rawRole, queryRole, savedRole].find(value => ['department-head', 'department_head', 'dept-head', 'admin', 'admin-security', 'admin_security'].includes(value)) || 'admin';
    const role = ['department-head', 'department_head', 'dept-head'].includes(chosenRole) ? 'dept-head' : 'admin';
    const nav = page.querySelector('.so-nav[data-approval-nav="' + role + '"]');
    if (nav) nav.hidden = false;
    const label = page.querySelector('#approvalReviewerLabel');
    const name = page.querySelector('#approvalReviewerName');
    const avatar = page.querySelector('#approvalReviewerAvatar');
    const description = page.querySelector('#approvalDescription');
    if (label) label.textContent = role === 'admin' ? 'Admin & Security' : 'Department Head';
    if (name) name.textContent = role === 'admin' ? 'System Administrator' : 'Department Head';
    if (avatar) avatar.textContent = role === 'admin' ? 'AD' : 'DH';
    if (description) description.textContent = role === 'admin' ? 'Review Department Head registrations awaiting approval.' : 'Review Faculty registrations awaiting approval.';
  }
  function initAccountApprovals() {
    const approvalStatus = document.getElementById("approvalStatus");
    const approvalList = document.getElementById("approvalList");
    if (!approvalStatus || !approvalList || approvalList.dataset.approvalsInitialized) return;
    approvalList.dataset.approvalsInitialized = "true";

    async function loadRequests() {
      approvalStatus.textContent = "Loading requests...";
      approvalStatus.classList.remove("approval-error");
      approvalList.replaceChildren();
      try {
        const response = await fetch("/api/account-role-requests", {
          headers: { Accept: "application/json" },
          credentials: "same-origin"
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Requests could not be loaded.");
        const requests = Array.isArray(result.requests) ? result.requests : [];
        if (!requests.length) {
          approvalStatus.textContent = "There are no pending requests.";
          return;
        }
        approvalStatus.textContent = requests.length + " pending request" + (requests.length === 1 ? "" : "s");
        requests.forEach((request) => {
          const profile = request.profile_data || {};
          const card = document.createElement("article");
          card.className = "approval-request";
          const details = document.createElement("div");
          const title = document.createElement("h2");
          title.textContent = profile.full_name || profile.email || "Account request";
          const metadata = document.createElement("div");
          metadata.className = "approval-details";
          [
            ["Role", request.requested_role],
            ["Email", profile.email],
            ["ID", profile.id_number],
            ["Department / Program", profile.department_name || profile.program_name || profile.department_or_program],
            ["Submitted", request.submitted_at]
          ].forEach(([label, value]) => {
            if (!value) return;
            const item = document.createElement("span");
            item.textContent = label + ": " + value;
            metadata.appendChild(item);
          });
          details.append(title, metadata);
          const actions = document.createElement("div");
          actions.className = "approval-actions";
          const approve = document.createElement("button");
          approve.className = "approval-accept";
          approve.type = "button";
          approve.textContent = "Approve";
          approve.addEventListener("click", () => decide(request.id, "approved"));
          const reject = document.createElement("button");
          reject.className = "approval-reject";
          reject.type = "button";
          reject.textContent = "Reject";
          reject.addEventListener("click", () => {
            const reason = window.prompt("Reason for rejection:");
            if (reason === null) return;
            decide(request.id, "rejected", reason.trim());
          });
          actions.append(approve, reject);
          card.append(details, actions);
          approvalList.appendChild(card);
        });
      } catch (error) {
        approvalStatus.textContent = error.message;
        approvalStatus.classList.add("approval-error");
      }
    }

    async function decide(requestId, decision, reason = "") {
      const buttons = approvalList.querySelectorAll("button");
      buttons.forEach(button => { button.disabled = true; });
      try {
        const response = await fetch("/api/account-role-requests/" + encodeURIComponent(requestId) + "/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ decision, reason })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Decision could not be saved.");
        await loadRequests();
      } catch (error) {
        approvalStatus.textContent = error.message;
        approvalStatus.classList.add("approval-error");
      } finally {
        buttons.forEach(button => { if (button.isConnected) button.disabled = false; });
      }
    }

    loadRequests();
    return loadRequests;
  }
  function setupApprovalNotifications() {
    const admin = !!document.querySelector('body.cm-admin-page');
    const dept = !!document.querySelector('body.ed-dashboard-page[data-dashboard-role="dept-head"]') ||
      (document.querySelector('body.ed-dashboard-page') &&
       (new URLSearchParams(location.search).get('role') === 'dept-head'));
    if (!admin && !dept) return;
    const bell = document.querySelector('.so-notification-btn');
    if (!bell || bell.dataset.approvalBellInitialized) return;
    bell.dataset.approvalBellInitialized = 'true';
    let dialog = document.getElementById('eduApprovalDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'eduApprovalDialog';
      dialog.className = 'edu-approval-dialog';
      dialog.setAttribute('aria-labelledby', 'eduApprovalTitle');
      dialog.innerHTML = '<div class="edu-approval-heading"><div><h2 id="eduApprovalTitle">Account approval requests</h2><p>Review ' +
        (admin ? 'Department Head' : 'Faculty') +
        ' registrations awaiting approval.</p></div><button type="button" class="edu-approval-close" aria-label="Close">×</button></div><p id="approvalStatus" class="approval-status" role="status"></p><div id="approvalList" class="approval-list"></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('.edu-approval-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    const refresh = initAccountApprovals();
    function open() {
      if (!dialog.open) dialog.showModal();
      if (refresh) refresh();
    }
    bell.addEventListener('click', open);

  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    initApprovalWorkspace();
    if (document.getElementById('approvalList')) initAccountApprovals();
    setupApprovalNotifications();
  }, { once: true });
  else { initApprovalWorkspace(); if (document.getElementById('approvalList')) initAccountApprovals(); setupApprovalNotifications(); }
  document.addEventListener('edumetrics:nav-ready', setupApprovalNotifications);
})();

/* Profile completion — moved from the page into the shared script. */
(function () {
  function initProfileCompletion() {
    const form = document.getElementById("profileForm");
    if (!form || form.dataset.profileInitialized === "true") return;
    form.dataset.profileInitialized = "true";
    const profileForm = document.getElementById("profileForm");
        const profileRole = profileForm.dataset.role;
        const departmentSelect = document.getElementById("profileDepartment");
        const collegeSelect = document.getElementById("profileCollege");
        const programSelect = document.getElementById("profileProgram");
        const profileError = document.getElementById("profileError");
        let studentProgramRequest = 0;
    
        async function loadProfileOptions() {
          const select = profileRole === "student" ? collegeSelect : departmentSelect;
          if (!select) return;
          const errorMessage = document.getElementById(
            profileRole === "student" ? "profileCollegeError" : "profileOptionsError"
          );
          try {
            const response = await fetch("/api/registration-options/" + encodeURIComponent(profileRole), {
              headers: { Accept: "application/json" },
              credentials: "same-origin"
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Options could not be loaded.");
            if (!Array.isArray(result.options) || result.options.length === 0) {
              throw new Error("No colleges or departments are available. Please contact an administrator.");
            }
            select.replaceChildren(new Option(
              profileRole === "student" ? "Select College" : "Select Department",
              ""
            ));
            result.options.forEach(option => {
              select.add(new Option(option.label, profileRole === "student" ? option.id : option.value));
            });
            select.disabled = false;
          } catch (error) {
            errorMessage.textContent = error.message;
          }
        }
    
        async function loadStudentPrograms(departmentId) {
          const errorMessage = document.getElementById("profileProgramError");
          const requestId = ++studentProgramRequest;
          programSelect.replaceChildren(new Option(
            departmentId ? "Loading programs..." : "Select Program",
            ""
          ));
          programSelect.disabled = true;
          errorMessage.textContent = "";
          if (!departmentId) return;
    
          try {
            const response = await fetch(
              "/api/registration-options/student/" +
              encodeURIComponent(departmentId) + "/programs",
              { headers: { Accept: "application/json" }, credentials: "same-origin" }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Programs could not be loaded.");
            if (requestId !== studentProgramRequest) return;
            if (!Array.isArray(result.options) || result.options.length === 0) {
              throw new Error("No programs are configured for this college yet.");
            }
            programSelect.replaceChildren(new Option("Select Program", ""));
            result.options.forEach(option => {
              programSelect.add(new Option(option.label, option.id));
            });
            programSelect.disabled = false;
          } catch (error) {
            if (requestId === studentProgramRequest) errorMessage.textContent = error.message;
          }
        }
    
        if (collegeSelect) {
          collegeSelect.addEventListener("change", () => {
            document.getElementById("profileCollegeError").textContent = "";
            loadStudentPrograms(collegeSelect.value);
          });
        }
    
        loadProfileOptions();
    
        profileForm.addEventListener("submit", async event => {
          event.preventDefault();
          if (!profileForm.reportValidity()) return;
    
          const formData = new FormData(profileForm);
          const button = profileForm.querySelector("button[type='submit']");
          button.disabled = true;
          profileError.hidden = true;
          try {
            const response = await fetch("/api/auth/complete-profile", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                fullName: formData.get("fullName"),
                idNumber: formData.get("idNumber"),
                department: profileRole === "student"
                  ? programSelect.selectedOptions[0]?.textContent || ""
                  : formData.get("department") || "",
                departmentId: formData.get("departmentId") || "",
                programId: formData.get("programId") || ""
              })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Profile could not be saved.");
            if (result.status === "approval_pending" && ["faculty", "dept-head"].includes(profileRole)) {
              // A one-time UI marker; the server remains the authority on account status.
              sessionStorage.setItem("edumetricsPendingApprovalNotice", profileRole);
              window.location.href = "/account-pending.html?role=" + encodeURIComponent(profileRole);
            } else if (result.status === "approval_pending") {
              // Never present a Faculty/Department Head approval popup to Admin or Student.
              window.location.href = "/account-pending.html";
            } else {
              sessionStorage.removeItem("edumetricsPendingApprovalNotice");
              window.location.href = "/main/dashboard.html";
            }
          } catch (error) {
            profileError.textContent = error.message;
            profileError.hidden = false;
          } finally {
            button.disabled = false;
          }
        });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initProfileCompletion, { once: true });
  else initProfileCompletion();
})();

/* Account pending notice: shown once after a successful Faculty/Dept Head profile submission. */
(function () {
  function initPendingNotice() {
    if (!document.querySelector('.account-pending-page')) return;
    const role = new URLSearchParams(window.location.search).get('role');
    const submittedRole = sessionStorage.getItem('edumetricsPendingApprovalNotice');
    sessionStorage.removeItem('edumetricsPendingApprovalNotice');
    if (!['faculty', 'dept-head'].includes(role) || submittedRole !== role) return;
    if (document.getElementById('eduPendingNotice')) return;

    const approver = role === 'faculty' ? 'your Department Head' : 'Admin & Security';
    const roleLabel = role === 'faculty' ? 'Faculty' : 'Department Head';
    const dialog = document.createElement('dialog');
    dialog.id = 'eduPendingNotice';
    dialog.className = 'edu-approval-dialog edu-status-dialog';
    const title = document.createElement('h2');
    title.textContent = 'Account awaiting approval';
    const message = document.createElement('p');
    message.textContent = 'Your ' + roleLabel + ' account is pending approval by ' + approver + '. You can sign in after your account is approved.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'approval-accept';
    button.textContent = 'OK';
    button.addEventListener('click', () => dialog.close());
    dialog.append(title, message, button);
    document.body.appendChild(dialog);
    dialog.showModal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPendingNotice, { once: true });
  else initPendingNotice();
})();

/* Login page: use the existing shared auth helpers and modal. */
(function () {
    function initLoginPage() {
        const form = document.getElementById("loginForm");
        if (!form || form.dataset.initialized === "true") return;
        form.dataset.initialized = "true";
        const emailField = document.getElementById("loginEmail");
        const passwordField = document.getElementById("loginPassword");
        const params = new URLSearchParams(location.search);
        const rawRole = params.get("role") || "student";
        const role = ({"dept-head":"department-head", "department_head":"department-head"})[rawRole] || rawRole;
        const roleNames = {student:"Student",faculty:"Faculty","department-head":"Department Head","admin-security":"Admin & Security"};
        const selectedRole = roleNames[role] ? role : "student";
        const label = document.getElementById("loginRoleLabel");
        if (label) label.textContent = roleNames[selectedRole];
        document.title = "EduMetrics | " + roleNames[selectedRole] + " Log In";
        const register = document.getElementById("createAccountLink");
        if (register) register.href = "/register?role=" + encodeURIComponent(selectedRole);
        const forgot = document.getElementById("forgotPasswordLink");
        if (forgot) forgot.href = "/forgot-password.html?role=" + encodeURIComponent(selectedRole);
        const toggle = document.querySelector(".login-page .password-toggle");
        if (toggle) toggle.addEventListener("click", toggleLoginPassword);
        document.querySelectorAll(".login-page .social-icon-button").forEach(button => button.addEventListener("click", () => {
            socialLogin(button.getAttribute("aria-label").includes("Google") ? "Google" : "Microsoft");
        }));
        const support = document.querySelector(".login-page .header-action");
        if (support) support.addEventListener("click", () => showLoginModal("Support", "Support options will be available once this section is connected.", "!"));
        document.querySelectorAll(".login-page .modal-close-button, .login-page .modal-primary-button").forEach(button => button.addEventListener("click", closeLoginModal));
        const oauthError = params.get("oauth_error");
        const oauthMessage = document.getElementById("oauthErrorMessage");
        if (oauthError === "account_exists" && oauthMessage) {
            oauthMessage.textContent = "Account Already Exists. Please use your account.";
            oauthMessage.hidden = false;
        }
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const email = emailField.value.trim();
            const password = passwordField.value;
            const emailError = document.getElementById("loginEmailError");
            const passwordError = document.getElementById("loginPasswordError");
            emailError.textContent = passwordError.textContent = "";
            emailField.classList.remove("input-error");
            passwordField.classList.remove("input-error");
            let valid = true;
            if (!isValidEmail(email)) {
                emailError.textContent = email ? "Please enter a valid email address." : "Please enter your email.";
                emailField.classList.add("input-error"); valid = false;
            }
            if (!password) { passwordError.textContent = "Please enter your password."; passwordField.classList.add("input-error"); valid = false; }
            if (!valid) return;
            sessionStorage.setItem("verificationEmail", email);
            sessionStorage.setItem("verificationRole", selectedRole);
            sessionStorage.setItem("verificationPurpose", "login");
            const rememberMe = !!document.getElementById("rememberMe")?.checked;
            sessionStorage.setItem("rememberMe", String(rememberMe));
            if (["5500", "5501"].includes(location.port)) {
                location.href = "verification-login.html?role=" + encodeURIComponent(selectedRole);
                return;
            }
            try {
                const response = await fetch("/api/auth/login", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({email, password, role:selectedRole, rememberMe})
                });
                const result = await response.json();
                if (!response.ok) {
                    if (result.locked) showLoginModal("Login temporarily locked", `Too many failed password attempts. Please try again in ${result.retry_after || 30} seconds.`, "!");
                    else showLoginModal("Login failed", result.error || "Unable to log in.", "!");
                    return;
                }
                if (result.status === "verification_required") {
                    sessionStorage.setItem("verificationPurpose", "signup");
                    location.href = "verification-signup.html?role=" + encodeURIComponent(selectedRole);
                } else if (result.status === "approval_pending") {
                    if (["faculty", "department-head"].includes(selectedRole)) {
                        showLoginModal("Account awaiting approval", result.message || "Your account is waiting for approval.", "!");
                    } else {
                        showLoginModal("Login unavailable", "This account cannot log in yet. Please contact support if this is unexpected.", "!");
                    }
                } else if (result.status === "login_otp_required") {
                    sessionStorage.setItem("verificationPurpose", "login");
                    location.href = "verification-login.html?role=" + encodeURIComponent(selectedRole);
                } else if (result.status === "authenticated") {
                    location.href = "/main/dashboard.html";
                } else {
                    showLoginModal("Login", result.message || "Unexpected login response.", "!");
                }
            } catch (error) {
                showLoginModal("Connection error", "Could not connect to the login service. Please try again.", "!");
            }
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initLoginPage, {once:true});
    else initLoginPage();
})();
