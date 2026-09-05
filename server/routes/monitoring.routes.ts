import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { monitoringPoller } from '../monitoring/poller.js';

const router = Router();

// GET /api/monitoring/telemetry?connectionId=...&range=24h
// Returns historical telemetry records for charts
router.get('/telemetry', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const connectionId = req.query.connectionId as string | undefined;
  const range = (req.query.range as string) || '24h';

  const isDemo = Boolean(store.settings.demoMode);
  const liveConnections = Array.from(store.connections.values()).filter(c => isDemo || !c.isDemo);
  const validConnIds = new Set(liveConnections.map(c => c.id));

  if (connectionId && !isDemo && !validConnIds.has(connectionId)) {
    res.status(404).json({ error: 'Connection not found in active live inventory' });
    return;
  }

  const history = await store.getTelemetryHistory(connectionId, range);

  res.json({
    connectionId: connectionId || null,
    range,
    data: history,
    totalPoints: history.length,
    pollIntervalSec: store.settings.pollIntervalSec
  });
});

// GET /api/monitoring/current
// Returns latest telemetry snapshot for each active connection
router.get('/current', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const isDemo = Boolean(store.settings.demoMode);
  const connections = Array.from(store.connections.values()).filter(c => isDemo || !c.isDemo);

  const results = [];
  for (const conn of connections) {
    const telemetry = await store.getLatestTelemetry(conn.id);
    if (telemetry) {
      results.push({
        connectionId: conn.id,
        connectionName: conn.name,
        type: conn.type,
        status: conn.status,
        telemetry
      });
    } else {
      results.push({
        connectionId: conn.id,
        connectionName: conn.name,
        type: conn.type,
        status: conn.status,
        telemetry: null
      });
    }
  }

  res.json({
    timestamp: new Date().toISOString(),
    isDemoMode: isDemo,
    connections: results
  });
});

// POST /api/monitoring/poll/:connectionId
// Manually trigger an immediate telemetry poll (useful for testing)
router.post('/poll/:connectionId', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.params;
  const conn = store.connections.get(connectionId);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  try {
    const telemetry = await monitoringPoller.pollConnection(connectionId);
    if (!telemetry) {
      res.status(502).json({
        success: false,
        error: conn.errorDetails || 'Failed to poll telemetry from endpoint',
        connectionStatus: conn.status
      });
      return;
    }

    res.json({
      success: true,
      message: `Telemetry collected successfully from ${conn.name}`,
      telemetry
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Poll failed' });
  }
});

// Metric history with customizable time range (backwards compatible)
router.get('/metrics', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const range = (req.query.range as string) || '24h';
  const isDemo = Boolean(store.settings.demoMode);
  const liveConnections = Array.from(store.connections.values()).filter(c => isDemo || !c.isDemo);
  const validConnIds = new Set(liveConnections.map(c => c.id));

  let data = await store.getTelemetryHistory(undefined, range);
  if (!isDemo && liveConnections.length > 0) {
    data = data.filter(m => !m.connectionId || validConnIds.has(m.connectionId));
  } else if (!isDemo && liveConnections.length === 0) {
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
