(() => {
  const API_BASE = ((window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || window.API_BASE || '')
    .replace(/\/+$/, '');
  const BATCH_UPLOAD_URL = API_BASE.endsWith('/api')
    ? `${API_BASE}/students/batch-upload`
    : `${API_BASE}/api/students/batch-upload`;
  const stripWebsiteContentTags = window.SDMSUrlSanitize?.stripWebsiteContentTags || ((value) => {
    if (value == null) return '';
    return String(value).replace(/^<WebsiteContent_[^>]+>/, '').replace(/<\/WebsiteContent_[^>]+>$/, '').trim();
  });
  const sanitizeRow = window.SDMSUrlSanitize?.sanitizeRow || ((row) => row);
  const EXPECTED_HEADERS = ['lrn', 'full_name', 'age', 'grade', 'section', 'strand'];
  const HEADER_ALIASES = {
    fullname: 'full_name',
    full_name: 'full_name',
    'full name': 'full_name',
    first_name: 'first_name',
    middle_name: 'middle_name',
    last_name: 'last_name',
    lrn: 'lrn',
    age: 'age',
    grade: 'grade',
    section: 'section',
    strand: 'strand',
    email: 'email',
    phone: 'phone',
    url: 'profile_url',
    profile_url: 'profile_url'
  };

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function apiRequest(url, { method = 'POST', body } = {}) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok && res.status !== 207) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  async function apiRequestFormData(url, { method = 'POST', formData } = {}) {
    const { ['Content-Type']: _omitContentType, ...headers } = authHeaders();
    const res = await fetch(url, {
      method,
      headers,
      body: formData
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok && res.status !== 207) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const modal = document.getElementById('batchUploadModal');
  const openBtn = document.getElementById('batchUploadBtn');
  const closeBtn = document.getElementById('closeBatchUploadBtn');
  const dropZone = document.getElementById('dropZone');
  const csvFileInput = document.getElementById('csvFileInput');
  const fileInfo = document.getElementById('fileInfo');
  const fileNameEl = document.getElementById('fileName');
  const clearFileBtn = document.getElementById('clearFileBtn');
  const parseCSVBtn = document.getElementById('parseCSVBtn');
  const downloadTplBtn = document.getElementById('downloadTemplateBtn');
  const previewSection = document.getElementById('csvPreviewSection');
  const previewCount = document.getElementById('previewCount');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const confirmUploadBtn = document.getElementById('confirmUploadBtn');
  const validationErrors = document.getElementById('validationErrors');
  const errorList = document.getElementById('errorList');
  const previewTbody = document.querySelector('#csvPreviewTable tbody');

  let parsedStudents = [];
  let selectedFile = null;
  let parseResult = null;

  function openModal() { if (modal) { resetModal(); modal.style.display = 'flex'; } }
  function closeModal() { if (modal) { modal.style.display = 'none'; resetModal(); } }
  function resetModal() {
    selectedFile = null;
    parsedStudents = [];
    parseResult = null;
    if (csvFileInput) csvFileInput.value = '';
    if (fileInfo) fileInfo.style.display = 'none';
    if (previewSection) previewSection.style.display = 'none';
    if (validationErrors) validationErrors.style.display = 'none';
    if (errorList) errorList.innerHTML = '';
    if (previewTbody) previewTbody.innerHTML = '';
  }

  function setFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) return alert('Please upload a CSV file (.csv).');
    selectedFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileInfo) fileInfo.style.display = 'block';
    if (previewSection) previewSection.style.display = 'none';
  }

  function parseCsvLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map(cell => stripWebsiteContentTags(cell));
  }

  function detectDelimiter(headerLine = '') {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  function normalizeHeaders(headerRow) {
    return headerRow.map(h => HEADER_ALIASES[(h || '').toLowerCase().trim()] || null);
  }

  function buildFullName(firstName, middleName, lastName, fallbackFullName) {
    const composed = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return composed || fallbackFullName || '';
  }

  function parseCSVText(rawText) {
    const parseErrors = [];
    const text = rawText.replace(/^\uFEFF/, '');
    if (text !== rawText) parseErrors.push('UTF-8 BOM detected and normalized.');

    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (!lines.length) return { students: [], errors: ['CSV is empty.'] };

    const delimiter = detectDelimiter(lines[0]);
    if (delimiter === ';') parseErrors.push('Detected semicolon-delimited CSV. Parsed using ";" delimiter.');

    const firstRow = parseCsvLine(lines[0], delimiter);
    const normalizedHeaders = normalizeHeaders(firstRow);
    const headerLooksValid = normalizedHeaders.some(Boolean);

    if (headerLooksValid) {
      const unknown = firstRow.filter((_, idx) => !normalizedHeaders[idx]);
      if (unknown.length) parseErrors.push(`Unsupported header(s): ${unknown.join(', ')}.`);
      const missingRequired = EXPECTED_HEADERS.filter(header => !normalizedHeaders.includes(header));
      if (missingRequired.length) parseErrors.push(`Missing required header(s): ${missingRequired.join(', ')}.`);
    }

    const students = [];
    const dataLines = headerLooksValid ? lines.slice(1) : lines;
    const startRow = headerLooksValid ? 2 : 1;

    dataLines.forEach((line, index) => {
      const cells = parseCsvLine(line, delimiter);
      const row = startRow + index;
      const record = headerLooksValid
        ? normalizedHeaders.reduce((acc, header, i) => {
            if (header) acc[header] = cells[i] || '';
            return acc;
          }, {})
        : { lrn: cells[0] || '', full_name: cells[1] || '', age: cells[2] || '', grade: cells[3] || '', section: cells[4] || '', strand: cells[5] || '' };

      const sanitized = sanitizeRow(record);
      const fullName = stripWebsiteContentTags(sanitized.full_name || '');
      const firstName = stripWebsiteContentTags(sanitized.first_name || '');
      const middleName = stripWebsiteContentTags(sanitized.middle_name || '');
      const lastName = stripWebsiteContentTags(sanitized.last_name || '');
      const ageRaw = stripWebsiteContentTags(sanitized.age || '');
      const age = ageRaw !== '' ? Number(ageRaw) : null;

      students.push({
        _row: row,
        lrn: stripWebsiteContentTags(sanitized.lrn || '') || null,
        full_name: buildFullName(firstName, middleName, lastName, fullName),
        age: Number.isFinite(age) ? age : null,
        grade: stripWebsiteContentTags(sanitized.grade || '') || null,
        section: stripWebsiteContentTags(sanitized.section || '') || null,
        strand: stripWebsiteContentTags(sanitized.strand || '') || null,
        email: stripWebsiteContentTags(sanitized.email || '') || null,
        phone: stripWebsiteContentTags(sanitized.phone || '') || null,
        profile_url: stripWebsiteContentTags(sanitized.profile_url || '') || null,
        last_name: lastName || null,
        _fullName: buildFullName(firstName, middleName, lastName, fullName),
        _ageRaw: ageRaw
      });
    });

    return { students, errors: parseErrors };
  }

  function validateStudents(students) {
    const errors = [];
    students.forEach(s => {
      if (!s.full_name) errors.push(`Row ${s._row}: Full Name is required (got "${s._fullName || ''}")`);
      if (s.lrn && !/^\d{1,12}$/.test(s.lrn)) errors.push(`Row ${s._row}: LRN must be up to 12 digits (got "${s.lrn}")`);
      if (s._ageRaw !== '' && s._ageRaw != null && (s.age === null || s.age < 0 || s.age > 120)) errors.push(`Row ${s._row}: Invalid age "${s._ageRaw}"`);
      if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) errors.push(`Row ${s._row}: Invalid email format`);
      if (s.phone && !/^\+?[0-9()\-\s]{7,20}$/.test(s.phone)) errors.push(`Row ${s._row}: Invalid phone format`);
      if (s.profile_url) {
        try {
          const parsed = new URL(s.profile_url);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad_protocol');
        } catch {
          errors.push(`Row ${s._row}: Invalid profile URL`);
        }
      }
    });
    return errors;
  }

  function renderPreview(students) {
    if (!previewTbody) return;
    previewTbody.innerHTML = '';
    students.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.lrn || ''}</td><td>${s._fullName || ''}</td><td>${s.age !== null ? s.age : ''}</td><td>${s.grade || ''}</td><td>${s.section || ''}</td><td>${s.strand || ''}</td><td><span style="color:#16a34a;font-weight:500;">Ready</span></td>`;
      previewTbody.appendChild(tr);
    });
  }

  function showValidationErrors(errors) {
    if (!validationErrors || !errorList) return;
    if (!errors.length) return void (validationErrors.style.display = 'none');
    errorList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    validationErrors.style.display = 'block';
  }

  async function readCsvAsUtf8(file) {
    const buffer = await file.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('File must be UTF-8 encoded. Please re-save the CSV as UTF-8 and try again.');
    }
  }

  async function uploadStudentCSV(file) {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequestFormData(BATCH_UPLOAD_URL, { method: 'POST', formData });
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  dropZone?.addEventListener('click', () => csvFileInput?.click());
  ['dragenter', 'dragover'].forEach(ev => dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; dropZone.style.background = '#eff6ff'; }));
  ['dragleave', 'drop'].forEach(ev => dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = '#d1d5db'; dropZone.style.background = '#f9fafb'; }));
  dropZone?.addEventListener('drop', e => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) setFile(file); });
  csvFileInput?.addEventListener('change', e => { const file = e.target.files?.[0]; if (file) setFile(file); });
  clearFileBtn?.addEventListener('click', () => { selectedFile = null; if (csvFileInput) csvFileInput.value = ''; if (fileInfo) fileInfo.style.display = 'none'; if (previewSection) previewSection.style.display = 'none'; });
  downloadTplBtn?.addEventListener('click', () => {
    const csv = 'LRN,FullName,Age,Grade,Section,Strand\r\n123456789012,Juan Dela Cruz,16,11,A,STEM\r\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  parseCSVBtn?.addEventListener('click', async () => {
    if (!selectedFile) return alert('Please select a CSV file first.');
    try {
      const text = await readCsvAsUtf8(selectedFile);
      parseResult = parseCSVText(text);
      parsedStudents = parseResult.students;
      if (!parsedStudents.length) return alert('No valid data rows found in the CSV file.');
      const errors = [...(parseResult.errors || []), ...validateStudents(parsedStudents)];
      showValidationErrors(errors);
      renderPreview(parsedStudents);
      if (previewCount) previewCount.textContent = String(parsedStudents.length);
      if (previewSection) previewSection.style.display = 'block';
    } catch (err) {
      alert(err.message || 'Unable to parse CSV file.');
    }
  });

  cancelUploadBtn?.addEventListener('click', () => { if (previewSection) previewSection.style.display = 'none'; parsedStudents = []; });

  confirmUploadBtn?.addEventListener('click', async () => {
    if (!parsedStudents.length) return alert('No students to upload. Please parse a CSV file first.');
    const preflightErrors = [...(parseResult?.errors || []), ...validateStudents(parsedStudents)];
    if (preflightErrors.length) {
      showValidationErrors(preflightErrors);
      return alert('Fix CSV validation errors before uploading.');
    }

    if (confirmUploadBtn) { confirmUploadBtn.disabled = true; confirmUploadBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...'; }
    try {
      if (!selectedFile) throw new Error('No CSV file selected. Please choose a file before uploading.');
      const result = await uploadStudentCSV(selectedFile);
      let msg = `Upload complete!\n✅ Inserted: ${result.inserted}`;
      if (result.skipped > 0) msg += `\n⏭️ Skipped (duplicate LRN): ${result.skipped}`;
      if (result.failed > 0) msg += `\n❌ Failed: ${result.failed}`;
      if (result.warnings?.length) msg += `\n⚠️ Warnings: ${result.warnings.length}`;
      if (result.errors?.length) {
        const sample = result.errors.slice(0, 5).map(e => `  Row ${e.row}: ${e.field} ${e.error}`).join('\n');
        msg += `\n\nFirst errors:\n${sample}`;
      }
      alert(msg);
      closeModal();
      if (typeof window.SDMS_refreshStudents === 'function') window.SDMS_refreshStudents();
      else window.location.reload();
    } catch (err) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      if (confirmUploadBtn) { confirmUploadBtn.disabled = false; confirmUploadBtn.innerHTML = '<i class="fa fa-save"></i> Save All Students'; }
    }
  });

  window.addEventListener('click', e => { if (modal && e.target === modal) closeModal(); });
})();
