import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { logAuditAction } from '../monitoring/audit.js';
import { monitoringPoller } from '../monitoring/poller.js';

const router = Router();

// Get settings
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json(store.settings);
});

// Update settings (Admin only)
router.put('/', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { 
    pollIntervalSec, 
    metricRetentionDays, 
    demoMode, 
    webhookUrl, 
    emailAlertsEnabled, 
    smtpHost, 
    smtpPort, 
    smtpUser, 
    smtpFrom, 
    autoResolveMinutes 
  } = req.body;

  if (pollIntervalSec) store.settings.pollIntervalSec = Math.max(5, parseInt(pollIntervalSec, 10));
  if (metricRetentionDays) store.settings.metricRetentionDays = parseInt(metricRetentionDays, 10);
  if (demoMode !== undefined) store.settings.demoMode = Boolean(demoMode);
  if (webhookUrl !== undefined) store.settings.webhookUrl = webhookUrl;
  if (emailAlertsEnabled !== undefined) store.settings.emailAlertsEnabled = Boolean(emailAlertsEnabled);
  if (smtpHost !== undefined) store.settings.smtpHost = smtpHost;
  if (smtpPort !== undefined) store.settings.smtpPort = parseInt(smtpPort, 10);
  if (smtpUser !== undefined) store.settings.smtpUser = smtpUser;
  if (smtpFrom !== undefined) store.settings.smtpFrom = smtpFrom;
  if (autoResolveMinutes) store.settings.autoResolveMinutes = parseInt(autoResolveMinutes, 10);

  // Persist to PostgreSQL
  await store.saveSettings(store.settings);

  // Restart monitoring poller with new interval
  monitoringPoller.start();

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'SYSTEM_CONFIG_UPDATE',
    resourceType: 'SETTINGS',
    details: `Updated system settings (Poll interval: ${store.settings.pollIntervalSec}s, Demo mode: ${store.settings.demoMode})`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json(store.settings);
});

// Re-seed demo infrastructure
router.post('/reset-demo', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  await store.seedDemoData();

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'SYSTEM_CONFIG_UPDATE',
    resourceType: 'DEMO_DATA',
    details: 'Reset and re-seeded demo infrastructure cluster topology',
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json({ success: true, message: 'Demo infrastructure successfully reset' });
});

export default router;
