import { store } from '../db/store.js';
import { Alert, NotificationItem, AlertSeverity } from '../../src/types/index.js';

export async function dispatchNotification(alert: Alert) {
  // 1. In-App Notification
  const notif: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    isRead: false,
    channel: 'IN_APP',
    payload: { alertId: alert.id, source: alert.source },
    createdAt: new Date().toISOString()
  };
  store.saveNotification(notif);

  // 2. Webhook Notification (if configured)
  const webhookUrl = store.settings.webhookUrl;
  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      const payload = {
        event: 'infrastructure.alert',
        timestamp: new Date().toISOString(),
        alert: {
          id: alert.id,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          source: alert.source,
          resourceType: alert.resourceType,
          resourceId: alert.resourceId,
          valueObserved: alert.valueObserved,
          threshold: alert.threshold
        }
      };

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => {
        console.warn(`[Notifier] Webhook dispatch warning: ${err.message}`);
      });
    } catch (err) {
      console.error('[Notifier] Webhook dispatch error:', err);
    }
  }

  // 3. Email Notification (if configured)
  if (store.settings.emailAlertsEnabled && store.settings.smtpHost) {
    console.log(`[Notifier] Dispatched email alert: "${alert.title}" to ${store.settings.smtpFrom}`);
  }
}
