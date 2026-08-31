import { store } from '../db/store.js';
import { providerRegistry } from '../providers/registry.js';
import { alertEngine } from './alertEngine.js';
import { MetricDataPoint } from '../../src/types/index.js';
import { broadcastToAll } from '../websocket.js';

class MonitoringPoller {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private failureCounts: Map<string, number> = new Map();

  public start() {
    if (this.timer) clearInterval(this.timer);
    
    // Initial poll immediately
    this.pollAll();

    const intervalMs = Math.max(5, store.settings.pollIntervalSec || 30) * 1000;
    this.timer = setInterval(() => {
      this.pollAll();
    }, intervalMs);

    console.log(`[MonitoringPoller] Engine started. Polling every ${store.settings.pollIntervalSec}s.`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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
        try {
          const provider = providerRegistry.getProvider(conn);
          const status = await provider.getStatus();
          
          conn.lastCheckedAt = new Date().toISOString();
          if (status.status === 'ONLINE') {
            conn.status = 'ONLINE';
            conn.lastSeen = new Date().toISOString();
            conn.errorDetails = null;
            this.failureCounts.set(conn.id, 0);

            // Fetch live metrics
            const metrics = await provider.getMetrics();
            totalCpu += metrics.cpu;
            totalMem += metrics.memory;
            totalStorage += metrics.storage;
            rxRateTotal += metrics.networkRxKbps;
            txRateTotal += metrics.networkTxKbps;
            nodeCount++;

            // Evaluate Alert Rules for this node
            await alertEngine.evaluateMetrics({
              connectionId: conn.id,
              sourceName: conn.name,
              resourceType: conn.type === 'ESXI' ? 'ESXI' : (conn.type === 'CASAOS' ? 'CASAOS' : 'SERVER'),
              cpuPct: metrics.cpu,
              memoryPct: metrics.memory,
              storagePct: metrics.storage,
              isOffline: false
            });
          } else {
            // Handle failures with exponential tracking
            const fails = (this.failureCounts.get(conn.id) || 0) + 1;
            this.failureCounts.set(conn.id, fails);
            
            if (fails >= 2) {
              conn.status = 'OFFLINE';
              conn.errorDetails = status.error || 'Connection timed out';
              
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
            }
          }
          store.saveConnection(conn);
        } catch (err: any) {
          conn.status = 'DEGRADED';
          conn.errorDetails = err.message;
          store.saveConnection(conn);
        }
      }

      // If in demo mode and no external nodes, maintain rich dynamic fluctuations
      if (nodeCount > 0) {
        const avgCpu = Math.round((totalCpu / nodeCount) * 10) / 10;
        const avgMem = Math.round((totalMem / nodeCount) * 10) / 10;
        const avgStorage = Math.round((totalStorage / nodeCount) * 10) / 10;

        const newMetricPoint: MetricDataPoint = {
          timestamp: new Date().toISOString(),
          cpu: avgCpu,
          memory: avgMem,
          storage: avgStorage,
          networkRxKbps: Math.round(rxRateTotal),
          networkTxKbps: Math.round(txRateTotal)
        };

        store.addMetric(newMetricPoint);

        // Broadcast real-time telemetry over WebSocket
        broadcastToAll({
          type: 'METRICS_UPDATE',
          data: newMetricPoint
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
