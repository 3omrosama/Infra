import { store } from '../db/store.js';
import { AuditLog } from '../../src/types/index.js';

export function logAuditAction(params: {
  userId?: string;
  username?: string;
  connectionId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: string;
  ipAddress?: string;
  status?: 'SUCCESS' | 'FAILURE';
}): AuditLog {
  return store.addAuditLog({
    userId: params.userId,
    username: params.username || (params.userId ? store.users.get(params.userId)?.username : 'system'),
    connectionId: params.connectionId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: params.details,
    ipAddress: params.ipAddress || 'internal',
    status: params.status || 'SUCCESS'
  });
}
