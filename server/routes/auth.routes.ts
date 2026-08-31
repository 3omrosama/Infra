import { Router, Response } from 'express';
import { store, StoredUser } from '../db/store.js';
import { comparePassword, hashPassword } from '../crypto.js';
import { generateToken, sanitizeUser, authenticateToken, requireRole, AuthenticatedRequest } from '../auth.js';
import { logAuditAction } from '../monitoring/audit.js';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Find user by username or email
  const user = Array.from(store.users.values()).find(
    u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase()
  );

  if (!user || !user.isActive) {
    logAuditAction({
      username,
      action: 'LOGIN_FAILED',
      resourceType: 'AUTH',
      details: `Failed login attempt for user '${username}': user not found or inactive`,
      ipAddress: req.ip,
      status: 'FAILURE'
    });
    res.status(401).json({ error: 'Invalid credentials or inactive account' });
    return;
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    logAuditAction({
      userId: user.id,
      username: user.username,
      action: 'LOGIN_FAILED',
      resourceType: 'AUTH',
      details: `Failed password verification for user '${username}'`,
      ipAddress: req.ip,
      status: 'FAILURE'
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Update last login
  user.lastLoginAt = new Date().toISOString();
  await store.saveUser(user);

  const { token, expiresAt } = generateToken(user);

  logAuditAction({
    userId: user.id,
    username: user.username,
    action: 'LOGIN_SUCCESS',
    resourceType: 'AUTH',
    details: `User '${user.username}' logged in successfully with role '${user.role}'`,
    ipAddress: req.ip,
    status: 'SUCCESS'
  });

  res.json({
    user: sanitizeUser(user),
    token,
    expiresAt
  });
});

// Current User Profile
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user: req.user });
});

// Logout
router.post('/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    logAuditAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'LOGOUT',
      resourceType: 'AUTH',
      details: `User '${req.user.username}' logged out`,
      ipAddress: req.ip,
      status: 'SUCCESS'
    });
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
