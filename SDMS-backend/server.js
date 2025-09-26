import express from 'express';
import cors from 'cors';

import accountsRoute from './src/routes/accounts.js';
import offensesRoute from './src/routes/offenses.js';
import smsRoute from './src/routes/sms.js';
import studentsRoute from './src/routes/students.js';
import { runMigrations } from './src/migrate.js';

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

// Track first-time denied origins to avoid log spam
const deniedOriginsLogged = new Set();
const corsOptions = {
  origin: (origin, cb) => {
    const ok = isAllowedOrigin(origin);
    if (!ok && origin && !deniedOriginsLogged.has(origin)) {
      console.warn('[CORS] Denied origin:', origin, '| Allowed list:', allowed);
      deniedOriginsLogged.add(origin);
    }
    cb(null, ok);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // set to true only if using cookies/auth headers across sites
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Explicitly handle preflight for all routes
app.options('*', cors(corsOptions));

app.use(express.json());

// Friendly root for humans
app.get('/', (_req, res) => {
  res.json({
    name: 'SDMS API',
    status: 'ok',
    health: '/api/health',
    docs: 'Use /api/* routes from the frontend.'
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Debug endpoint to introspect allowed origins (remove or protect later)
app.get('/_debug/allowed-origins', (_req, res) => {
  res.json({ allowed, note: 'Modify ALLOWED_ORIGINS env var (comma-separated). Wildcards supported via *.domain.tld' });
});

app.use('/api/accounts', accountsRoute);
app.use('/api/past-offenses', offensesRoute);
app.use('/api/sms', smsRoute);
app.use('/api/students', studentsRoute);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

// Wrap startup so we can await migrations first
(async () => {
  try {
    if (process.env.AUTO_MIGRATE !== 'false') { // default: run
      console.log('Running migrations (startup)...');
      await runMigrations();
    } else {
      console.log('AUTO_MIGRATE disabled; skipping migrations.');
    }
  } catch (e) {
    console.error('Migration error during startup:', e);
  }
  app.listen(PORT, () => {
    console.log(`SDMS backend listening on ${PORT}`);
  });
})();

