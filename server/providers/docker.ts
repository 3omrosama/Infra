import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  DockerContainer, 
  DockerImage, 
  DockerVolume, 
  MetricDataPoint, 
  SystemEvent 
} from '../../src/types/index.js';

export class DockerProvider extends BaseInfrastructureProvider {
  constructor(config: ProviderConnectionConfig) {
    super(config);
  }

  private getBaseUrl(): string {
    const protocol = this.config.useHttps ? 'https' : 'http';
    return `${protocol}://${this.config.host}:${this.config.port}`;
  }

  async connect(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const baseUrl = this.getBaseUrl();
      const res = await this.fetchWithTimeout(`${baseUrl}/version`, {}, 5000);
      this.lastPingMs = Date.now() - startTime;
      if (res.ok) {
        this.isConnected = true;
        this.lastError = null;
        return true;
      }
      this.isConnected = false;
      this.lastError = `Docker daemon returned HTTP ${res.status}`;
      return false;
    } catch (err: any) {
      this.lastPingMs = Date.now() - startTime;
      this.isConnected = false;
      this.lastError = err.message || 'Failed to reach Docker daemon';
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      const baseUrl = this.getBaseUrl();
      const res = await this.fetchWithTimeout(`${baseUrl}/version`, {}, 5000);
      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: true,
          message: `Docker engine connected at ${this.config.host}:${this.config.port}`,
          latencyMs,
          version: `Docker Engine v${data.Version || '26.x'}`,
          details: data
        };
      } else {
        return {
          success: false,
          message: `Docker daemon response: HTTP ${res.status}`,
          latencyMs
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Docker socket connection failed: ${err.message}`,
        latencyMs: Date.now() - startTime
      };
    }
  }

  async getContainers(): Promise<DockerContainer[]> {
    return [];
  }

  async getImages(): Promise<DockerImage[]> {
    return [];
  }

  async getVolumes(): Promise<DockerVolume[]> {
    return [];
  }

  async getMetrics(): Promise<MetricDataPoint> {
    return {
      timestamp: new Date().toISOString(),
      cpu: 0,
      memory: 0,
      storage: 0,
      networkRxKbps: 0,
      networkTxKbps: 0
    };
  }

  async getEvents(): Promise<SystemEvent[]> {
    return [];
  }

  async executeContainerAction(containerId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    const baseUrl = this.getBaseUrl();
    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/containers/${containerId}/${action}`, {
        method: 'POST'
      }, 8000);

      if (res.ok || res.status === 204 || res.status === 304) {
        return {
          success: true,
          message: `Container '${containerId}' ${action} completed successfully`
        };
      } else {
        return {
          success: false,
          message: `Docker daemon returned status ${res.status} for ${action}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Docker container operation failed: ${err.message}`
      };
    }
  }
}
