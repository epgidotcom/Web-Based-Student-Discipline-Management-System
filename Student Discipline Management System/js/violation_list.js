(() => {
	const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
	const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;

	const PAGE_SIZE = 100;
	let currentPage = 1;
	let allViolations = [];
	let filteredViolations = [];
	let students = [];
	let evidenceState = [];

	const tableBody = document.querySelector('#violationTable tbody');
	const addBtn = document.getElementById('addViolationBtn');
	const searchInput = document.getElementById('searchInput');
	const paginationEl = document.getElementById('violationPagination');
	const tableInfoEl = document.getElementById('violationInfo');
	const tableLoading = document.getElementById('violationLoading');

	const violationModal = document.getElementById('violationModal');
	const violationForm = document.getElementById('violationForm');
	const modalTitle = document.getElementById('modalTitle');
	const editIndexField = document.getElementById('editIndex');

	const studentLRNField = document.getElementById('studentLRN');
	const studentNameField = document.getElementById('studentName');
	const gradeSectionField = document.getElementById('gradeSection');
	const incidentDateField = document.getElementById('incidentDate');
	const descriptionField = document.getElementById('description');
	const violationTypeField = document.getElementById('violationType');
	const sanctionField = document.getElementById('sanction');

	const pastOffenseWrap = document.getElementById('pastOffenseWrap');
	const pastOffenseList = document.getElementById('pastOffenseList');
	const pastOffenseEmpty = document.getElementById('pastOffenseEmpty');

	const evidenceUploader = document.getElementById('evidenceUploader');
	const evidencePreview = document.getElementById('evidencePreview');
	const evidenceDrop = document.getElementById('evidenceDrop');
	const evidenceChoose = document.getElementById('evidenceChoose');
	const evidenceInput = document.getElementById('evidenceInput');
	const evidenceActions = document.getElementById('evidenceActions');
	const evidenceChange = document.getElementById('evidenceChange');
	const evidenceClear = document.getElementById('evidenceClear');

	const viewModal = document.getElementById('viewModal');
	const viewStudent = document.getElementById('viewStudent');
	const viewGradeSection = document.getElementById('viewGradeSection');
	const viewPastOffenseRow = document.getElementById('viewPastOffenseRow');
	const viewPastOffense = document.getElementById('viewPastOffense');
	const viewIncidentDate = document.getElementById('viewIncidentDate');
	const viewAddedDate = document.getElementById('viewAddedDate');
	const viewDescription = document.getElementById('viewDescription');
	const viewViolationType = document.getElementById('viewViolationType');
	const viewSanction = document.getElementById('viewSanction');
	const viewEvidenceWrap = document.getElementById('viewEvidenceWrap');
	const viewEvidence = document.getElementById('viewEvidence');

	const imagePreviewModal = document.getElementById('imagePreviewModal');
	const imagePreviewClose = document.getElementById('imagePreviewClose');
	const imagePreviewFull = document.getElementById('imagePreviewFull');

	function authHeaders(){
		const token = window.SDMSAuth?.getToken?.();
		return token ? { Authorization: `Bearer ${token}` } : {};
	}

	async function api(path, { method = 'GET', body, headers = {} } = {}) {
		const init = { method, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers } };
		if (body !== undefined) {
			init.body = typeof body === 'string' ? body : JSON.stringify(body);
		}
		const res = await fetch(`${API_ROOT}${path}`, init);
		if (!res.ok) {
			const text = await res.text();
			throw new Error(text || `Request failed (${res.status})`);
		}
		if (res.status === 204) return null;
		const ct = res.headers.get('content-type') || '';
		return ct.includes('application/json') ? res.json() : res.text();
	}

	const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	function formatDate(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return DATE_FMT.format(date);
	}

	function closeModal(modal) {
		if (!modal) return;
		modal.style.display = 'none';
	}

	function openModal(modal) {
		if (!modal) return;
		modal.style.display = 'flex';
	}

	function renderEvidencePreview(container, list = [], { selectable = false } = {}) {
		if (!container) return;
		container.innerHTML = '';
		if (!list.length) {
			container.classList.add('is-hidden');
			if (selectable) evidenceActions?.classList.add('is-hidden');
			return;
		}
		container.classList.remove('is-hidden');
		if (selectable) evidenceActions?.classList.remove('is-hidden');

		list.forEach((item, idx) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'evidence-thumb';
			const img = document.createElement('img');
			img.alt = `Evidence ${idx + 1}`;
			img.src = item;
			img.addEventListener('click', () => {
				if (!imagePreviewModal || !imagePreviewFull) return;
				imagePreviewFull.src = item;
				openModal(imagePreviewModal);
			});
			wrapper.appendChild(img);
			container.appendChild(wrapper);
		});
	}

	function resetEvidence() {
		evidenceState = [];
		renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });
	}

	function getTotalPages() {
		return Math.max(1, Math.ceil(filteredViolations.length / PAGE_SIZE));
	}

	function getSliceForPage(page) {
		const start = (page - 1) * PAGE_SIZE;
		return filteredViolations.slice(start, start + PAGE_SIZE);
	}

	function findViolationById(id) {
		if (!id) return null;
		return allViolations.find((v) => String(v.id) === String(id)) || null;
	}

	function findViolationIndex(id) {
		if (!id) return -1;
		return allViolations.findIndex((v) => String(v.id) === String(id));
	}

	function setInfoBar(page) {
		if (!tableInfoEl) return;
		const total = filteredViolations.length;
		if (!total) {
			tableInfoEl.textContent = 'Showing 0 of 0';
			return;
		}
		const start = (page - 1) * PAGE_SIZE + 1;
		const end = Math.min(page * PAGE_SIZE, total);
		tableInfoEl.textContent = `Showing ${start}\u2013${end} of ${total}`;
	}

	function renderPaginationUI(page) {
	if (!paginationEl) return;
	paginationEl.innerHTML = '';

	const totalRecords = filteredViolations.length;
	const totalPages = getTotalPages();

	// Always show pagination controls, even if records < PAGE_SIZE
	const makeBtn = (label, goTo, opts = {}) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.textContent = label;
		if (opts.title) btn.title = opts.title;
		if (opts.current) btn.setAttribute('aria-current', 'page');
		if (opts.disabled) btn.disabled = true;
		btn.className = opts.current ? 'page-btn active' : 'page-btn';
		btn.addEventListener('click', () => gotoPage(goTo));
		return btn;
	};

	// Previous arrow
	const prevBtn = makeBtn('‹', Math.max(1, page - 1), {
		title: 'Previous',
		disabled: page === 1
	});
	paginationEl.appendChild(prevBtn);

	// Numbered page buttons (show up to 5 pages)
	const windowSize = 5;
	let start = Math.max(1, page - Math.floor(windowSize / 2));
	let end = Math.min(totalPages, start + windowSize - 1);
	start = Math.max(1, end - windowSize + 1);

	if (start > 1) {
		paginationEl.appendChild(makeBtn('1', 1));
		if (start > 2) {
			const ellipsis = document.createElement('span');
			ellipsis.textContent = '…';
			paginationEl.appendChild(ellipsis);
		}
	}

	for (let p = start; p <= end; p++) {
		paginationEl.appendChild(makeBtn(String(p), p, { current: p === page }));
	}

	if (end < totalPages) {
		if (end < totalPages - 1) {
			const ellipsis = document.createElement('span');
			ellipsis.textContent = '…';
			paginationEl.appendChild(ellipsis);
		}
		paginationEl.appendChild(makeBtn(String(totalPages), totalPages));
	}

	// Next arrow
	const nextBtn = makeBtn('›', Math.min(totalPages, page + 1), {
		title: 'Next',
		disabled: page === totalPages
	});
	paginationEl.appendChild(nextBtn);

	// Always update info bar
	setInfoBar(page);
}

	function showSpinner(show) {
		if (!tableLoading) return;
		tableLoading.classList.toggle('show', !!show);
		tableLoading.setAttribute('aria-hidden', show ? 'false' : 'true');
	}

	async function gotoPage(page, { force = false } = {}) {
		const totalPages = getTotalPages();
		const next = Math.min(Math.max(1, page), totalPages);
		if (!force && next === currentPage && tableBody?.children?.length) return;
		showSpinner(true);
		tableBody?.classList.add('fade');
		tableBody?.classList.remove('show');
		await new Promise((resolve) => setTimeout(resolve, 220));
		currentPage = next;
		renderTable();
		renderPaginationUI(currentPage);
		setInfoBar(currentPage);
		requestAnimationFrame(() => {
			tableBody?.classList.remove('fade');
			tableBody?.classList.add('show');
			showSpinner(false);
		});
	}

	async function fileToDataURL(file, maxEdge = 1280, quality = 0.9) {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.src = url;
		await img.decode();
		const canvas = document.createElement('canvas');
		const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
		canvas.width = Math.round(img.width * scale);
		canvas.height = Math.round(img.height * scale);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		URL.revokeObjectURL(url);
		return canvas.toDataURL('image/jpeg', quality);
	}

	async function addEvidenceFiles(fileList) {
		if (!fileList?.length) return;
		const toProcess = Array.from(fileList).slice(0, 3 - evidenceState.length);
		for (const file of toProcess) {
			if (!/^image\//i.test(file.type)) continue;
			try {
				const dataUrl = await fileToDataURL(file, 1280, 0.85);
				evidenceState.push(dataUrl);
			} catch (err) {
				console.error('[violations] failed to process evidence', err);
			}
		}
		renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });
	}

	function updatePastOffenseDisplay(items) {
		if (!pastOffenseWrap || !pastOffenseList || !pastOffenseEmpty) return;
		pastOffenseList.innerHTML = '';
		if (!items?.length) {
			pastOffenseWrap.classList.add('is-hidden');
			pastOffenseEmpty.classList.remove('is-hidden');
			return;
		}
		pastOffenseWrap.classList.remove('is-hidden');
		pastOffenseEmpty.classList.add('is-hidden');
		items.slice(0, 5).forEach(v => {
			const li = document.createElement('li');
			const date = formatDate(v.incident_date);
			li.textContent = `${date ? `${date}: ` : ''}${v.offense_type || 'Violation'}`;
			pastOffenseList.appendChild(li);
		});
	}

	function computeFilteredViolations(query = '') {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return [...allViolations];
		return allViolations.filter((v) => {
			return [
				v.student_name,
				v.grade_section,
				v.offense_type,
				v.description,
				v.sanction,
				v.student_lrn,
				v.incident_date,
				v.created_at
			].some((field) => String(field ?? '').toLowerCase().includes(normalized));
		});
	}

	async function refreshTable({ preservePage = false } = {}) {
		const query = searchInput?.value ?? '';
		filteredViolations = computeFilteredViolations(query);
		const totalPages = getTotalPages();
		const targetPage = preservePage ? Math.min(currentPage, totalPages) : 1;
		await gotoPage(targetPage, { force: true });
	}

	function renderTable() {
		if (!tableBody) return;
		tableBody.innerHTML = '';
		const rows = getSliceForPage(currentPage);
		if (!rows.length) {
			const row = document.createElement('tr');
			row.dataset.placeholder = 'empty';
			row.innerHTML = '<td colspan="8" style="text-align:center;color:#6b7280;">No violations recorded</td>';
			tableBody.appendChild(row);
			setInfoBar(currentPage);
			return;
		}

		rows.forEach((v) => {
			const pastOffense = (v.repeat_count ?? 0) > 0 ? `${v.repeat_count}` : '—';
			const row = document.createElement('tr');
			row.dataset.id = v.id;
			row.innerHTML = `
				<td>${v.student_name || '—'}</td>
				<td>${v.grade_section || '—'}</td>
				<td>${pastOffense}</td>
				<td>${formatDate(v.incident_date)}</td>
				<td>${v.offense_type || '—'}</td>
				<td>${v.sanction || '—'}</td>
				<td>${formatDate(v.created_at)}</td>
				<td>
					<button class="action-btn" data-action="view" data-id="${v.id}" title="View"><i class="fa fa-eye"></i></button>
					<button class="action-btn edit-btn" data-action="edit" data-id="${v.id}" title="Edit"><i class="fa fa-edit"></i></button>
					<button class="action-btn delete-btn" data-action="delete" data-id="${v.id}" title="Delete"><i class="fa fa-trash"></i></button>
				</td>`;
			tableBody.appendChild(row);
		});
	}

	async function loadViolations() {
		showSpinner(true);
		tableBody?.classList.remove('show');
		try {
			const list = await api('/violations');
			allViolations = Array.isArray(list) ? list : [];
		} catch (err) {
			console.error('[violations] failed to load', err);
			alert(`Failed to load violations. ${err.message || ''}`.trim());
			allViolations = [];
		}
		await refreshTable();
	}

	async function loadStudents() {
		try {
			const list = await api('/students');
			students = Array.isArray(list) ? list : [];
		} catch (err) {
			console.warn('[violations] failed to load students list', err);
			students = [];
		}
	}

	function findStudentByLRN(lrn) {
		if (!lrn) return null;
		const target = lrn.replace(/\s+/g, '').toLowerCase();
		return students.find(s => String(s.lrn || '').replace(/\s+/g, '').toLowerCase() === target) || null;
	}

	function displayPastOffensesFor(studentId, excludeId) {
		if (!studentId) {
			updatePastOffenseDisplay([]);
			return;
		}
		const items = allViolations.filter(v => v.student_id === studentId && v.id !== excludeId);
		updatePastOffenseDisplay(items);
	}

	function prepareCreateModal() {
		violationForm?.reset();
		violationForm.dataset.studentId = '';
		editIndexField.value = '';
		studentLRNField.value = '';
		studentNameField.value = '';
		gradeSectionField.value = '';
		incidentDateField.value = '';
		descriptionField.value = '';
		violationTypeField.value = '';
		sanctionField.value = '';
		modalTitle.textContent = 'Add Violation';
		resetEvidence();
		displayPastOffensesFor(null);
		openModal(violationModal);
	}

	function prepareEditModal(id) {
		const item = findViolationById(id);
		if (!item) return;
		modalTitle.textContent = 'Edit Violation';
		editIndexField.value = String(item.id);
		violationForm.dataset.studentId = item.student_id ? String(item.student_id) : '';

		const matchingStudent = students.find(s => s.id === item.student_id);
		if (matchingStudent) {
			studentLRNField.value = matchingStudent.lrn || '';
			studentNameField.value = [matchingStudent.first_name, matchingStudent.middle_name, matchingStudent.last_name].filter(Boolean).join(' ');
			gradeSectionField.value = item.grade_section || `${matchingStudent.grade ?? ''}-${matchingStudent.section ?? ''}`.replace(/^-/, '') || '';
		} else {
			studentLRNField.value = '';
			studentNameField.value = item.student_name || '';
			gradeSectionField.value = item.grade_section || '';
		}

		incidentDateField.value = item.incident_date ? String(item.incident_date).slice(0, 10) : '';
		descriptionField.value = item.description || '';
		violationTypeField.value = item.offense_type || '';
		sanctionField.value = item.sanction || '';

		const files = Array.isArray(item.evidence?.files) ? item.evidence.files : [];
		evidenceState = files.slice(0, 3);
		renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });

		displayPastOffensesFor(item.student_id, item.id);
		openModal(violationModal);
	}

	function showViewModal(id) {
		const item = findViolationById(id);
		if (!item) return;
		viewStudent.textContent = item.student_name || '—';
		viewGradeSection.textContent = item.grade_section || '—';
		viewIncidentDate.textContent = formatDate(item.incident_date) || '—';
		viewAddedDate.textContent = formatDate(item.created_at) || '—';
		viewDescription.textContent = item.description || '—';
		viewViolationType.textContent = item.offense_type || '—';
		viewSanction.textContent = item.sanction || '—';

		const history = allViolations.filter(v => v.student_id === item.student_id && v.id !== item.id);
		if (history.length) {
			viewPastOffenseRow.classList.remove('is-hidden');
			viewPastOffense.textContent = `${history.length} earlier case${history.length > 1 ? 's' : ''}`;
		} else {
			viewPastOffenseRow.classList.add('is-hidden');
			viewPastOffense.textContent = '';
		}

		const files = Array.isArray(item.evidence?.files) ? item.evidence.files : [];
		if (files.length) {
			viewEvidenceWrap.classList.remove('is-hidden');
			viewEvidence.innerHTML = '';
			files.forEach((src, idx) => {
				const img = document.createElement('img');
				img.src = src;
				img.alt = `Evidence ${idx + 1}`;
				img.addEventListener('click', () => {
					if (!imagePreviewModal || !imagePreviewFull) return;
					imagePreviewFull.src = src;
					openModal(imagePreviewModal);
				});
				viewEvidence.appendChild(img);
			});
		} else {
			viewEvidenceWrap.classList.add('is-hidden');
			viewEvidence.innerHTML = '';
		}

		openModal(viewModal);
	}

	async function persistViolation(event) {
		event.preventDefault();
		if (violationForm && !violationForm.reportValidity()) {
			return;
		}

		const studentIdRaw = violationForm.dataset.studentId || '';
		const studentId = studentIdRaw ? Number(studentIdRaw) : null;

		// If dataset.studentId wasn't set (user may not have blurred the LRN field),
		// try to resolve the student by the entered LRN now before rejecting.
		let resolvedStudentId = studentId;
		if (!resolvedStudentId || Number.isNaN(resolvedStudentId)) {
			const lrnInput = studentLRNField?.value?.trim();
			if (lrnInput) {
				const match = findStudentByLRN(lrnInput);
				if (match) {
					resolvedStudentId = Number(match.id);
					// Cache the resolved id on the form dataset so subsequent checks pass
					violationForm.dataset.studentId = String(match.id);
					// Also ensure student name/grade display is populated
					studentNameField.value = [match.first_name, match.middle_name, match.last_name].filter(Boolean).join(' ');
					if (!gradeSectionField.value) {
						const composed = [match.grade, match.section].filter(Boolean).join('-');
						gradeSectionField.value = composed || gradeSectionField.value;
					}
				}
			}
		}

		if (!resolvedStudentId || Number.isNaN(resolvedStudentId)) {
			alert('Please enter a valid student LRN to link this violation to an existing student.');
			return;
		}
		violationForm.dataset.studentId = String(resolvedStudentId);

		const payload = {
			student_id: resolvedStudentId,
			grade_section: gradeSectionField?.value?.trim() || null,
			offense_type: violationTypeField?.value || null,
			description: descriptionField?.value?.trim() || null,
			sanction: sanctionField?.value || null,
			incident_date: incidentDateField?.value || null,
			evidence: evidenceState.length ? { files: evidenceState.slice(0, 3) } : null
		};

		try {
			let saved;
			const editId = editIndexField?.value === '' ? null : editIndexField.value;
			if (editId === null) {
				saved = await api('/violations', { method: 'POST', body: payload });
				allViolations.unshift(saved);
			} else {
				const target = findViolationById(editId);
				if (!target) throw new Error('Unable to locate violation to update.');
				saved = await api(`/violations/${encodeURIComponent(target.id)}`, { method: 'PUT', body: payload });
				const allIdx = findViolationIndex(target.id);
				if (allIdx >= 0) {
					allViolations.splice(allIdx, 1, saved);
				}
			}
			await refreshTable({ preservePage: editId !== null });
			closeModal(violationModal);
			violationForm.reset();
			violationForm.dataset.studentId = '';
			studentLRNField.value = '';
			studentNameField.value = '';
			gradeSectionField.value = '';
			resetEvidence();
			displayPastOffensesFor(null);
		} catch (err) {
			console.error('[violations] save failed', err);
			alert(err.message || 'Failed to save violation.');
		}
	}

	async function removeViolation(id) {
		const item = findViolationById(id);
		if (!item) return;
		if (!confirm('Delete this violation record?')) return;
		try {
			await api(`/violations/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
			const allIdx = findViolationIndex(item.id);
			if (allIdx >= 0) {
				allViolations.splice(allIdx, 1);
			}
			await refreshTable({ preservePage: true });
		} catch (err) {
			console.error('[violations] delete failed', err);
			alert(err.message || 'Failed to delete violation.');
		}
	}

	function filterTable() {
		refreshTable().catch((err) => console.error('[violations] filter failed', err));
	}

	function bindEvents() {
		addBtn?.addEventListener('click', prepareCreateModal);
		document.querySelectorAll('#violationModal .close-btn').forEach(btn => btn.addEventListener('click', () => closeModal(violationModal)));
		document.querySelectorAll('#viewModal .close-btn').forEach(btn => btn.addEventListener('click', () => closeModal(viewModal)));
		imagePreviewClose?.addEventListener('click', () => closeModal(imagePreviewModal));
		window.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				closeModal(violationModal);
				closeModal(viewModal);
				closeModal(imagePreviewModal);
			}
		});

		violationForm?.addEventListener('submit', persistViolation);
		searchInput?.addEventListener('keyup', filterTable);

		tableBody?.addEventListener('click', (event) => {
			const button = event.target.closest('button[data-action]');
			if (!button) return;
			const action = button.dataset.action;
			const id = button.dataset.id;
			if (!id) return;
			if (action === 'view') showViewModal(id);
			else if (action === 'edit') prepareEditModal(id);
			else if (action === 'delete') removeViolation(id);
		});

		studentLRNField?.addEventListener('blur', () => {
			const lrn = studentLRNField.value.trim();
			if (!lrn) {
				violationForm.dataset.studentId = '';
				studentNameField.value = '';
				displayPastOffensesFor(null);
				return;
			}
			const match = findStudentByLRN(lrn);
			if (match) {
				violationForm.dataset.studentId = String(match.id);
				studentNameField.value = [match.first_name, match.middle_name, match.last_name].filter(Boolean).join(' ');
				if (!gradeSectionField.value) {
					const composed = [match.grade, match.section].filter(Boolean).join('-');
					gradeSectionField.value = composed || gradeSectionField.value;
				}
				displayPastOffensesFor(match.id);
			} else {
				violationForm.dataset.studentId = '';
				displayPastOffensesFor(null);
				alert('No student found for that LRN. Please ensure the student exists in the system.');
			}
		});

		evidenceChoose?.addEventListener('click', () => evidenceInput?.click());
		evidenceChange?.addEventListener('click', () => evidenceInput?.click());
		evidenceClear?.addEventListener('click', resetEvidence);
		evidenceInput?.addEventListener('change', (e) => addEvidenceFiles(e.target.files));

		['dragenter', 'dragover'].forEach(ev => evidenceDrop?.addEventListener(ev, (e) => {
			e.preventDefault();
			evidenceDrop.classList.add('dragover');
		}));
		['dragleave', 'drop'].forEach(ev => evidenceDrop?.addEventListener(ev, (e) => {
			e.preventDefault();
			evidenceDrop.classList.remove('dragover');
		}));
		evidenceDrop?.addEventListener('drop', (e) => addEvidenceFiles(e.dataTransfer?.files));
	}

	async function init() {
		bindEvents();
		await Promise.all([loadStudents(), loadViolations()]);
	}

	window.searchViolation = () => filterTable();

	init();
})();
