import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { providerRegistry } from '../providers/registry.js';
import { logAuditAction } from '../monitoring/audit.js';

const router = Router();

// Global list of all Docker Containers
router.get('/all-containers', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const containers = Array.from(store.dockerContainers.values());
  res.json(containers);
});

// Containers for a specific connection
router.get('/:id/containers', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const containers = Array.from(store.dockerContainers.values()).filter(c => c.connectionId === req.params.id);
  res.json(containers);
});

// Container lifecycle action (start, stop, restart)
router.post('/:id/containers/:containerId/action', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { id, containerId } = req.params;
  const { action, reason } = req.body;

  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: "Invalid action. Must be 'start', 'stop', or 'restart'" });
    return;
  }

  const conn = store.connections.get(id);
  const container = store.dockerContainers.get(containerId);

  if (!conn || !container) {
    res.status(404).json({ error: 'Connection or Container not found' });
    return;
  }

  const provider = providerRegistry.getProvider(conn);
  const result = provider.executeContainerAction
    ? await provider.executeContainerAction(containerId, action)
    : { success: false, message: 'Provider does not support Container lifecycle actions' };

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: id,
    action: `CONTAINER_${action.toUpperCase()}`,
    resourceType: 'DOCKER_CONTAINER',
    resourceId: containerId,
    details: `Executed '${action}' on Docker container '${container.name}'. Reason: ${reason || 'Operator UI command'}`,
    ipAddress: req.ip,
    status: result.success ? 'SUCCESS' : 'FAILURE'
  });

  if (result.success) {
    res.json({ success: true, message: result.message, container: store.dockerContainers.get(containerId) });
  } else {
    res.status(500).json({ error: result.message });
  }
});

// Get Docker Images
router.get('/:id/images', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const images = Array.from(store.dockerImages.values());
  res.json(images);
});

// Get Docker Volumes
router.get('/:id/volumes', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const volumes = Array.from(store.dockerVolumes.values());
  res.json(volumes);
});

export default router;
