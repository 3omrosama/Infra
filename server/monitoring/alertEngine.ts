import { store } from '../db/store.js';
import { Alert, AlertRule, AlertSeverity } from '../../src/types/index.js';
import { dispatchNotification } from './notifier.js';
import { prisma } from '../db/prisma.js';

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
        // Check if an unresolved incident (ACTIVE or ACKNOWLEDGED) already exists for this condition
        // A previously RESOLVED alert will NOT match, allowing a new incident if the condition returns
        let existingUnresolved = Array.from(store.alerts.values()).find(
          a => (a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED') && 
               a.source === metricData.sourceName && 
               a.title === alertTitle &&
               (!metricData.connectionId || !a.connectionId || a.connectionId === metricData.connectionId) &&
               (!metricData.resourceId || !a.resourceId || a.resourceId === metricData.resourceId)
        );

        // Check PostgreSQL persistence if not found in active in-memory store
        if (!existingUnresolved && store.isDbConnected) {
          try {
            const dbAlert = await prisma.alert.findFirst({
              where: {
                status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
                source: metricData.sourceName,
                title: alertTitle,
                ...(metricData.connectionId ? { connectionId: metricData.connectionId } : {}),
                ...(metricData.resourceId ? { resourceId: metricData.resourceId } : {})
              },
              orderBy: { createdAt: 'desc' }
            });

            if (dbAlert) {
              existingUnresolved = {
                id: dbAlert.id,
                connectionId: dbAlert.connectionId || undefined,
                title: dbAlert.title,
                message: dbAlert.message,
                severity: dbAlert.severity as any,
                status: dbAlert.status as any,
                source: dbAlert.source,
                resourceType: dbAlert.resourceType as any,
                resourceId: dbAlert.resourceId || undefined,
                valueObserved: dbAlert.valueObserved ?? undefined,
                threshold: dbAlert.threshold ?? undefined,
                acknowledgedAt: dbAlert.acknowledgedAt?.toISOString(),
                acknowledgedBy: dbAlert.acknowledgedBy || undefined,
                resolvedAt: dbAlert.resolvedAt?.toISOString(),
                resolvedBy: dbAlert.resolvedBy || undefined,
                createdAt: dbAlert.createdAt.toISOString(),
                updatedAt: dbAlert.updatedAt.toISOString()
              };
              store.alerts.set(existingUnresolved.id, existingUnresolved);
            }
          } catch (dbErr: any) {
            console.warn('[AlertEngine] Database deduplication query fallback note:', dbErr?.message || dbErr);
          }
        }

        if (existingUnresolved) {
          // Update the existing open incident with latest telemetry
          // Preserve ACKNOWLEDGED status (do NOT reset back to ACTIVE)
          existingUnresolved.valueObserved = observedValue;
          existingUnresolved.message = alertMsg;
          existingUnresolved.updatedAt = new Date().toISOString();
          await store.saveAlert(existingUnresolved);
        } else {
          // Condition is new or was previously RESOLVED: create a new ACTIVE alert
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

          await store.saveAlert(alert);
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
    store.saveAlert(alert);

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
    store.saveAlert(alert);

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
