(() => {
  const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || window.API_BASE || '';
  const API_ROOT = `${API_BASE.replace(/\/+$/, '')}/api`;

  // Modal elements
  const batchUploadBtn = document.getElementById('batchUploadBtn');
  const batchUploadModal = document.getElementById('batchUploadModal');
  const closeBatchUploadBtn = document.getElementById('closeBatchUploadBtn');
  const csvFileInput = document.getElementById('csvFileInput');
  const dropZone = document.getElementById('dropZone');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const clearFileBtn = document.getElementById('clearFileBtn');
  const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
  const parseCSVBtn = document.getElementById('parseCSVBtn');
  const csvPreviewSection = document.getElementById('csvPreviewSection');
  const csvPreviewTable = document.getElementById('csvPreviewTable');
  const previewCount = document.getElementById('previewCount');
  const confirmUploadBtn = document.getElementById('confirmUploadBtn');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const validationErrors = document.getElementById('validationErrors');
  const errorList = document.getElementById('errorList');

  let parsedStudents = [];
  let validationResults = [];
  let selectedFile = null;

  // API helper
  async function api(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_ROOT}${path}`;
    const token = localStorage.getItem('token');
    
    const config = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Download CSV template
  downloadTemplateBtn?.addEventListener('click', () => {
    const template = [
      'LRN,FullName,Age,Grade,Section,Strand',
      '123456789012,Juan Dela Cruz,16,11,A,STEM',
      '234567890123,Maria Santos,17,12,B,ABM',
      '345678901234,Pedro Reyes,15,10,C,HUMSS'
    ].join('\n');

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'student_batch_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  // Drag and drop handlers
  dropZone?.addEventListener('click', () => csvFileInput?.click());

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#3b82f6';
    dropZone.style.background = '#dbeafe';
  });

  dropZone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#d1d5db';
    dropZone.style.background = '#f9fafb';
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#d1d5db';
    dropZone.style.background = '#f9fafb';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        selectedFile = file;
        showFileInfo(file);
      } else {
        alert('Please drop a CSV file (.csv extension)');
      }
    }
  });

  csvFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      selectedFile = file;
      showFileInfo(file);
    }
  });

  clearFileBtn?.addEventListener('click', () => {
    clearFile();
  });

  function showFileInfo(file) {
    fileName.textContent = file.name;
    fileInfo.style.display = 'block';
    dropZone.style.display = 'none';
  }

  function clearFile() {
    selectedFile = null;
    csvFileInput.value = '';
    fileInfo.style.display = 'none';
    dropZone.style.display = 'block';
    csvPreviewSection.style.display = 'none';
  }

  // Parse CSV content
  function parseCSV(csvText) {
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length < 2) {
      throw new Error('CSV file must contain at least a header row and one data row');
    }

    const header = lines[0].split(',').map(h => h.trim());
    
    // Validate headers (case-insensitive)
    const expectedHeaders = ['LRN', 'FullName', 'Age', 'Grade', 'Section', 'Strand'];
    const headerValid = expectedHeaders.every((expected, index) => {
      return header[index] && header[index].toLowerCase() === expected.toLowerCase();
    });

    if (!headerValid) {
      throw new Error(
        `Invalid CSV headers. Expected: ${expectedHeaders.join(', ')}\n` +
        `Found: ${header.join(', ')}`
      );
    }

    // Parse data rows
    const students = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.split(',').map(v => v.trim());

      if (values.length < 6) {
        errors.push(`Row ${i + 1}: Insufficient columns (expected 6, found ${values.length})`);
        continue;
      }

      const [lrn, fullName, age, grade, section, strand] = values;

      // Basic validation
      const rowErrors = [];
      
      if (!lrn || lrn.length !== 12 || !/^\d{12}$/.test(lrn)) {
        rowErrors.push('LRN must be exactly 12 digits');
      }

      if (!fullName || fullName.length < 2) {
        rowErrors.push('FullName is required (min 2 characters)');
      }

      const ageNum = parseInt(age, 10);
      if (!age || isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        rowErrors.push('Age must be a valid number between 0 and 120');
      }

      const validGrades = ['7', '8', '9', '10', '11', '12'];
      if (!grade || !validGrades.includes(grade)) {
        rowErrors.push('Grade must be one of: 7, 8, 9, 10, 11, 12');
      }

      if (!section || section.length < 1) {
        rowErrors.push('Section is required');
      }

      const validStrands = ['ABM', 'HUMSS', 'STEM', 'GAS'];
      if (strand && !validStrands.includes(strand.toUpperCase())) {
        rowErrors.push(`Strand must be one of: ${validStrands.join(', ')}`);
      }

      // Parse full name into parts (simple split by space)
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

      students.push({
        rowNumber: i + 1,
        lrn,
        fullName,
        firstName,
        middleName,
        lastName,
        age: ageNum,
        grade,
        section,
        strand: strand ? strand.toUpperCase() : '',
        errors: rowErrors,
        valid: rowErrors.length === 0
      });

      if (rowErrors.length > 0) {
        errors.push(`Row ${i + 1} (${lrn || 'no LRN'}): ${rowErrors.join(', ')}`);
      }
    }

    return { students, errors };
  }

  // Display preview
  function displayPreview(students, errors) {
    const tbody = csvPreviewTable.querySelector('tbody');
    tbody.innerHTML = '';

    students.forEach(student => {
      const row = document.createElement('tr');
      row.style.backgroundColor = student.valid ? '#f0fdf4' : '#fee2e2';

      row.innerHTML = `
        <td>${student.lrn}</td>
        <td>${student.fullName}</td>
        <td>${student.age}</td>
        <td>${student.grade}</td>
        <td>${student.section}</td>
        <td>${student.strand}</td>
        <td>
          ${student.valid 
            ? '<span style="color: #059669;"><i class="fa fa-check-circle"></i> Valid</span>'
            : '<span style="color: #dc2626;"><i class="fa fa-exclamation-triangle"></i> Invalid</span>'
          }
        </td>
      `;

      tbody.appendChild(row);
    });

    previewCount.textContent = students.length;

    // Display errors if any
    if (errors.length > 0) {
      errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
      validationErrors.style.display = 'block';
      confirmUploadBtn.disabled = true;
      confirmUploadBtn.style.opacity = '0.5';
      confirmUploadBtn.style.cursor = 'not-allowed';
    } else {
      validationErrors.style.display = 'none';
      confirmUploadBtn.disabled = false;
      confirmUploadBtn.style.opacity = '1';
      confirmUploadBtn.style.cursor = 'pointer';
    }

    csvPreviewSection.style.display = 'block';
  }

  // Handle CSV file parsing
  parseCSVBtn?.addEventListener('click', async () => {
    if (!selectedFile) {
      alert('Please select a CSV file first');
      return;
    }

    try {
      parseCSVBtn.disabled = true;
      parseCSVBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Parsing...';

      const text = await selectedFile.text();
      const result = parseCSV(text);
      
      parsedStudents = result.students;
      validationResults = result.errors;

      displayPreview(parsedStudents, validationResults);

    } catch (error) {
      alert(`Error parsing CSV: ${error.message}`);
      console.error('CSV parse error:', error);
    } finally {
      parseCSVBtn.disabled = false;
      parseCSVBtn.innerHTML = '<i class="fa fa-check-circle"></i> Parse & Preview';
    }
  });

  // Handle bulk upload
  confirmUploadBtn?.addEventListener('click', async () => {
    const validStudents = parsedStudents.filter(s => s.valid);
    
    if (validStudents.length === 0) {
      alert('No valid students to upload');
      return;
    }

    if (!confirm(`Upload ${validStudents.length} students to the database?\n\nNote: Duplicate LRNs will be skipped.`)) {
      return;
    }

    try {
      confirmUploadBtn.disabled = true;
      confirmUploadBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading...';

      // Prepare students for API
      const studentsToUpload = validStudents.map(s => ({
        lrn: s.lrn,
        first_name: s.firstName,
        middle_name: s.middleName || null,
        last_name: s.lastName,
        age: s.age,
        grade: s.grade,
        section: s.section,
        parent_contact: '09000000000' // Default as mentioned in requirements
      }));

      // Call bulk create endpoint
      const result = await api('/students/batch', {
        method: 'POST',
        body: { students: studentsToUpload }
      });

      // Show detailed results
      const message = [
        `Batch Upload Complete!`,
        ``,
        `✓ Inserted: ${result.inserted || 0}`,
        `⊘ Skipped (duplicates): ${result.skipped || 0}`,
        `✗ Failed: ${result.failed || 0}`,
        ``
      ];

      if (result.errors && result.errors.length > 0) {
        message.push(`Errors:`);
        result.errors.slice(0, 5).forEach(err => {
          message.push(`  Row ${err.row}: ${err.error}`);
        });
        if (result.errors.length > 5) {
          message.push(`  ... and ${result.errors.length - 5} more`);
        }
      }

      alert(message.join('\n'));
      
      // Close modal and refresh student list
      closeBatchUploadModal();
      
      // Trigger refresh of student list
      if (window.location.reload) {
        window.location.reload();
      }

    } catch (error) {
      alert(`Error uploading students: ${error.message}`);
      console.error('Batch upload error:', error);
    } finally {
      confirmUploadBtn.disabled = false;
      confirmUploadBtn.innerHTML = '<i class="fa fa-save"></i> Save All Students';
    }
  });

  // Modal controls
  function openBatchUploadModal() {
    clearFile();
    parsedStudents = [];
    validationResults = [];
    batchUploadModal.style.display = 'flex';
  }

  function closeBatchUploadModal() {
    batchUploadModal.style.display = 'none';
    clearFile();
    parsedStudents = [];
    validationResults = [];
  }

  batchUploadBtn?.addEventListener('click', openBatchUploadModal);
  closeBatchUploadBtn?.addEventListener('click', closeBatchUploadModal);
  cancelUploadBtn?.addEventListener('click', closeBatchUploadModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && batchUploadModal.style.display === 'flex') {
      closeBatchUploadModal();
    }
  });

})();
