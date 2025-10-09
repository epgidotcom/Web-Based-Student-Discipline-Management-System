import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/sanctions/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
    await query('INSERT INTO sms_logs (phone, message) VALUES ($1,$2)', [phone, message]);
    res.json({ ok: true, accepted: true, phone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

router.get('/announcements', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, title, message, created_at
         FROM sms_announcements
        ORDER BY created_at DESC
        LIMIT 50`
    );
    res.json(rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      created_at: row.created_at
    })));
  } catch (e) {
    console.error('[sms] announcements fetch failed', e);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

router.post('/announcements', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, message } = req.body || {};
    const cleanMessage = (message || '').trim();
    const cleanTitle = (title || '').trim();
    if (!cleanMessage) {
      return res.status(400).json({ error: 'Announcement message is required' });
    }

    const { rows } = await query(
      `INSERT INTO sms_announcements (title, message)
       VALUES ($1,$2)
       RETURNING id, title, message, created_at`,
      [cleanTitle || null, cleanMessage]
    );

    const row = rows[0];
    res.status(201).json({
      id: row.id,
      title: row.title,
      message: row.message,
      created_at: row.created_at
    });
  } catch (e) {
    console.error('[sms] announcement create failed', e);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

export default router;
