import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { alertEngine } from '../monitoring/alertEngine.js';
import { logAuditAction } from '../monitoring/audit.js';
import { AlertRule } from '../../src/types/index.js';

const router = Router();

// List all alerts (filter by status and severity)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { status, severity } = req.query;
  let alerts = Array.from(store.alerts.values());

  if (status) {
    alerts = alerts.filter(a => a.status === status);
  }
  if (severity) {
    alerts = alerts.filter(a => a.severity === severity);
  }

  alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(alerts);
});

// Acknowledge alert
router.post('/:id/acknowledge', authenticateToken, requireRole('ADMIN', 'OPERATOR'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const username = req.user?.username || 'operator';
  const updated = alertEngine.acknowledgeAlert(id, username);

  if (!updated) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'ACK_ALERT',
    resourceType: 'ALERT',
    resourceId: id,
    details: `Acknowledged alert: "${updated.title}"`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json(updated);
});

// Resolve alert
router.post('/:id/resolve', authenticateToken, requireRole('ADMIN', 'OPERATOR'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const username = req.user?.username || 'operator';
  const updated = alertEngine.resolveAlert(id, username);

  if (!updated) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'RESOLVE_ALERT',
    resourceType: 'ALERT',
    resourceId: id,
    details: `Resolved alert: "${updated.title}"`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json(updated);
});

// Get Alert Rules
router.get('/rules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const rules = Array.from(store.alertRules.values());
  res.json(rules);
});

// Create Alert Rule (Admin only)
router.post('/rules', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, metric, condition, threshold, durationSec, severity, targetType } = req.body;

  if (!name || !metric || !threshold || !severity) {
    res.status(400).json({ error: 'Name, metric, threshold, and severity are required' });
    return;
  }

  const newRule: AlertRule = {
    id: `rule-${Date.now().toString(36)}`,
    name,
    metric,
    condition: condition || 'gt',
    threshold: parseFloat(threshold),
    durationSec: durationSec ? parseInt(durationSec, 10) : 60,
    severity,
    isEnabled: true,
    targetType,
    createdAt: new Date().toISOString()
  };

  await store.saveAlertRule(newRule);

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'CREATE_ALERT_RULE',
    resourceType: 'ALERT_RULE',
    resourceId: newRule.id,
    details: `Created alert rule: "${newRule.name}" (${newRule.metric} ${newRule.condition} ${newRule.threshold})`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.status(201).json(newRule);
});

// Update Alert Rule
router.put('/rules/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const rule = store.alertRules.get(id);
  if (!rule) {
    res.status(404).json({ error: 'Alert rule not found' });
    return;
  }

  const { name, threshold, durationSec, severity, isEnabled } = req.body;
  if (name) rule.name = name;
  if (threshold !== undefined) rule.threshold = parseFloat(threshold);
  if (durationSec !== undefined) rule.durationSec = parseInt(durationSec, 10);
  if (severity) rule.severity = severity;
  if (isEnabled !== undefined) rule.isEnabled = isEnabled;

  await store.saveAlertRule(rule);
  res.json(rule);
});

// Delete Alert Rule
router.delete('/rules/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const rule = store.alertRules.get(id);
  if (!rule) {
    res.status(404).json({ error: 'Alert rule not found' });
    return;
  }

  await store.deleteAlertRule(id);
  res.json({ success: true, message: `Alert rule '${rule.name}' removed` });
});

export default router;
