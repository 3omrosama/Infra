import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  CasaOSServer, 
  CasaOSApp, 
  CasaOSDisk, 
  MetricDataPoint, 
  SystemEvent 
} from '../../src/types/index.js';

export class CasaOSProvider extends BaseInfrastructureProvider {
  private apiToken: string | null = null;

  constructor(config: ProviderConnectionConfig) {
    super(config);
    this.apiToken = config.token || config.password || null;
  }

  private getBaseUrl(): string {
    const protocol = this.config.useHttps ? 'https' : 'http';
    return `${protocol}://${this.config.host}:${this.config.port}`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (this.apiToken) {
      headers['Authorization'] = this.apiToken.startsWith('Bearer ') ? this.apiToken : `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  async connect(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const baseUrl = this.getBaseUrl();
      const res = await this.fetchWithTimeout(`${baseUrl}/v2/sys/version`, {
        headers: this.getHeaders()
      }, 5000);

      this.lastPingMs = Date.now() - startTime;
      if (res.ok) {
        this.isConnected = true;
        this.lastError = null;
        return true;
      }
      this.isConnected = false;
      this.lastError = `CasaOS returned status ${res.status}`;
      return false;
    } catch (err: any) {
      this.lastPingMs = Date.now() - startTime;
      this.isConnected = false;
      this.lastError = err.message || 'Failed to connect to CasaOS';
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
      const res = await this.fetchWithTimeout(`${baseUrl}/v2/sys/version`, {
        headers: this.getHeaders()
      }, 5000);

      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: true,
          message: `Connected successfully to CasaOS at ${this.config.host}:${this.config.port}`,
          latencyMs,
          version: data.version || 'CasaOS v0.4.x',
          details: data
        };
      } else {
        return {
          success: false,
          message: `CasaOS returned HTTP ${res.status}: ${res.statusText}`,
          latencyMs
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Unable to reach CasaOS server at ${this.config.host}:${this.config.port}: ${err.message}`,
        latencyMs: Date.now() - startTime
      };
    }
  }

  async getServerInfo(): Promise<CasaOSServer | null> {
    return null; // Adapter point for /v2/sys/system
  }

  async getApps(): Promise<CasaOSApp[]> {
    return []; // Adapter point for /v2/app-management/apps
  }

  async getDisks(): Promise<CasaOSDisk[]> {
    return []; // Adapter point for /v1/storage/disks
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

  async executeAppAction(appId: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    const baseUrl = this.getBaseUrl();
    const stateMap = {
      'start': 'start',
      'stop': 'stop',
      'restart': 'restart'
    };

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/v2/app-management/apps/${appId}/state`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ state: stateMap[action] })
      }, 8000);

      if (res.ok) {
        return {
          success: true,
          message: `CasaOS application '${appId}' ${action} triggered successfully`
        };
      } else {
        return {
          success: false,
          message: `CasaOS application action failed with status ${res.status}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `CasaOS application action failed: ${err.message}`
      };
    }
  }
}
