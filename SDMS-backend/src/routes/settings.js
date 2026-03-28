import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ========== SANCTIONS ==========

// GET all sanctions
router.get('/sanctions', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, sanction, created_at, updated_at
       FROM norm_sanction
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch sanctions' });
  }
});

// POST create sanction
router.post('/sanctions', async (req, res) => {
  try {
    const { sanction } = req.body || {};
    if (!sanction) return res.status(400).json({ error: 'sanction is required' });

    const { rows } = await query(
      `INSERT INTO norm_sanction (sanction)
       VALUES ($1)
       RETURNING id, sanction, created_at, updated_at`,
      [String(sanction).trim()]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT update sanction
router.put('/sanctions/:id', async (req, res) => {
  try {
    const { sanction } = req.body || {};
    if (!sanction) return res.status(400).json({ error: 'sanction is required' });

    const { rows } = await query(
      `UPDATE norm_sanction
       SET sanction = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, sanction, created_at, updated_at`,
      [String(sanction).trim(), req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE sanction by id
router.delete('/sanctions/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM norm_sanction WHERE id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ========== GRADES & SECTIONS ==========

// GET all grades and sections
router.get('/grades-sections', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, grade_level, section_name, strand, adviser, created_at, updated_at
       FROM norm_sections
       ORDER BY grade_level, section_name, updated_at`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch grades and sections' });
  }
});

// GET all grades for dropdown
router.get('/grades', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT grade_level
       FROM norm_sections
       ORDER BY grade_level`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch grades and sections' });
  }
});

// GET all sections for dropdown
router.get('/grades/:grade_level/sections', async (req, res) => {
  try {
    const grade_level = decodeURIComponent(req.params.grade_level || '').trim();
    const { rows } = await query(
      `SELECT DISTINCT section_name
       FROM norm_sections
       WHERE grade_level = $1
       ORDER BY section_name`,
      [grade_level]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET all strands for dropdown
router.get('/grades/:grade_level/:section_name/strand', async (req, res) => {
  try {
    const grade_level = decodeURIComponent(req.params.grade_level || '').trim();
    const section_name = decodeURIComponent(req.params.section_name || '').trim();
    // console.log("PARAMS:", { grade_level, section_name });
    const { rows } = await query(
      `SELECT id, strand
       FROM norm_sections
       WHERE grade_level = $1 AND section_name = $2
       ORDER BY strand`,
      [grade_level, section_name]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});



// POST create grade & section
router.post('/grades-sections', async (req, res) => {
  try {
    const { grade_level, section_name, strand, adviser } = req.body || {};
    if (!section_name) return res.status(400).json({ error: 'section_name is required' });

    const { rows } = await query(
      `INSERT INTO norm_sections (grade_level, section_name, strand, adviser)
       VALUES ($1, $2, $3, $4)
       RETURNING id, grade_level, section_name, strand, adviser, created_at, updated_at`,
      [String(grade_level || '').trim() || null, String(section_name).trim(), String(strand || '').trim() || null, String(adviser || '').trim() || null]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT update grade & section
router.put('/grades-sections/:id', async (req, res) => {
  try {
    const { grade_level, section_name, strand, adviser } = req.body || {};
    if (!section_name) return res.status(400).json({ error: 'section_name is required' });

    const { rows } = await query(
      `UPDATE norm_sections
       SET grade_level = $1, section_name = $2, strand = $3, adviser = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, grade_level, section_name, strand, adviser, created_at, updated_at`,
      [String(grade_level || '').trim() || null, String(section_name).trim(), String(strand || '').trim() || null, String(adviser || '').trim() || null, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE grade & section by id
router.delete('/grades-sections/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM norm_sections WHERE id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
