import { Router } from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'node:stream';
import { query } from '../db.js';
import { processBatchStudents, mapStudentUploadToColumns } from '../utils/studentUpload.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const STUDENT_COLUMNS = 'id, lrn, full_name, grade, section, strand';
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID_REGEX = /^\d+$/;

export function getStudentLookup(rawId) {
  const id = String(rawId ?? '').trim();
  if (!id) return null;
  if (UUID_V4_REGEX.test(id)) return { column: 'id', value: id };
  if (NUMERIC_ID_REGEX.test(id)) return { column: 'id', value: Number.parseInt(id, 10) };
  return null;
}

async function getStudentTableColumns() {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'students' ORDER BY ordinal_position`
  );
  return rows.map((row) => row.column_name);
}

// Falls back to false when the constraint lookup fails to avoid invalid conflict targets.
async function hasStudentUniqueConstraint(columnName) {
  try {
    const { rows } = await query(
      `SELECT 1
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.table_name = 'students'
          AND tc.table_schema = current_schema()
          AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
          AND ccu.column_name = $1
        LIMIT 1`,
      [columnName]
    );
    return rows.length > 0;
  } catch (error) {
    console.warn('[hasStudentUniqueConstraint] failed to verify unique constraint on column; duplicate entries may fail', {
      columnName,
      error: error.message
    });
    return false;
  }
}


// List students (paginated)
router.get('/', async (req, res) => {
  const lrnQuery = req.query.lrn;
  if (lrnQuery) {
    try {
      const { rows } = await query(
        `select ${STUDENT_COLUMNS} from students where lrn = $1 limit 1`,
        [lrnQuery]
      );
      if (rows.length === 0) return res.json([]);
      return res.json(rows);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const pageRaw = Number.parseInt(req.query.page, 10);
  const limitRaw = Number.parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 100;
  const offset = (page - 1) * limit;

  try {
    const listResult = await query(
      `select ${STUDENT_COLUMNS} from students order by full_name asc limit $1 offset $2`,
      [limit, offset]
    );
    const countResult = await query('select count(*)::int as total from students');
    const total = countResult.rows[0]?.total ?? 0;

    res.json({
      data: listResult.rows,
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  // Removed legacy payload fields (first_name/middle_name/last_name/etc.); schema now uses full_name.
  const { lrn, full_name, grade, section, strand } = req.body ?? {};
  if (!full_name) return res.status(400).json({ error: 'full_name is required' });

  try {
    const { rows } = await query(
      `insert into students (lrn, full_name, grade, section, strand)
       values ($1,$2,$3,$4,$5)
       returning ${STUDENT_COLUMNS}`,
      [lrn ?? null, full_name, grade ?? null, section ?? null, strand ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Batch create students
router.post('/batch', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `batch-${Date.now()}`;
  const { students } = req.body ?? {};

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'students array is required and must not be empty', requestId });
  }

  const availableColumns = await getStudentTableColumns();
  const results = await processBatchStudents(students, async (student, rowNumber, rawStudent) => {
    const mappedStudent = mapStudentUploadToColumns(student, availableColumns);
    if (!mappedStudent.columns.length) {
      throw new Error('No compatible students columns found');
    }
    const placeholders = mappedStudent.columns.map((_, index) => `$${index + 1}`).join(',');

    try {
      const { rows } = await query(
        `insert into students (${mappedStudent.columns.join(',')})
         values (${placeholders})
         returning id`,
        mappedStudent.values
      );

      return rows[0];
    } catch (e) {
      console.error('[students.batch] row_insert_error', {
        requestId,
        row: rowNumber,
        raw: rawStudent,
        sanitized: student,
        error: e.message,
        time: new Date().toISOString()
      });
      throw e;
    }
  });

  let statusCode;
  if (results.failed === students.length) statusCode = 400;
  else if (results.inserted === students.length) statusCode = 201;
  else statusCode = 207;

  res.status(statusCode).json({
    requestId,
    inserted: results.inserted,
    skipped: results.skipped,
    failed: results.failed,
    errors: results.errors,
    warnings: results.warnings,
    details: results.details
  });
});

// Batch upload students from CSV
router.post('/batch-upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const rows = [];

  try {
    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer)
        .pipe(csv())
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    const availableColumns = await getStudentTableColumns();
    const hasLrnUniqueConstraint = await hasStudentUniqueConstraint('lrn');
    let inserted = 0;

    for (const row of rows) {
      const lrn = row.LRN?.trim() || null;
      const fullName = row.FullName?.trim();
      const grade = row.Grade?.trim() || null;
      const section = row.Section?.trim() || null;
      const strand = row.Strand?.trim() || null;
      const age = Number.parseInt(row.Age, 10);

      if (!fullName) {
        continue;
      }

      const mappedStudent = mapStudentUploadToColumns(
        { lrn, full_name: fullName, age: Number.isNaN(age) ? null : age, grade, section, strand },
        availableColumns
      );
      if (!mappedStudent.columns.length) {
        continue;
      }
      const placeholders = mappedStudent.columns.map((_, index) => `$${index + 1}`).join(',');
      const rowConflictClause = hasLrnUniqueConstraint && mappedStudent.columns.includes('lrn')
        ? ' on conflict (lrn) do nothing'
        : '';
      const insertQuery = `INSERT INTO students (${mappedStudent.columns.join(',')})
         VALUES (${placeholders})${rowConflictClause}`;
      const { rowCount } = await query(insertQuery, mappedStudent.values);

      inserted += rowCount;
    }

    return res.json({ success: true, inserted });
  } catch (error) {
    console.error('Error in /api/students/batch-upload:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get one student
router.get('/:id', async (req, res) => {
  const lookup = getStudentLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  try {
    const { rows } = await query(
      `select ${STUDENT_COLUMNS} from students where ${lookup.column} = $1`,
      [lookup.value]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  // Removed legacy payload fields including last_name; update only current schema columns.
  const { lrn, full_name, grade, section, strand } = req.body ?? {};
  const lookup = getStudentLookup(req.params.id);

  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  try {
    const { rows } = await query(
      `update students
          set lrn = coalesce($1, lrn),
              full_name = coalesce($2, full_name),
              grade = coalesce($3, grade),
              section = coalesce($4, section),
              strand = coalesce($5, strand)
        where ${lookup.column} = $6
        returning ${STUDENT_COLUMNS}`,
      [lrn ?? null, full_name ?? null, grade ?? null, section ?? null, strand ?? null, lookup.value]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  const lookup = getStudentLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  try {
    const { rowCount } = await query(`DELETE FROM students WHERE ${lookup.column} = $1`, [lookup.value]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });

    res.status(200).json({ message: 'Student deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
