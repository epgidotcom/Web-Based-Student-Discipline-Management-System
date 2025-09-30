import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { audit } from '../util/audit.js';

const router = Router();

router.post('/sanctions/send', authRequired, async (req, res) => {
  if (!['Admin','GuidanceCounselor'].includes(req.user.role)) return res.status(403).json({ error: 'Admin or Guidance Counselor required' });
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
  await query('INSERT INTO sms_logs (phone, message) VALUES ($1,$2)', [phone, message]);
  audit(req.user, 'send_sms', 'sms_log', null, { phone });
  res.json({ ok: true, accepted: true, phone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

export default router;
