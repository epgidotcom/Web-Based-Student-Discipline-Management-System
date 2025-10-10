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

async function sendViaIProg({ apiToken, phone, message, provider }) {
  // Required endpoint (query params carry auth + core data for compatibility)
  const baseUrl = 'https://sms.iprogtech.com/api/v1/sms_messages';
  const params = new URLSearchParams({
    api_token: apiToken,
    phone_number: phone,
    message,
    sms_provider: String(provider)
  });

  const fetchFn = await ensureFetch();
  const response = await fetchFn(`${baseUrl}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_token: apiToken,
      phone_number: phone,
      message,
      sms_provider: provider
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText || 'SMS gateway error';
    throw new Error(detail);
  }

  return data || {};
}

router.use(requireAuth, requireAdmin);

router.post('/sanctions/send', async (req, res) => {
  const {
    phone,
    phone_number,
    message,
    template = 'default',
    student: studentName = null,
    studentId = null,
    violation: violationType = null,
    smsProvider: requestedProvider = 1
  } = req.body || {};

  // Accept legacy `phone` field while preferring `phone_number` (new contract).
  const inputPhone = phone_number ?? phone ?? null;
  const normalized = sanitizePhone(inputPhone);
  if (!normalized) {
    return res.status(400).json({ error: 'Phone number must be 11 digits.' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const messageText = message.trim();

  const provider = Number.isInteger(requestedProvider)
    ? requestedProvider
    : Number.parseInt(requestedProvider, 10);
  const smsProvider = Number.isInteger(provider) && provider >= 0 ? provider : 1;

  // iProgTech token (hardcoded per requirement)
  const iprogToken = '749479e8e029099681e03ac811a1a8cce8ae8b4f';

  const messageId = buildMessageId();
  const dateSent = new Date();
  const senderAccountId = req.user?.id ?? null;
  const messageType = TEMPLATE_LABELS[template] || TEMPLATE_LABELS.default;
  const maskedPhone = maskPhone(normalized);
  const phoneHash = hashPhone(normalized);
  const studentNameHash = studentName ? hashValue(studentName.trim().toLowerCase()) : null;

  let status = 'Failed';
  let errorDetail = null;

  let providerResponse = null;
  try {
    console.log(`Sending SMS to: ${maskPhone(normalized)}`);
    const providerPayload = await sendViaIProg({
      apiToken: iprogToken,
      phone: normalized,
      message: messageText,
      provider: smsProvider
    });
    providerResponse = providerPayload?.message
      || providerPayload?.status
      || providerPayload?.data?.status
      || 'Accepted';
    status = 'Sent';
    console.info(`[sms] ${messageId} dispatched to ${maskedPhone}`);
  } catch (err) {
    errorDetail = err?.message || 'Unknown SMS gateway error';
    const errMeta = {
      name: err?.name,
      code: err?.code ?? err?.cause?.code ?? err?.cause?.errno,
      syscall: err?.cause?.syscall,
      hostname: err?.cause?.hostname,
      type: err?.type
    };
    console.error(`[sms] ${messageId} failed for ${maskedPhone}: ${errorDetail}`, errMeta);
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
      error: 'SMS send failed',
      detail: errorDetail || 'Unable to deliver SMS'
    });
  }

  return res.json({
    status: 'Sent',
    providerResponse: providerResponse || 'Accepted'
  });
});

export default router;
