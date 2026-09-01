// Core Domain Types & Provider Interface Definitions for NOC Infrastructure Manager

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export type ConnectionType = 
  | 'ESXI' 
  | 'CASAOS' 
  | 'DOCKER' 
  | 'PROXMOX' 
  | 'TRUENAS' 
  | 'LINUX_SERVER' 
  | 'WINDOWS_SERVER';

export type InfrastructureType = ConnectionType;

export type ConnectionStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'CONNECTING' | 'DISABLED';

export type PowerState = 'RUNNING' | 'STOPPED' | 'SUSPENDED' | 'UNKNOWN';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export type ResourceType = 'ESXI' | 'VM' | 'CASAOS' | 'DOCKER' | 'SERVER' | 'STORAGE' | 'NETWORK';

export interface InfrastructureConnection {
  id: string;
  name: string;
  type: ConnectionType;
  host: string;
  port: number;
  useHttps: boolean;
  skipSslVerify: boolean;
  username?: string;
  endpointKey?: string;
  status: ConnectionStatus;
  lastSeen?: string | null;
  lastCheckedAt?: string | null;
  errorDetails?: string | null;
  pollIntervalSec: number;
  isEnabled: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ESXiHost {
  id: string;
  connectionId: string;
  hostname: string;
  ipAddress: string;
  version: string;
  build?: string;
  uptimeSeconds: number;
  cpuModel?: string;
  cpuCores: number;
  cpuMhzTotal?: number;
  cpuUsagePct: number;
  memoryBytesTotal: number;
  memoryUsagePct: number;
  storageBytesTotal: number;
  storageBytesUsed: number;
  storageUsagePct: number;
  powerState: PowerState;
  vmCount: number;
  runningVmCount: number;
  datastores: DatastoreInfo[];
  networks: NetworkInfo[];
}

export interface DatastoreInfo {
  id: string;
  name: string;
  type: string; // VMFS, NFS, vSAN
  capacityBytes: number;
  freeBytes: number;
  usagePct: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export interface NetworkInfo {
  id: string;
  name: string;
  type: string; // vSwitch, PortGroup, Bridge, PhysicalNIC
  vlanId?: number;
  macAddress?: string;
  ipAddress?: string;
  speedMbps?: number;
  status: 'ACTIVE' | 'INACTIVE';
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface VirtualMachine {
  id: string;
  connectionId: string;
  hostId?: string;
  externalVmId: string;
  name: string;
  powerState: PowerState;
  cpuCount: number;
  cpuUsagePct: number;
  memoryBytes: number;
  memoryUsagePct: number;
  storageBytes: number;
  storageUsagePct: number;
  ipAddress?: string;
  guestOs?: string;
  uptimeSeconds: number;
  datastoreName?: string;
  networkName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CasaOSServer {
  id: string;
  connectionId: string;
  hostname: string;
  ipAddress: string;
  version: string;
  uptimeSeconds: number;
  cpuModel?: string;
  cpuCores: number;
  cpuUsagePct: number;
  memoryBytesTotal: number;
  memoryBytesUsed: number;
  memoryUsagePct: number;
  storageBytesTotal: number;
  storageBytesUsed: number;
  storageUsagePct: number;
  diskCount: number;
  runningAppsCount: number;
  totalAppsCount: number;
  dockerVersion?: string;
  disks: CasaOSDisk[];
}

export interface CasaOSDisk {
  id: string;
  name: string;
  path: string;
  model: string;
  capacityBytes: number;
  usedBytes: number;
  usagePct: number;
  health: 'PASSED' | 'WARNING' | 'FAILED';
  temperatureC: number;
  type: 'SSD' | 'HDD' | 'NVMe';
}

export interface CasaOSApp {
  id: string;
  connectionId: string;
  name: string;
  title: string;
  category: string;
  icon?: string;
  status: 'running' | 'stopped' | 'restarting' | 'error';
  containerId: string;
  image: string;
  cpuUsagePct: number;
  memoryBytes: number;
  memoryUsagePct: number;
  networkRxBytes: number;
  networkTxBytes: number;
  restartCount: number;
  ports: { host: number; container: number; protocol: 'tcp' | 'udp' }[];
  volumes: { hostPath: string; containerPath: string; mode: string }[];
  uptimeSeconds: number;
  createdAt: string;
}

export interface DockerContainer {
  id: string;
  connectionId: string;
  containerId: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting';
  cpuUsagePct: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  memoryUsagePct: number;
  networkRxBytes: number;
  networkTxBytes: number;
  ports: { ip?: string; privatePort: number; publicPort?: number; type: string }[];
  mounts: { source: string; destination: string; mode: string; rw: boolean }[];
  restartCount: number;
  created: string;
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  sizeBytes: number;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  scope: string;
  sizeBytes?: number;
}

export interface MetricDataPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  storage: number;
  networkRxKbps: number;
  networkTxKbps: number;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: 'cpu' | 'memory' | 'storage' | 'network' | 'status';
  condition: 'gt' | 'lt' | 'eq' | 'offline';
  threshold: number;
  durationSec: number;
  severity: AlertSeverity;
  isEnabled: boolean;
  targetType?: ResourceType;
  createdAt: string;
}

export interface Alert {
  id: string;
  connectionId?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  resourceType?: ResourceType;
  resourceId?: string;
  valueObserved?: number;
  threshold?: number;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isRead: boolean;
  channel: 'IN_APP' | 'EMAIL' | 'WEBHOOK';
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface SystemEvent {
  id: string;
  connectionId?: string;
  eventType: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  username?: string;
  connectionId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'FAILURE';
  createdAt: string;
}

export interface DashboardSummary {
  nodes: {
    total: number;
    online: number;
    offline: number;
    warning: number;
  };
  vms: {
    total: number;
    running: number;
    stopped: number;
    suspended: number;
  };
  containers: {
    total: number;
    running: number;
    stopped: number;
  };
  metrics: {
    cpuUtilizationPct: number;
    memoryUtilizationPct: number;
    storageUtilizationPct: number;
    networkTrafficRxKbps: number;
    networkTrafficTxKbps: number;
  };
  historicalMetrics: MetricDataPoint[];
  activeAlerts: Alert[];
  recentEvents: SystemEvent[];
  recentAuditLogs: AuditLog[];
  isDemoMode: boolean;
  healthScore: number;
  lastUpdated: string;
}

export interface ProviderConnectionConfig {
  id?: string;
  name: string;
  type: ConnectionType;
  host: string;
  port: number;
  useHttps: boolean;
  skipSslVerify: boolean;
  username?: string;
  password?: string;
  token?: string;
  endpointKey?: string;
  encryptedSecret?: string;
  secretIv?: string;
  secretTag?: string;
  pollIntervalSec?: number;
  isEnabled?: boolean;
  isDemo?: boolean;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  version?: string;
  details?: Record<string, unknown>;
}

export interface ProviderStatus {
  status: ConnectionStatus;
  lastSeen?: string;
  latencyMs?: number;
  error?: string;
}

// Provider abstraction interface
export interface InfrastructureProvider {
  id: string;
  config: ProviderConnectionConfig;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ProviderTestResult>;
  getStatus(): Promise<ProviderStatus>;
  getHosts?(): Promise<ESXiHost[]>;
  getVirtualMachines?(): Promise<VirtualMachine[]>;
  getStorage?(): Promise<DatastoreInfo[] | CasaOSDisk[] | DockerVolume[]>;
  getNetworks?(): Promise<NetworkInfo[]>;
  getMetrics(): Promise<MetricDataPoint>;
  getEvents(): Promise<SystemEvent[]>;
  getLogs?(): Promise<string[]>;

  // Management actions
  executeVMAction?(vmId: string, action: 'power-on' | 'power-off' | 'restart' | 'suspend'): Promise<{ success: boolean; message: string }>;
  executeAppAction?(appId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }>;
  executeContainerAction?(containerId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }>;
}

export interface SystemSettings {
  pollIntervalSec: number;
  metricRetentionDays: number;
  demoMode: boolean;
  webhookUrl?: string;
  emailAlertsEnabled: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpFrom?: string;
  autoResolveMinutes?: number;
}
