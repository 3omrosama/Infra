import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';

const router = Router();

// System event logs
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { severity, source, search, limit } = req.query;
  let events = [...store.events];

  if (severity) {
    events = events.filter(e => e.severity === severity);
  }
  if (source) {
    events = events.filter(e => e.source.toLowerCase().includes(String(source).toLowerCase()));
  }
  if (search) {
    const q = String(search).toLowerCase();
    events = events.filter(e => 
      e.message.toLowerCase().includes(q) || 
      e.eventType.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q)
    );
  }

  const max = limit ? parseInt(String(limit), 10) : 100;
  res.json(events.slice(0, max));
});

// Security & Management Audit Logs
router.get('/audit', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { action, username, resourceType, status, search, limit } = req.query;
  let logs = [...store.auditLogs];

  if (action) {
    logs = logs.filter(l => l.action.toLowerCase() === String(action).toLowerCase());
  }
  if (username) {
    logs = logs.filter(l => l.username?.toLowerCase() === String(username).toLowerCase());
  }
  if (resourceType) {
    logs = logs.filter(l => l.resourceType.toLowerCase() === String(resourceType).toLowerCase());
  }
  if (status) {
    logs = logs.filter(l => l.status === status);
  }
  if (search) {
    const q = String(search).toLowerCase();
    logs = logs.filter(l => 
      l.details.toLowerCase().includes(q) || 
      l.action.toLowerCase().includes(q) || 
      l.username?.toLowerCase().includes(q)
    );
  }

  const max = limit ? parseInt(String(limit), 10) : 100;
  res.json(logs.slice(0, max));
});

export default router;
