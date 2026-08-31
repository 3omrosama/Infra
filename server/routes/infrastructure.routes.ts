import { Router, Response } from 'express';
import { store, StoredConnection } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { encryptSecret } from '../crypto.js';
import { providerRegistry } from '../providers/registry.js';
import { logAuditAction } from '../monitoring/audit.js';
import { monitoringPoller } from '../monitoring/poller.js';

const router = Router();

// List all infrastructure connections (without exposing plaintext passwords)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const list = Array.from(store.connections.values()).map(conn => {
    const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
    return safeConn;
  });
  res.json(list);
});

// Create new infrastructure connection (Admin/Operator)
router.post('/', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, type, host, port, useHttps, skipSslVerify, username, password, token, pollIntervalSec } = req.body;

  if (!name || !type || !host || !port) {
    res.status(400).json({ error: 'Name, type, host, and port are required' });
    return;
  }

  const rawSecret = password || token || '';
  const { encrypted, iv, tag } = encryptSecret(rawSecret);

  const newConn: StoredConnection = {
    id: `conn-${type.toLowerCase()}-${Date.now().toString(36)}`,
    name,
    type,
    host,
    port: parseInt(port, 10),
    useHttps: useHttps ?? true,
    skipSslVerify: skipSslVerify ?? false,
    username: username || '',
    encryptedSecret: encrypted,
    secretIv: iv,
    secretTag: tag,
    status: 'CONNECTING',
    pollIntervalSec: pollIntervalSec ? parseInt(pollIntervalSec, 10) : 30,
    isEnabled: true,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.connections.set(newConn.id, newConn);

  // Test connection immediately
  const provider = providerRegistry.getProvider(newConn);
  const testRes = await provider.testConnection();
  if (testRes.success) {
    newConn.status = 'ONLINE';
    newConn.lastSeen = new Date().toISOString();
  } else {
    newConn.status = 'DEGRADED';
    newConn.errorDetails = testRes.message;
  }
  await store.saveConnection(newConn);

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: newConn.id,
    action: 'CREATE_CONNECTION',
    resourceType: 'INFRASTRUCTURE',
    resourceId: newConn.id,
    details: `Added new ${type} infrastructure connection '${name}' (${host}:${port})`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  const { encryptedSecret, secretIv, secretTag, ...safeConn } = newConn;
  res.status(201).json(safeConn);
});

// Test connection endpoint
router.post('/:id/test', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);

  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const provider = providerRegistry.getProvider(conn);
  const result = await provider.testConnection();

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: id,
    action: 'TEST_CONNECTION',
    resourceType: 'INFRASTRUCTURE',
    resourceId: id,
    details: `Connection test on '${conn.name}': ${result.success ? 'PASSED' : 'FAILED'} (${result.latencyMs}ms)`,
    ipAddress: req.ip,
    status: result.success ? 'SUCCESS' : 'FAILURE'
  });

  res.json(result);
});

// Force sync / immediate polling of connection
router.post('/:id/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await monitoringPoller.pollAll();
  const conn = store.connections.get(req.params.id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }
  const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
  res.json({ success: true, connection: safeConn });
});

// Update connection
router.put('/:id', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const { name, host, port, useHttps, skipSslVerify, username, password, token, pollIntervalSec, isEnabled } = req.body;

  if (name) conn.name = name;
  if (host) conn.host = host;
  if (port) conn.port = parseInt(port, 10);
  if (useHttps !== undefined) conn.useHttps = useHttps;
  if (skipSslVerify !== undefined) conn.skipSslVerify = skipSslVerify;
  if (username !== undefined) conn.username = username;
  if (pollIntervalSec) conn.pollIntervalSec = parseInt(pollIntervalSec, 10);
  if (isEnabled !== undefined) conn.isEnabled = isEnabled;

  if (password || token) {
    const rawSecret = password || token;
    const { encrypted, iv, tag } = encryptSecret(rawSecret);
    conn.encryptedSecret = encrypted;
    conn.secretIv = iv;
    conn.secretTag = tag;
  }

  conn.updatedAt = new Date().toISOString();
  await store.saveConnection(conn);
  providerRegistry.removeProvider(id); // reset cached client instance

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: id,
    action: 'UPDATE_CONNECTION',
    resourceType: 'INFRASTRUCTURE',
    resourceId: id,
    details: `Updated connection configuration for '${conn.name}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
  res.json(safeConn);
});

// Delete connection
router.delete('/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  providerRegistry.removeProvider(id);
  await store.deleteConnection(id);

  // Clean up associated VMs/Hosts/Apps
  Array.from(store.virtualMachines.values()).forEach(vm => {
    if (vm.connectionId === id) store.virtualMachines.delete(vm.id);
  });
  Array.from(store.esxiHosts.values()).forEach(h => {
    if (h.connectionId === id) store.esxiHosts.delete(h.id);
  });
  Array.from(store.casaosApps.values()).forEach(a => {
    if (a.connectionId === id) store.casaosApps.delete(a.id);
  });
  Array.from(store.dockerContainers.values()).forEach(c => {
    if (c.connectionId === id) store.dockerContainers.delete(c.id);
  });

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'DELETE_CONNECTION',
    resourceType: 'INFRASTRUCTURE',
    resourceId: id,
    details: `Removed infrastructure connection '${conn.name}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json({ success: true, message: `Connection '${conn.name}' deleted successfully` });
});

// Toggle Demo Mode
router.post('/demo/toggle', authenticateToken, requireRole('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  store.settings.demoMode = !store.settings.demoMode;
  if (store.settings.demoMode) {
    store.seedDemoData();
  }

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'SYSTEM_CONFIG_UPDATE',
    resourceType: 'SYSTEM',
    details: `Demo Mode toggled to: ${store.settings.demoMode ? 'ENABLED' : 'DISABLED'}`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json({ success: true, demoMode: store.settings.demoMode });
});

export default router;
