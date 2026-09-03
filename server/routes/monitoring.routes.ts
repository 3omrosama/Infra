import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Metric history with customizable time range
router.get('/metrics', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const range = (req.query.range as string) || '24h';
  
  let sliceCount = 48;
  if (range === '1h') sliceCount = 12;
  else if (range === '6h') sliceCount = 24;
  else if (range === '24h') sliceCount = 48;
  else if (range === '7d') sliceCount = 168;

  const isDemo = Boolean(store.settings.demoMode);
  const liveConnections = Array.from(store.connections.values()).filter(c => isDemo || !c.isDemo);
  const validConnIds = new Set(liveConnections.map(c => c.id));

  let data: any[] = [];
  if (isDemo) {
    data = store.metrics.slice(-sliceCount);
  } else if (liveConnections.length > 0) {
    data = store.metrics.filter(m => !m.connectionId || validConnIds.has(m.connectionId)).slice(-sliceCount);
  } else {
    data = [];
  }

  res.json({
    range,
    data,
    totalPoints: data.length,
    pollIntervalSec: store.settings.pollIntervalSec
  });
});

// Overall system health summary
router.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
    demoMode: store.settings.demoMode,
    connectionsCount: store.connections.size
  });
});

export default router;
