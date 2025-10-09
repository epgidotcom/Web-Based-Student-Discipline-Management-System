import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// List students
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
  `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at
         from students
        order by last_name asc, first_name asc`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one student
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
  `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at
         from students where id = $1`,
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
  const { lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact } = req.body ?? {};
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });
  const cleanAge = age === undefined || age === null || age === '' ? null : Number(age);
  if (cleanAge !== null && !Number.isFinite(cleanAge)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  try {
    // Build legacy composite fields still enforced in the DB (full_name, grade_level) if they exist.
    const full_name = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim() || null;
    const grade_level = grade ?? null; // mirror grade into legacy grade_level if present

    // Try inserting with legacy columns; if they do not exist (future clean schema) fallback gracefully.
    let rows;
    try {
      ({ rows } = await query(
        `insert into students (lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, full_name, grade_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning *`,
  [lrn ?? null, first_name, middle_name ?? null, last_name, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, full_name, grade_level]
      ));
    } catch (err) {
      // If error mentions unknown column (e.g., after we drop legacy columns) retry without them.
      if (/full_name|grade_level/i.test(err.message) && /column.*does not exist/i.test(err.message)) {
        ({ rows } = await query(
          `insert into students (lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           returning *`,
          [lrn ?? null, first_name, middle_name ?? null, last_name, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null]
        ));
      } else {
        throw err;
      }
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    // Unique violation for LRN (Postgres code 23505). Provide friendlier message & 409 Conflict.
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '') ) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  const { lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact } = req.body ?? {};
  const cleanAge = age === undefined || age === null || age === '' ? null : Number(age);
  if (cleanAge !== null && !Number.isFinite(cleanAge)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  try {
    // We may need to recompute full_name / grade_level if any related fields changed.
    // Fetch current row first (only if name or grade parts provided) to build new composite.
    let full_name = null;
    let grade_level = null;
    if (first_name || middle_name || last_name || grade) {
      try {
        const current = await query('select first_name, middle_name, last_name, grade from students where id = $1', [req.params.id]);
        if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const cur = current.rows[0];
        const newFirst = first_name ?? cur.first_name;
        const newMiddle = middle_name ?? cur.middle_name;
        const newLast = last_name ?? cur.last_name;
        const newGrade = grade ?? cur.grade;
        full_name = [newFirst, newMiddle, newLast].filter(Boolean).join(' ').trim() || null;
        grade_level = newGrade ?? null;
      } catch (e) {
        // If select fails we still proceed with basic update; error handled later if update fails.
      }
    }

    let rows;
    try {
      ({ rows } = await query(
        `update students
            set lrn            = coalesce($1, lrn),
                first_name     = coalesce($2, first_name),
                middle_name    = coalesce($3, middle_name),
                last_name      = coalesce($4, last_name),
                birthdate      = coalesce($5, birthdate),
                age            = coalesce($6, age),
                address        = coalesce($7, address),
                grade          = coalesce($8, grade),
                section        = coalesce($9, section),
                parent_contact = coalesce($10, parent_contact),
                full_name      = coalesce($11, full_name),
                grade_level    = coalesce($12, grade_level)
          where id = $13
          returning *`,
  [lrn ?? null, first_name ?? null, middle_name ?? null, last_name ?? null, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, full_name, grade_level, req.params.id]
      ));
    } catch (err) {
      if (/full_name|grade_level/i.test(err.message) && /column.*does not exist/i.test(err.message)) {
        ({ rows } = await query(
          `update students
              set lrn            = coalesce($1, lrn),
                  first_name     = coalesce($2, first_name),
                  middle_name    = coalesce($3, middle_name),
                  last_name      = coalesce($4, last_name),
                  birthdate      = coalesce($5, birthdate),
                  age            = coalesce($6, age),
                  address        = coalesce($7, address),
                  grade          = coalesce($8, grade),
                  section        = coalesce($9, section),
                  parent_contact = coalesce($10, parent_contact)
            where id = $11
            returning *`,
          [lrn ?? null, first_name ?? null, middle_name ?? null, last_name ?? null, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, req.params.id]
        ));
      } else {
        throw err;
      }
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query('delete from students where id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
