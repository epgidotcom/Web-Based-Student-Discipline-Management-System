import { Router } from 'express';
import { query } from '../db.js';
import { processBatchStudents } from '../utils/studentUpload.js';

const router = Router();

const STUDENT_COLUMNS = 'id, lrn, full_name, grade, section, strand';


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

// Get one student
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `select ${STUDENT_COLUMNS} from students where id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
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

  const results = await processBatchStudents(students, async (student, rowNumber, rawStudent) => {
    const { lrn, full_name, grade, section, strand } = student;

    try {
      const { rows } = await query(
        `insert into students (lrn, full_name, grade, section, strand)
         values ($1,$2,$3,$4,$5)
         returning id`,
        [lrn ?? null, full_name, grade ?? null, section ?? null, strand ?? null]
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

// Update student
router.put('/:id', async (req, res) => {
  // Removed legacy payload fields including last_name; update only current schema columns.
  const { lrn, full_name, grade, section, strand } = req.body ?? {};

  try {
    const { rows } = await query(
      `update students
          set lrn = coalesce($1, lrn),
              full_name = coalesce($2, full_name),
              grade = coalesce($3, grade),
              section = coalesce($4, section),
              strand = coalesce($5, strand)
        where id = $6
        returning ${STUDENT_COLUMNS}`,
      [lrn ?? null, full_name ?? null, grade ?? null, section ?? null, strand ?? null, req.params.id]
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
  try {
    const { rowCount } = await query('DELETE FROM students WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });

    res.status(200).json({ message: 'Student deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
