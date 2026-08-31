import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { authenticateToken, AuthenticatedRequest } from '../auth.js';
import { NotificationItem } from '../../src/types/index.js';

const router = Router();

// Get Notifications
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const notifs = Array.from(store.notifications.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(notifs);
});

// Mark single as read
router.post('/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const notif = store.notifications.get(id);
  if (!notif) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  notif.isRead = true;
  await store.saveNotification(notif);
  res.json(notif);
});

// Mark all as read
router.post('/read-all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  for (const n of store.notifications.values()) {
    n.isRead = true;
    await store.saveNotification(n);
  }
  res.json({ success: true, message: 'All notifications marked as read' });
});

// Test Notification trigger
router.post('/test', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const testNotif: NotificationItem = {
    id: `notif-test-${Date.now()}`,
    title: 'Test Notification Dispatched',
    message: `Manual test triggered by user '${req.user?.username || 'operator'}'`,
    severity: 'INFO',
    isRead: false,
    channel: 'IN_APP',
    createdAt: new Date().toISOString()
  };

  await store.saveNotification(testNotif);
  res.json(testNotif);
});

export default router;
