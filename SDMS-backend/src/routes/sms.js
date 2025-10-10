import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.post('/sanctions/send', async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
  await query('INSERT INTO sms_logs (phone, message) VALUES ($1,$2)', [phone, message]);
    res.json({ ok: true, accepted: true, phone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

export default router;
