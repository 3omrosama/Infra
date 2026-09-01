import {
  UserRole,
  InfrastructureConnection,
  ESXiHost,
  VirtualMachine,
  CasaOSServer,
  CasaOSApp,
  DockerContainer,
  DockerImage,
  DockerVolume,
  MetricDataPoint,
  AlertRule,
  Alert,
  NotificationItem,
  SystemEvent,
  AuditLog,
  SystemSettings
} from '../../src/types/index.js';
import { hashPassword, encryptSecret } from '../crypto.js';
import { prisma, checkDatabaseConnection } from './prisma.js';
import { normalizeEndpoint } from '../utils/endpoint.js';

export interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface StoredConnection extends InfrastructureConnection {
  encryptedSecret?: string;
  secretIv?: string;
  secretTag?: string;
}

export class DataStore {
  public users: Map<string, StoredUser> = new Map();
  public connections: Map<string, StoredConnection> = new Map();
  public esxiHosts: Map<string, ESXiHost> = new Map();
  public virtualMachines: Map<string, VirtualMachine> = new Map();
  public casaosServers: Map<string, CasaOSServer> = new Map();
  public casaosApps: Map<string, CasaOSApp> = new Map();
  public dockerContainers: Map<string, DockerContainer> = new Map();
  public dockerImages: Map<string, DockerImage> = new Map();
  public dockerVolumes: Map<string, DockerVolume> = new Map();
  public metrics: MetricDataPoint[] = [];
  public alertRules: Map<string, AlertRule> = new Map();
  public alerts: Map<string, Alert> = new Map();
  public notifications: Map<string, NotificationItem> = new Map();
  public events: SystemEvent[] = [];
  public auditLogs: AuditLog[] = [];
  public settings: SystemSettings = {
    pollIntervalSec: 30,
    metricRetentionDays: 30,
    demoMode: false,
    webhookUrl: '',
    emailAlertsEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpFrom: 'alerts@noc-manager.local',
    autoResolveMinutes: 120
  };

  private isDbConnected: boolean = false;

  public async init() {
    console.log('[DataStore] Initializing PostgreSQL database store...');
    this.isDbConnected = await checkDatabaseConnection();

    if (this.isDbConnected) {
      console.log('[DataStore] PostgreSQL connected. Synchronizing schema & seed data...');
      try {
        await this.syncDatabase();
      } catch (err: any) {
        console.error('[DataStore] Error during DB synchronization:', err?.message || err);
      }
    } else {
      console.warn('[DataStore] PostgreSQL database connection unavailable. Using in-memory store fallback.');
      await this.seedInMemoryFallback();
    }
  }

  /**
   * Synchronize with PostgreSQL database
   */
  private async syncDatabase() {
    // 1. Ensure Roles exist
    await this.ensureRoles();

    // 2. Ensure System Settings exist
    await this.ensureSettings();

    // 3. Ensure Default Users exist
    await this.ensureDefaultUsers();

    // 4. Ensure Default Alert Rules exist
    await this.ensureDefaultAlertRules();

    // 5. Load all state from PostgreSQL into memory
    await this.loadAllFromDatabase();

    // 6. If database is completely empty of connections and demoMode is enabled, seed demo topology
    if (this.connections.size === 0 && this.settings.demoMode) {
      console.log('[DataStore] No existing connections found and Demo Mode is ON. Seeding initial demo topology...');
      await this.seedDemoData();
    }
  }

  private async ensureRoles() {
    const roles: Array<{ name: UserRole; description: string; permissions: string[] }> = [
      {
        name: 'ADMIN',
        description: 'Full administrative access across all infrastructure, credentials, and settings',
        permissions: ['*']
      },
      {
        name: 'OPERATOR',
        description: 'Operational privileges to acknowledge alerts and execute power/container actions',
        permissions: ['view:*', 'action:vm:*', 'action:container:*', 'alert:ack', 'alert:resolve']
      },
      {
        name: 'VIEWER',
        description: 'Read-only visibility for infrastructure monitoring, metrics, and logs',
        permissions: ['view:*']
      }
    ];

    for (const r of roles) {
      await prisma.role.upsert({
        where: { name: r.name },
        update: { description: r.description },
        create: {
          name: r.name,
          description: r.description,
          permissions: r.permissions
        }
      });
    }
  }

  private async ensureSettings() {
    const dbSetting = await prisma.systemSetting.findUnique({
      where: { id: 'default' }
    });

    if (dbSetting) {
      this.settings = {
        pollIntervalSec: dbSetting.pollIntervalSec,
        metricRetentionDays: dbSetting.metricRetentionDays,
        demoMode: dbSetting.demoMode,
        webhookUrl: dbSetting.webhookUrl,
        emailAlertsEnabled: dbSetting.emailAlertsEnabled,
        smtpHost: dbSetting.smtpHost,
        smtpPort: dbSetting.smtpPort,
        smtpUser: dbSetting.smtpUser,
        smtpFrom: dbSetting.smtpFrom,
        autoResolveMinutes: dbSetting.autoResolveMinutes
      };
    } else {
      const created = await prisma.systemSetting.create({
        data: {
          id: 'default',
          pollIntervalSec: this.settings.pollIntervalSec,
          metricRetentionDays: this.settings.metricRetentionDays,
          demoMode: this.settings.demoMode,
          webhookUrl: this.settings.webhookUrl,
          emailAlertsEnabled: this.settings.emailAlertsEnabled,
          smtpHost: this.settings.smtpHost,
          smtpPort: this.settings.smtpPort,
          smtpUser: this.settings.smtpUser,
          smtpFrom: this.settings.smtpFrom,
          autoResolveMinutes: this.settings.autoResolveMinutes
        }
      });
      this.settings.pollIntervalSec = created.pollIntervalSec;
    }
  }

  private async ensureDefaultUsers() {
    const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
    const operatorRole = await prisma.role.findUnique({ where: { name: 'OPERATOR' } });
    const viewerRole = await prisma.role.findUnique({ where: { name: 'VIEWER' } });

    const defaultUsers = [
      {
        id: 'usr-admin-01',
        username: 'admin',
        email: 'admin@noc-infrastructure.local',
        password: 'AdminNocPass2026!',
        role: 'ADMIN' as UserRole,
        roleId: adminRole?.id
      },
      {
        id: 'usr-operator-01',
        username: 'operator',
        email: 'operator@noc-infrastructure.local',
        password: 'OperatorNocPass2026!',
        role: 'OPERATOR' as UserRole,
        roleId: operatorRole?.id
      },
      {
        id: 'usr-viewer-01',
        username: 'viewer',
        email: 'viewer@noc-infrastructure.local',
        password: 'ViewerNocPass2026!',
        role: 'VIEWER' as UserRole,
        roleId: viewerRole?.id
      }
    ];

    for (const u of defaultUsers) {
      const existing = await prisma.user.findUnique({
        where: { username: u.username }
      });

      if (!existing) {
        const passwordHash = await hashPassword(u.password);
        await prisma.user.create({
          data: {
            id: u.id,
            username: u.username,
            email: u.email,
            passwordHash,
            roleId: u.roleId,
            roleName: u.role,
            isActive: true
          }
        });
      }
    }
  }

  private async ensureDefaultAlertRules() {
    const defaultRules: AlertRule[] = [
      {
        id: 'rule-cpu-critical',
        name: 'High CPU Utilization Critical',
        metric: 'cpu',
        condition: 'gt',
        threshold: 90,
        durationSec: 60,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-cpu-warning',
        name: 'Elevated CPU Utilization',
        metric: 'cpu',
        condition: 'gt',
        threshold: 75,
        durationSec: 120,
        severity: 'WARNING',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-mem-critical',
        name: 'Memory Exhaustion Critical',
        metric: 'memory',
        condition: 'gt',
        threshold: 92,
        durationSec: 60,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-storage-warning',
        name: 'Storage Volume Capacity High',
        metric: 'storage',
        condition: 'gt',
        threshold: 85,
        durationSec: 300,
        severity: 'WARNING',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-node-offline',
        name: 'Infrastructure Node Disconnected',
        metric: 'status',
        condition: 'offline',
        threshold: 1,
        durationSec: 10,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      }
    ];

    for (const rule of defaultRules) {
      const existing = await prisma.alertRule.findUnique({ where: { id: rule.id } });
      if (!existing) {
        await prisma.alertRule.create({
          data: {
            id: rule.id,
            name: rule.name,
            metric: rule.metric,
            condition: rule.condition,
            threshold: rule.threshold,
            durationSec: rule.durationSec,
            severity: rule.severity,
            isEnabled: rule.isEnabled,
            createdAt: new Date(rule.createdAt)
          }
        });
      }
    }
  }

  /**
   * Load all tables from PostgreSQL into memory caches
   */
  public async loadAllFromDatabase() {
    // 1. Users
    const dbUsers = await prisma.user.findMany({
      include: { role: true }
    });
    this.users.clear();
    for (const u of dbUsers) {
      const roleName: UserRole = (u.role?.name || u.roleName || 'VIEWER') as UserRole;
      this.users.set(u.id, {
        id: u.id,
        username: u.username,
        email: u.email,
        passwordHash: u.passwordHash,
        role: roleName,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt?.toISOString(),
        createdAt: u.createdAt.toISOString()
      });
    }

    // 2. Connections
    const dbConnections = await prisma.infrastructureConnection.findMany({
      orderBy: { createdAt: 'asc' }
    });
    this.connections.clear();
    for (const c of dbConnections) {
      this.connections.set(c.id, {
        id: c.id,
        name: c.name,
        type: c.type as any,
        host: c.host,
        port: c.port,
        useHttps: c.useHttps,
        skipSslVerify: c.skipSslVerify,
        username: c.username || undefined,
        endpointKey: c.endpointKey || undefined,
        encryptedSecret: c.encryptedSecret || undefined,
        secretIv: c.secretIv || undefined,
        secretTag: c.secretTag || undefined,
        status: c.status as any,
        lastSeen: c.lastSeen?.toISOString(),
        lastCheckedAt: c.lastCheckedAt?.toISOString(),
        errorDetails: c.errorDetails || undefined,
        pollIntervalSec: c.pollIntervalSec,
        isEnabled: c.isEnabled,
        isDemo: c.isDemo,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      });
    }

    // 3. Hosts
    const dbHosts = await prisma.host.findMany();
    this.esxiHosts.clear();
    for (const h of dbHosts) {
      this.esxiHosts.set(h.id, {
        id: h.id,
        connectionId: h.connectionId,
        hostname: h.hostname,
        ipAddress: h.ipAddress,
        version: h.version,
        build: h.build || undefined,
        cpuModel: h.cpuModel || 'Generic x86_64 Processor',
        cpuCores: h.cpuCores,
        cpuMhzTotal: h.cpuMhzTotal || undefined,
        cpuUsagePct: h.cpuUsagePct,
        memoryBytesTotal: Number(h.memoryBytesTotal),
        memoryUsagePct: h.memoryUsagePct,
        storageBytesTotal: Number(h.storageBytesTotal),
        storageBytesUsed: Number(h.storageBytesUsed),
        storageUsagePct: h.storageUsagePct,
        uptimeSeconds: Number(h.uptimeSeconds),
        powerState: h.powerState as any,
        vmCount: h.vmCount,
        runningVmCount: h.runningVmCount,
        datastores: (h.datastores as any) || [],
        networks: (h.networksJson as any) || []
      });
    }

    // 4. Virtual Machines
    const dbVms = await prisma.virtualMachine.findMany();
    this.virtualMachines.clear();
    for (const vm of dbVms) {
      this.virtualMachines.set(vm.id, {
        id: vm.id,
        connectionId: vm.connectionId,
        hostId: vm.hostId || undefined,
        externalVmId: vm.externalVmId,
        name: vm.name,
        powerState: vm.powerState as any,
        cpuCount: vm.cpuCount,
        cpuUsagePct: vm.cpuUsagePct,
        memoryBytes: Number(vm.memoryBytes),
        memoryUsagePct: vm.memoryUsagePct,
        storageBytes: Number(vm.storageBytes),
        storageUsagePct: vm.storageUsagePct,
        ipAddress: vm.ipAddress || undefined,
        guestOs: vm.guestOs || 'Linux 64-bit',
        uptimeSeconds: Number(vm.uptimeSeconds),
        datastoreName: vm.datastoreName || undefined,
        networkName: vm.networkName || undefined,
        createdAt: vm.createdAt.toISOString(),
        updatedAt: vm.updatedAt.toISOString()
      });
    }

    // 5. CasaOS Servers
    const dbCasaServers = await prisma.casaOSServer.findMany();
    this.casaosServers.clear();
    for (const s of dbCasaServers) {
      this.casaosServers.set(s.id, {
        id: s.id,
        connectionId: s.connectionId,
        hostname: s.hostname,
        ipAddress: s.ipAddress,
        version: s.version,
        uptimeSeconds: Number(s.uptimeSeconds),
        cpuModel: s.cpuModel || 'Intel / AMD Embedded CPU',
        cpuCores: s.cpuCores,
        cpuUsagePct: s.cpuUsagePct,
        memoryBytesTotal: Number(s.memoryBytesTotal),
        memoryBytesUsed: Number(s.memoryBytesUsed),
        memoryUsagePct: s.memoryUsagePct,
        storageBytesTotal: Number(s.storageBytesTotal),
        storageBytesUsed: Number(s.storageBytesUsed),
        storageUsagePct: s.storageUsagePct,
        diskCount: s.diskCount,
        runningAppsCount: s.runningAppsCount,
        totalAppsCount: s.totalAppsCount,
        dockerVersion: s.dockerVersion || '24.0.7',
        disks: (s.disks as any) || []
      });
    }

    // 6. Containers (Docker & CasaOS Apps)
    const dbContainers = await prisma.container.findMany();
    this.dockerContainers.clear();
    this.casaosApps.clear();
    for (const c of dbContainers) {
      if (c.isCasaOsApp) {
        this.casaosApps.set(c.id, {
          id: c.id,
          connectionId: c.connectionId,
          containerId: c.externalId,
          name: c.name,
          title: c.appTitle || c.name,
          icon: c.appIcon || 'server',
          status: (c.status === 'running' || c.status === 'stopped' || c.status === 'restarting' || c.status === 'error') ? c.status : 'running',
          category: c.appCategory || 'General',
          image: c.image,
          cpuUsagePct: c.cpuUsagePct,
          memoryBytes: Number(c.memoryBytes),
          memoryUsagePct: c.memoryUsagePct,
          networkRxBytes: Number(c.networkRxBytes),
          networkTxBytes: Number(c.networkTxBytes),
          restartCount: c.restartCount,
          ports: (c.ports as any) || [],
          volumes: (c.volumes as any) || [],
          uptimeSeconds: Number(c.uptimeSeconds),
          createdAt: c.createdAt.toISOString()
        });
      } else {
        this.dockerContainers.set(c.id, {
          id: c.id,
          connectionId: c.connectionId,
          containerId: c.externalId,
          name: c.name,
          image: c.image,
          state: (c.status === 'running' || c.status === 'exited' || c.status === 'paused' || c.status === 'restarting') ? c.status : 'running',
          status: c.status,
          cpuUsagePct: c.cpuUsagePct,
          memoryBytes: Number(c.memoryBytes),
          memoryLimitBytes: Number(c.memoryLimitBytes),
          memoryUsagePct: c.memoryUsagePct,
          networkTxBytes: Number(c.networkTxBytes),
          networkRxBytes: Number(c.networkRxBytes),
          ports: (c.ports as any) || [],
          mounts: (c.volumes as any) || [],
          restartCount: c.restartCount,
          created: c.createdAt.toISOString()
        });
      }
    }

    // 7. Docker Images & Volumes
    const dbImages = await prisma.dockerImage.findMany();
    this.dockerImages.clear();
    for (const img of dbImages) {
      this.dockerImages.set(img.id, {
        id: img.id,
        repoTags: [img.repository ? `${img.repository}:${img.tag || 'latest'}` : img.imageId],
        sizeBytes: Number(img.sizeBytes),
        created: img.created.toISOString()
      });
    }

    const dbVolumes = await prisma.dockerVolume.findMany();
    this.dockerVolumes.clear();
    for (const v of dbVolumes) {
      this.dockerVolumes.set(v.id, {
        name: v.name,
        driver: v.driver,
        scope: v.scope,
        sizeBytes: Number(v.sizeBytes)
      });
    }

    // 8. Alert Rules
    const dbRules = await prisma.alertRule.findMany({ orderBy: { createdAt: 'asc' } });
    this.alertRules.clear();
    for (const r of dbRules) {
      this.alertRules.set(r.id, {
        id: r.id,
        name: r.name,
        metric: r.metric as any,
        condition: r.condition as any,
        threshold: r.threshold,
        durationSec: r.durationSec,
        severity: r.severity as any,
        isEnabled: r.isEnabled,
        targetType: r.targetType as any,
        createdAt: r.createdAt.toISOString()
      });
    }

    // 9. Alerts
    const dbAlerts = await prisma.alert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    this.alerts.clear();
    for (const a of dbAlerts) {
      this.alerts.set(a.id, {
        id: a.id,
        connectionId: a.connectionId || undefined,
        title: a.title,
        message: a.message,
        severity: a.severity as any,
        status: a.status as any,
        source: a.source,
        resourceType: a.resourceType as any,
        resourceId: a.resourceId || undefined,
        valueObserved: a.valueObserved || undefined,
        threshold: a.threshold || undefined,
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
        acknowledgedBy: a.acknowledgedBy || undefined,
        resolvedAt: a.resolvedAt?.toISOString(),
        resolvedBy: a.resolvedBy || undefined,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString()
      });
    }

    // 10. Notifications
    const dbNotifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    this.notifications.clear();
    for (const n of dbNotifications) {
      this.notifications.set(n.id, {
        id: n.id,
        title: n.title,
        message: n.message,
        severity: n.severity as any,
        isRead: n.isRead,
        channel: n.channel as any,
        payload: (n.payload as any) || undefined,
        createdAt: n.createdAt.toISOString()
      });
    }

    // 11. Events
    const dbEvents = await prisma.event.findMany({
      orderBy: { timestamp: 'desc' },
      take: 150
    });
    this.events = dbEvents.map(e => ({
      id: e.id,
      connectionId: e.connectionId || undefined,
      eventType: e.eventType,
      severity: e.severity as any,
      source: e.source,
      message: e.message,
      metadata: (e.metadata as any) || undefined,
      timestamp: e.timestamp.toISOString()
    }));

    // 12. Audit Logs
    const dbAuditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    this.auditLogs = dbAuditLogs.map(l => ({
      id: l.id,
      userId: l.userId || undefined,
      username: l.username || undefined,
      connectionId: l.connectionId || undefined,
      action: l.action,
      resourceType: l.resourceType,
      resourceId: l.resourceId || undefined,
      details: l.details,
      ipAddress: l.ipAddress || undefined,
      status: l.status as any,
      createdAt: l.createdAt.toISOString()
    }));

    // 13. Metrics
    const dbMetrics = await prisma.metric.findMany({
      orderBy: { timestamp: 'desc' },
      take: 168
    });
    this.metrics = dbMetrics.reverse().map(m => ({
      timestamp: m.timestamp.toISOString(),
      cpu: m.cpuPct,
      memory: m.memoryPct,
      storage: m.storagePct || 0,
      networkRxKbps: m.networkRxKbps,
      networkTxKbps: m.networkTxKbps
    }));

    // If no metrics in DB yet, generate initial baseline
    if (this.metrics.length === 0) {
      this.generateBaselineMetrics();
    }
  }

  // --------------------------------------------------------------------------
  // Persistence Methods (Write-Through to PostgreSQL)
  // --------------------------------------------------------------------------

  public async saveUser(user: StoredUser): Promise<void> {
    this.users.set(user.id, user);
    if (!this.isDbConnected) return;

    try {
      const role = await prisma.role.findUnique({ where: { name: user.role } });
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          username: user.username,
          email: user.email,
          passwordHash: user.passwordHash,
          roleId: role?.id,
          roleName: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null
        },
        create: {
          id: user.id,
          username: user.username,
          email: user.email,
          passwordHash: user.passwordHash,
          roleId: role?.id,
          roleName: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
          createdAt: new Date(user.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist user '${user.username}':`, err?.message || err);
    }
  }

  public async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    if (!this.isDbConnected) return;

    try {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    } catch (err: any) {
      console.error(`[DataStore] Failed to delete user '${id}' from DB:`, err?.message || err);
    }
  }

  public findConnectionByEndpoint(endpointKey: string): StoredConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.endpointKey === endpointKey) return conn;
      const norm = normalizeEndpoint(conn.type, conn.host, conn.port, conn.useHttps);
      if (norm.key === endpointKey) return conn;
    }
    return undefined;
  }

  public async saveConnection(conn: StoredConnection): Promise<void> {
    if (!conn.endpointKey) {
      conn.endpointKey = normalizeEndpoint(conn.type, conn.host, conn.port, conn.useHttps).key;
    }
    this.connections.set(conn.id, conn);
    if (!this.isDbConnected) return;

    try {
      await prisma.infrastructureConnection.upsert({
        where: { id: conn.id },
        update: {
          name: conn.name,
          type: conn.type as any,
          host: conn.host,
          port: conn.port,
          useHttps: conn.useHttps,
          skipSslVerify: conn.skipSslVerify,
          username: conn.username,
          endpointKey: conn.endpointKey,
          encryptedSecret: conn.encryptedSecret,
          secretIv: conn.secretIv,
          secretTag: conn.secretTag,
          status: conn.status as any,
          lastSeen: conn.lastSeen ? new Date(conn.lastSeen) : null,
          lastCheckedAt: conn.lastCheckedAt ? new Date(conn.lastCheckedAt) : null,
          errorDetails: conn.errorDetails,
          pollIntervalSec: conn.pollIntervalSec,
          isEnabled: conn.isEnabled,
          isDemo: conn.isDemo || false
        },
        create: {
          id: conn.id,
          name: conn.name,
          type: conn.type as any,
          host: conn.host,
          port: conn.port,
          useHttps: conn.useHttps,
          skipSslVerify: conn.skipSslVerify,
          username: conn.username,
          endpointKey: conn.endpointKey,
          encryptedSecret: conn.encryptedSecret,
          secretIv: conn.secretIv,
          secretTag: conn.secretTag,
          status: conn.status as any,
          lastSeen: conn.lastSeen ? new Date(conn.lastSeen) : null,
          lastCheckedAt: conn.lastCheckedAt ? new Date(conn.lastCheckedAt) : null,
          errorDetails: conn.errorDetails,
          pollIntervalSec: conn.pollIntervalSec,
          isEnabled: conn.isEnabled,
          isDemo: conn.isDemo || false,
          createdAt: new Date(conn.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist connection '${conn.name}':`, err?.message || err);
    }
  }

  public async deleteConnection(id: string): Promise<void> {
    this.connections.delete(id);
    // Remove all associated child resources from in-memory maps
    Array.from(this.esxiHosts.values()).filter(h => h.connectionId === id).forEach(h => this.esxiHosts.delete(h.id));
    Array.from(this.virtualMachines.values()).filter(v => v.connectionId === id).forEach(v => this.virtualMachines.delete(v.id));
    Array.from(this.casaosServers.values()).filter(s => s.connectionId === id).forEach(s => this.casaosServers.delete(s.id));
    Array.from(this.casaosApps.values()).filter(a => a.connectionId === id).forEach(a => this.casaosApps.delete(a.id));
    Array.from(this.dockerContainers.values()).filter(c => c.connectionId === id).forEach(c => this.dockerContainers.delete(c.id));
    Array.from(this.dockerImages.values()).filter(img => img.id === id).forEach(img => this.dockerImages.delete(img.id));
    Array.from(this.alerts.values()).filter(alt => alt.connectionId === id).forEach(alt => this.alerts.delete(alt.id));

    if (!this.isDbConnected) return;

    try {
      await prisma.host.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.virtualMachine.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.casaOSServer.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.container.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.alert.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.event.deleteMany({ where: { connectionId: id } }).catch(() => {});
      await prisma.infrastructureConnection.delete({ where: { id } }).catch(() => {});
    } catch (err: any) {
      console.error(`[DataStore] Failed to delete connection '${id}' from DB:`, err?.message || err);
    }
  }

  public async saveHost(host: ESXiHost): Promise<void> {
    this.esxiHosts.set(host.id, host);
    if (!this.isDbConnected) return;

    try {
      await prisma.host.upsert({
        where: { id: host.id },
        update: {
          hostname: host.hostname,
          ipAddress: host.ipAddress,
          version: host.version,
          build: host.build || null,
          cpuModel: host.cpuModel || null,
          cpuCores: host.cpuCores,
          cpuMhzTotal: host.cpuMhzTotal || null,
          cpuUsagePct: host.cpuUsagePct,
          memoryBytesTotal: BigInt(Math.floor(host.memoryBytesTotal || 0)),
          memoryUsagePct: host.memoryUsagePct,
          storageBytesTotal: BigInt(Math.floor(host.storageBytesTotal || 0)),
          storageBytesUsed: BigInt(Math.floor(host.storageBytesUsed || 0)),
          storageUsagePct: host.storageUsagePct,
          uptimeSeconds: BigInt(Math.floor(host.uptimeSeconds || 0)),
          powerState: (host.powerState as any) || 'RUNNING',
          vmCount: host.vmCount || 0,
          runningVmCount: host.runningVmCount || 0,
          datastores: (host.datastores as any) || [],
          networksJson: (host.networks as any) || []
        },
        create: {
          id: host.id,
          connectionId: host.connectionId,
          hostname: host.hostname,
          ipAddress: host.ipAddress,
          version: host.version,
          build: host.build || null,
          cpuModel: host.cpuModel || null,
          cpuCores: host.cpuCores,
          cpuMhzTotal: host.cpuMhzTotal || null,
          cpuUsagePct: host.cpuUsagePct,
          memoryBytesTotal: BigInt(Math.floor(host.memoryBytesTotal || 0)),
          memoryUsagePct: host.memoryUsagePct,
          storageBytesTotal: BigInt(Math.floor(host.storageBytesTotal || 0)),
          storageBytesUsed: BigInt(Math.floor(host.storageBytesUsed || 0)),
          storageUsagePct: host.storageUsagePct,
          uptimeSeconds: BigInt(Math.floor(host.uptimeSeconds || 0)),
          powerState: (host.powerState as any) || 'RUNNING',
          vmCount: host.vmCount || 0,
          runningVmCount: host.runningVmCount || 0,
          datastores: (host.datastores as any) || [],
          networksJson: (host.networks as any) || []
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist host '${host.hostname}':`, err?.message || err);
    }
  }

  public async saveVirtualMachine(vm: VirtualMachine): Promise<void> {
    this.virtualMachines.set(vm.id, vm);
    if (!this.isDbConnected) return;

    try {
      await prisma.virtualMachine.upsert({
        where: { id: vm.id },
        update: {
          hostId: vm.hostId || null,
          externalVmId: vm.externalVmId,
          name: vm.name,
          powerState: (vm.powerState as any) || 'RUNNING',
          cpuCount: vm.cpuCount,
          cpuUsagePct: vm.cpuUsagePct,
          memoryBytes: BigInt(Math.floor(vm.memoryBytes || 0)),
          memoryUsagePct: vm.memoryUsagePct,
          storageBytes: BigInt(Math.floor(vm.storageBytes || 0)),
          storageUsagePct: vm.storageUsagePct,
          ipAddress: vm.ipAddress || null,
          guestOs: vm.guestOs || null,
          uptimeSeconds: BigInt(Math.floor(vm.uptimeSeconds || 0)),
          datastoreName: vm.datastoreName || null,
          networkName: vm.networkName || null
        },
        create: {
          id: vm.id,
          connectionId: vm.connectionId,
          hostId: vm.hostId || null,
          externalVmId: vm.externalVmId,
          name: vm.name,
          powerState: (vm.powerState as any) || 'RUNNING',
          cpuCount: vm.cpuCount,
          cpuUsagePct: vm.cpuUsagePct,
          memoryBytes: BigInt(Math.floor(vm.memoryBytes || 0)),
          memoryUsagePct: vm.memoryUsagePct,
          storageBytes: BigInt(Math.floor(vm.storageBytes || 0)),
          storageUsagePct: vm.storageUsagePct,
          ipAddress: vm.ipAddress || null,
          guestOs: vm.guestOs || null,
          uptimeSeconds: BigInt(Math.floor(vm.uptimeSeconds || 0)),
          datastoreName: vm.datastoreName || null,
          networkName: vm.networkName || null,
          createdAt: new Date(vm.createdAt || Date.now())
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist VM '${vm.name}':`, err?.message || err);
    }
  }

  public async syncDiscoveredESXi(connectionId: string, hosts: ESXiHost[], vms: VirtualMachine[]): Promise<void> {
    const discoveredHostIds = new Set<string>();
    const discoveredVmIds = new Set<string>();

    for (const host of hosts) {
      host.connectionId = connectionId;
      discoveredHostIds.add(host.id);
      await this.saveHost(host);
    }

    for (const vm of vms) {
      vm.connectionId = connectionId;
      if (!vm.hostId && hosts.length > 0) {
        vm.hostId = hosts[0].id;
      }
      discoveredVmIds.add(vm.id);
      await this.saveVirtualMachine(vm);
    }

    // Prune stale hosts previously associated with this connection that are no longer present
    for (const [id, h] of this.esxiHosts.entries()) {
      if (h.connectionId === connectionId && !discoveredHostIds.has(id)) {
        this.esxiHosts.delete(id);
        if (this.isDbConnected) {
          await prisma.host.delete({ where: { id } }).catch(() => {});
        }
      }
    }

    // Prune stale VMs previously associated with this connection that are no longer present
    for (const [id, v] of this.virtualMachines.entries()) {
      if (v.connectionId === connectionId && !discoveredVmIds.has(id)) {
        this.virtualMachines.delete(id);
        if (this.isDbConnected) {
          await prisma.virtualMachine.delete({ where: { id } }).catch(() => {});
        }
      }
    }
  }

  public async saveAlert(alert: Alert): Promise<void> {
    this.alerts.set(alert.id, alert);
    if (!this.isDbConnected) return;

    try {
      await prisma.alert.upsert({
        where: { id: alert.id },
        update: {
          title: alert.title,
          message: alert.message,
          severity: alert.severity as any,
          status: alert.status as any,
          source: alert.source,
          resourceType: alert.resourceType as any,
          resourceId: alert.resourceId,
          valueObserved: alert.valueObserved,
          threshold: alert.threshold,
          acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
          acknowledgedBy: alert.acknowledgedBy,
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          resolvedBy: alert.resolvedBy
        },
        create: {
          id: alert.id,
          connectionId: alert.connectionId,
          title: alert.title,
          message: alert.message,
          severity: alert.severity as any,
          status: alert.status as any,
          source: alert.source,
          resourceType: alert.resourceType as any,
          resourceId: alert.resourceId,
          valueObserved: alert.valueObserved,
          threshold: alert.threshold,
          acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
          acknowledgedBy: alert.acknowledgedBy,
          resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
          resolvedBy: alert.resolvedBy,
          createdAt: new Date(alert.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist alert '${alert.title}':`, err?.message || err);
    }
  }

  public async saveAlertRule(rule: AlertRule): Promise<void> {
    this.alertRules.set(rule.id, rule);
    if (!this.isDbConnected) return;

    try {
      await prisma.alertRule.upsert({
        where: { id: rule.id },
        update: {
          name: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          threshold: rule.threshold,
          durationSec: rule.durationSec,
          severity: rule.severity as any,
          isEnabled: rule.isEnabled,
          targetType: rule.targetType as any
        },
        create: {
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          threshold: rule.threshold,
          durationSec: rule.durationSec,
          severity: rule.severity as any,
          isEnabled: rule.isEnabled,
          targetType: rule.targetType as any,
          createdAt: new Date(rule.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist alert rule '${rule.name}':`, err?.message || err);
    }
  }

  public async deleteAlertRule(id: string): Promise<void> {
    this.alertRules.delete(id);
    if (!this.isDbConnected) return;

    try {
      await prisma.alertRule.delete({ where: { id } }).catch(() => {});
    } catch (err: any) {
      console.error(`[DataStore] Failed to delete alert rule '${id}':`, err?.message || err);
    }
  }

  public async saveNotification(notif: NotificationItem): Promise<void> {
    this.notifications.set(notif.id, notif);
    if (!this.isDbConnected) return;

    try {
      await prisma.notification.upsert({
        where: { id: notif.id },
        update: {
          isRead: notif.isRead
        },
        create: {
          id: notif.id,
          title: notif.title,
          message: notif.message,
          severity: notif.severity as any,
          isRead: notif.isRead,
          channel: notif.channel || 'IN_APP',
          payload: (notif.payload as any) || undefined,
          createdAt: new Date(notif.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist notification:`, err?.message || err);
    }
  }

  public async saveEvent(event: SystemEvent): Promise<void> {
    this.events.unshift(event);
    if (this.events.length > 200) this.events.pop();

    if (!this.isDbConnected) return;

    try {
      await prisma.event.create({
        data: {
          id: event.id,
          connectionId: event.connectionId,
          eventType: event.eventType,
          severity: event.severity as any,
          source: event.source,
          message: event.message,
          metadata: (event.metadata as any) || undefined,
          timestamp: new Date(event.timestamp)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist event:`, err?.message || err);
    }
  }

  public async saveAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 200) this.auditLogs.pop();

    if (!this.isDbConnected) return;

    try {
      await prisma.auditLog.create({
        data: {
          id: log.id,
          userId: log.userId,
          username: log.username,
          connectionId: log.connectionId,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          status: log.status || 'SUCCESS',
          createdAt: new Date(log.createdAt)
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist audit log:`, err?.message || err);
    }
  }

  public async saveMetric(metric: MetricDataPoint): Promise<void> {
    this.metrics.push(metric);
    if (this.metrics.length > 300) {
      this.metrics.shift();
    }

    if (!this.isDbConnected) return;

    try {
      await prisma.metric.create({
        data: {
          cpuPct: metric.cpu,
          memoryPct: metric.memory,
          storagePct: metric.storage,
          networkRxKbps: metric.networkRxKbps,
          networkTxKbps: metric.networkTxKbps,
          timestamp: new Date(metric.timestamp)
        }
      });
    } catch (err: any) {
      // Metric error should not interrupt telemetry
    }
  }

  public async saveSettings(settings: SystemSettings): Promise<void> {
    this.settings = { ...settings };
    if (!this.isDbConnected) return;

    try {
      await prisma.systemSetting.upsert({
        where: { id: 'default' },
        update: {
          pollIntervalSec: settings.pollIntervalSec,
          metricRetentionDays: settings.metricRetentionDays,
          demoMode: settings.demoMode,
          webhookUrl: settings.webhookUrl || '',
          emailAlertsEnabled: settings.emailAlertsEnabled,
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort,
          smtpUser: settings.smtpUser || '',
          smtpFrom: settings.smtpFrom,
          autoResolveMinutes: settings.autoResolveMinutes
        },
        create: {
          id: 'default',
          pollIntervalSec: settings.pollIntervalSec,
          metricRetentionDays: settings.metricRetentionDays,
          demoMode: settings.demoMode,
          webhookUrl: settings.webhookUrl || '',
          emailAlertsEnabled: settings.emailAlertsEnabled,
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort,
          smtpUser: settings.smtpUser || '',
          smtpFrom: settings.smtpFrom,
          autoResolveMinutes: settings.autoResolveMinutes
        }
      });
    } catch (err: any) {
      console.error(`[DataStore] Failed to persist system settings:`, err?.message || err);
    }
  }

  public addAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): AuditLog {
    const log: AuditLog = {
      id: entry.id || `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      userId: entry.userId,
      username: entry.username,
      connectionId: entry.connectionId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details,
      ipAddress: entry.ipAddress,
      status: entry.status || 'SUCCESS',
      createdAt: entry.createdAt || new Date().toISOString()
    };
    this.saveAuditLog(log);
    return log;
  }

  public addEvent(entry: Omit<SystemEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): SystemEvent {
    const evt: SystemEvent = {
      id: entry.id || `evt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      connectionId: entry.connectionId,
      eventType: entry.eventType,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      metadata: entry.metadata,
      timestamp: entry.timestamp || new Date().toISOString()
    };
    this.saveEvent(evt);
    return evt;
  }

  public addMetric(metric: MetricDataPoint): void {
    this.saveMetric(metric);
  }

  // --------------------------------------------------------------------------
  // Baseline Metrics & Demo Seeding
  // --------------------------------------------------------------------------

  private generateBaselineMetrics() {
    this.metrics = [];
    const now = Date.now();
    for (let i = 48; i >= 0; i--) {
      const time = new Date(now - i * 30 * 60 * 1000).toISOString();
      const wave = Math.sin(i / 3) * 12;
      this.metrics.push({
        timestamp: time,
        cpu: Math.max(15, Math.min(95, Math.round((48 + wave + (Math.random() * 8 - 4)) * 10) / 10)),
        memory: Math.max(30, Math.min(92, Math.round((64 + wave * 0.4 + (Math.random() * 4 - 2)) * 10) / 10)),
        storage: 62.8,
        networkRxKbps: Math.round(18400 + wave * 1200 + Math.random() * 2000),
        networkTxKbps: Math.round(14100 + wave * 900 + Math.random() * 1500)
      });
    }
  }

  private async seedInMemoryFallback() {
    this.generateBaselineMetrics();

    // Default users in memory
    const defaultUsers = [
      {
        id: 'usr-admin-01',
        username: 'admin',
        email: 'admin@noc-infrastructure.local',
        password: 'AdminNocPass2026!',
        role: 'ADMIN' as UserRole
      },
      {
        id: 'usr-operator-01',
        username: 'operator',
        email: 'operator@noc-infrastructure.local',
        password: 'OperatorNocPass2026!',
        role: 'OPERATOR' as UserRole
      },
      {
        id: 'usr-viewer-01',
        username: 'viewer',
        email: 'viewer@noc-infrastructure.local',
        password: 'ViewerNocPass2026!',
        role: 'VIEWER' as UserRole
      }
    ];

    for (const u of defaultUsers) {
      const passwordHash = await hashPassword(u.password);
      this.users.set(u.id, {
        id: u.id,
        username: u.username,
        email: u.email,
        passwordHash,
        role: u.role,
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

    await this.seedDemoData();
  }

  public async seedDemoData() {
    const encEsxi = encryptSecret('VMwareEsxiPass2026!');
    const encCasa = encryptSecret('CasaOsToken9827361');
    const encDocker = encryptSecret('DockerSocketTlsKey');

    // 1. ESXi Host & VMs
    const esxiConn: StoredConnection = {
      id: 'conn-esxi-prod-01',
      name: 'ESXi Production Cluster (vCenter 8.0)',
      type: 'ESXI',
      host: '10.240.10.15',
      port: 443,
      useHttps: true,
      skipSslVerify: true,
      username: 'root',
      encryptedSecret: encEsxi.encrypted,
      secretIv: encEsxi.iv,
      secretTag: encEsxi.tag,
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.saveConnection(esxiConn);

    const esxiHost: ESXiHost = {
      id: 'host-esxi-node-01',
      connectionId: esxiConn.id,
      hostname: 'esxi-node01.prod.datacenter.local',
      ipAddress: '10.240.10.15',
      version: 'VMware ESXi 8.0 Update 2 (Build 22380479)',
      build: '22380479',
      cpuModel: 'Intel(R) Xeon(R) Gold 6348 CPU @ 2.60GHz (2 Sockets x 28 Cores)',
      cpuCores: 56,
      cpuMhzTotal: 145600,
      cpuUsagePct: 52.4,
      memoryBytesTotal: 274877906944, // 256 GB
      memoryUsagePct: 68.2,
      storageBytesTotal: 17592186044416, // 16 TB
      storageBytesUsed: 10995116277760, // 10 TB
      storageUsagePct: 62.5,
      uptimeSeconds: 3888000, // 45 days
      powerState: 'RUNNING',
      vmCount: 6,
      runningVmCount: 5,
      datastores: [
        {
          id: 'ds-nvme-san-01',
          name: 'SAN-NVMe-Datastore-01',
          type: 'VMFS 6',
          capacityBytes: 8796093022208,
          freeBytes: 3298534883328,
          usagePct: 62.5,
          status: 'NORMAL'
        },
        {
          id: 'ds-sas-hdd-02',
          name: 'Archive-SAS-Datastore-02',
          type: 'VMFS 6',
          capacityBytes: 8796093022208,
          freeBytes: 4398046511104,
          usagePct: 50.0,
          status: 'NORMAL'
        }
      ],
      networks: [
        {
          id: 'net-vm-network',
          name: 'VM Network (Prod-VLAN-100)',
          type: 'vSphere Standard Switch (vSwitch0)',
          vlanId: 100,
          status: 'ACTIVE',
          rxBytesPerSec: 1845000,
          txBytesPerSec: 1220000
        },
        {
          id: 'net-dmz-network',
          name: 'DMZ Public Tier (VLAN-20)',
          type: 'vSphere Standard Switch (vSwitch1)',
          vlanId: 20,
          status: 'ACTIVE',
          rxBytesPerSec: 450000,
          txBytesPerSec: 320000
        }
      ]
    };
    this.esxiHosts.set(esxiHost.id, esxiHost);

    const esxiVMs: VirtualMachine[] = [
      {
        id: 'vm-k8s-master-01',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-101',
        name: 'k8s-control-plane-01.prod',
        powerState: 'RUNNING',
        cpuCount: 8,
        cpuUsagePct: 44.1,
        memoryBytes: 34359738368, // 32 GB
        memoryUsagePct: 62.3,
        storageBytes: 214748364800, // 200 GB
        storageUsagePct: 48.0,
        ipAddress: '10.240.10.50',
        guestOs: 'Ubuntu Linux 22.04 LTS (64-bit)',
        uptimeSeconds: 3880000,
        datastoreName: 'SAN-NVMe-Datastore-01',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-k8s-worker-01',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-102',
        name: 'k8s-worker-node-01.prod',
        powerState: 'RUNNING',
        cpuCount: 16,
        cpuUsagePct: 78.4,
        memoryBytes: 68719476736, // 64 GB
        memoryUsagePct: 81.5,
        storageBytes: 536870912000, // 500 GB
        storageUsagePct: 72.1,
        ipAddress: '10.240.10.51',
        guestOs: 'Ubuntu Linux 22.04 LTS (64-bit)',
        uptimeSeconds: 3880000,
        datastoreName: 'SAN-NVMe-Datastore-01',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-pg-cluster-primary',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-103',
        name: 'postgres-ha-primary-01',
        powerState: 'RUNNING',
        cpuCount: 12,
        cpuUsagePct: 56.2,
        memoryBytes: 42949672960, // 40 GB
        memoryUsagePct: 74.0,
        storageBytes: 1073741824000, // 1 TB
        storageUsagePct: 68.4,
        ipAddress: '10.240.10.60',
        guestOs: 'Debian GNU/Linux 12 (bookworm)',
        uptimeSeconds: 3880000,
        datastoreName: 'SAN-NVMe-Datastore-01',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-vault-security',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-104',
        name: 'hashicorp-vault-kms-01',
        powerState: 'RUNNING',
        cpuCount: 4,
        cpuUsagePct: 18.5,
        memoryBytes: 17179869184, // 16 GB
        memoryUsagePct: 32.1,
        storageBytes: 107374182400, // 100 GB
        storageUsagePct: 22.0,
        ipAddress: '10.240.10.70',
        guestOs: 'Alpine Linux v3.19',
        uptimeSeconds: 3880000,
        datastoreName: 'SAN-NVMe-Datastore-01',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-backup-veeam',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-105',
        name: 'veeam-dr-backup-proxy',
        powerState: 'RUNNING',
        cpuCount: 8,
        cpuUsagePct: 29.8,
        memoryBytes: 34359738368,
        memoryUsagePct: 41.2,
        storageBytes: 2147483648000,
        storageUsagePct: 84.5,
        ipAddress: '10.240.10.80',
        guestOs: 'Microsoft Windows Server 2022 Datacenter',
        uptimeSeconds: 2160000,
        datastoreName: 'Archive-SAS-Datastore-02',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-staging-sandbox',
        connectionId: esxiConn.id,
        hostId: esxiHost.id,
        externalVmId: 'vm-106',
        name: 'staging-qa-sandbox-env',
        powerState: 'STOPPED',
        cpuCount: 4,
        cpuUsagePct: 0,
        memoryBytes: 17179869184,
        memoryUsagePct: 0,
        storageBytes: 214748364800,
        storageUsagePct: 35.0,
        ipAddress: '10.240.10.99',
        guestOs: 'Ubuntu Linux 22.04 LTS (64-bit)',
        uptimeSeconds: 0,
        datastoreName: 'SAN-NVMe-Datastore-01',
        networkName: 'VM Network (Prod-VLAN-100)',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    esxiVMs.forEach(vm => this.virtualMachines.set(vm.id, vm));

    // 2. CasaOS Server & Apps
    const casaConn: StoredConnection = {
      id: 'conn-casaos-edge-01',
      name: 'CasaOS Edge Gateway (HomeLab & Media)',
      type: 'CASAOS',
      host: '10.240.20.5',
      port: 80,
      useHttps: false,
      skipSslVerify: false,
      username: 'admin',
      encryptedSecret: encCasa.encrypted,
      secretIv: encCasa.iv,
      secretTag: encCasa.tag,
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.saveConnection(casaConn);

    const casaServer: CasaOSServer = {
      id: 'srv-casaos-node-01',
      connectionId: casaConn.id,
      hostname: 'casaos-edge-appliance.local',
      ipAddress: '10.240.20.5',
      version: 'v0.4.8 Community Edition',
      uptimeSeconds: 1555200,
      cpuModel: 'Intel(R) Core(TM) i7-12700H @ 2.30GHz (14 Cores / 20 Threads)',
      cpuCores: 14,
      cpuUsagePct: 38.6,
      memoryBytesTotal: 68719476736,
      memoryBytesUsed: 36507222016,
      memoryUsagePct: 53.1,
      storageBytesTotal: 8796093022208,
      storageBytesUsed: 5277655813324,
      storageUsagePct: 60.0,
      diskCount: 4,
      runningAppsCount: 6,
      totalAppsCount: 7,
      dockerVersion: 'Docker Engine v25.0.3 (build 4debf41)',
      disks: [
        {
          id: 'disk-nvme-sys',
          name: 'Samsung NVMe SSD 980 PRO 2TB',
          path: '/',
          model: 'Samsung 980 PRO',
          capacityBytes: 2000398934016,
          usedBytes: 800159573606,
          usagePct: 40.0,
          health: 'PASSED',
          temperatureC: 41,
          type: 'NVMe'
        },
        {
          id: 'disk-hdd-array-01',
          name: 'Seagate IronWolf Pro 8TB NAS (ZFS Pool)',
          path: '/DATA/MediaPool',
          model: 'Seagate IronWolf Pro',
          capacityBytes: 8001563222016,
          usedBytes: 4800937933209,
          usagePct: 60.0,
          health: 'PASSED',
          temperatureC: 36,
          type: 'HDD'
        }
      ]
    };
    this.casaosServers.set(casaServer.id, casaServer);

    const casaApps: CasaOSApp[] = [
      {
        id: 'app-nextcloud',
        connectionId: casaConn.id,
        name: 'nextcloud',
        title: 'Nextcloud Hub 28 Enterprise',
        category: 'Productivity & Storage',
        icon: 'cloud',
        status: 'running',
        containerId: 'cntr-nc-28',
        image: 'nextcloud:28.0.2-apache',
        cpuUsagePct: 8.4,
        memoryBytes: 2147483648,
        memoryUsagePct: 3.1,
        networkRxBytes: 4294967296,
        networkTxBytes: 3221225472,
        restartCount: 0,
        ports: [{ host: 8080, container: 80, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/AppData/nextcloud', containerPath: '/var/www/html', mode: 'rw' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-jellyfin',
        connectionId: casaConn.id,
        name: 'jellyfin',
        title: 'Jellyfin Media Server (Hardware Transcoding)',
        category: 'Media & Streaming',
        icon: 'film',
        status: 'running',
        containerId: 'cntr-jf-10',
        image: 'jellyfin/jellyfin:10.8.13-1',
        cpuUsagePct: 19.2,
        memoryBytes: 4294967296,
        memoryUsagePct: 6.2,
        networkRxBytes: 12884901888,
        networkTxBytes: 64424509440,
        restartCount: 0,
        ports: [{ host: 8096, container: 8096, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/MediaPool', containerPath: '/media', mode: 'ro' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-homeassistant',
        connectionId: casaConn.id,
        name: 'homeassistant',
        title: 'Home Assistant Core 2024.3',
        category: 'Smart Home & IoT',
        icon: 'home',
        status: 'running',
        containerId: 'cntr-ha-2024',
        image: 'homeassistant/home-assistant:2024.3.1',
        cpuUsagePct: 4.1,
        memoryBytes: 1610612736,
        memoryUsagePct: 2.3,
        networkRxBytes: 2147483648,
        networkTxBytes: 1073741824,
        restartCount: 0,
        ports: [{ host: 8123, container: 8123, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/AppData/homeassistant', containerPath: '/config', mode: 'rw' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-adguard-home',
        connectionId: casaConn.id,
        name: 'adguard-home',
        title: 'AdGuard Home DNS / DoH Filter',
        category: 'Network & Security',
        icon: 'shield',
        status: 'running',
        containerId: 'cntr-agh-01',
        image: 'adguard/adguardhome:v0.107.45',
        cpuUsagePct: 2.0,
        memoryBytes: 536870912,
        memoryUsagePct: 0.8,
        networkRxBytes: 8589934592,
        networkTxBytes: 8589934592,
        restartCount: 0,
        ports: [{ host: 3001, container: 3000, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/AppData/adguard/conf', containerPath: '/opt/adguardhome/conf', mode: 'rw' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-vaultwarden',
        connectionId: casaConn.id,
        name: 'vaultwarden',
        title: 'Vaultwarden Bitwarden Server',
        category: 'Security & Passwords',
        icon: 'lock',
        status: 'running',
        containerId: 'cntr-vw-130',
        image: 'vaultwarden/server:1.30.5',
        cpuUsagePct: 1.5,
        memoryBytes: 402653184,
        memoryUsagePct: 0.6,
        networkRxBytes: 1073741824,
        networkTxBytes: 1073741824,
        restartCount: 0,
        ports: [{ host: 8088, container: 80, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/AppData/vaultwarden', containerPath: '/data', mode: 'rw' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-photoprism',
        connectionId: casaConn.id,
        name: 'photoprism',
        title: 'PhotoPrism AI Powered Gallery',
        category: 'Media & Photography',
        icon: 'camera',
        status: 'running',
        containerId: 'cntr-pp-24',
        image: 'photoprism/photoprism:240301-jammy',
        cpuUsagePct: 12.8,
        memoryBytes: 3221225472,
        memoryUsagePct: 4.7,
        networkRxBytes: 6442450944,
        networkTxBytes: 4294967296,
        restartCount: 0,
        ports: [{ host: 2342, container: 2342, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/MediaPool/Photos', containerPath: '/photoprism/originals', mode: 'rw' }],
        uptimeSeconds: 1555200,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'app-transmission-vpn',
        connectionId: casaConn.id,
        name: 'transmission-vpn',
        title: 'Transmission Torrent + WireGuard VPN',
        category: 'Download & Networking',
        icon: 'download',
        status: 'stopped',
        containerId: 'cntr-trans-01',
        image: 'haugene/transmission-openvpn:latest',
        cpuUsagePct: 0,
        memoryBytes: 0,
        memoryUsagePct: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        restartCount: 0,
        ports: [{ host: 9091, container: 9091, protocol: 'tcp' }],
        volumes: [{ hostPath: '/DATA/MediaPool/Downloads', containerPath: '/data', mode: 'rw' }],
        uptimeSeconds: 0,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      }
    ];
    casaApps.forEach(a => this.casaosApps.set(a.id, a));

    // 3. Docker Production Node
    const dockerConn: StoredConnection = {
      id: 'conn-docker-prod-01',
      name: 'Docker Production Microservices Host',
      type: 'DOCKER',
      host: '10.240.30.12',
      port: 2376,
      useHttps: true,
      skipSslVerify: true,
      encryptedSecret: encDocker.encrypted,
      secretIv: encDocker.iv,
      secretTag: encDocker.tag,
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.saveConnection(dockerConn);

    const dockerContainers: DockerContainer[] = [
      {
        id: 'cntr-ingress-traefik',
        connectionId: dockerConn.id,
        containerId: 'e92f1837b01c',
        name: 'traefik-edge-reverse-proxy',
        image: 'traefik:v3.0.0-rc4',
        state: 'running',
        status: 'Up 12 days (healthy)',
        cpuUsagePct: 3.2,
        memoryBytes: 167772160,
        memoryLimitBytes: 1073741824,
        memoryUsagePct: 15.6,
        networkTxBytes: 85899345920,
        networkRxBytes: 128849018880,
        ports: [
          { privatePort: 80, publicPort: 80, type: 'tcp', ip: '0.0.0.0' },
          { privatePort: 443, publicPort: 443, type: 'tcp', ip: '0.0.0.0' },
          { privatePort: 8080, publicPort: 8080, type: 'tcp', ip: '127.0.0.1' }
        ],
        mounts: [
          { source: '/var/run/docker.sock', destination: '/var/run/docker.sock', mode: 'ro', rw: false },
          { source: '/etc/traefik/acme.json', destination: '/acme.json', mode: 'rw', rw: true }
        ],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 12).toISOString()
      },
      {
        id: 'cntr-redis-cluster',
        connectionId: dockerConn.id,
        containerId: '8a11b439c72e',
        name: 'redis-cache-cluster-master',
        image: 'redis:7.2.4-alpine',
        state: 'running',
        status: 'Up 12 days',
        cpuUsagePct: 6.8,
        memoryBytes: 4294967296,
        memoryLimitBytes: 8589934592,
        memoryUsagePct: 50.0,
        networkTxBytes: 42949672960,
        networkRxBytes: 34359738368,
        ports: [{ privatePort: 6379, publicPort: 6379, type: 'tcp', ip: '0.0.0.0' }],
        mounts: [{ source: '/var/lib/redis/data', destination: '/data', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 12).toISOString()
      },
      {
        id: 'cntr-grafana-oss',
        connectionId: dockerConn.id,
        containerId: '3c8290f1d41a',
        name: 'grafana-observability-dashboard',
        image: 'grafana/grafana-enterprise:10.4.0',
        state: 'running',
        status: 'Up 9 days',
        cpuUsagePct: 4.5,
        memoryBytes: 536870912,
        memoryLimitBytes: 2147483648,
        memoryUsagePct: 25.0,
        networkTxBytes: 12884901888,
        networkRxBytes: 8589934592,
        ports: [{ privatePort: 3000, publicPort: 3000, type: 'tcp', ip: '0.0.0.0' }],
        mounts: [{ source: '/var/lib/grafana', destination: '/var/lib/grafana', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 9).toISOString()
      },
      {
        id: 'cntr-prometheus-tsdb',
        connectionId: dockerConn.id,
        containerId: '77b819f032aa',
        name: 'prometheus-time-series-metrics',
        image: 'prom/prometheus:v2.50.1',
        state: 'running',
        status: 'Up 9 days',
        cpuUsagePct: 14.2,
        memoryBytes: 6442450944,
        memoryLimitBytes: 12884901888,
        memoryUsagePct: 50.0,
        networkTxBytes: 8589934592,
        networkRxBytes: 68719476736,
        ports: [{ privatePort: 9090, publicPort: 9090, type: 'tcp', ip: '127.0.0.1' }],
        mounts: [{ source: '/prometheus/data', destination: '/prometheus', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 9).toISOString()
      },
      {
        id: 'cntr-rabbitmq-broker',
        connectionId: dockerConn.id,
        containerId: '98d24ef0981b',
        name: 'rabbitmq-event-bus-cluster',
        image: 'rabbitmq:3.13-management-alpine',
        state: 'running',
        status: 'Up 6 days',
        cpuUsagePct: 5.1,
        memoryBytes: 1073741824,
        memoryLimitBytes: 4294967296,
        memoryUsagePct: 25.0,
        networkTxBytes: 25769803776,
        networkRxBytes: 21474836480,
        ports: [
          { privatePort: 5672, publicPort: 5672, type: 'tcp', ip: '0.0.0.0' },
          { privatePort: 15672, publicPort: 15672, type: 'tcp', ip: '0.0.0.0' }
        ],
        mounts: [{ source: '/var/lib/rabbitmq', destination: '/var/lib/rabbitmq', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 6).toISOString()
      },
      {
        id: 'cntr-worker-batch-etl',
        connectionId: dockerConn.id,
        containerId: '54e908ab1c3d',
        name: 'etl-pipeline-batch-consumer',
        image: 'python:3.11-slim',
        state: 'exited',
        status: 'Exited (0) 4 hours ago',
        cpuUsagePct: 0,
        memoryBytes: 0,
        memoryLimitBytes: 2147483648,
        memoryUsagePct: 0,
        networkTxBytes: 2147483648,
        networkRxBytes: 10737418240,
        ports: [],
        mounts: [{ source: '/tmp/etl-jobs', destination: '/jobs', mode: 'rw', rw: true }],
        restartCount: 1,
        created: new Date(Date.now() - 86400000 * 3).toISOString()
      }
    ];
    dockerContainers.forEach(c => this.dockerContainers.set(c.id, c));

    // 4. Initial Active Alerts
    const initialAlerts: Alert[] = [
      {
        id: 'alt-k8s-worker-load',
        connectionId: esxiConn.id,
        title: 'High CPU Load on k8s-worker-node-01',
        message: 'CPU consumption exceeded 75% threshold for > 2 minutes (Observed: 78.4%)',
        severity: 'WARNING',
        status: 'ACTIVE',
        source: 'k8s-worker-node-01.prod',
        resourceType: 'VM',
        resourceId: 'vm-k8s-worker-01',
        valueObserved: 78.4,
        threshold: 75.0,
        createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'alt-backup-storage-capacity',
        connectionId: esxiConn.id,
        title: 'Veeam DR Proxy Storage Near Threshold',
        message: 'Assigned virtual disk utilization is at 84.5% (Threshold: 85.0%)',
        severity: 'WARNING',
        status: 'ACTIVE',
        source: 'veeam-dr-backup-proxy',
        resourceType: 'STORAGE',
        resourceId: 'vm-backup-veeam',
        valueObserved: 84.5,
        threshold: 85.0,
        createdAt: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    for (const alt of initialAlerts) {
      await this.saveAlert(alt);
    }

    // 5. Initial System Events
    const initialEvents: SystemEvent[] = [
      {
        id: 'evt-boot-cluster',
        connectionId: esxiConn.id,
        eventType: 'CLUSTER_HEALTH_AUDIT',
        severity: 'INFO',
        source: 'ESXi Production Cluster',
        message: 'Cluster heartbeat and state synchronized across 6 virtual machines and 2 datastores',
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString()
      },
      {
        id: 'evt-casaos-app-sync',
        connectionId: casaConn.id,
        eventType: 'APP_STATUS_SYNC',
        severity: 'INFO',
        source: 'CasaOS Edge Gateway',
        message: 'Detected 6 running containers and 1 stopped container in App Store registry',
        timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString()
      },
      {
        id: 'evt-docker-inspect',
        connectionId: dockerConn.id,
        eventType: 'CONTAINER_LIFECYCLE',
        severity: 'INFO',
        source: 'Docker Production Host',
        message: 'Batch ETL consumer completed job #8928 and exited normally with code 0',
        timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString()
      }
    ];
    for (const evt of initialEvents) {
      await this.saveEvent(evt);
    }

    // 6. Initial Audit Logs
    const initialAuditLogs: AuditLog[] = [
      {
        id: 'aud-sys-boot',
        username: 'system',
        action: 'SYSTEM_BOOT',
        resourceType: 'PLATFORM',
        details: 'NOC Management Platform initialized and monitoring engine started in Demo Mode',
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
      },
      {
        id: 'aud-admin-login-hist',
        username: 'admin',
        action: 'LOGIN_SUCCESS',
        resourceType: 'AUTH',
        details: 'Administrative session established from internal subnet (10.240.0.100)',
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - 1000 * 60 * 28).toISOString()
      }
    ];
    for (const aud of initialAuditLogs) {
      await this.saveAuditLog(aud);
    }
  }
}

export const store = new DataStore();
