import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours

//TEST ONLY remove comment in production
export function signToken(account){
  return jwt.sign({
    sub: account.id,
    role: account.role,
    username: account.username
  }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export async function requireAuth(req, res, next){
  try {
    const hdr = req.headers.authorization || '';
    const m = hdr.match(/^Bearer (.+)$/i);
    if(!m) return res.status(401).json({ error: 'Missing token' });
    let payload;
    try {
      payload = jwt.verify(m[1], JWT_SECRET);
    } catch(e){
      return res.status(401).json({ error: 'Invalid token' });
    }
    // Fetch user to ensure still exists
    const { rows } = await query('SELECT id, full_name, email, username, role, grade FROM accounts WHERE id = $1', [payload.sub]);
    if(!rows.length) return res.status(401).json({ error: 'Account not found' });
    req.user = rows[0];
    next();
  } catch(e){
    console.error('Auth error', e);
    res.status(500).json({ error: 'Auth failure' });
  }
}

export function requireAdmin(req, res, next){
  if(!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if(!(req.user.role === 'Admin' || req.user.role === 'Teacher')){ // treat Teacher as guidance/admin level per requirement
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Non-blocking attempt to resolve user from Authorization header.
// Returns the user row object or null if token missing/invalid.
export async function tryGetUser(req){
  try {
    const hdr = req.headers.authorization || '';
    const m = hdr.match(/^Bearer (.+)$/i);
    if(!m) return null;
    let payload;
    try {
      payload = jwt.verify(m[1], JWT_SECRET);
    } catch(e){
      return null;
    }
    const { rows } = await query('SELECT id, full_name, email, username, role, grade FROM accounts WHERE id = $1', [payload.sub]);
    if(!rows.length) return null;
    return rows[0];
  } catch (e) {
    console.warn('tryGetUser failed', e);
    return null;
  }
}
//TEST ONLY remove comment in production END

//TEST ONLY REMOVE THIS IN PRODUCTION
// export function signToken(account) {
//   // Return a placeholder token or success message
//   return 'mock-token-success';
// }

// export async function requireAuth(req, res, next) {
//   // Skip token checks — automatically authenticate
//   req.user = { 
//     id: 1,
//     full_name: 'Demo User',
//     email: 'demo@example.com',
//     username: 'demo',
//     role: 'Admin',
//     grade: 'N/A'
//   };
//   next(); // Continue the request
// }

// export function requireAdmin(req, res, next) {
//   // Always allow
//   next();
// }

// export async function tryGetUser(req) {
//   // Always return a mock user
//   return {
//     id: 1,
//     full_name: 'Demo User',
//     email: 'demo@example.com',
//     username: 'demo',
//     role: 'Admin',
//     grade: 'N/A'
//   };
// }
//TEST ONLY REMOVE THIS IN PRODUCTION END