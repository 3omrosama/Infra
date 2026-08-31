import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';
import { DashboardSummary } from '../../src/types/index.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const connections = Array.from(store.connections.values());
  const vms = Array.from(store.virtualMachines.values());
  const containers = Array.from(store.dockerContainers.values());
  const apps = Array.from(store.casaosApps.values());

  const totalNodes = connections.length;
  const onlineNodes = connections.filter(c => c.status === 'ONLINE').length;
  const offlineNodes = connections.filter(c => c.status === 'OFFLINE').length;
  const warningNodes = connections.filter(c => c.status === 'DEGRADED').length;

  const totalVms = vms.length;
  const runningVms = vms.filter(v => v.powerState === 'RUNNING').length;
  const stoppedVms = vms.filter(v => v.powerState === 'STOPPED').length;
  const suspendedVms = vms.filter(v => v.powerState === 'SUSPENDED').length;

  const totalContainers = containers.length + apps.length;
  const runningContainers = containers.filter(c => c.state === 'running').length + apps.filter(a => a.status === 'running').length;
  const stoppedContainers = totalContainers - runningContainers;

  // Aggregate current metrics
  const latestMetric = store.metrics[store.metrics.length - 1] || {
    cpu: 48.5,
    memory: 64.2,
    storage: 62.8,
    networkRxKbps: 18400,
    networkTxKbps: 14100
  };

  const activeAlerts = Array.from(store.alerts.values())
    .filter(a => a.status === 'ACTIVE')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Calculate infrastructure Health Score (0-100)
  let healthScore = 100;
  if (offlineNodes > 0) healthScore -= offlineNodes * 20;
  if (warningNodes > 0) healthScore -= warningNodes * 8;
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
  const warningAlerts = activeAlerts.filter(a => a.severity === 'WARNING').length;
  healthScore -= (criticalAlerts * 15 + warningAlerts * 5);
  healthScore = Math.max(0, Math.min(100, healthScore));

  const summary: DashboardSummary = {
    nodes: {
      total: totalNodes,
      online: onlineNodes,
      offline: offlineNodes,
      warning: warningNodes
    },
    vms: {
      total: totalVms,
      running: runningVms,
      stopped: stoppedVms,
      suspended: suspendedVms
    },
    containers: {
      total: totalContainers,
      running: runningContainers,
      stopped: stoppedContainers
    },
    metrics: {
      cpuUtilizationPct: latestMetric.cpu,
      memoryUtilizationPct: latestMetric.memory,
      storageUtilizationPct: latestMetric.storage,
      networkTrafficRxKbps: latestMetric.networkRxKbps,
      networkTrafficTxKbps: latestMetric.networkTxKbps
    },
    historicalMetrics: store.metrics.slice(-30),
    activeAlerts: activeAlerts.slice(0, 5),
    recentEvents: store.events.slice(0, 8),
    recentAuditLogs: store.auditLogs.slice(0, 8),
    isDemoMode: store.settings.demoMode,
    healthScore,
    lastUpdated: new Date().toISOString()
  };

  res.json(summary);
});

export default router;
