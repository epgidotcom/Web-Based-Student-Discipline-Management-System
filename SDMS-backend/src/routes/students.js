import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// List students
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at
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
      `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at
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
  const { lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact } = req.body ?? {};
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });
  try {
    const { rows } = await query(
      `insert into students (lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [lrn ?? null, first_name, middle_name ?? null, last_name, birthdate ?? null, address ?? null, grade ?? null, section ?? null, parent_contact ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  const { lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact } = req.body ?? {};
  try {
    const { rows } = await query(
      `update students
          set lrn            = coalesce($1, lrn),
              first_name     = coalesce($2, first_name),
              middle_name    = coalesce($3, middle_name),
              last_name      = coalesce($4, last_name),
              birthdate      = coalesce($5, birthdate),
              address        = coalesce($6, address),
              grade          = coalesce($7, grade),
              section        = coalesce($8, section),
              parent_contact = coalesce($9, parent_contact)
        where id = $10
        returning *`,
      [lrn ?? null, first_name ?? null, middle_name ?? null, last_name ?? null, birthdate ?? null, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
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
