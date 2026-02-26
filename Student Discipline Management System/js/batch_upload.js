(() => {
  const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || window.API_BASE || '';
  const API_ROOT = `${API_BASE.replace(/\/+$/, '')}/api`;
  const stripWebsiteContentTags = window.SDMSUrlSanitize?.stripWebsiteContentTags || ((value) => {
    if (value == null) return '';
    return String(value)
      .replace(/^<WebsiteContent_[^>]+>/, '')
      .replace(/<\/WebsiteContent_[^>]+>$/, '')
      .trim();
  });
  const BATCH_CHUNK_SIZE = 200;
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
    strand: 'strand'
  };

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api(path, { method = 'POST', body } = {}) {
    const res = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    // 207 Multi-Status is partial success – return it without throwing
    if (!res.ok && res.status !== 207) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  // DOM elements
  const modal           = document.getElementById('batchUploadModal');
  const openBtn         = document.getElementById('batchUploadBtn');
  const closeBtn        = document.getElementById('closeBatchUploadBtn');
  const dropZone        = document.getElementById('dropZone');
  const csvFileInput    = document.getElementById('csvFileInput');
  const fileInfo        = document.getElementById('fileInfo');
  const fileNameEl      = document.getElementById('fileName');
  const clearFileBtn    = document.getElementById('clearFileBtn');
  const parseCSVBtn     = document.getElementById('parseCSVBtn');
  const downloadTplBtn  = document.getElementById('downloadTemplateBtn');
  const previewSection  = document.getElementById('csvPreviewSection');
  const previewCount    = document.getElementById('previewCount');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const confirmUploadBtn = document.getElementById('confirmUploadBtn');
  const validationErrors = document.getElementById('validationErrors');
  const errorList       = document.getElementById('errorList');
  const previewTbody    = document.querySelector('#csvPreviewTable tbody');

  let parsedStudents = [];
  let selectedFile   = null;
  let parseResult = null;

  // ── Modal open / close ──────────────────────────────────────────────────
  function openModal() {
    if (!modal) return;
    resetModal();
    modal.style.display = 'flex';
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    resetModal();
  }

  function resetModal() {
    selectedFile   = null;
    parsedStudents = [];
    if (csvFileInput)    csvFileInput.value = '';
    if (fileInfo)        fileInfo.style.display = 'none';
    if (previewSection)  previewSection.style.display = 'none';
    if (validationErrors) validationErrors.style.display = 'none';
    if (errorList)       errorList.innerHTML = '';
    if (previewTbody)    previewTbody.innerHTML = '';
    parseResult = null;
  }

  // ── File handling ───────────────────────────────────────────────────────
  function setFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a CSV file (.csv).');
      return;
    }
    selectedFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileInfo)   fileInfo.style.display = 'block';
    if (previewSection) previewSection.style.display = 'none';
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);

  dropZone?.addEventListener('click', () => csvFileInput?.click());
  ['dragenter', 'dragover'].forEach(ev => dropZone?.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.style.borderColor = '#3b82f6';
    dropZone.style.background  = '#eff6ff';
  }));
  ['dragleave', 'drop'].forEach(ev => dropZone?.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.style.borderColor = '#d1d5db';
    dropZone.style.background  = '#f9fafb';
  }));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });

  csvFileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) setFile(file);
  });

  clearFileBtn?.addEventListener('click', () => {
    selectedFile = null;
    if (csvFileInput) csvFileInput.value = '';
    if (fileInfo)     fileInfo.style.display = 'none';
    if (previewSection) previewSection.style.display = 'none';
  });

  // ── CSV template download ───────────────────────────────────────────────
  downloadTplBtn?.addEventListener('click', () => {
    const csv = 'LRN,FullName,Age,Grade,Section,Strand\r\n123456789012,Juan Dela Cruz,16,11,A,STEM\r\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'students_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── CSV parsing ─────────────────────────────────────────────────────────
  function parseCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map(cell => stripWebsiteContentTags(cell));
  }

  function normalizeHeaders(headerRow) {
    return headerRow.map(h => HEADER_ALIASES[(h || '').toLowerCase().trim()] || null);
  }

  function buildFullName(firstName, middleName, lastName, fallbackFullName) {
    const composed = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return composed || fallbackFullName || '';
  }

  function parseCSVText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (!lines.length) return { students: [], errors: ['CSV is empty.'] };

    const firstRow = parseCsvLine(lines[0]);
    const normalizedHeaders = normalizeHeaders(firstRow);
    const headerLooksValid = normalizedHeaders.some(Boolean);
    const parseErrors = [];

    if (headerLooksValid) {
      const unknown = firstRow.filter((_, idx) => !normalizedHeaders[idx]);
      if (unknown.length) {
        parseErrors.push(`Unsupported header(s): ${unknown.join(', ')}.`);
      }
    }

    const students = [];
    const dataLines = headerLooksValid ? lines.slice(1) : lines;
    const startRow = headerLooksValid ? 2 : 1;

    dataLines.forEach((line, index) => {
      const cells = parseCsvLine(line);
      const row = startRow + index;
      const record = headerLooksValid
        ? normalizedHeaders.reduce((acc, header, i) => {
            if (header) acc[header] = cells[i] || '';
            return acc;
          }, {})
        : {
            lrn: cells[0] || '',
            full_name: cells[1] || '',
            age: cells[2] || '',
            grade: cells[3] || '',
            section: cells[4] || '',
            strand: cells[5] || ''
          };

      const fullName = stripWebsiteContentTags(record.full_name || '');
      const firstName = stripWebsiteContentTags(record.first_name || '');
      const middleName = stripWebsiteContentTags(record.middle_name || '');
      const lastName = stripWebsiteContentTags(record.last_name || '');
      const ageRaw = stripWebsiteContentTags(record.age || '');
      const age = ageRaw !== '' ? Number(ageRaw) : null;

      students.push({
        _row: row,
        lrn: stripWebsiteContentTags(record.lrn || '') || null,
        full_name: buildFullName(firstName, middleName, lastName, fullName),
        age: Number.isFinite(age) ? age : null,
        grade: stripWebsiteContentTags(record.grade || '') || null,
        section: stripWebsiteContentTags(record.section || '') || null,
        strand: stripWebsiteContentTags(record.strand || '') || null,
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
      if (!s.full_name) {
        errors.push(`Row ${s._row}: Full Name is required (got "${s._fullName || ''}")`);
      }
      if (s.lrn && !/^\d{1,12}$/.test(s.lrn)) {
        errors.push(`Row ${s._row}: LRN must be up to 12 digits (got "${s.lrn}")`);
      }
      if (s._ageRaw !== '' && s._ageRaw != null && (s.age === null || s.age < 0 || s.age > 120)) {
        errors.push(`Row ${s._row}: Invalid age "${s._ageRaw}"`);
      }
    });
    return errors;
  }

  function renderPreview(students) {
    if (!previewTbody) return;
    previewTbody.innerHTML = '';
    students.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${s.lrn || ''}</td>` +
        `<td>${s._fullName || ''}</td>` +
        `<td>${s.age !== null ? s.age : ''}</td>` +
        `<td>${s.grade || ''}</td>` +
        `<td>${s.section || ''}</td>` +
        `<td>${s.strand || ''}</td>` +
        `<td><span style="color:#16a34a;font-weight:500;">Ready</span></td>`;
      previewTbody.appendChild(tr);
    });
  }

  function showValidationErrors(errors) {
    if (!validationErrors || !errorList) return;
    if (!errors.length) { validationErrors.style.display = 'none'; return; }
    errorList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    validationErrors.style.display = 'block';
  }

  parseCSVBtn?.addEventListener('click', () => {
    if (!selectedFile) {
      alert('Please select a CSV file first.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      parseResult = parseCSVText(text);
      parsedStudents = parseResult.students;
      if (!parsedStudents.length) {
        alert('No valid data rows found in the CSV file.');
        return;
      }
      const errors = [...(parseResult.errors || []), ...validateStudents(parsedStudents)];
      showValidationErrors(errors);
      renderPreview(parsedStudents);
      if (previewCount)  previewCount.textContent = String(parsedStudents.length);
      if (previewSection) previewSection.style.display = 'block';
    };
    reader.readAsText(selectedFile);
  });

  cancelUploadBtn?.addEventListener('click', () => {
    if (previewSection) previewSection.style.display = 'none';
    parsedStudents = [];
  });

  // ── Confirm upload ──────────────────────────────────────────────────────
  async function uploadInChunks(students) {
    const aggregate = { inserted: 0, skipped: 0, failed: 0, errors: [] };
    const totalChunks = Math.ceil(students.length / BATCH_CHUNK_SIZE);
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * BATCH_CHUNK_SIZE;
      const chunk = students.slice(start, start + BATCH_CHUNK_SIZE);
      if (confirmUploadBtn) {
        confirmUploadBtn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Uploading chunk ${chunkIndex + 1}/${totalChunks}...`;
      }
      const result = await api('/students/batch', { method: 'POST', body: { students: chunk } });
      aggregate.inserted += result.inserted || 0;
      aggregate.skipped += result.skipped || 0;
      aggregate.failed += result.failed || 0;
      aggregate.errors.push(...(result.errors || []));
    }
    return aggregate;
  }

  confirmUploadBtn?.addEventListener('click', async () => {
    if (!parsedStudents.length) {
      alert('No students to upload. Please parse a CSV file first.');
      return;
    }

    if (confirmUploadBtn) {
      confirmUploadBtn.disabled = true;
      confirmUploadBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';
    }

    try {
      const payload = parsedStudents.map(s => ({
        lrn: s.lrn || null,
        full_name: s.full_name,
        last_name: s.last_name || null,
        age: s.age,
        grade: s.grade || null,
        section: s.section || null,
        strand: s.strand || null
      }));

      const result = await uploadInChunks(payload);

      let msg = `Upload complete!\n\u2705 Inserted: ${result.inserted}`;
      if (result.skipped > 0) msg += `\n\u23ED\uFE0F Skipped (duplicate LRN): ${result.skipped}`;
      if (result.failed  > 0) msg += `\n\u274C Failed: ${result.failed}`;

      if (result.errors && result.errors.length) {
        const sample = result.errors.slice(0, 5).map(e => `  Row ${e.row}: ${e.error}`).join('\n');
        msg += `\n\nFirst errors:\n${sample}`;
        if (result.errors.length > 5) msg += `\n  … and ${result.errors.length - 5} more`;
      }

      alert(msg);
      closeModal();

      // Refresh the student table without a full page reload
      if (typeof window.SDMS_refreshStudents === 'function') {
        window.SDMS_refreshStudents();
      } else {
        window.location.reload();
      }
    } catch (err) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      if (confirmUploadBtn) {
        confirmUploadBtn.disabled = false;
        confirmUploadBtn.innerHTML = '<i class="fa fa-save"></i> Save All Students';
      }
    }
  });

  // Close on outside-click
  window.addEventListener('click', e => {
    if (modal && e.target === modal) closeModal();
  });

})();
