import { Router } from 'express';

export function createHealthRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: { status: 'ok', uptimeSeconds: process.uptime(), timestamp: new Date().toISOString() } });
  });
  return router;
}
