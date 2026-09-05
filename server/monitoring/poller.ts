import { store } from '../db/store.js';
import { providerRegistry } from '../providers/registry.js';
import { alertEngine } from './alertEngine.js';
import { MetricDataPoint, NormalizedTelemetry } from '../../src/types/index.js';
import { broadcastToAll } from '../websocket.js';

class MonitoringPoller {
  private timer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private activePolls: Set<string> = new Set();
  private failureCounts: Map<string, number> = new Map();

  public start() {
    if (this.timer) clearInterval(this.timer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    
    // Initial poll immediately
    this.pollAll();

    const intervalMs = Math.max(5, store.settings.pollIntervalSec || 30) * 1000;
    this.timer = setInterval(() => {
      this.pollAll();
    }, intervalMs);

    // Run metric retention cleanup once every 24 hours
    this.cleanupTimer = setInterval(() => {
      store.cleanOldMetrics().catch(err => {
        console.error('[MonitoringPoller] Metric retention cleanup error:', err);
      });
    }, 24 * 60 * 60 * 1000);

    console.log(`[MonitoringPoller] Engine started. Polling every ${store.settings.pollIntervalSec}s.`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Poll a single connection immediately (with overlap guard)
   */
  public async pollConnection(connectionId: string): Promise<NormalizedTelemetry | null> {
    const conn = store.connections.get(connectionId);
    if (!conn || !conn.isEnabled) {
      return null;
    }

    if (this.activePolls.has(connectionId)) {
      console.log(`[MonitoringPoller] Poll already active for connection ${connectionId} (${conn.name}), skipping.`);
      return store.latestTelemetry.get(connectionId) || null;
    }

    this.activePolls.add(connectionId);

    try {
      const provider = providerRegistry.getProvider(conn);
      let telemetry: NormalizedTelemetry | null = null;

      if (typeof (provider as any).getNormalizedTelemetry === 'function') {
        telemetry = await (provider as any).getNormalizedTelemetry();
      } else {
        const metrics = await provider.getMetrics();
        telemetry = {
          id: `tel-${conn.id}-${Date.now().toString(36)}`,
          connectionId: conn.id,
          timestamp: metrics.timestamp || new Date().toISOString(),
          cpu: {
            utilizationPct: metrics.cpu,
            coresTotal: metrics.cpuCoresTotal || 1
          },
          memory: {
            usedBytes: metrics.memoryBytesUsed || 0,
            totalBytes: metrics.memoryBytesTotal || 0,
            utilizationPct: metrics.memory
          },
          storage: {
            usedBytes: metrics.storageBytesUsed || 0,
            totalBytes: metrics.storageBytesTotal || 0,
            utilizationPct: metrics.storage
          },
          network: {
            rxBytesPerSec: null,
            txBytesPerSec: null,
            rxKbps: metrics.networkRxKbps,
            txKbps: metrics.networkTxKbps
          },
          uptimeSeconds: metrics.uptimeSeconds || 0,
          latencyMs: metrics.latencyMs || 0,
          status: 'ONLINE'
        };
      }

      if (telemetry) {
        conn.status = 'ONLINE';
        conn.lastSeen = new Date().toISOString();
        conn.lastCheckedAt = new Date().toISOString();
        conn.errorDetails = undefined;
        this.failureCounts.set(conn.id, 0);

        // Persist telemetry
        await store.saveNormalizedTelemetry(telemetry);

        // Sync inventory discovery for ESXi if applicable
        if (conn.type === 'ESXI') {
          try {
            const hosts = await (provider as any).getHosts();
            const vms = await (provider as any).getVirtualMachines();
            if (hosts.length > 0 || vms.length > 0) {
              await store.syncDiscoveredESXi(conn.id, hosts, vms);
            }
          } catch (discErr: any) {
            console.warn(`[MonitoringPoller] Discovery sync notice for ${conn.name}:`, discErr.message);
          }
        }

        // Evaluate Alert Rules
        await alertEngine.evaluateMetrics({
          connectionId: conn.id,
          sourceName: conn.name,
          resourceType: conn.type === 'ESXI' ? 'ESXI' : (conn.type === 'CASAOS' ? 'CASAOS' : 'SERVER'),
          cpuPct: telemetry.cpu.utilizationPct,
          memoryPct: telemetry.memory.utilizationPct,
          storagePct: telemetry.storage.utilizationPct,
          isOffline: false
        });

        // Broadcast telemetry.updated event over WebSocket
        broadcastToAll({
          type: 'telemetry.updated',
          connectionId: conn.id,
          data: telemetry,
          timestamp: telemetry.timestamp
        });

        // Also broadcast METRICS_UPDATE for backwards compatibility
        broadcastToAll({
          type: 'METRICS_UPDATE',
          data: {
            connectionId: conn.id,
            timestamp: telemetry.timestamp,
            cpu: telemetry.cpu.utilizationPct,
            memory: telemetry.memory.utilizationPct,
            storage: telemetry.storage.utilizationPct,
            networkRxKbps: telemetry.network.rxKbps || 0,
            networkTxKbps: telemetry.network.txKbps || 0
          }
        });

        store.saveConnection(conn);
        return telemetry;
      }
      return null;
    } catch (err: any) {
      const fails = (this.failureCounts.get(conn.id) || 0) + 1;
      this.failureCounts.set(conn.id, fails);
      conn.lastCheckedAt = new Date().toISOString();

      if (fails >= 2) {
        conn.status = 'OFFLINE';
        conn.errorDetails = err.message || 'Connection timed out';
        
        await alertEngine.evaluateMetrics({
          connectionId: conn.id,
          sourceName: conn.name,
          resourceType: 'SERVER',
          cpuPct: 0,
          memoryPct: 0,
          isOffline: true
        });
      } else {
        conn.status = 'DEGRADED';
        conn.errorDetails = err.message;
      }

      store.saveConnection(conn);
      return null;
    } finally {
      this.activePolls.delete(connectionId);
    }
  }

  public async pollAll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const connections = Array.from(store.connections.values()).filter(c => c.isEnabled);
      let totalCpu = 0;
      let totalMem = 0;
      let totalStorage = 0;
      let nodeCount = 0;
      let rxRateTotal = 0;
      let txRateTotal = 0;

      for (const conn of connections) {
        const tel = await this.pollConnection(conn.id);
        if (tel && tel.status === 'ONLINE') {
          totalCpu += tel.cpu.utilizationPct;
          totalMem += tel.memory.utilizationPct;
          totalStorage += tel.storage.utilizationPct;
          rxRateTotal += tel.network.rxKbps || 0;
          txRateTotal += tel.network.txKbps || 0;
          nodeCount++;
        }
      }

      if (nodeCount > 0) {
        const avgCpu = Math.round((totalCpu / nodeCount) * 10) / 10;
        const avgMem = Math.round((totalMem / nodeCount) * 10) / 10;
        const avgStorage = Math.round((totalStorage / nodeCount) * 10) / 10;

        const aggregatePoint: MetricDataPoint = {
          timestamp: new Date().toISOString(),
          cpu: avgCpu,
          memory: avgMem,
          storage: avgStorage,
          networkRxKbps: Math.round(rxRateTotal),
          networkTxKbps: Math.round(txRateTotal)
        };

        // Broadcast overall aggregate
        broadcastToAll({
          type: 'METRICS_AGGREGATE',
          data: aggregatePoint
        });
      }

      broadcastToAll({
        type: 'CONNECTIONS_STATUS',
        data: Array.from(store.connections.values())
      });

    } catch (err) {
      console.error('[MonitoringPoller] Poll cycle encountered error:', err);
    } finally {
      this.isPolling = false;
    }
  }
}

export const monitoringPoller = new MonitoringPoller();
