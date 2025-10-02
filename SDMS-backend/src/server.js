import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import accountsRoute from './routes/accounts.js';
import offensesRoute from './routes/offenses.js';
import smsRoute from './routes/sms.js';
import studentsRoute from './routes/students.js';
import violationsRoute from './routes/violations.js';
import authRoute from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Build allowed origins list from env (comma-separated)
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, '')) // trim and remove trailing slashes
  .filter(Boolean);

// Helper to test an origin against allowed list, supporting wildcard subdomains (e.g., *.vercel.app)
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow same-origin/non-browser tools
  const clean = String(origin).replace(/\/+$/, '');
  if (!allowed.length) return true; // if not configured, allow all
  return allowed.some(item => {
    if (item.startsWith('*.')) {
      const suffix = item.slice(1); // remove leading '*'
      return clean.endsWith(suffix);
    }
    return clean === item;
  });
};

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // set to true only if using cookies/auth headers across sites
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Explicitly handle preflight for all routes
app.options('*', cors(corsOptions));

app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/accounts', accountsRoute);
app.use('/api/auth', authRoute);
app.use('/api/past-offenses', offensesRoute);
app.use('/api/sms', smsRoute);
app.use('/api/students', studentsRoute);
app.use('/api/violations', violationsRoute);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`SDMS backend listening on ${PORT}`);
});
