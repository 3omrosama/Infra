import { Router, Response } from 'express';
import { store, StoredConnection } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { encryptSecret } from '../crypto.js';
import { providerRegistry } from '../providers/registry.js';
import { logAuditAction } from '../monitoring/audit.js';
import { monitoringPoller } from '../monitoring/poller.js';
import { ProviderConnectionConfig } from '../../src/types/index.js';
import { normalizeEndpoint } from '../utils/endpoint.js';

const router = Router();

// List all infrastructure connections (without exposing plaintext passwords)
const listConnections = (req: AuthenticatedRequest, res: Response) => {
  const isDemo = Boolean(store.settings.demoMode);
  const list = Array.from(store.connections.values())
    .filter(conn => isDemo || !conn.isDemo)
    .map(conn => {
      const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
      return safeConn;
    });
  res.json(list);
};
router.get('/', authenticateToken, listConnections);
router.get('/connections', authenticateToken, listConnections);

// Create new infrastructure connection (Admin/Operator) - Strictly Idempotent
const createConnectionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { name, type, host, port, useHttps, skipSslVerify, username, password, token, pollIntervalSec } = req.body;

  if (!name || !type || !host || !port) {
    res.status(400).json({ error: 'Name, type, host, and port are required' });
    return;
  }

  // 1. Normalize connection endpoint for deterministic identity
  const normalized = normalizeEndpoint(type, host, port, useHttps);

  // 2. Server-side Duplicate Prevention
  const existingConn = store.findConnectionByEndpoint(normalized.key);
  if (existingConn) {
    const { encryptedSecret, secretIv, secretTag, ...safeExisting } = existingConn;
    res.status(409).json({
      error: 'DUPLICATE_CONNECTION',
      message: `${normalized.type} node ${normalized.host}:${normalized.port} is already registered as '${existingConn.name}'.`,
      existingConnection: safeExisting
    });
    return;
  }

  const rawSecret = password || token || '';
  const { encrypted, iv, tag } = encryptSecret(rawSecret);

  const newConn: StoredConnection = {
    id: `conn-${type.toLowerCase()}-${Date.now().toString(36)}`,
    name: name.trim(),
    type: normalized.type as any,
    host: normalized.host,
    port: normalized.port,
    useHttps: normalized.useHttps,
    endpointKey: normalized.key,
    skipSslVerify: skipSslVerify ?? false,
    username: username ? username.trim() : '',
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
  newConn.lastCheckedAt = new Date().toISOString();
  if (testRes.success) {
    newConn.status = 'ONLINE';
    newConn.lastSeen = new Date().toISOString();
    newConn.errorDetails = undefined;
    
    // Automatically discover inventory for supported providers
    if (type === 'ESXI') {
      try {
        const hosts = await provider.getHosts();
        const vms = await provider.getVirtualMachines();
        await store.syncDiscoveredESXi(newConn.id, hosts, vms);
      } catch (discErr: any) {
        console.error(`[InfrastructureRoutes] Initial discovery error on '${name}':`, discErr?.message || discErr);
      }
    }
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
    details: `Added new ${type} infrastructure connection '${name}' (${normalized.host}:${normalized.port})`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  const { encryptedSecret, secretIv, secretTag, ...safeConn } = newConn;
  res.status(201).json(safeConn);
};
router.post('/', authenticateToken, requireRole('ADMIN', 'OPERATOR'), createConnectionHandler);
router.post('/connections', authenticateToken, requireRole('ADMIN', 'OPERATOR'), createConnectionHandler);

// Test connection endpoint for existing connection
const testConnectionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);

  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const provider = providerRegistry.getProvider(conn);
  const result = await provider.testConnection();

  conn.lastCheckedAt = new Date().toISOString();
  if (result.success) {
    conn.status = 'ONLINE';
    conn.lastSeen = new Date().toISOString();
    conn.errorDetails = undefined;
  } else {
    conn.status = 'DEGRADED';
    conn.errorDetails = result.message;
  }
  await store.saveConnection(conn);

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
};
router.post('/:id/test', authenticateToken, testConnectionHandler);
router.post('/connections/:id/test', authenticateToken, testConnectionHandler);

// Test unpersisted connection parameters directly (before saving)
router.post('/test-config', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, useHttps, skipSslVerify, username, password, token } = req.body;

  if (!type || !host || !port) {
    res.status(400).json({ error: 'Type, host, and port are required for testing' });
    return;
  }

  const normalized = normalizeEndpoint(type, host, port, useHttps);

  const tempConfig: ProviderConnectionConfig = {
    id: `test-${Date.now().toString(36)}`,
    name: 'Test-Probe',
    type: normalized.type as any,
    host: normalized.host,
    port: normalized.port,
    useHttps: normalized.useHttps,
    skipSslVerify: skipSslVerify ?? false,
    username: username || '',
    password: password || undefined,
    token: token || undefined,
    pollIntervalSec: 30,
    isEnabled: true,
    isDemo: false
  };

  const provider = providerRegistry.getProvider(tempConfig);
  const result = await provider.testConnection();
  if (tempConfig.id) {
    providerRegistry.removeProvider(tempConfig.id);
  }

  res.json(result);
});

// Get single connection by ID
const getConnectionByIdHandler = (req: AuthenticatedRequest, res: Response) => {
  const conn = store.connections.get(req.params.id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }
  const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
  res.json(safeConn);
};
router.get('/:id', authenticateToken, getConnectionByIdHandler);
router.get('/connections/:id', authenticateToken, getConnectionByIdHandler);

// Force sync / immediate polling of connection
const syncConnectionHandler = async (req: AuthenticatedRequest, res: Response) => {
  await monitoringPoller.pollAll();
  const conn = store.connections.get(req.params.id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }
  const { encryptedSecret, secretIv, secretTag, ...safeConn } = conn;
  res.json({ success: true, connection: safeConn });
};
router.post('/:id/sync', authenticateToken, syncConnectionHandler);
router.post('/connections/:id/sync', authenticateToken, syncConnectionHandler);

// Update connection
const updateConnectionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const { name, host, port, useHttps, skipSslVerify, username, password, token, pollIntervalSec, isEnabled } = req.body;

  const newType = conn.type;
  const newHost = host !== undefined ? host : conn.host;
  const newPort = port !== undefined ? parseInt(port, 10) : conn.port;
  const newUseHttps = useHttps !== undefined ? useHttps : conn.useHttps;

  // Re-normalize and check for duplicates against other connections
  const normalized = normalizeEndpoint(newType, newHost, newPort, newUseHttps);
  const duplicate = store.findConnectionByEndpoint(normalized.key);
  if (duplicate && duplicate.id !== id) {
    res.status(409).json({
      error: 'DUPLICATE_CONNECTION',
      message: `${normalized.type} node ${normalized.host}:${normalized.port} is already registered under '${duplicate.name}'.`
    });
    return;
  }

  if (name) conn.name = name.trim();
  conn.host = normalized.host;
  conn.port = normalized.port;
  conn.useHttps = normalized.useHttps;
  conn.endpointKey = normalized.key;
  if (skipSslVerify !== undefined) conn.skipSslVerify = skipSslVerify;
  if (username !== undefined) conn.username = username.trim();
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
};
router.put('/:id', authenticateToken, requireRole('ADMIN', 'OPERATOR'), updateConnectionHandler);
router.put('/connections/:id', authenticateToken, requireRole('ADMIN', 'OPERATOR'), updateConnectionHandler);

// Delete connection
const deleteConnectionHandler = async (req: AuthenticatedRequest, res: Response) => {
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
};
router.delete('/:id', authenticateToken, requireRole('ADMIN'), deleteConnectionHandler);
router.delete('/connections/:id', authenticateToken, requireRole('ADMIN'), deleteConnectionHandler);

// Toggle Demo Mode
router.post('/demo/toggle', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  store.settings.demoMode = !store.settings.demoMode;
  await store.saveSettings(store.settings);
  if (store.settings.demoMode) {
    await store.seedDemoData();
  } else {
    // When live mode is enabled, trigger immediate background poll of live connections
    monitoringPoller.pollAll().catch(() => {});
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
