import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Map template keys to the descriptive label stored in audit logs.
const TEMPLATE_LABELS = {
  warning: 'Warning Notice',
  minor: 'Minor Offense Notice',
  major: 'Major Offense Notice',
  suspension: 'Suspension Notice',
  default: 'General Notice'
};

function sanitizePhone(phoneRaw = '') {
  const digits = String(phoneRaw).replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) {
    return null;
  }
  if (digits.startsWith('09')) {
    return `63${digits.slice(1)}`;
  }
  return digits;
}

// SHA256 keeps the value traceable for duplicates without exposing the original data.
function hashValue(raw) {
  if (!raw) return null;
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function hashPhone(phoneRaw) {
  return hashValue(phoneRaw);
}

function maskPhone(phoneRaw) {
  return `******${phoneRaw.slice(-4)}`;
}

function buildMessageId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const raw = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(8).toString('hex');
  const suffix = raw.split('-')[0].slice(0, 8).toUpperCase();
  return `MSG-${stamp}-${suffix}`;
}

// Ensure fetch exists even on Node < 18 by lazily importing node-fetch.
let cachedFetch = null;
async function ensureFetch() {
  if (typeof fetch === 'function') return fetch;
  if (!cachedFetch) {
    const mod = await import('node-fetch');
    cachedFetch = mod.default;
  }
  return cachedFetch;
}

// Lazily ensure the audit table exists (helpful if migrations skipped in a new environment).
let messageLogTableEnsured = false;
async function ensureMessageLogTable() {
  if (messageLogTableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id TEXT NOT NULL,
      student_id UUID,
      student_name TEXT,
      student_name_hash TEXT,
      violation_type TEXT,
      message_type TEXT,
      message_status TEXT NOT NULL,
      date_sent TIMESTAMPTZ NOT NULL DEFAULT now(),
      sender_account_id UUID,
      sender_name TEXT,
      phone_hash TEXT NOT NULL,
      error_detail TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_message_logs_message_id ON message_logs(message_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_message_logs_date_sent ON message_logs(date_sent)');
  messageLogTableEnsured = true;
}

async function sendViaIProg({ apiToken, phone, message }) {
  const endpoint = 'https://sms.iprogtech.com/api/v1/sms_messages';
  const trimmedToken = apiToken.trim();
  const queryParams = new URLSearchParams({ api_token: trimmedToken });
  const requestUrl = `${endpoint}?${queryParams.toString()}`;
  const requestBody = {
    api_token: trimmedToken,
    phone_number: phone,
    message,
    sms_provider: 0
  };

  const fetchFn = await ensureFetch();
  const response = await fetchFn(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  let payload = null;
  let rawText = null;
  try {
    payload = await response.json();
  } catch (_) {
    rawText = await response.text();
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || rawText || response.statusText;
    throw new Error(detail || 'SMS gateway rejected request');
  }

  const success = (() => {
    if (!payload) return true; // assume success if gateway returned empty body
    if (payload.success !== undefined) return Boolean(payload.success);
    if (payload.status) return String(payload.status).toLowerCase() === 'success';
    if (payload.data?.status) return String(payload.data.status).toLowerCase().includes('queued');
    return true;
  })();

  if (!success) {
    const detail = payload?.message || payload?.error || rawText || 'SMS gateway reported failure';
    throw new Error(detail);
  }

  return payload || rawText;
}

router.use(requireAuth, requireAdmin);

router.post('/sanctions/send', async (req, res) => {
  const {
    phone,
    message,
    template = 'default',
    student: studentName = null,
    studentId = null,
    violation: violationType = null
  } = req.body || {};

  const normalized = sanitizePhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'Phone number must be 11 digits.' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const iprogToken = process.env.IPROG_API_TOKEN;
  if (!iprogToken) {
    console.error('[sms] Missing IPROG_API_TOKEN environment variable.');
    return res.status(500).json({ error: 'SMS gateway not configured.' });
  }

  const messageId = buildMessageId();
  const dateSent = new Date();
  const senderAccountId = req.user?.id ?? null;
  const messageType = TEMPLATE_LABELS[template] || TEMPLATE_LABELS.default;
  const maskedPhone = maskPhone(normalized);
  const phoneHash = hashPhone(normalized);
  const studentNameHash = studentName ? hashValue(studentName.trim().toLowerCase()) : null;

  let status = 'Failed';
  let errorDetail = null;

  try {
    await sendViaIProg({ apiToken: iprogToken, phone: normalized, message });
    status = 'Sent';
    console.info(`[sms] ${messageId} dispatched to ${maskedPhone}`);
  } catch (err) {
    errorDetail = err?.message || 'Unknown SMS gateway error';
    console.error(`[sms] ${messageId} failed for ${maskedPhone}: ${errorDetail}`);
  }

  try {
    await ensureMessageLogTable();
    await query(
      `INSERT INTO message_logs (
         message_id,
         student_id,
         student_name,
         student_name_hash,
         violation_type,
         message_type,
         message_status,
         date_sent,
         sender_account_id,
         sender_name,
         phone_hash,
         error_detail
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)` ,
      [
        messageId,
        studentId || null,
        studentName || null,
        studentNameHash,
        violationType || null,
        messageType,
        status,
        dateSent.toISOString(),
        senderAccountId,
        'MPNAGSDMS',
        phoneHash,
        errorDetail
      ]
    );
  } catch (logErr) {
    console.error('[sms] Failed to persist message log', logErr);
  }

  if (status !== 'Sent') {
    return res.status(502).json({
      messageId,
      status: 'Failed',
      error: errorDetail || 'Unable to deliver SMS',
      timestamp: dateSent.toISOString()
    });
  }

  return res.json({
    messageId,
    status: 'Sent',
    timestamp: dateSent.toISOString()
  });
});

export default router;
