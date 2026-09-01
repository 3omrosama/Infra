import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  ESXiHost, 
  VirtualMachine, 
  DatastoreInfo, 
  NetworkInfo, 
  MetricDataPoint, 
  SystemEvent,
  PowerState
} from '../../src/types/index.js';
import { ESXiSoapClient, ESXiObjectContent } from './esxiSoapClient.js';

export class ESXiProvider extends BaseInfrastructureProvider {
  private client: ESXiSoapClient;

  constructor(config: ProviderConnectionConfig) {
    super(config);
    this.client = new ESXiSoapClient({
      connectionId: config.id,
      host: config.host,
      port: config.port,
      useHttps: config.useHttps ?? true,
      skipSslVerify: config.skipSslVerify ?? false
    });
  }

  public updateConfig(config: ProviderConnectionConfig) {
    this.config = config;
    if (this.client) {
      this.client.destroy();
    }
    this.client = new ESXiSoapClient({
      connectionId: config.id,
      host: config.host,
      port: config.port,
      useHttps: config.useHttps ?? true,
      skipSslVerify: config.skipSslVerify ?? false
    });
    this.isConnected = false;
    this.lastError = null;
  }

  /**
   * Establish authenticated session against ESXi SOAP endpoint
   */
  async connect(): Promise<boolean> {
    const startTime = Date.now();
    try {
      // Step 1 & 2: Retrieve service content and login
      await this.client.retrieveServiceContent();
      const loginRes = await this.client.login(
        this.config.username || 'root',
        this.config.password
      );

      this.lastPingMs = Date.now() - startTime;
      this.isConnected = loginRes.success;
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.lastPingMs = Date.now() - startTime;
      this.isConnected = false;
      this.lastError = err.message || 'Failed to authenticate with ESXi host';
      return false;
    }
  }

  /**
   * Terminate active session
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      // Ignore disconnect errors
    } finally {
      this.isConnected = false;
      this.client.destroy();
    }
  }

  /**
   * Test Connection: Authenticate against live ESXi host, measure round-trip latency, and verify credentials
   */
  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    const testClient = new ESXiSoapClient({
      connectionId: this.config.id,
      host: this.config.host,
      port: this.config.port,
      useHttps: this.config.useHttps ?? true,
      skipSslVerify: this.config.skipSslVerify ?? false
    });

    try {
      // 1. Retrieve Service Content (checks endpoint reachability & version)
      const serviceContent = await testClient.retrieveServiceContent();
      const esxiFullName = serviceContent.about?.fullName || `VMware ESXi ${serviceContent.about?.version || ''}`;

      // 2. Perform authentication with provided credentials
      await testClient.login(
        this.config.username || 'root',
        this.config.password
      );

      const latencyMs = Date.now() - startTime;

      // 3. Graceful logout
      await testClient.logout().catch(() => {});

      return {
        success: true,
        message: `Successfully connected and authenticated with ${esxiFullName} at ${this.config.host}:${this.config.port}`,
        latencyMs,
        version: esxiFullName
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        message: `Connection failed: ${err.message || 'Unknown ESXi connection error'}`,
        latencyMs
      };
    } finally {
      testClient.destroy();
    }
  }

  /**
   * Ensure authenticated session before executing inventory discovery
   */
  private async ensureSession(): Promise<void> {
    if (!this.client.getSessionCookie()) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error(this.lastError || 'Could not establish session to ESXi');
      }
    }
  }

  /**
   * Discover and parse all Hypervisor Hosts (HostSystem) from ESXi
   */
  async getHosts(): Promise<ESXiHost[]> {
    await this.ensureSession();

    let containerViewId: string | null = null;
    try {
      containerViewId = await this.client.createContainerView(['HostSystem', 'Datastore', 'Network']);

      const rawObjects = await this.client.retrieveInventoryObjects(containerViewId, [
        {
          type: 'HostSystem',
          properties: [
            'name',
            'summary.hardware',
            'summary.quickStats',
            'summary.config',
            'config.product',
            'runtime.powerState',
            'runtime.bootTime',
            'datastore',
            'network',
            'vm'
          ]
        },
        {
          type: 'Datastore',
          properties: [
            'name',
            'summary.name',
            'summary.type',
            'summary.capacity',
            'summary.freeSpace',
            'summary.accessible',
            'summary.uncommitted'
          ]
        },
        {
          type: 'Network',
          properties: [
            'name',
            'summary.name',
            'summary.accessible'
          ]
        }
      ]);

      // Parse Datastores
      const datastoresMap = new Map<string, DatastoreInfo>();
      const datastoreObjects = rawObjects.filter(o => o.obj.type === 'Datastore');
      for (const dsObj of datastoreObjects) {
        const dsName = dsObj.props['summary.name'] || dsObj.props['name'] || 'Datastore';
        const dsType = dsObj.props['summary.type'] || 'VMFS';
        const capacity = Number(dsObj.props['summary.capacity']) || 0;
        const freeSpace = Number(dsObj.props['summary.freeSpace']) || 0;
        const usedSpace = Math.max(0, capacity - freeSpace);
        const usagePct = capacity > 0 ? Math.round(((usedSpace / capacity) * 100) * 10) / 10 : 0;

        datastoresMap.set(dsObj.obj.value, {
          id: `ds-${dsObj.obj.value}`,
          name: dsName,
          type: dsType,
          capacityBytes: capacity,
          freeBytes: freeSpace,
          usagePct,
          status: usagePct > 90 ? 'CRITICAL' : (usagePct > 80 ? 'WARNING' : 'NORMAL')
        });
      }

      // Parse Networks
      const networksMap = new Map<string, NetworkInfo>();
      const networkObjects = rawObjects.filter(o => o.obj.type === 'Network');
      for (const netObj of networkObjects) {
        const netName = netObj.props['summary.name'] || netObj.props['name'] || 'VM Network';
        networksMap.set(netObj.obj.value, {
          id: `net-${netObj.obj.value}`,
          name: netName,
          type: 'vSphere Standard Switch PortGroup',
          status: 'ACTIVE',
          rxBytesPerSec: 0,
          txBytesPerSec: 0
        });
      }

      // Parse Hosts
      const hostObjects = rawObjects.filter(o => o.obj.type === 'HostSystem');
      const hosts: ESXiHost[] = [];

      for (const hostObj of hostObjects) {
        const hostName = hostObj.props['name'] || this.config.host;
        const hw = hostObj.props['summary.hardware'] || {};
        const qs = hostObj.props['summary.quickStats'] || {};
        const product = hostObj.props['config.product'] || {};

        const cpuModel = hw.cpuModel || `${hw.vendor || 'Generic'} x86_64 (${hw.numCpuPkgs || 1} Pkg x ${hw.numCpuCores || 1} Cores)`;
        const cpuCores = Number(hw.numCpuCores) || 1;
        const cpuMhz = Number(hw.cpuMhz) || 2000;
        const cpuMhzTotal = cpuCores * cpuMhz;

        const memoryBytesTotal = Number(hw.memorySize) || 0;
        const memoryUsedMB = Number(qs.overallMemoryUsage) || 0;
        const memoryBytesUsed = memoryUsedMB * 1024 * 1024;
        const memoryUsagePct = memoryBytesTotal > 0 ? Math.round(((memoryBytesUsed / memoryBytesTotal) * 100) * 10) / 10 : 0;

        const cpuUsedMhz = Number(qs.overallCpuUsage) || 0;
        const cpuUsagePct = cpuMhzTotal > 0 ? Math.round(((cpuUsedMhz / cpuMhzTotal) * 100) * 10) / 10 : 0;

        const uptimeSeconds = Number(qs.uptime) || 0;
        const powerState: PowerState = hostObj.props['runtime.powerState'] === 'poweredOff' ? 'STOPPED' : 'RUNNING';

        // Attached datastores & networks
        const hostDatastores: DatastoreInfo[] = Array.from(datastoresMap.values());
        const hostNetworks: NetworkInfo[] = Array.from(networksMap.values());

        const storageBytesTotal = hostDatastores.reduce((acc, d) => acc + d.capacityBytes, 0);
        const storageBytesFree = hostDatastores.reduce((acc, d) => acc + d.freeBytes, 0);
        const storageBytesUsed = Math.max(0, storageBytesTotal - storageBytesFree);
        const storageUsagePct = storageBytesTotal > 0 ? Math.round(((storageBytesUsed / storageBytesTotal) * 100) * 10) / 10 : 0;

        const vmObjList = hostObj.props['vm'];
        const vmCount = Array.isArray(vmObjList) ? vmObjList.length : (vmObjList ? 1 : 0);

        hosts.push({
          id: `host-${this.config.id || 'esxi'}-${hostObj.obj.value}`,
          connectionId: this.config.id || '',
          hostname: hostName,
          ipAddress: this.config.host,
          version: product.fullName || `VMware ESXi ${product.version || '8.0'}`,
          build: product.build || '',
          cpuModel,
          cpuCores,
          cpuMhzTotal,
          cpuUsagePct,
          memoryBytesTotal,
          memoryUsagePct,
          storageBytesTotal,
          storageBytesUsed,
          storageUsagePct,
          uptimeSeconds,
          powerState,
          vmCount,
          runningVmCount: vmCount,
          datastores: hostDatastores,
          networks: hostNetworks
        });
      }

      return hosts;
    } catch (err: any) {
      console.error(`[ESXiProvider] Failed to query hosts on ${this.config.host}:`, err.message);
      this.lastError = err.message;
      return [];
    } finally {
      if (containerViewId) {
        await this.client.destroyView(containerViewId).catch(() => {});
      }
    }
  }

  /**
   * Discover and parse all Virtual Machines from ESXi
   */
  async getVirtualMachines(): Promise<VirtualMachine[]> {
    await this.ensureSession();

    let containerViewId: string | null = null;
    try {
      containerViewId = await this.client.createContainerView(['VirtualMachine']);

      const rawObjects = await this.client.retrieveInventoryObjects(containerViewId, [
        {
          type: 'VirtualMachine',
          properties: [
            'name',
            'runtime.powerState',
            'runtime.bootTime',
            'runtime.host',
            'config.hardware.numCPU',
            'config.hardware.memoryMB',
            'summary.quickStats.overallCpuUsage',
            'summary.quickStats.guestMemoryUsage',
            'summary.quickStats.uptimeSeconds',
            'summary.storage.committed',
            'summary.storage.uncommitted',
            'summary.guest.ipAddress',
            'summary.guest.guestFullName',
            'guest.ipAddress',
            'guest.guestFullName',
            'datastore',
            'network'
          ]
        }
      ]);

      const vms: VirtualMachine[] = [];

      for (const vmObj of rawObjects) {
        const vmName = vmObj.props['name'] || `VM-${vmObj.obj.value}`;
        const rawPowerState = vmObj.props['runtime.powerState'] || 'poweredOff';
        let powerState: PowerState = 'STOPPED';
        if (rawPowerState === 'poweredOn') powerState = 'RUNNING';
        else if (rawPowerState === 'suspended') powerState = 'SUSPENDED';

        const cpuCount = Number(vmObj.props['config.hardware.numCPU']) || 1;
        const memoryMB = Number(vmObj.props['config.hardware.memoryMB']) || 1024;
        const memoryBytes = memoryMB * 1024 * 1024;

        const memoryUsedMB = Number(vmObj.props['summary.quickStats.guestMemoryUsage']) || 0;
        const memoryUsagePct = memoryMB > 0 ? Math.round(((memoryUsedMB / memoryMB) * 100) * 10) / 10 : 0;

        const cpuUsedMhz = Number(vmObj.props['summary.quickStats.overallCpuUsage']) || 0;
        const cpuUsagePct = cpuCount > 0 ? Math.min(100, Math.round(((cpuUsedMhz / (cpuCount * 2400)) * 100) * 10) / 10) : 0;

        const committedStorage = Number(vmObj.props['summary.storage.committed']) || 0;
        const uncommittedStorage = Number(vmObj.props['summary.storage.uncommitted']) || 0;
        const totalStorage = committedStorage + uncommittedStorage;
        const storageUsagePct = totalStorage > 0 ? Math.round(((committedStorage / totalStorage) * 100) * 10) / 10 : 0;

        const ipAddress = vmObj.props['summary.guest.ipAddress'] || vmObj.props['guest.ipAddress'] || undefined;
        const guestOs = vmObj.props['summary.guest.guestFullName'] || vmObj.props['guest.guestFullName'] || 'Generic OS (64-bit)';
        const uptimeSeconds = Number(vmObj.props['summary.quickStats.uptimeSeconds']) || 0;

        vms.push({
          id: `vm-${this.config.id || 'esxi'}-${vmObj.obj.value}`,
          connectionId: this.config.id || '',
          externalVmId: vmObj.obj.value,
          name: vmName,
          powerState,
          cpuCount,
          cpuUsagePct: powerState === 'RUNNING' ? cpuUsagePct : 0,
          memoryBytes,
          memoryUsagePct: powerState === 'RUNNING' ? memoryUsagePct : 0,
          storageBytes: totalStorage > 0 ? totalStorage : committedStorage,
          storageUsagePct,
          ipAddress,
          guestOs,
          uptimeSeconds: powerState === 'RUNNING' ? uptimeSeconds : 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      return vms;
    } catch (err: any) {
      console.error(`[ESXiProvider] Failed to query VMs on ${this.config.host}:`, err.message);
      this.lastError = err.message;
      return [];
    } finally {
      if (containerViewId) {
        await this.client.destroyView(containerViewId).catch(() => {});
      }
    }
  }

  async getStorage(): Promise<DatastoreInfo[]> {
    const hosts = await this.getHosts();
    return hosts.flatMap(h => h.datastores);
  }

  async getNetworks(): Promise<NetworkInfo[]> {
    const hosts = await this.getHosts();
    return hosts.flatMap(h => h.networks);
  }

  async getMetrics(): Promise<MetricDataPoint> {
    const hosts = await this.getHosts();
    if (hosts.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        cpu: 0,
        memory: 0,
        storage: 0,
        networkRxKbps: 0,
        networkTxKbps: 0
      };
    }

    const avgCpu = Math.round((hosts.reduce((acc, h) => acc + h.cpuUsagePct, 0) / hosts.length) * 10) / 10;
    const avgMem = Math.round((hosts.reduce((acc, h) => acc + h.memoryUsagePct, 0) / hosts.length) * 10) / 10;
    const avgStorage = Math.round((hosts.reduce((acc, h) => acc + h.storageUsagePct, 0) / hosts.length) * 10) / 10;

    return {
      timestamp: new Date().toISOString(),
      cpu: avgCpu,
      memory: avgMem,
      storage: avgStorage,
      networkRxKbps: 0,
      networkTxKbps: 0
    };
  }

  async getEvents(): Promise<SystemEvent[]> {
    return [];
  }
}
