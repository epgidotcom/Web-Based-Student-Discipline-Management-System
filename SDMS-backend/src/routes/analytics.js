import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  backfillViolationPredictions,
  listAvailableSections,
  listAvailableViolationLabels,
  listSectionLikelihood,
} from '../services/predictive.js';

const router = Router();

let backfillInProgress = false;
let lastBackfillAt = 0;
const BACKFILL_COOLDOWN_MS = 30 * 1000;

router.get('/predictive-repeat-risk', async (req, res) => {
  try {
    const section = String(req.query.section || 'All');
    const violation = String(req.query.violation || 'All');

    const windowRaw = Number.parseInt(req.query.window_days, 10);
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const windowDays = Number.isFinite(windowRaw) && windowRaw > 0 ? Math.min(windowRaw, 365) : 90;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;

    const [rows, sections, violations] = await Promise.all([
      listSectionLikelihood({ section, violation, windowDays, limit }),
      listAvailableSections(),
      listAvailableViolationLabels(),
    ]);

    res.json({
      window_days: windowDays,
      section_filter: section,
      violation_filter: violation,
      generated_at: new Date().toISOString(),
      sections,
      violations,
      labels: rows.map((row) => row.section),
      likelihood: rows.map((row) => row.likelihood),
      sample_sizes: rows.map((row) => row.sample_size),
      rows,
    });
  } catch (error) {
    console.error('[analytics/predictive-repeat-risk] failed', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/predictive-repeat-risk/backfill', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (process.env.ENABLE_PREDICTIVE_BACKFILL !== 'true') {
      return res.status(403).json({ error: 'Backfill endpoint is disabled' });
    }

    if (backfillInProgress) {
      return res.status(409).json({ error: 'Backfill already in progress' });
    }

    const now = Date.now();
    if (now - lastBackfillAt < BACKFILL_COOLDOWN_MS) {
      const retryAfter = Math.ceil((BACKFILL_COOLDOWN_MS - (now - lastBackfillAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Backfill cooling down, retry in ${retryAfter}s` });
    }

    const limitRaw = Number.parseInt(req.body?.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 2000) : 200;

    backfillInProgress = true;
    const result = await backfillViolationPredictions({ limit });
    lastBackfillAt = Date.now();
    res.json({
      requested_limit: limit,
      ...result,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[analytics/predictive-repeat-risk/backfill] failed', error);
    res.status(500).json({ error: error.message });
  } finally {
    backfillInProgress = false;
  }
});

// Compatibility alias for clients expecting /api/analytics/predictive.
router.get('/predictive', async (req, res) => {
  try {
    const data = await listSectionLikelihood({
      section: 'All',
      violation: 'All',
      windowDays: 90,
      limit: 30,
    });

    res.json({
      sections: data.map((row) => row.section),
      likelihood: data.map((row) => row.likelihood),
      sample_sizes: data.map((row) => row.sample_size),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[analytics/predictive] failed', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
