import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_SEC = 60 * 60 * 8; // 8 hours

export function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL_SEC });
}

export function authRequired(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Missing token' });
  try{ const data = jwt.verify(token, JWT_SECRET); req.user = data; return next(); }
  catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
}

export function adminOnly(req, res, next){
  if(!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if(req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin required' });
  next();
}

export async function attachFreshUser(req, _res, next){
  // optional utility to re-fetch user record (role changes etc.)
  if(!req.user?.id) return next();
  try{
    const { rows } = await query(`SELECT id, full_name AS "fullName", email, username, role, grade FROM accounts WHERE id=$1`, [req.user.id]);
    if(rows[0]) req.user = rows[0];
  }catch(e){ /* ignore */ }
  next();
}
