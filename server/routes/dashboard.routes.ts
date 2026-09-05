import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';
import { DashboardSummary, MetricDataPoint } from '../../src/types/index.js';

const router = Router();

router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const isDemo = Boolean(store.settings.demoMode);

  // In Live Mode (isDemo === false), strictly filter out demo nodes and disabled connections
  const connections = Array.from(store.connections.values()).filter(c => isDemo ? true : (!c.isDemo && c.isEnabled !== false));
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
  let cpuUtilizationPct: number | null = null;
  let memoryUtilizationPct: number | null = null;
  let storageUtilizationPct: number | null = null;
  let networkTrafficRxKbps: number | null = null;
  let networkTrafficTxKbps: number | null = null;

  let totalCpuCores: number | null = null;
  let totalMemoryBytes: number | null = null;
  let totalMemoryUsedBytes: number | null = null;
  let totalStorageBytes: number | null = null;
  let totalStorageUsedBytes: number | null = null;
  let healthScore: number | null = null;
  let historicalMetrics: MetricDataPoint[] = [];

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

    historicalMetrics = store.metrics.slice(-30);

    let score = 100;
    if (offlineNodes > 0) score -= offlineNodes * 25;
    if (warningNodes > 0) score -= warningNodes * 10;
    healthScore = Math.max(0, Math.min(100, score));
  } else {
    // In Live Mode: ONLY aggregate if live connections actually exist
    if (totalNodes > 0) {
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
        let rxKbps = 0;
        let txKbps = 0;
        for (const h of hosts) {
          for (const net of h.networks || []) {
            rxKbps += Math.round(((net.rxBytesPerSec || 0) * 8) / 1024);
            txKbps += Math.round(((net.txBytesPerSec || 0) * 8) / 1024);
          }
        }
        networkTrafficRxKbps = rxKbps;
        networkTrafficTxKbps = txKbps;
      } else {
        // Non-ESXi live connections - check metrics polled from active live connections
        const liveMetrics = store.metrics.filter(m => m.connectionId && validConnIds.has(m.connectionId));
        if (liveMetrics.length > 0) {
          const last = liveMetrics[liveMetrics.length - 1];
          cpuUtilizationPct = last.cpu;
          memoryUtilizationPct = last.memory;
          storageUtilizationPct = last.storage;
          networkTrafficRxKbps = last.networkRxKbps;
          networkTrafficTxKbps = last.networkTxKbps;
        }
      }

      // Historical metrics for live mode: ONLY from real polled metrics matching live connections
      const liveHistory = store.metrics.filter(m => m.connectionId && validConnIds.has(m.connectionId));
      if (liveHistory.length > 0) {
        historicalMetrics = liveHistory.slice(-30);
      } else {
        const dbHistory = await store.getTelemetryHistory(undefined, '24h');
        const validDbHistory = dbHistory.filter(m => m.connectionId && validConnIds.has(m.connectionId));
        if (validDbHistory.length > 0) {
          historicalMetrics = validDbHistory.slice(-30);
        } else if (cpuUtilizationPct !== null) {
          historicalMetrics = [
            {
              timestamp: new Date().toISOString(),
              cpu: cpuUtilizationPct,
              memory: memoryUtilizationPct || 0,
              storage: storageUtilizationPct || 0,
              networkRxKbps: networkTrafficRxKbps || 0,
              networkTxKbps: networkTrafficTxKbps || 0
            }
          ];
        } else {
          historicalMetrics = [];
        }
      }

      // Calculate infrastructure Health Score for live mode
      let score = 100;
      if (offlineNodes > 0) score -= offlineNodes * 25;
      if (warningNodes > 0) score -= warningNodes * 10;
      const liveAlerts = Array.from(store.alerts.values()).filter(a => a.status === 'ACTIVE' && a.connectionId && validConnIds.has(a.connectionId));
      const criticalAlerts = liveAlerts.filter(a => a.severity === 'CRITICAL').length;
      const warningAlerts = liveAlerts.filter(a => a.severity === 'WARNING').length;
      score -= (criticalAlerts * 15 + warningAlerts * 5);
      healthScore = Math.max(0, Math.min(100, score));
    } else {
      // Zero live connections: explicit empty state
      cpuUtilizationPct = null;
      memoryUtilizationPct = null;
      storageUtilizationPct = null;
      networkTrafficRxKbps = null;
      networkTrafficTxKbps = null;
      totalCpuCores = null;
      totalMemoryBytes = null;
      totalMemoryUsedBytes = null;
      totalStorageBytes = null;
      totalStorageUsedBytes = null;
      healthScore = null;
      historicalMetrics = [];
    }
  }

  // Active alerts in current scope: in live mode, strictly require matching live connectionId
  const activeAlerts = Array.from(store.alerts.values())
    .filter(a => a.status === 'ACTIVE' && (isDemo ? true : Boolean(a.connectionId && validConnIds.has(a.connectionId))))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Recent system events in current scope: in live mode, strictly require matching live connectionId
  const seenEventIds = new Set<string>();
  const recentEvents = store.events
    .filter(e => isDemo ? true : Boolean(e.connectionId && validConnIds.has(e.connectionId)))
    .filter(e => {
      if (seenEventIds.has(e.id)) return false;
      seenEventIds.add(e.id);
      return true;
    })
    .slice(0, 8);

  // Recent audit logs in current scope: in live mode, exclude demo-specific logs and filter connectionId if present
  const seenLogIds = new Set<string>();
  const recentAuditLogs = store.auditLogs
    .filter(l => {
      if (isDemo) return true;
      if (l.details && l.details.includes('Demo Mode')) return false;
      if (l.connectionId) return validConnIds.has(l.connectionId);
      return true;
    })
    .filter(l => {
      if (seenLogIds.has(l.id)) return false;
      seenLogIds.add(l.id);
      return true;
    })
    .slice(0, 8);

  const summary: DashboardSummary = {
    hasLiveInfrastructure: totalNodes > 0,
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
