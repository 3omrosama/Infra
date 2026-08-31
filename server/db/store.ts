import { 
  User, 
  UserRole, 
  InfrastructureConnection, 
  ESXiHost, 
  VirtualMachine, 
  CasaOSServer, 
  CasaOSApp, 
  DockerContainer, 
  DockerImage, 
  DockerVolume, 
  Alert, 
  AlertRule, 
  NotificationItem, 
  SystemEvent, 
  AuditLog, 
  MetricDataPoint,
  DatastoreInfo,
  NetworkInfo
} from '../../src/types/index.js';
import { DEMO_ACCOUNTS } from '../../src/constants/demoAccounts.js';
import { hashPassword, encryptSecret } from '../crypto.js';
import fs from 'fs';
import path from 'path';

export interface StoredUser extends User {
  passwordHash: string;
}

export interface StoredConnection extends InfrastructureConnection {
  encryptedSecret?: string;
  secretIv?: string;
  secretTag?: string;
}

export interface SystemSettings {
  pollIntervalSec: number;
  metricRetentionDays: number;
  demoMode: boolean;
  webhookUrl: string;
  emailAlertsEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  autoResolveMinutes: number;
}

class DataStore {
  public users: Map<string, StoredUser> = new Map();
  public sessions: Map<string, { userId: string; expiresAt: Date; ipAddress?: string }> = new Map();
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
    demoMode: true,
    webhookUrl: '',
    emailAlertsEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpFrom: 'alerts@noc-manager.local',
    autoResolveMinutes: 120
  };

  private initialized = false;

  public async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Seed default roles and demo users from single source of truth
    for (const account of DEMO_ACCOUNTS) {
      const passwordHash = await hashPassword(account.password);
      const user: StoredUser = {
        id: account.id,
        username: account.username,
        email: account.email,
        passwordHash,
        role: account.role,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      this.users.set(user.id, user);
    }

    // Seed default Alert Rules
    const defaultRules: AlertRule[] = [
      {
        id: 'rule-cpu-high',
        name: 'High CPU Utilization (> 90%)',
        metric: 'cpu',
        condition: 'gt',
        threshold: 90,
        durationSec: 60,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-mem-high',
        name: 'High Memory Utilization (> 90%)',
        metric: 'memory',
        condition: 'gt',
        threshold: 90,
        durationSec: 60,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-storage-warning',
        name: 'Storage Pool Warning (> 85%)',
        metric: 'storage',
        condition: 'gt',
        threshold: 85,
        durationSec: 300,
        severity: 'WARNING',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-storage-critical',
        name: 'Storage Pool Critical (> 95%)',
        metric: 'storage',
        condition: 'gt',
        threshold: 95,
        durationSec: 120,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule-host-offline',
        name: 'Host Offline or Unreachable',
        metric: 'status',
        condition: 'offline',
        threshold: 1,
        durationSec: 30,
        severity: 'CRITICAL',
        isEnabled: true,
        createdAt: new Date().toISOString()
      }
    ];

    defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));

    // Seed initial Demo connections and infrastructure if Demo Mode enabled
    if (this.settings.demoMode) {
      this.seedDemoData();
    }

    // Seed initial audit log
    this.addAuditLog({
      userId: 'usr-admin-001',
      username: 'admin',
      action: 'SYSTEM_BOOT',
      resourceType: 'SYSTEM',
      details: 'NOC Infrastructure Manager monitoring daemon booted successfully',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS'
    });
  }

  public seedDemoData() {
    // 1. ESXi Enterprise Node 1
    const esxiConn1: StoredConnection = {
      id: 'conn-esxi-prod-01',
      name: 'ESXi Enterprise Cluster Node 01',
      type: 'ESXI',
      host: '10.20.0.10',
      port: 443,
      useHttps: true,
      skipSslVerify: true,
      username: 'root',
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.connections.set(esxiConn1.id, esxiConn1);

    const esxiHost1: ESXiHost = {
      id: 'host-esxi-01',
      connectionId: esxiConn1.id,
      hostname: 'esx-prod-node01.corp.internal',
      ipAddress: '10.20.0.10',
      version: 'VMware ESXi 8.0.2',
      build: 'Releasebuild-22380479',
      uptimeSeconds: 3849200,
      cpuModel: 'Intel(R) Xeon(R) Gold 6348 CPU @ 2.60GHz (28 Cores / 56 Threads)',
      cpuCores: 56,
      cpuMhzTotal: 145600,
      cpuUsagePct: 54.2,
      memoryBytesTotal: 256 * 1024 * 1024 * 1024,
      memoryUsagePct: 68.4,
      storageBytesTotal: 14.8 * 1024 * 1024 * 1024 * 1024,
      storageBytesUsed: 9.6 * 1024 * 1024 * 1024 * 1024,
      storageUsagePct: 64.8,
      powerState: 'RUNNING',
      vmCount: 6,
      runningVmCount: 5,
      datastores: [
        {
          id: 'ds-nvme-01',
          name: 'datastore-nvme-tier1-san',
          type: 'VMFS-6',
          capacityBytes: 8 * 1024 * 1024 * 1024 * 1024,
          freeBytes: 3.2 * 1024 * 1024 * 1024 * 1024,
          usagePct: 60.0,
          status: 'NORMAL'
        },
        {
          id: 'ds-nfs-01',
          name: 'datastore-nfs-backup-pool',
          type: 'NFS-4.1',
          capacityBytes: 6.8 * 1024 * 1024 * 1024 * 1024,
          freeBytes: 1.9 * 1024 * 1024 * 1024 * 1024,
          usagePct: 72.1,
          status: 'NORMAL'
        }
      ],
      networks: [
        {
          id: 'vsw-01',
          name: 'vSwitch0 (Management & VM Traffic)',
          type: 'vSwitch',
          status: 'ACTIVE',
          rxBytesPerSec: 4820100,
          txBytesPerSec: 3204900
        },
        {
          id: 'pg-prod-vlan100',
          name: 'PG-Production-VLAN100',
          type: 'PortGroup',
          vlanId: 100,
          status: 'ACTIVE',
          rxBytesPerSec: 3100200,
          txBytesPerSec: 2100800
        },
        {
          id: 'pg-dmz-vlan200',
          name: 'PG-DMZ-Edge-VLAN200',
          type: 'PortGroup',
          vlanId: 200,
          status: 'ACTIVE',
          rxBytesPerSec: 1719900,
          txBytesPerSec: 1104100
        }
      ]
    };
    this.esxiHosts.set(esxiHost1.id, esxiHost1);

    // 2. ESXi Node 2 (Edge/Lab)
    const esxiConn2: StoredConnection = {
      id: 'conn-esxi-edge-02',
      name: 'ESXi Compute Blade Node 02',
      type: 'ESXI',
      host: '10.20.0.11',
      port: 443,
      useHttps: true,
      skipSslVerify: true,
      username: 'root',
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.connections.set(esxiConn2.id, esxiConn2);

    const esxiHost2: ESXiHost = {
      id: 'host-esxi-02',
      connectionId: esxiConn2.id,
      hostname: 'esx-edge-blade02.corp.internal',
      ipAddress: '10.20.0.11',
      version: 'VMware ESXi 8.0.1',
      build: 'Releasebuild-21495797',
      uptimeSeconds: 1948200,
      cpuModel: 'AMD EPYC 7702P 64-Core Processor',
      cpuCores: 64,
      cpuMhzTotal: 128000,
      cpuUsagePct: 78.9,
      memoryBytesTotal: 128 * 1024 * 1024 * 1024,
      memoryUsagePct: 84.1,
      storageBytesTotal: 8 * 1024 * 1024 * 1024 * 1024,
      storageBytesUsed: 5.2 * 1024 * 1024 * 1024 * 1024,
      storageUsagePct: 65.0,
      powerState: 'RUNNING',
      vmCount: 4,
      runningVmCount: 4,
      datastores: [
        {
          id: 'ds-blade2-local',
          name: 'datastore-nvme-blade02',
          type: 'VMFS-6',
          capacityBytes: 8 * 1024 * 1024 * 1024 * 1024,
          freeBytes: 2.8 * 1024 * 1024 * 1024 * 1024,
          usagePct: 65.0,
          status: 'NORMAL'
        }
      ],
      networks: [
        {
          id: 'vsw-blade2',
          name: 'vSwitch0',
          type: 'vSwitch',
          status: 'ACTIVE',
          rxBytesPerSec: 8100300,
          txBytesPerSec: 6400200
        }
      ]
    };
    this.esxiHosts.set(esxiHost2.id, esxiHost2);

    // Virtual Machines across ESXi nodes
    const vms: VirtualMachine[] = [
      {
        id: 'vm-prod-db01',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-101',
        name: 'prod-postgresql-primary',
        powerState: 'RUNNING',
        cpuCount: 8,
        cpuUsagePct: 62.4,
        memoryBytes: 32 * 1024 * 1024 * 1024,
        memoryUsagePct: 78.5,
        storageBytes: 500 * 1024 * 1024 * 1024,
        storageUsagePct: 64.2,
        ipAddress: '10.20.10.15',
        guestOs: 'Ubuntu Linux 24.04 LTS (64-bit)',
        uptimeSeconds: 3412000,
        datastoreName: 'datastore-nvme-tier1-san',
        networkName: 'PG-Production-VLAN100',
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-prod-k8s-cp01',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-102',
        name: 'k8s-controlplane-01',
        powerState: 'RUNNING',
        cpuCount: 4,
        cpuUsagePct: 41.8,
        memoryBytes: 16 * 1024 * 1024 * 1024,
        memoryUsagePct: 61.2,
        storageBytes: 120 * 1024 * 1024 * 1024,
        storageUsagePct: 38.0,
        ipAddress: '10.20.10.20',
        guestOs: 'Debian GNU/Linux 12 (bookworm)',
        uptimeSeconds: 2190000,
        datastoreName: 'datastore-nvme-tier1-san',
        networkName: 'PG-Production-VLAN100',
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-prod-redis01',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-103',
        name: 'prod-redis-sentinel-01',
        powerState: 'RUNNING',
        cpuCount: 4,
        cpuUsagePct: 24.1,
        memoryBytes: 16 * 1024 * 1024 * 1024,
        memoryUsagePct: 52.0,
        storageBytes: 60 * 1024 * 1024 * 1024,
        storageUsagePct: 29.5,
        ipAddress: '10.20.10.35',
        guestOs: 'Alpine Linux v3.19',
        uptimeSeconds: 1849000,
        datastoreName: 'datastore-nvme-tier1-san',
        networkName: 'PG-Production-VLAN100',
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-prod-edge-waf',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-104',
        name: 'edge-waf-envoy-proxy',
        powerState: 'RUNNING',
        cpuCount: 4,
        cpuUsagePct: 48.7,
        memoryBytes: 8 * 1024 * 1024 * 1024,
        memoryUsagePct: 44.0,
        storageBytes: 80 * 1024 * 1024 * 1024,
        storageUsagePct: 35.1,
        ipAddress: '10.20.20.5',
        guestOs: 'Rocky Linux 9.3 (Blue Onyx)',
        uptimeSeconds: 3100000,
        datastoreName: 'datastore-nvme-tier1-san',
        networkName: 'PG-DMZ-Edge-VLAN200',
        createdAt: new Date(Date.now() - 86400000 * 50).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-prod-win-ad',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-105',
        name: 'win-activedirectory-dc01',
        powerState: 'RUNNING',
        cpuCount: 4,
        cpuUsagePct: 32.5,
        memoryBytes: 16 * 1024 * 1024 * 1024,
        memoryUsagePct: 58.9,
        storageBytes: 150 * 1024 * 1024 * 1024,
        storageUsagePct: 51.4,
        ipAddress: '10.20.10.8',
        guestOs: 'Microsoft Windows Server 2022 (64-bit)',
        uptimeSeconds: 1540000,
        datastoreName: 'datastore-nvme-tier1-san',
        networkName: 'PG-Production-VLAN100',
        createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-stage-staging01',
        connectionId: esxiConn1.id,
        hostId: esxiHost1.id,
        externalVmId: 'vm-106',
        name: 'stage-app-monolith-dr',
        powerState: 'STOPPED',
        cpuCount: 4,
        cpuUsagePct: 0,
        memoryBytes: 16 * 1024 * 1024 * 1024,
        memoryUsagePct: 0,
        storageBytes: 100 * 1024 * 1024 * 1024,
        storageUsagePct: 42.0,
        ipAddress: '10.20.10.99',
        guestOs: 'Ubuntu Linux 22.04 LTS (64-bit)',
        uptimeSeconds: 0,
        datastoreName: 'datastore-nfs-backup-pool',
        networkName: 'PG-Production-VLAN100',
        createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Node 2 VMs
      {
        id: 'vm-k8s-worker01',
        connectionId: esxiConn2.id,
        hostId: esxiHost2.id,
        externalVmId: 'vm-201',
        name: 'k8s-compute-worker-01',
        powerState: 'RUNNING',
        cpuCount: 16,
        cpuUsagePct: 88.5,
        memoryBytes: 64 * 1024 * 1024 * 1024,
        memoryUsagePct: 91.4,
        storageBytes: 400 * 1024 * 1024 * 1024,
        storageUsagePct: 76.8,
        ipAddress: '10.20.10.21',
        guestOs: 'Debian GNU/Linux 12 (bookworm)',
        uptimeSeconds: 1940000,
        datastoreName: 'datastore-nvme-blade02',
        networkName: 'vSwitch0',
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'vm-k8s-worker02',
        connectionId: esxiConn2.id,
        hostId: esxiHost2.id,
        externalVmId: 'vm-202',
        name: 'k8s-compute-worker-02',
        powerState: 'RUNNING',
        cpuCount: 16,
        cpuUsagePct: 74.2,
        memoryBytes: 32 * 1024 * 1024 * 1024,
        memoryUsagePct: 79.0,
        storageBytes: 300 * 1024 * 1024 * 1024,
        storageUsagePct: 61.2,
        ipAddress: '10.20.10.22',
        guestOs: 'Debian GNU/Linux 12 (bookworm)',
        uptimeSeconds: 1940000,
        datastoreName: 'datastore-nvme-blade02',
        networkName: 'vSwitch0',
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    vms.forEach(vm => this.virtualMachines.set(vm.id, vm));

    // 3. CasaOS Homelab / Edge Server 1
    const casaConn1: StoredConnection = {
      id: 'conn-casaos-edge-01',
      name: 'CasaOS Edge Media & Storage Server',
      type: 'CASAOS',
      host: '10.30.0.50',
      port: 80,
      useHttps: false,
      skipSslVerify: false,
      username: 'casaos-admin',
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 40).toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.connections.set(casaConn1.id, casaConn1);

    const casaServer1: CasaOSServer = {
      id: 'casa-srv-01',
      connectionId: casaConn1.id,
      hostname: 'casaos-storage-edge.local',
      ipAddress: '10.30.0.50',
      version: 'CasaOS v0.4.8 (ZimaBoard/Debian 12)',
      uptimeSeconds: 1420500,
      cpuModel: 'Intel Celeron N5105 @ 2.00GHz (4 Cores / 4 Threads)',
      cpuCores: 4,
      cpuUsagePct: 38.6,
      memoryBytesTotal: 16 * 1024 * 1024 * 1024,
      memoryBytesUsed: 9.4 * 1024 * 1024 * 1024,
      memoryUsagePct: 58.7,
      storageBytesTotal: 18 * 1024 * 1024 * 1024 * 1024,
      storageBytesUsed: 11.2 * 1024 * 1024 * 1024 * 1024,
      storageUsagePct: 62.2,
      diskCount: 3,
      runningAppsCount: 6,
      totalAppsCount: 7,
      dockerVersion: '26.0.1-ce',
      disks: [
        {
          id: 'disk-sata-01',
          name: 'Samsung SSD 870 EVO 1TB',
          path: '/dev/sda',
          model: 'MZ-77E1T0B',
          capacityBytes: 1000 * 1024 * 1024 * 1024,
          usedBytes: 420 * 1024 * 1024 * 1024,
          usagePct: 42.0,
          health: 'PASSED',
          temperatureC: 34,
          type: 'SSD'
        },
        {
          id: 'disk-nas-02',
          name: 'Seagate IronWolf Pro 8TB',
          path: '/dev/sdb',
          model: 'ST8000NE001',
          capacityBytes: 8000 * 1024 * 1024 * 1024,
          usedBytes: 5800 * 1024 * 1024 * 1024,
          usagePct: 72.5,
          health: 'PASSED',
          temperatureC: 38,
          type: 'HDD'
        },
        {
          id: 'disk-nas-03',
          name: 'Seagate IronWolf Pro 8TB (Mirror Pool)',
          path: '/dev/sdc',
          model: 'ST8000NE001',
          capacityBytes: 8000 * 1024 * 1024 * 1024,
          usedBytes: 5800 * 1024 * 1024 * 1024,
          usagePct: 72.5,
          health: 'PASSED',
          temperatureC: 39,
          type: 'HDD'
        }
      ]
    };
    this.casaosServers.set(casaServer1.id, casaServer1);

    // CasaOS Apps
    const casaApps: CasaOSApp[] = [
      {
        id: 'app-plex',
        connectionId: casaConn1.id,
        name: 'plex',
        title: 'Plex Media Server',
        category: 'Media & Entertainment',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/plex.png',
        status: 'running',
        containerId: 'c-plex-882a9f',
        image: 'linuxserver/plex:latest',
        cpuUsagePct: 18.4,
        memoryBytes: 2.4 * 1024 * 1024 * 1024,
        memoryUsagePct: 15.0,
        networkRxBytes: 1540920000,
        networkTxBytes: 8930400000,
        restartCount: 0,
        ports: [{ host: 32400, container: 32400, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/Media', containerPath: '/media', mode: 'ro' },
          { hostPath: '/DATA/AppData/plex', containerPath: '/config', mode: 'rw' }
        ],
        uptimeSeconds: 984000,
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString()
      },
      {
        id: 'app-nextcloud',
        connectionId: casaConn1.id,
        name: 'nextcloud',
        title: 'Nextcloud Hub',
        category: 'Cloud Storage & Office',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nextcloud.png',
        status: 'running',
        containerId: 'c-nextcloud-55b21',
        image: 'nextcloud:apache',
        cpuUsagePct: 8.2,
        memoryBytes: 1.1 * 1024 * 1024 * 1024,
        memoryUsagePct: 6.8,
        networkRxBytes: 420900000,
        networkTxBytes: 310800000,
        restartCount: 1,
        ports: [{ host: 8080, container: 80, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/AppData/nextcloud', containerPath: '/var/www/html', mode: 'rw' }
        ],
        uptimeSeconds: 849000,
        createdAt: new Date(Date.now() - 86400000 * 25).toISOString()
      },
      {
        id: 'app-homeassistant',
        connectionId: casaConn1.id,
        name: 'homeassistant',
        title: 'Home Assistant Core',
        category: 'Home Automation & IoT',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/home-assistant.png',
        status: 'running',
        containerId: 'c-ha-3381a',
        image: 'ghcr.io/home-assistant/home-assistant:stable',
        cpuUsagePct: 4.5,
        memoryBytes: 850 * 1024 * 1024,
        memoryUsagePct: 5.3,
        networkRxBytes: 89000000,
        networkTxBytes: 74000000,
        restartCount: 0,
        ports: [{ host: 8123, container: 8123, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/AppData/homeassistant', containerPath: '/config', mode: 'rw' }
        ],
        uptimeSeconds: 1420000,
        createdAt: new Date(Date.now() - 86400000 * 40).toISOString()
      },
      {
        id: 'app-pihole',
        connectionId: casaConn1.id,
        name: 'pihole',
        title: 'Pi-hole DNS Sinkhole',
        category: 'Networking & Security',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png',
        status: 'running',
        containerId: 'c-pihole-991f',
        image: 'pihole/pihole:latest',
        cpuUsagePct: 1.2,
        memoryBytes: 320 * 1024 * 1024,
        memoryUsagePct: 2.0,
        networkRxBytes: 48900000,
        networkTxBytes: 52000000,
        restartCount: 0,
        ports: [
          { host: 53, container: 53, protocol: 'udp' },
          { host: 8053, container: 80, protocol: 'tcp' }
        ],
        volumes: [
          { hostPath: '/DATA/AppData/pihole/etc-pihole', containerPath: '/etc/pihole', mode: 'rw' }
        ],
        uptimeSeconds: 1420000,
        createdAt: new Date(Date.now() - 86400000 * 40).toISOString()
      },
      {
        id: 'app-vaultwarden',
        connectionId: casaConn1.id,
        name: 'vaultwarden',
        title: 'Vaultwarden Password Vault',
        category: 'Security & Auth',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bitwarden.png',
        status: 'running',
        containerId: 'c-vw-7729b',
        image: 'vaultwarden/server:latest',
        cpuUsagePct: 0.8,
        memoryBytes: 180 * 1024 * 1024,
        memoryUsagePct: 1.1,
        networkRxBytes: 12000000,
        networkTxBytes: 15000000,
        restartCount: 0,
        ports: [{ host: 8088, container: 80, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/AppData/vaultwarden', containerPath: '/data', mode: 'rw' }
        ],
        uptimeSeconds: 1420000,
        createdAt: new Date(Date.now() - 86400000 * 35).toISOString()
      },
      {
        id: 'app-grafana',
        connectionId: casaConn1.id,
        name: 'grafana',
        title: 'Grafana Telemetry & Logs',
        category: 'Monitoring & Analytics',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/grafana.png',
        status: 'running',
        containerId: 'c-grafana-12a88',
        image: 'grafana/grafana:latest',
        cpuUsagePct: 3.1,
        memoryBytes: 420 * 1024 * 1024,
        memoryUsagePct: 2.6,
        networkRxBytes: 78000000,
        networkTxBytes: 85000000,
        restartCount: 0,
        ports: [{ host: 3001, container: 3000, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/AppData/grafana', containerPath: '/var/lib/grafana', mode: 'rw' }
        ],
        uptimeSeconds: 1200000,
        createdAt: new Date(Date.now() - 86400000 * 28).toISOString()
      },
      {
        id: 'app-qbittorrent',
        connectionId: casaConn1.id,
        name: 'qbittorrent',
        title: 'qBittorrent Web UI',
        category: 'Downloaders',
        icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png',
        status: 'stopped',
        containerId: 'c-qbit-4491c',
        image: 'linuxserver/qbittorrent:latest',
        cpuUsagePct: 0,
        memoryBytes: 0,
        memoryUsagePct: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        restartCount: 2,
        ports: [{ host: 8085, container: 8080, protocol: 'tcp' }],
        volumes: [
          { hostPath: '/DATA/Downloads', containerPath: '/downloads', mode: 'rw' }
        ],
        uptimeSeconds: 0,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      }
    ];
    casaApps.forEach(app => this.casaosApps.set(app.id, app));

    // 4. Standalone Docker Host Connection
    const dockerConn1: StoredConnection = {
      id: 'conn-docker-cicd-01',
      name: 'Docker CI/CD & Build Runner',
      type: 'DOCKER',
      host: '10.20.10.80',
      port: 2375,
      useHttps: false,
      skipSslVerify: false,
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pollIntervalSec: 30,
      isEnabled: true,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.connections.set(dockerConn1.id, dockerConn1);

    const dockerContainers: DockerContainer[] = [
      {
        id: 'docker-gitlab-runner',
        connectionId: dockerConn1.id,
        containerId: '7f91a2bc3d4e',
        name: 'gitlab-runner-heavy-builds',
        image: 'gitlab/gitlab-runner:ubuntu-v16.10.0',
        status: 'Up 14 days',
        state: 'running',
        cpuUsagePct: 35.8,
        memoryBytes: 3.8 * 1024 * 1024 * 1024,
        memoryLimitBytes: 16 * 1024 * 1024 * 1024,
        memoryUsagePct: 23.7,
        networkRxBytes: 894000000,
        networkTxBytes: 742000000,
        ports: [],
        mounts: [{ source: '/var/run/docker.sock', destination: '/var/run/docker.sock', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 14).toISOString()
      },
      {
        id: 'docker-redis-cache',
        connectionId: dockerConn1.id,
        containerId: '98a12e4f01bb',
        name: 'build-artifact-redis-cache',
        image: 'redis:7.2-alpine',
        status: 'Up 14 days',
        state: 'running',
        cpuUsagePct: 2.1,
        memoryBytes: 512 * 1024 * 1024,
        memoryLimitBytes: 4 * 1024 * 1024 * 1024,
        memoryUsagePct: 12.8,
        networkRxBytes: 124000000,
        networkTxBytes: 382000000,
        ports: [{ privatePort: 6379, publicPort: 6379, type: 'tcp' }],
        mounts: [{ source: 'redis-cache-vol', destination: '/data', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 14).toISOString()
      },
      {
        id: 'docker-registry-mirror',
        connectionId: dockerConn1.id,
        containerId: 'e2c19a88f01a',
        name: 'local-container-registry-mirror',
        image: 'registry:2',
        status: 'Up 12 days',
        state: 'running',
        cpuUsagePct: 1.4,
        memoryBytes: 380 * 1024 * 1024,
        memoryLimitBytes: 2 * 1024 * 1024 * 1024,
        memoryUsagePct: 19.0,
        networkRxBytes: 2400000000,
        networkTxBytes: 1800000000,
        ports: [{ privatePort: 5000, publicPort: 5000, type: 'tcp' }],
        mounts: [{ source: '/opt/registry', destination: '/var/lib/registry', mode: 'rw', rw: true }],
        restartCount: 0,
        created: new Date(Date.now() - 86400000 * 12).toISOString()
      }
    ];
    dockerContainers.forEach(c => this.dockerContainers.set(c.id, c));

    // Seed historical time series metrics (last 24 hours in 30 minute chunks)
    this.metrics = [];
    const now = Date.now();
    for (let i = 48; i >= 0; i--) {
      const ts = new Date(now - i * 30 * 60 * 1000).toISOString();
      const wave = Math.sin((48 - i) / 4);
      this.metrics.push({
        timestamp: ts,
        cpu: Math.min(95, Math.max(25, Math.round(52 + wave * 18 + (Math.random() * 8 - 4)))),
        memory: Math.min(92, Math.max(45, Math.round(68 + wave * 10 + (Math.random() * 4 - 2)))),
        storage: Math.round(64.2 + (48 - i) * 0.04),
        networkRxKbps: Math.round(18400 + wave * 6500 + Math.random() * 2000),
        networkTxKbps: Math.round(14200 + wave * 5200 + Math.random() * 1500)
      });
    }

    // Seed active Alerts
    const sampleAlerts: Alert[] = [
      {
        id: 'alert-001',
        connectionId: esxiConn2.id,
        title: 'Compute Node High Memory Consumption',
        message: 'Host esx-edge-blade02.corp.internal memory threshold exceeded (84.1% allocated). Worker-01 node pressure.',
        severity: 'WARNING',
        status: 'ACTIVE',
        source: 'ESXi Host Monitor',
        resourceType: 'ESXI',
        resourceId: esxiHost2.id,
        valueObserved: 84.1,
        threshold: 80.0,
        createdAt: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 28 * 60 * 1000).toISOString()
      },
      {
        id: 'alert-002',
        connectionId: esxiConn2.id,
        title: 'Kubernetes Worker CPU Saturation',
        message: 'VM k8s-compute-worker-01 CPU usage sustained at 88.5% for > 5 minutes.',
        severity: 'WARNING',
        status: 'ACTIVE',
        source: 'VM Telemetry',
        resourceType: 'VM',
        resourceId: 'vm-k8s-worker01',
        valueObserved: 88.5,
        threshold: 85.0,
        createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString()
      },
      {
        id: 'alert-003',
        connectionId: casaConn1.id,
        title: 'Application Container Stopped: qBittorrent',
        message: 'Application qBittorrent Web UI exited with code 0. Status is currently stopped.',
        severity: 'INFO',
        status: 'ACKNOWLEDGED',
        source: 'CasaOS Engine',
        resourceType: 'CASAOS',
        resourceId: 'app-qbittorrent',
        acknowledgedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        acknowledgedBy: 'admin',
        createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString()
      }
    ];
    sampleAlerts.forEach(a => this.alerts.set(a.id, a));

    // Seed Notifications
    const sampleNotifications: NotificationItem[] = [
      {
        id: 'notif-001',
        title: 'Host Warning: esx-edge-blade02',
        message: 'Memory threshold warning triggered on ESXi Blade 02.',
        severity: 'WARNING',
        isRead: false,
        channel: 'IN_APP',
        createdAt: new Date(Date.now() - 28 * 60 * 1000).toISOString()
      },
      {
        id: 'notif-002',
        title: 'Backup Completed: datastore-nfs-backup-pool',
        message: 'Snapshot replication of 6 VMs completed successfully (1.4 TB transfer).',
        severity: 'INFO',
        isRead: true,
        channel: 'IN_APP',
        createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString()
      },
      {
        id: 'notif-003',
        title: 'CasaOS Disks SMART Check: All Passed',
        message: '3 physical drives verified healthy with zero reallocated sectors.',
        severity: 'INFO',
        isRead: true,
        channel: 'IN_APP',
        createdAt: new Date(Date.now() - 360 * 60 * 1000).toISOString()
      }
    ];
    sampleNotifications.forEach(n => this.notifications.set(n.id, n));

    // Seed Events
    this.events = [
      {
        id: 'evt-001',
        connectionId: esxiConn1.id,
        eventType: 'VM_POWER_STATE',
        severity: 'INFO',
        source: 'ESXi Provider',
        message: 'Virtual machine prod-postgresql-primary health check verified OK',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      },
      {
        id: 'evt-002',
        connectionId: casaConn1.id,
        eventType: 'APP_HEALTH_PING',
        severity: 'INFO',
        source: 'CasaOS Provider',
        message: 'Plex Media Server processed 4 concurrent 4K transcoding streams',
        timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString()
      },
      {
        id: 'evt-003',
        connectionId: esxiConn2.id,
        eventType: 'CPU_HIGH_LOAD',
        severity: 'WARNING',
        source: 'ESXi Monitor',
        message: 'k8s-compute-worker-01 CPU usage spike to 88.5%',
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString()
      },
      {
        id: 'evt-004',
        connectionId: dockerConn1.id,
        eventType: 'CONTAINER_STATUS',
        severity: 'INFO',
        source: 'Docker Engine',
        message: 'Container gitlab-runner-heavy-builds finished CI pipeline #4920',
        timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString()
      }
    ];

    // Seed Audit Logs
    this.auditLogs = [
      {
        id: 'audit-001',
        userId: 'usr-admin-001',
        username: 'admin',
        connectionId: esxiConn1.id,
        action: 'VM_POWER_ON',
        resourceType: 'VM',
        resourceId: 'vm-prod-db01',
        details: 'Operator confirmed power-on verification for prod-postgresql-primary',
        ipAddress: '10.20.0.100',
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
      },
      {
        id: 'audit-002',
        userId: 'usr-op-002',
        username: 'operator',
        connectionId: casaConn1.id,
        action: 'APP_RESTART',
        resourceType: 'CASAOS_APP',
        resourceId: 'app-homeassistant',
        details: 'Restarted Home Assistant container after integration update',
        ipAddress: '10.20.0.105',
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString()
      },
      {
        id: 'audit-003',
        userId: 'usr-admin-001',
        username: 'admin',
        connectionId: esxiConn1.id,
        action: 'TEST_CONNECTION',
        resourceType: 'ESXI_CONNECTION',
        resourceId: esxiConn1.id,
        details: 'Executed live latency and REST API connectivity test (14ms)',
        ipAddress: '10.20.0.100',
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      }
    ];
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
    const entry: AuditLog = {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    this.auditLogs.unshift(entry);
    // Keep max 500 in memory
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
    return entry;
  }

  public addEvent(event: Omit<SystemEvent, 'id' | 'timestamp'>): SystemEvent {
    const entry: SystemEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString()
    };
    this.events.unshift(entry);
    if (this.events.length > 500) {
      this.events.pop();
    }
    return entry;
  }

  public addMetric(point: MetricDataPoint) {
    this.metrics.push(point);
    // Keep max 288 data points (e.g. 24h at 5min intervals or 48h at 10min intervals)
    if (this.metrics.length > 288) {
      this.metrics.shift();
    }
  }
}

export const store = new DataStore();
