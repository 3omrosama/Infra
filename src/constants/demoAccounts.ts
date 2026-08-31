import { UserRole } from '../types/index.js';

export interface DemoAccount {
  id: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  label: string;
  description: string;
  badgeColorClass: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'usr-admin-001',
    username: 'admin',
    email: 'admin@infrastructure.internal',
    password: 'AdminNocPass2026!',
    role: 'ADMIN',
    label: 'Admin',
    description: 'Full Access',
    badgeColorClass: 'text-cyan-400'
  },
  {
    id: 'usr-op-002',
    username: 'operator',
    email: 'operator@infrastructure.internal',
    password: 'OperatorPass2026!',
    role: 'OPERATOR',
    label: 'Operator',
    description: 'Power / Ops',
    badgeColorClass: 'text-emerald-400'
  },
  {
    id: 'usr-view-003',
    username: 'viewer',
    email: 'viewer@infrastructure.internal',
    password: 'ViewerPass2026!',
    role: 'VIEWER',
    label: 'Viewer',
    description: 'Read Only',
    badgeColorClass: 'text-purple-400'
  }
];

export const DEFAULT_DEMO_CREDENTIALS = {
  username: DEMO_ACCOUNTS[0].username,
  password: DEMO_ACCOUNTS[0].password
};
