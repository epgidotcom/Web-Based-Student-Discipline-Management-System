import { Router } from 'express';
import { query } from '../db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { signToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { audit } from '../util/audit.js';
import nodemailer from 'nodemailer';

// If MAIL_* env vars provided we send email; else token returned for dev.
const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : undefined;
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER;
let transporter = null;
if (MAIL_HOST && MAIL_USER && MAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT || 587,
    secure: false,
    auth: { user: MAIL_USER, pass: MAIL_PASS }
  });
}

const router = Router();

// Helper to fetch account by username/email (case insensitive)
async function findAccount(identifier){
  const { rows } = await query(
    `SELECT id, full_name AS "fullName", email, username, password_hash, role, grade
     FROM accounts
     WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1)
     LIMIT 1`, [identifier]);
  return rows[0];
}

router.post('/login', rateLimit({ windowMs: 60_000, max: 25 }), async (req,res) => {
  try{
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const acct = await findAccount(username);
    if (!acct) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, acct.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const accessToken = signToken({ id: acct.id, role: acct.role, username: acct.username });
    // Refresh token
    const refreshRaw = crypto.randomBytes(32).toString('hex');
    const refreshHash = await bcrypt.hash(refreshRaw, 12);
    const refreshExp = new Date(Date.now() + 1000*60*60*24*7); // 7 days
    await query('INSERT INTO refresh_tokens (account_id, token_hash, expires_at) VALUES ($1,$2,$3)', [acct.id, refreshHash, refreshExp]);
    audit(acct, 'login', 'account', acct.id, { ua: req.headers['user-agent'] });
    res.json({
      token: accessToken,
      refreshToken: refreshRaw,
      user: {
        id: acct.id,
        fullName: acct.fullName,
        email: acct.email,
        username: acct.username,
        role: acct.role,
        grade: acct.grade
      }
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Request password reset -> create token and (for now) return it in response.
// In production you'd email this link to the user.
router.post('/forgot-password', rateLimit({ windowMs: 60_000, max: 10 }), async (req,res) => {
  try{
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { rows } = await query(
      `SELECT id FROM accounts WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    if (!rows[0]) {
      // For privacy always respond ok even if not found
      return res.json({ ok: true });
    }
    const accountId = rows[0].id;
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenSha = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000*60*15); // 15 mins
    await query(
      `INSERT INTO password_resets (account_id, token_hash, token_sha256, expires_at) VALUES ($1,$2,$3,$4)`,
      [accountId, tokenHash, tokenSha, expiresAt]
    );
    if (transporter) {
      const resetUrl = (process.env.FRONTEND_BASE || '').replace(/\/$/, '') + `/forgot_password.html#token=${rawToken}`;
      try {
        await transporter.sendMail({
          from: MAIL_FROM,
            to: email,
          subject: 'Password Reset Instructions',
          text: `Use this one-time token to reset your password (valid 15 minutes):\n\n${rawToken}\n\nOr visit: ${resetUrl}`
        });
        return res.json({ ok: true, emailed: true });
      } catch (mailErr) {
        console.warn('Email send failed, falling back to returning token', mailErr);
      }
    }
    // Dev fallback: return raw token in response
    res.json({ ok: true, token: rawToken, emailed: false });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'Failed to start reset' });
  }
});

router.post('/reset-password', rateLimit({ windowMs: 60_000, max: 20 }), async (req,res) => {
  try{
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Missing data' });
    const tokenSha = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await query(
      `SELECT id, account_id FROM password_resets
       WHERE token_sha256=$1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`, [tokenSha]);
    if (!rows[0]) return res.status(400).json({ error: 'Invalid or expired token' });
    const match = rows[0];

    const pwHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE accounts SET password_hash=$1 WHERE id=$2', [pwHash, match.account_id]);
  await query('UPDATE password_resets SET used_at=now() WHERE id=$1', [match.id]);
  audit({ id: match.account_id }, 'reset_password', 'account', match.account_id, null);
    res.json({ ok: true });
// Refresh access token
router.post('/refresh', rateLimit({ windowMs: 60_000, max: 60 }), async (req,res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });
    // Lookup tokens for all accounts (better: table scan by comparing bcrypt?)
    const { rows } = await query(`SELECT id, account_id, token_hash, expires_at, revoked_at FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 2000`);
    let record = null;
    for (const r of rows){
      const ok = await bcrypt.compare(refreshToken, r.token_hash);
      if (ok){ record = r; break; }
    }
    if (!record) return res.status(401).json({ error: 'Invalid refresh token' });
    const acctQ = await query(`SELECT id, full_name AS "fullName", email, username, role, grade FROM accounts WHERE id=$1`, [record.account_id]);
    if (!acctQ.rows[0]) return res.status(401).json({ error: 'Account missing' });
    const acct = acctQ.rows[0];
    const newAccess = signToken({ id: acct.id, role: acct.role, username: acct.username });
    res.json({ token: newAccess, user: acct });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Refresh failed' });
  }
});
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
