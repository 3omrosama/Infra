import { Router, Response } from 'express';
import { store, StoredUser } from '../db/store.js';
import { authenticateToken, requireRole, AuthenticatedRequest, sanitizeUser } from '../auth.js';
import { hashPassword } from '../crypto.js';
import { logAuditAction } from '../monitoring/audit.js';

const router = Router();

// List all users (Admin only)
router.get('/', authenticateToken, requireRole('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const users = Array.from(store.users.values()).map(sanitizeUser);
  res.json(users);
});

// Create new user (Admin only)
router.post('/', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password || !role) {
    res.status(400).json({ error: 'Username, email, password, and role are required' });
    return;
  }

  // Check unique username or email
  const existing = Array.from(store.users.values()).find(
    u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    res.status(409).json({ error: 'Username or email already registered' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const newUser: StoredUser = {
    id: `usr-${Date.now().toString(36)}`,
    username,
    email,
    passwordHash,
    role,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  store.users.set(newUser.id, newUser);

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'USER_CREATE',
    resourceType: 'USER',
    resourceId: newUser.id,
    details: `Created new user '${username}' with role '${role}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.status(201).json(sanitizeUser(newUser));
});

// Update user (Admin only)
router.put('/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = store.users.get(id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { email, role, isActive, password } = req.body;
  if (email) user.email = email;
  if (role) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (password) {
    user.passwordHash = await hashPassword(password);
  }

  store.users.set(id, user);

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'USER_UPDATE',
    resourceType: 'USER',
    resourceId: id,
    details: `Updated account settings for user '${user.username}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json(sanitizeUser(user));
});

// Delete user (Admin only)
router.delete('/:id', authenticateToken, requireRole('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  if (req.user?.id === id) {
    res.status(400).json({ error: 'Cannot delete your own active administrative account' });
    return;
  }

  const user = store.users.get(id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  store.users.delete(id);

  logAuditAction({
    userId: req.user?.id,
    username: req.user?.username,
    action: 'USER_DELETE',
    resourceType: 'USER',
    resourceId: id,
    details: `Deleted user account '${user.username}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json({ success: true, message: `User '${user.username}' deleted successfully` });
});

export default router;
