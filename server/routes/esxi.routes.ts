import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { providerRegistry } from '../providers/registry.js';
import { logAuditAction } from '../monitoring/audit.js';

const router = Router();

// Global list of all Virtual Machines across all connections
router.get('/all-vms', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const vms = Array.from(store.virtualMachines.values());
  res.json(vms);
});

// Global list of all ESXi Hosts
router.get('/all-hosts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const hosts = Array.from(store.esxiHosts.values());
  res.json(hosts);
});

// Get Hosts for a specific connection
router.get('/:id/hosts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const conn = store.connections.get(id);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  const hosts = Array.from(store.esxiHosts.values()).filter(h => h.connectionId === id);
  res.json(hosts);
});

// Get VMs for a specific connection
router.get('/:id/vms', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const vms = Array.from(store.virtualMachines.values()).filter(vm => vm.connectionId === id);
  res.json(vms);
});

// Get specific VM detail
router.get('/:id/vms/:vmId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { vmId } = req.params;
  const vm = store.virtualMachines.get(vmId);
  if (!vm) {
    res.status(404).json({ error: 'Virtual machine not found' });
    return;
  }
  res.json(vm);
});

// Execute VM management power action (Admin/Operator only, audited)
router.post('/:id/vms/:vmId/action', authenticateToken, requireRole('ADMIN', 'OPERATOR'), async (req: AuthenticatedRequest, res: Response) => {
  const { id, vmId } = req.params;
  const { action, reason } = req.body;

  if (!['power-on', 'power-off', 'restart', 'suspend'].includes(action)) {
    res.status(400).json({ error: "Invalid action. Must be 'power-on', 'power-off', 'restart', or 'suspend'" });
    return;
  }

  const conn = store.connections.get(id);
  const vm = store.virtualMachines.get(vmId);

  if (!conn || !vm) {
    res.status(404).json({ error: 'Connection or Virtual Machine not found' });
    return;
  }

  const provider = providerRegistry.getProvider(conn);
  const result = provider.executeVMAction 
    ? await provider.executeVMAction(vmId, action) 
    : { success: false, message: 'Provider does not support VM actions' };

  // Log mandatory audit trail
  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    connectionId: id,
    action: `VM_${action.toUpperCase().replace('-', '_')}`,
    resourceType: 'VIRTUAL_MACHINE',
    resourceId: vmId,
    details: `Executed '${action}' on VM '${vm.name}' (${vm.externalVmId}). Reason: ${reason || 'Operator manual intervention'}`,
    ipAddress: req.ip,
    status: result.success ? 'SUCCESS' : 'FAILURE'
  });

  if (result.success) {
    res.json({ success: true, message: result.message, vm: store.virtualMachines.get(vmId) });
  } else {
    res.status(500).json({ error: result.message });
  }
});

// Get Datastores
router.get('/:id/datastores', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const host = Array.from(store.esxiHosts.values()).find(h => h.connectionId === req.params.id);
  res.json(host ? host.datastores : []);
});

// Get Networks
router.get('/:id/networks', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const host = Array.from(store.esxiHosts.values()).find(h => h.connectionId === req.params.id);
  res.json(host ? host.networks : []);
});

export default router;
