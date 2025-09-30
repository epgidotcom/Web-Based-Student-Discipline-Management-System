import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { audit } from '../util/audit.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.json([]);
  try {
    const { rows } = await query(
      `SELECT label FROM past_offenses
       WHERE LOWER(student_name) = LOWER($1)
       ORDER BY created_at DESC
       LIMIT 50`,
      [name]
    );
    res.json(rows.map(r => r.label));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch offenses' });
  }
});

router.post('/', authRequired, async (req, res) => {
  if (!['Admin','GuidanceCounselor'].includes(req.user.role)) return res.status(403).json({ error: 'Admin or Guidance Counselor required' });
  try {
    const { name, label } = req.body;
    if (!name || !label) return res.status(400).json({ error: 'Missing name or label' });
    await query(
      'INSERT INTO past_offenses (student_name, label) VALUES ($1,$2)',
      [name.trim(), label.trim()]
    );
    const { rows } = await query(
      `SELECT label FROM past_offenses
       WHERE LOWER(student_name)=LOWER($1)
       ORDER BY created_at DESC
       LIMIT 50`,
      [name.trim()]
    );
  audit(req.user, 'add_past_offense', 'past_offense', null, { student_name: name.trim(), label: label.trim() });
  res.status(201).json(rows.map(r => r.label));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add offense' });
  }
});

export default router;
