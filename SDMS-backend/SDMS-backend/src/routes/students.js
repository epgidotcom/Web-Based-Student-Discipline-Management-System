import { Router } from 'express';

const router = Router();

router.get('/', async (_req, res) => {
  res.json([]);
});

export default router;
