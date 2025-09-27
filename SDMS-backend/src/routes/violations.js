import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Helper: fetch student by id
async function fetchStudent(id) {
  if (!id) return null;
  const { rows } = await query(
    'SELECT id, first_name, middle_name, last_name, grade, section FROM students WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

function buildStudentDisplay(s) {
  if (!s) return null;
  const parts = [s.last_name, s.first_name];
  if (s.middle_name) {
    const m = s.middle_name.trim();
    if (m) parts.push(m[0] + '.');
  }
  return parts.filter(Boolean).join(', ').replace(/\s+/g,' ').trim();
}

function normalizeEvidence(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.length ? { files: raw.slice(0,3) } : null;
  if (typeof raw === 'object') {
    const obj = { ...raw };
    if (Array.isArray(obj.files)) obj.files = obj.files.slice(0,3);
    return obj;
  }
  return { value: raw };
}

// List with optional filters (student_id, offense_type, q)
router.get('/', async (req, res) => {
  try {
    const { student_id, offense_type, q, limit = 200 } = req.query;
    const clauses = []; const params = []; 
    if (student_id) { params.push(student_id); clauses.push(`student_id = $${params.length}`); }
    if (offense_type) { params.push(offense_type); clauses.push(`LOWER(offense_type) = LOWER($${params.length})`); }
    if (q) { params.push(`%${q.toLowerCase()}%`); clauses.push(`(LOWER(description) LIKE $${params.length} OR LOWER(offense_type) LIKE $${params.length} OR LOWER(sanction) LIKE $${params.length})`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    params.push(Math.min(Number(limit) || 200, 500));
    const sql = `SELECT id, student_id, student_name, grade_section, offense_type, sanction, description, incident_date, status, repeat_count_at_insert, evidence, created_at, updated_at
                 FROM violations
                 ${where}
                 ORDER BY incident_date DESC, created_at DESC
                 LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    res.json(rows.map(r => ({ ...r, repeat_count: r.repeat_count_at_insert })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats endpoint (must be BEFORE /:id to avoid being captured as id)
router.get('/stats', async (req, res) => {
  try {
    // total
    const totalQ = await query('SELECT COUNT(*)::int AS total FROM violations');
    // last 30 days (inclusive)
    const last30Q = await query("SELECT COUNT(*)::int AS last30 FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '29 days'");
    // open cases (Pending + Ongoing)
    const openQ = await query("SELECT COUNT(*)::int AS open FROM violations WHERE status IN ('Pending','Ongoing')");
    // repeat offenders (>=3 in last 90 days)
    const repeatQ = await query("SELECT COUNT(*)::int AS repeat_offenders_90 FROM (SELECT student_id, COUNT(*) AS c FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY student_id HAVING COUNT(*) >= 3) t");
    // top offense types (last 90 days)
    const topTypesQ = await query("SELECT offense_type, COUNT(*)::int AS count FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY offense_type ORDER BY count DESC LIMIT 5");
    // weekly trend (last 12 weeks including current)
    const weeklyTrendQ = await query(`
      SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start, COALESCE(COUNT(v.id),0)::int AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '77 days', CURRENT_DATE, INTERVAL '7 days') AS week_start
      LEFT JOIN violations v
        ON v.incident_date >= week_start
       AND v.incident_date < (week_start + INTERVAL '7 days')
      GROUP BY week_start
      ORDER BY week_start`);

    res.json({
      total: totalQ.rows[0].total,
      last30: last30Q.rows[0].last30,
      open_cases: openQ.rows[0].open,
      repeat_offenders_90: repeatQ.rows[0].repeat_offenders_90,
      top_offense_types: topTypesQ.rows,
      weekly_trend: weeklyTrendQ.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single
// Repeat count preview endpoint (must be before :id)
router.get('/repeat/check', async (req, res) => {
  try {
    const studentId = req.query.student_id;
    const offenseType = req.query.offense_type || req.query.violation_type; // backward compatibility
    if (!studentId || !offenseType) return res.status(400).json({ error: 'student_id and offense_type required' });
    const { rows } = await query(
      'SELECT COUNT(*)::int AS count FROM violations WHERE student_id = $1 AND LOWER(offense_type) = LOWER($2)',
      [studentId, offenseType]
    );
    res.json({ count: rows[0]?.count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single (placed after specific sub-routes)
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, student_id, student_name, grade_section, offense_type, sanction, description, incident_date, status, repeat_count_at_insert, evidence, created_at, updated_at FROM violations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    row.repeat_count = row.repeat_count_at_insert;
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const { student_id, grade_section, offense_type, description, sanction, incident_date, status, evidence } = req.body || {};
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    if (!offense_type || !offense_type.trim()) return res.status(400).json({ error: 'offense_type required' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'description required' });

    const student = await fetchStudent(student_id);
    if (!student) return res.status(400).json({ error: 'Student not found' });
    const student_name = buildStudentDisplay(student);
    const gradeSectionFinal = grade_section || (student.grade && student.section ? `${student.grade}-${student.section}` : null);

    const normEvidence = normalizeEvidence(evidence);

    const insertSQL = `
      INSERT INTO violations (
        student_id, student_name, grade_section,
        offense_type, description, sanction,
        incident_date, status, evidence
      )
      VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),COALESCE($8::violation_status_type,'Pending'),$9)
      RETURNING id, student_id, student_name, grade_section,
                offense_type, description, sanction, incident_date, status,
                repeat_count_at_insert, evidence, created_at, updated_at`;

    const params = [
      student_id,
      student_name,
      gradeSectionFinal,
      offense_type.trim(),
      description.trim(),
      sanction || null,
      incident_date || null,
      status || null,
      normEvidence
    ];

    const { rows } = await query(insertSQL, params);
    const row = rows[0];
    row.repeat_count = row.repeat_count_at_insert;
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const { student_id, grade_section, offense_type, description, sanction, incident_date, status, evidence } = req.body || {};

    let student_name = null;
    let gradeSectionFinal = grade_section || null;
    if (student_id) {
      const student = await fetchStudent(student_id);
      if (!student) return res.status(400).json({ error: 'Student not found' });
      student_name = buildStudentDisplay(student);
      if (!gradeSectionFinal) gradeSectionFinal = (student.grade && student.section) ? `${student.grade}-${student.section}` : null;
    }

    const normEvidence = normalizeEvidence(evidence);

    const updateSQL = `
      UPDATE violations SET
        student_id    = COALESCE($1, student_id),
        student_name  = COALESCE($2, student_name),
        grade_section = COALESCE($3, grade_section),
        offense_type  = COALESCE($4, offense_type),
        description   = COALESCE($5, description),
        sanction      = COALESCE($6, sanction),
        incident_date = COALESCE($7::date, incident_date),
        status        = COALESCE($8::violation_status_type, status),
        evidence      = $9,
        updated_at    = NOW()
      WHERE id = $10
      RETURNING id, student_id, student_name, grade_section,
                offense_type, description, sanction, incident_date, status,
                repeat_count_at_insert, evidence, created_at, updated_at`;

    const params = [
      student_id || null,
      student_name,
      gradeSectionFinal,
      offense_type || null,
      description || null,
      sanction || null,
      incident_date || null,
      status || null,
      normEvidence,
      req.params.id
    ];

    const { rows } = await query(updateSQL, params);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    row.repeat_count = row.repeat_count_at_insert;
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM violations WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
