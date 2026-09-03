import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';
import { DashboardSummary, MetricDataPoint } from '../../src/types/index.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const isDemo = Boolean(store.settings.demoMode);

  // In Live Mode (isDemo === false), strictly filter out demo nodes and synthetic items
  const connections = Array.from(store.connections.values()).filter(c => isDemo || !c.isDemo);
  const validConnIds = new Set(connections.map(c => c.id));

  const totalNodes = connections.length;
  const onlineNodes = connections.filter(c => c.status === 'ONLINE').length;
  const offlineNodes = connections.filter(c => c.status === 'OFFLINE').length;
  const warningNodes = connections.filter(c => c.status === 'DEGRADED').length;

  // Filter Inventory based on active mode
  const hosts = Array.from(store.esxiHosts.values()).filter(h => validConnIds.has(h.connectionId));
  const vms = Array.from(store.virtualMachines.values()).filter(v => validConnIds.has(v.connectionId));
  const containers = Array.from(store.dockerContainers.values()).filter(c => validConnIds.has(c.connectionId));
  const apps = Array.from(store.casaosApps.values()).filter(a => validConnIds.has(a.connectionId));

  const totalVms = vms.length;
  const runningVms = vms.filter(v => v.powerState === 'RUNNING').length;
  const stoppedVms = vms.filter(v => v.powerState === 'STOPPED').length;
  const suspendedVms = vms.filter(v => v.powerState === 'SUSPENDED').length;

  const totalContainers = containers.length + apps.length;
  const runningContainers = containers.filter(c => c.state === 'running').length + apps.filter(a => a.status === 'running').length;
  const stoppedContainers = totalContainers - runningContainers;

  // Real-time Aggregation of Telemetry
  let cpuUtilizationPct = 0;
  let memoryUtilizationPct = 0;
  let storageUtilizationPct = 0;
  let networkTrafficRxKbps = 0;
  let networkTrafficTxKbps = 0;

  let totalCpuCores = 0;
  let totalMemoryBytes = 0;
  let totalMemoryUsedBytes = 0;
  let totalStorageBytes = 0;
  let totalStorageUsedBytes = 0;

  if (isDemo) {
    // In Demo Mode: use latest stored/synthetic metric or realistic demo defaults
    const latestMetric = store.metrics[store.metrics.length - 1] || {
      cpu: 48.5,
      memory: 64.2,
      storage: 62.8,
      networkRxKbps: 18400,
      networkTxKbps: 14100
    };
    cpuUtilizationPct = latestMetric.cpu;
    memoryUtilizationPct = latestMetric.memory;
    storageUtilizationPct = latestMetric.storage;
    networkTrafficRxKbps = latestMetric.networkRxKbps;
    networkTrafficTxKbps = latestMetric.networkTxKbps;

    totalCpuCores = 56;
    totalMemoryBytes = 274877906944;
    totalMemoryUsedBytes = Math.round(totalMemoryBytes * (memoryUtilizationPct / 100));
    totalStorageBytes = 17592186044416;
    totalStorageUsedBytes = Math.round(totalStorageBytes * (storageUtilizationPct / 100));
  } else {
    // In Live Mode: Aggregate directly from real monitored hosts & datastores
    if (hosts.length > 0) {
      // CPU aggregation across real ESXi hosts
      const onlineHosts = hosts.filter(h => h.powerState === 'RUNNING');
      const activeHosts = onlineHosts.length > 0 ? onlineHosts : hosts;
      
      totalCpuCores = hosts.reduce((acc, h) => acc + (h.cpuCores || 0), 0);
      
      // Calculate average CPU utilization across active hosts
      const totalHostCpuUsage = activeHosts.reduce((acc, h) => acc + (h.cpuUsagePct || 0), 0);
      cpuUtilizationPct = activeHosts.length > 0 ? Math.round((totalHostCpuUsage / activeHosts.length) * 10) / 10 : 0;

      // Memory aggregation across real ESXi hosts
      totalMemoryBytes = hosts.reduce((acc, h) => acc + (Number(h.memoryBytesTotal) || 0), 0);
      totalMemoryUsedBytes = hosts.reduce((acc, h) => {
        const total = Number(h.memoryBytesTotal) || 0;
        const pct = h.memoryUsagePct || 0;
        return acc + Math.round((total * pct) / 100);
      }, 0);
      memoryUtilizationPct = totalMemoryBytes > 0 
        ? Math.round(((totalMemoryUsedBytes / totalMemoryBytes) * 100) * 10) / 10 
        : 0;

      // Storage aggregation across real datastores
      const allDatastores = hosts.flatMap(h => h.datastores || []);
      const uniqueDatastores = Array.from(new Map(allDatastores.map(d => [d.name || d.id, d])).values());

      totalStorageBytes = uniqueDatastores.reduce((acc, d) => acc + (Number(d.capacityBytes) || 0), 0);
      const totalStorageFreeBytes = uniqueDatastores.reduce((acc, d) => acc + (Number(d.freeBytes) || 0), 0);
      totalStorageUsedBytes = Math.max(0, totalStorageBytes - totalStorageFreeBytes);
      storageUtilizationPct = totalStorageBytes > 0
        ? Math.round(((totalStorageUsedBytes / totalStorageBytes) * 100) * 10) / 10
        : 0;

      // Network bandwidth from host interfaces
      for (const h of hosts) {
        for (const net of h.networks || []) {
          networkTrafficRxKbps += Math.round(((net.rxBytesPerSec || 0) * 8) / 1024);
          networkTrafficTxKbps += Math.round(((net.txBytesPerSec || 0) * 8) / 1024);
        }
      }
    } else {
      // If no ESXi hosts are registered in Live Mode yet, check live metrics from poller
      const liveMetrics = store.metrics.filter(m => !m.connectionId || validConnIds.has(m.connectionId));
      if (liveMetrics.length > 0) {
        const last = liveMetrics[liveMetrics.length - 1];
        cpuUtilizationPct = last.cpu;
        memoryUtilizationPct = last.memory;
        storageUtilizationPct = last.storage;
        networkTrafficRxKbps = last.networkRxKbps;
        networkTrafficTxKbps = last.networkTxKbps;
      }
    }
  }

  // Active alerts in current scope
  const activeAlerts = Array.from(store.alerts.values())
    .filter(a => a.status === 'ACTIVE' && (isDemo || !a.connectionId || validConnIds.has(a.connectionId)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Recent system events in current scope
  const recentEvents = store.events
    .filter(e => isDemo || !e.connectionId || validConnIds.has(e.connectionId))
    .slice(0, 8);

  // Recent audit logs in current scope
  const recentAuditLogs = store.auditLogs
    .filter(l => isDemo || !l.connectionId || validConnIds.has(l.connectionId))
    .slice(0, 8);

  // Calculate infrastructure Health Score (0-100)
  let healthScore = 100;
  if (totalNodes > 0) {
    if (offlineNodes > 0) healthScore -= offlineNodes * 25;
    if (warningNodes > 0) healthScore -= warningNodes * 10;
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
    const warningAlerts = activeAlerts.filter(a => a.severity === 'WARNING').length;
    healthScore -= (criticalAlerts * 15 + warningAlerts * 5);
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Historical metrics for charts
  let historicalMetrics: MetricDataPoint[] = [];
  if (isDemo) {
    historicalMetrics = store.metrics.slice(-30);
  } else {
    // In Live Mode: use real recorded metrics from poller
    const liveHistory = store.metrics.filter(m => !m.connectionId || validConnIds.has(m.connectionId));
    if (liveHistory.length >= 2) {
      historicalMetrics = liveHistory.slice(-30);
    } else {
      // Construct historical timeline starting with current live values
      const now = Date.now();
      historicalMetrics = [
        {
          timestamp: new Date(now - 60000).toISOString(),
          cpu: cpuUtilizationPct,
          memory: memoryUtilizationPct,
          storage: storageUtilizationPct,
          networkRxKbps: networkTrafficRxKbps,
          networkTxKbps: networkTrafficTxKbps
        },
        {
          timestamp: new Date(now).toISOString(),
          cpu: cpuUtilizationPct,
          memory: memoryUtilizationPct,
          storage: storageUtilizationPct,
          networkRxKbps: networkTrafficRxKbps,
          networkTxKbps: networkTrafficTxKbps
        }
      ];
    }
  }

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
      cpuUtilizationPct,
      memoryUtilizationPct,
      storageUtilizationPct,
      networkTrafficRxKbps,
      networkTrafficTxKbps,
      cpuCoresTotal: totalCpuCores,
      memoryBytesTotal: totalMemoryBytes,
      memoryBytesUsed: totalMemoryUsedBytes,
      storageBytesTotal: totalStorageBytes,
      storageBytesUsed: totalStorageUsedBytes
    },
    historicalMetrics,
    activeAlerts: activeAlerts.slice(0, 5),
    recentEvents,
    recentAuditLogs,
    isDemoMode: isDemo,
    healthScore,
    lastUpdated: new Date().toISOString()
  };

  res.json(summary);
});

export default router;
