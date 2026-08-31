import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  ESXiHost, 
  VirtualMachine, 
  CasaOSServer, 
  CasaOSApp, 
  DockerContainer, 
  DatastoreInfo, 
  CasaOSDisk, 
  DockerVolume, 
  NetworkInfo, 
  MetricDataPoint, 
  SystemEvent 
} from '../../src/types/index.js';
import { store } from '../db/store.js';

export class DemoProvider extends BaseInfrastructureProvider {
  constructor(config: ProviderConnectionConfig) {
    super(config);
    this.isConnected = true;
    this.lastPingMs = 12;
  }

  async connect(): Promise<boolean> {
    this.isConnected = true;
    this.lastError = null;
    return true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async testConnection(): Promise<ProviderTestResult> {
    return {
      success: true,
      message: `[Demo Mode] Simulated connection to ${this.config.name} (${this.config.type}) verified healthy`,
      latencyMs: Math.floor(8 + Math.random() * 12),
      version: 'NOC-Simulated Engine v2026.8'
    };
  }

  async getHosts(): Promise<ESXiHost[]> {
    return Array.from(store.esxiHosts.values()).filter(h => h.connectionId === this.config.id);
  }

  async getVirtualMachines(): Promise<VirtualMachine[]> {
    return Array.from(store.virtualMachines.values()).filter(vm => vm.connectionId === this.config.id);
  }

  async getStorage(): Promise<DatastoreInfo[]> {
    const host = Array.from(store.esxiHosts.values()).find(h => h.connectionId === this.config.id);
    return host ? host.datastores : [];
  }

  async getNetworks(): Promise<NetworkInfo[]> {
    const host = Array.from(store.esxiHosts.values()).find(h => h.connectionId === this.config.id);
    return host ? host.networks : [];
  }

  async getMetrics(): Promise<MetricDataPoint> {
    const jitter = (Math.random() * 6) - 3;
    return {
      timestamp: new Date().toISOString(),
      cpu: Math.min(99, Math.max(10, Math.round(55 + jitter))),
      memory: Math.min(99, Math.max(20, Math.round(72 + jitter * 0.5))),
      storage: 64.8,
      networkRxKbps: Math.round(18000 + Math.random() * 4000),
      networkTxKbps: Math.round(13500 + Math.random() * 3000)
    };
  }

  async getEvents(): Promise<SystemEvent[]> {
    return store.events.filter(e => e.connectionId === this.config.id);
  }

  async executeVMAction(vmId: string, action: 'power-on' | 'power-off' | 'restart' | 'suspend'): Promise<{ success: boolean; message: string }> {
    const vm = store.virtualMachines.get(vmId);
    if (!vm) {
      return { success: false, message: `VM ${vmId} not found` };
    }

    if (action === 'power-on') {
      vm.powerState = 'RUNNING';
      vm.cpuUsagePct = 35 + Math.random() * 20;
      vm.memoryUsagePct = 50 + Math.random() * 15;
    } else if (action === 'power-off') {
      vm.powerState = 'STOPPED';
      vm.cpuUsagePct = 0;
      vm.memoryUsagePct = 0;
    } else if (action === 'restart') {
      vm.powerState = 'RUNNING';
      vm.uptimeSeconds = 0;
    } else if (action === 'suspend') {
      vm.powerState = 'SUSPENDED';
      vm.cpuUsagePct = 0;
    }
    vm.updatedAt = new Date().toISOString();
    store.virtualMachines.set(vm.id, vm);

    store.addEvent({
      connectionId: this.config.id,
      eventType: 'VM_POWER_STATE',
      severity: 'INFO',
      source: 'ESXi Manager',
      message: `VM ${vm.name} transitioned to ${vm.powerState} via user command`
    });

    return {
      success: true,
      message: `[Demo] VM ${vm.name} power action '${action}' completed successfully`
    };
  }

  async executeAppAction(appId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    const app = store.casaosApps.get(appId);
    if (!app) {
      return { success: false, message: `Application ${appId} not found` };
    }

    if (action === 'start') {
      app.status = 'running';
      app.cpuUsagePct = 5 + Math.random() * 15;
    } else if (action === 'stop') {
      app.status = 'stopped';
      app.cpuUsagePct = 0;
      app.memoryUsagePct = 0;
    } else if (action === 'restart') {
      app.status = 'running';
      app.restartCount += 1;
      app.uptimeSeconds = 0;
    }
    store.casaosApps.set(app.id, app);

    store.addEvent({
      connectionId: this.config.id,
      eventType: 'APP_STATE_CHANGE',
      severity: 'INFO',
      source: 'CasaOS App Engine',
      message: `Application ${app.title} transitioned to ${app.status}`
    });

    return {
      success: true,
      message: `[Demo] Application ${app.title} ${action} executed successfully`
    };
  }

  async executeContainerAction(containerId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    const container = store.dockerContainers.get(containerId);
    if (!container) {
      return { success: false, message: `Container ${containerId} not found` };
    }

    if (action === 'start') {
      container.state = 'running';
      container.status = 'Up Less than a minute';
      container.cpuUsagePct = 12 + Math.random() * 10;
    } else if (action === 'stop') {
      container.state = 'exited';
      container.status = 'Exited (0)';
      container.cpuUsagePct = 0;
    } else if (action === 'restart') {
      container.state = 'running';
      container.restartCount += 1;
      container.status = 'Up 2 seconds';
    }
    store.dockerContainers.set(container.id, container);

    store.addEvent({
      connectionId: this.config.id,
      eventType: 'CONTAINER_LIFECYCLE',
      severity: 'INFO',
      source: 'Docker Engine',
      message: `Container ${container.name} state set to ${container.state}`
    });

    return {
      success: true,
      message: `[Demo] Container ${container.name} ${action} action executed successfully`
    };
  }
}
