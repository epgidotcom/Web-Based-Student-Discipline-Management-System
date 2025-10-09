import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { query } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

let cachedFetch = null;
async function getFetch(){
  if (typeof fetch === 'function') return fetch;
  if (!cachedFetch) {
    const mod = await import('node-fetch');
    cachedFetch = mod.default;
  }
  return cachedFetch;
}

let warnedAboutSecret = false;
async function verifyRecaptcha(token, req){
  const secret = process.env.RECAPTCHA_SECRET;
  if(!secret){
    if(!warnedAboutSecret){
      console.warn('RECAPTCHA_SECRET not set – skipping reCAPTCHA verification.');
      warnedAboutSecret = true;
    }
    return true;
  }
  if(!token) return false;

  try {
    const params = new URLSearchParams({ secret, response: token });
    const clientIp = extractClientIp(req);
    if(clientIp) params.append('remoteip', clientIp);

    const fetchFn = await getFetch();
    const response = await fetchFn('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if(!response.ok){
      console.error('reCAPTCHA verification request failed with status', response.status);
      return false;
    }
    const data = await response.json();
    if(!data.success){
      console.warn('reCAPTCHA verification rejected', data['error-codes']);
    }
    return Boolean(data.success);
  } catch (err){
    console.error('Error verifying reCAPTCHA', err);
    return false;
  }
}

function extractClientIp(req){
  const forwarded = req.headers['x-forwarded-for'];
  if(typeof forwarded === 'string' && forwarded.length){
    return forwarded.split(',')[0].trim();
  }
  return req.ip;
}

const router = Router();

// Build transporter (Gmail) using env vars
function buildTransport(){
  const { GMAIL_USER, GMAIL_PASS } = process.env;
  if(!GMAIL_USER || !GMAIL_PASS){
    console.warn('GMAIL_USER or GMAIL_PASS not set – password reset emails will not send.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
}
const transporter = buildTransport();

// Helper to shape account object for response
function publicAccount(a){
  if(!a) return null;
  return { id: a.id, fullName: a.full_name, email: a.email, username: a.username, role: a.role, grade: a.grade };
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password, recaptchaToken } = req.body || {};
    const recaptchaOk = await verifyRecaptcha(recaptchaToken, req);
    if(!recaptchaOk) return res.status(400).json({ error: 'reCAPTCHA validation failed' });

    if(!username || !password) return res.status(400).json({ error: 'username and password required' });
    const { rows } = await query('SELECT * FROM accounts WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1)', [username.trim()]);
    if(!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const acc = rows[0];
    const ok = await bcrypt.compare(password, acc.password_hash);
    if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(acc);
    res.json({ token, account: publicAccount(acc) });
  } catch(e){
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ account: publicAccount(req.user) });
});

// Request password reset
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if(!email) return res.status(400).json({ error: 'email required' });
    const { rows } = await query('SELECT id, full_name, email FROM accounts WHERE LOWER(email)=LOWER($1)', [email.trim()]);
    // Always respond 200 to avoid user enumeration
    if(!rows.length) return res.json({ ok: true });
    const acc = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    await query('INSERT INTO password_reset_tokens (account_id, token, expires_at) VALUES ($1,$2,$3)', [acc.id, token, expires_at]);

    const resetUrl = `${process.env.FRONTEND_BASE_URL || ''}/forgot_password.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(acc.email)}`;

    if(transporter){
      try {
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
            to: acc.email,
            subject: 'Password Reset Request',
            text: `Hello ${acc.full_name || ''},\n\nReset your password using this link (valid 30 minutes): ${resetUrl}`,
            html: `<p>Hello ${acc.full_name || ''},</p><p>Reset your password using this link (valid 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
        });
      } catch(mailErr){
        console.error('Failed sending email:', mailErr);
      }
    }

    res.json({ ok: true });
  } catch(e){
    console.error(e);
    res.status(500).json({ error: 'Request failed' });
  }
});

// Reset password
router.post('/reset', async (req, res) => {
  try {
    const { token, email, password } = req.body || {};
    if(!token || !email || !password) return res.status(400).json({ error: 'token, email, password required' });
    if(password.length < 6) return res.status(400).json({ error: 'Password too short' });

    const { rows } = await query(
      `SELECT prt.id, prt.account_id, prt.expires_at, a.email
         FROM password_reset_tokens prt
         JOIN accounts a ON a.id = prt.account_id
        WHERE prt.token = $1 AND LOWER(a.email)=LOWER($2)`,
      [token, email.trim()]
    );
    if(!rows.length) return res.status(400).json({ error: 'Invalid token' });
    const row = rows[0];
    if(new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE accounts SET password_hash=$1 WHERE id=$2', [hash, row.account_id]);
    await query('DELETE FROM password_reset_tokens WHERE account_id=$1', [row.account_id]);
    res.json({ ok: true });
  } catch(e){
    console.error(e);
    res.status(500).json({ error: 'Reset failed' });
  }
});

export default router;
