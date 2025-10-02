import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import accountsRoute from './src/routes/accounts.js';
import offensesRoute from './src/routes/offenses.js';
import smsRoute from './src/routes/sms.js';
import studentsRoute from './src/routes/students.js';
import violationsRoute from './src/routes/violations.js';
import authRoute from './src/routes/auth.js';
import { runMigrations } from './src/migrate.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Build allowed origins list from env (comma-separated)
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, '')) // trim and remove trailing slashes
  .filter(Boolean);

// Helper to test an origin against allowed list.
// Supports wildcard subdomains in these formats:
//   *.vercel.app
//   vercel.app (exact root)
//   https://*.vercel.app  (protocol form)
// Normalizes by stripping protocol before comparison.
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow same-origin/non-browser tools (e.g. curl, server-to-server)
  const normalize = (url) => String(url)
    .replace(/\/+$/, '')            // trim trailing slashes
    .replace(/^https?:\/\//i, '')   // drop scheme
    .toLowerCase();
  const client = normalize(origin);
  if (!allowed.length) return true; // if not configured, allow all
  return allowed.some(raw => {
    const item = normalize(raw);
    if (item.startsWith('*.')) {
      const suffix = item.slice(2); // remove '*.'
      return client === suffix || client.endsWith('.' + suffix);
    }
    return client === item;
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
app.use('/api/auth', authRoute);
app.use('/api/past-offenses', offensesRoute);
app.use('/api/sms', smsRoute);
app.use('/api/students', studentsRoute);
// IMPORTANT: Add violations route (missing earlier caused 404 on /api/violations)
app.use('/api/violations', violationsRoute);

// Optional debug route to list mounted paths (enable by setting DEBUG_ROUTES=true)
if (process.env.DEBUG_ROUTES === 'true') {
  app.get('/_debug/routes', (_req, res) => {
    const listed = [];
    app._router.stack.forEach(layer => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        listed.push(`${methods} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle?.stack) {
        layer.handle.stack.forEach(r => {
          if (r.route && r.route.path) {
            const methods = Object.keys(r.route.methods).join(',').toUpperCase();
            // layer.regexp is internal; we just show the route path prefix if available
            listed.push(`${methods} (sub) ${r.route.path}`);
          }
        });
      }
    });
    res.json({ routes: listed });
  });
  console.log('[DEBUG_ROUTES] Enabled. Visit /_debug/routes to see mounted routes.');
}

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
