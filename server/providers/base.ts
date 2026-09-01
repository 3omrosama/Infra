import { 
  InfrastructureProvider, 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  ProviderStatus, 
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

export abstract class BaseInfrastructureProvider implements InfrastructureProvider {
  public id: string;
  public config: ProviderConnectionConfig;
  public isConnected = false;
  public lastError: string | null = null;
  public lastPingMs = 0;

  constructor(config: ProviderConnectionConfig) {
    this.id = config.id || `prov-${Date.now()}`;
    this.config = config;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): Promise<ProviderTestResult>;
  abstract getMetrics(): Promise<MetricDataPoint>;
  abstract getEvents(): Promise<SystemEvent[]>;

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConnected) {
      await this.connect().catch((err: any) => {
        this.isConnected = false;
        this.lastError = err?.message || 'Connection failed';
      });
    }
    return {
      status: this.isConnected ? 'ONLINE' : (this.lastError ? 'DEGRADED' : 'OFFLINE'),
      lastSeen: this.isConnected ? new Date().toISOString() : undefined,
      latencyMs: this.lastPingMs,
      error: this.lastError || undefined
    };
  }

  // Base timeout wrapper for network calls
  protected async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
