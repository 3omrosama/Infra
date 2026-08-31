import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { store, StoredUser } from './db/store.js';
import { UserRole, User } from '../src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'c8f8b8e0d5a34e7f91a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: StoredUser): { token: string; expiresAt: string } {
  const expiresIn = '7d';
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn }
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return { token, expiresAt };
}

export function sanitizeUser(user: StoredUser): User {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err || !decoded) {
      res.status(403).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const user = store.users.get(decoded.id);
    if (!user || !user.isActive) {
      res.status(403).json({ error: 'User account not found or deactivated.' });
      return;
    }

    req.user = sanitizeUser(user);
    next();
  });
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admin has superuser privileges across all routes
    if (req.user.role === 'ADMIN' || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ 
      error: `Forbidden. Role '${req.user.role}' lacks required permissions. Required: [${allowedRoles.join(', ')}]` 
    });
  };
}
