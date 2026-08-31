import { store } from '../db/store.js';
import { Alert, AlertRule, AlertSeverity } from '../../src/types/index.js';
import { dispatchNotification } from './notifier.js';

class AlertEngine {
  public async evaluateMetrics(metricData: {
    connectionId?: string;
    sourceName: string;
    resourceType?: 'ESXI' | 'VM' | 'CASAOS' | 'DOCKER' | 'SERVER';
    resourceId?: string;
    cpuPct: number;
    memoryPct: number;
    storagePct?: number;
    isOffline?: boolean;
  }) {
    const rules = Array.from(store.alertRules.values()).filter(r => r.isEnabled);

    for (const rule of rules) {
      let triggered = false;
      let observedValue = 0;
      let alertTitle = '';
      let alertMsg = '';

      if (rule.metric === 'cpu' && metricData.cpuPct > rule.threshold) {
        triggered = true;
        observedValue = metricData.cpuPct;
        alertTitle = `High CPU Alert: ${metricData.sourceName}`;
        alertMsg = `CPU utilization of ${metricData.sourceName} reached ${metricData.cpuPct.toFixed(1)}% (Threshold: ${rule.threshold}%)`;
      } else if (rule.metric === 'memory' && metricData.memoryPct > rule.threshold) {
        triggered = true;
        observedValue = metricData.memoryPct;
        alertTitle = `High Memory Alert: ${metricData.sourceName}`;
        alertMsg = `Memory utilization of ${metricData.sourceName} reached ${metricData.memoryPct.toFixed(1)}% (Threshold: ${rule.threshold}%)`;
      } else if (rule.metric === 'storage' && metricData.storagePct !== undefined && metricData.storagePct > rule.threshold) {
        triggered = true;
        observedValue = metricData.storagePct;
        alertTitle = `Storage Capacity Warning: ${metricData.sourceName}`;
        alertMsg = `Storage utilization of ${metricData.sourceName} reached ${metricData.storagePct.toFixed(1)}% (Threshold: ${rule.threshold}%)`;
      } else if (rule.metric === 'status' && metricData.isOffline) {
        triggered = true;
        observedValue = 1;
        alertTitle = `Node Offline: ${metricData.sourceName}`;
        alertMsg = `Infrastructure node ${metricData.sourceName} became unreachable or offline.`;
      }

      if (triggered) {
        // Check if active alert already exists to prevent duplicate flooding
        const existingActive = Array.from(store.alerts.values()).find(
          a => a.status === 'ACTIVE' && 
               a.source === metricData.sourceName && 
               a.title === alertTitle
        );

        if (!existingActive) {
          const alert: Alert = {
            id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            connectionId: metricData.connectionId,
            title: alertTitle,
            message: alertMsg,
            severity: rule.severity,
            status: 'ACTIVE',
            source: metricData.sourceName,
            resourceType: metricData.resourceType,
            resourceId: metricData.resourceId,
            valueObserved: observedValue,
            threshold: rule.threshold,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          store.alerts.set(alert.id, alert);
          await dispatchNotification(alert);

          store.addEvent({
            connectionId: metricData.connectionId,
            eventType: 'ALERT_TRIGGERED',
            severity: rule.severity,
            source: 'Alert Engine',
            message: `Alert triggered: ${alertTitle}`
          });
        }
      }
    }
  }

  public acknowledgeAlert(alertId: string, username: string): Alert | null {
    const alert = store.alerts.get(alertId);
    if (!alert) return null;

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = username;
    alert.updatedAt = new Date().toISOString();
    store.alerts.set(alert.id, alert);

    store.addEvent({
      connectionId: alert.connectionId,
      eventType: 'ALERT_ACKNOWLEDGED',
      severity: 'INFO',
      source: 'Alert Engine',
      message: `Alert '${alert.title}' acknowledged by ${username}`
    });

    return alert;
  }

  public resolveAlert(alertId: string, username: string): Alert | null {
    const alert = store.alerts.get(alertId);
    if (!alert) return null;

    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = username;
    alert.updatedAt = new Date().toISOString();
    store.alerts.set(alert.id, alert);

    store.addEvent({
      connectionId: alert.connectionId,
      eventType: 'ALERT_RESOLVED',
      severity: 'INFO',
      source: 'Alert Engine',
      message: `Alert '${alert.title}' resolved by ${username}`
    });

    return alert;
  }
}

export const alertEngine = new AlertEngine();
