import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { providerRegistry } from '../providers/registry.js';
import { logAuditAction } from '../monitoring/audit.js';

const router = Router();

// Global list of CasaOS servers
router.get('/all-servers', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const servers = Array.from(store.casaosServers.values());
  res.json(servers);
});

// Global list of all CasaOS Apps
router.get('/all-apps', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const apps = Array.from(store.casaosApps.values());
  res.json(apps);
});

// Specific server detail
router.get('/:id/server', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const server = store.casaosServers.get(req.params.id) || 
    Array.from(store.casaosServers.values()).find(s => s.connectionId === req.params.id);

  if (!server) {
    res.status(404).json({ error: 'CasaOS server node not found' });
    return;
  }
  res.json(server);
});

// Apps for a specific connection
router.get('/:id/apps', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const apps = Array.from(store.casaosApps.values()).filter(a => a.connectionId === req.params.id);
  res.json(apps);
});

// Disks & Storage for a specific server
router.get('/:id/disks', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const server = Array.from(store.casaosServers.values()).find(s => s.connectionId === req.params.id);
  res.json(server ? server.disks : []);
});

// Execute App action (start/stop/restart)
router.post('/:id/apps/:appId/action', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { id, appId } = req.params;
  const { action, reason } = req.body;

  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: "Invalid action. Must be 'start', 'stop', or 'restart'" });
    return;
  }

  const conn = store.connections.get(id);
  const app = store.casaosApps.get(appId);

  if (!conn || !app) {
    res.status(404).json({ error: 'Connection or Application not found' });
    return;
  }

  const provider = providerRegistry.getProvider(conn);
  const result = provider.executeAppAction
    ? await provider.executeAppAction(appId, action)
    : { success: false, message: 'Provider does not support App actions' };

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: id,
    action: `APP_${action.toUpperCase()}`,
    resourceType: 'CASAOS_APP',
    resourceId: appId,
    details: `Executed '${action}' on CasaOS application '${app.title}'. Reason: ${reason || 'Operator UI command'}`,
    ipAddress: req.ip,
    status: result.success ? 'SUCCESS' : 'FAILURE'
  });

  if (result.success) {
    res.json({ success: true, message: result.message, app: store.casaosApps.get(appId) });
  } else {
    res.status(500).json({ error: result.message });
  }
});

export default router;
