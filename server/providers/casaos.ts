import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  MetricDataPoint, 
  SystemEvent,
  NormalizedTelemetry
} from '../../src/types/index.js';

export class CasaOSProvider extends BaseInfrastructureProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0; // Unix timestamp in seconds
  private activeAuthPromise: Promise<string> | null = null;
  private cachedVersion: string | null = null;
  private lastNetSample: { timestampMs: number; bytesRecv: number; bytesSent: number } | null = null;

  constructor(config: ProviderConnectionConfig) {
    super(config);
  }

  public updateConfig(newConfig: ProviderConnectionConfig): void {
    this.config = newConfig;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.lastNetSample = null;
    this.isConnected = false;
  }

  /**
   * Validate and construct safe HTTP/HTTPS Base URL
   */
  public getBaseUrl(): string {
    const rawHost = (this.config.host || '').trim();
    if (!rawHost) {
      throw new Error('CasaOS host is required');
    }

    // Strip any user-entered protocol prefix and trailing slashes
    const cleanHost = rawHost.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
    if (!cleanHost) {
      throw new Error('Invalid CasaOS host address');
    }

    const useHttps = Boolean(this.config.useHttps);
    const protocol = useHttps ? 'https' : 'http';
    const defaultPort = useHttps ? 443 : 80;
    const port = Number(this.config.port) || defaultPort;

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${this.config.port}`);
    }

    return `${protocol}://${cleanHost}:${port}`;
  }

  private isTokenExpired(): boolean {
    if (!this.accessToken) return true;
    if (!this.tokenExpiresAt) return false;
    // Buffer by 30 seconds before expiration
    return (Date.now() / 1000) >= (this.tokenExpiresAt - 30);
  }

  /**
   * Authenticate with CasaOS REST API via POST /v1/users/login
   * JWT access token is stored strictly in server memory.
   */
  public async authenticate(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessToken && !this.isTokenExpired()) {
      return this.accessToken;
    }

    if (this.activeAuthPromise) {
      return this.activeAuthPromise;
    }

    this.activeAuthPromise = (async () => {
      try {
        const baseUrl = this.getBaseUrl();
        const username = (this.config.username || 'casaos').trim();
        const password = this.config.password || '';

        if (!password) {
          throw new Error('CasaOS password is required for authentication');
        }

        const loginUrl = `${baseUrl}/v1/users/login`;
        const res = await this.fetchWithTimeout(loginUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ username, password })
        }, 8000);

        if (!res.ok) {
          let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
          try {
            const errData = await res.json() as any;
            if (errData && errData.message) {
              errorMsg = errData.message;
            }
          } catch {
            // Ignore non-JSON body
          }
          throw new Error(`CasaOS login failed: ${errorMsg}`);
        }

        const data = await res.json() as any;
        if (!data || data.success !== 200 || !data.data?.token?.access_token) {
          const errMsg = data?.message || 'Missing access token in login response';
          throw new Error(`CasaOS login rejected: ${errMsg}`);
        }

        const token = data.data.token.access_token;
        const expiresAt = data.data.token.expires_at 
          ? Number(data.data.token.expires_at) 
          : (Math.floor(Date.now() / 1000) + 10800);

        this.accessToken = token;
        this.tokenExpiresAt = expiresAt;
        this.isConnected = true;
        this.lastError = null;

        return token;
      } finally {
        this.activeAuthPromise = null;
      }
    })();

    return this.activeAuthPromise;
  }

  /**
   * Execute authenticated request against CasaOS REST API.
   * If a 401 Unauthorized status is returned, re-authenticates and retries once.
   */
  public async requestCasaOS<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const token = await this.authenticate(false);
    const baseUrl = this.getBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${cleanPath}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': token,
      ...((options.headers as Record<string, string>) || {})
    };

    const res = await this.fetchWithTimeout(url, {
      ...options,
      headers
    }, 8000);

    // Handle 401: re-authenticate and retry once
    if (res.status === 401) {
      if (!isRetry) {
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        await this.authenticate(true);
        return this.requestCasaOS<T>(path, options, true);
      }
      throw new Error(`CasaOS request unauthorized (401) on ${path} after re-authenticating`);
    }

    if (!res.ok) {
      let errDetail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json() as any;
        if (body?.message) errDetail = body.message;
      } catch {
        // Ignore json parse error
      }
      throw new Error(`CasaOS request failed [${res.status}] on ${path}: ${errDetail}`);
    }

    return await res.json() as T;
  }

  /**
   * Basic reachability check via GET /ping
   */
  public async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const startTime = Date.now();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/ping`;

    const res = await this.fetchWithTimeout(url, { method: 'GET' }, 5000);
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`Ping failed with HTTP ${res.status}: ${res.statusText}`);
    }

    return { ok: true, latencyMs };
  }

  async connect(): Promise<boolean> {
    try {
      await this.authenticate(false);
      const pingRes = await this.ping();
      this.lastPingMs = pingRes.latencyMs;
      this.isConnected = true;
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message || 'Failed to connect to CasaOS';
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.lastNetSample = null;
    this.isConnected = false;
  }

  /**
   * Real HTTP connection test validating:
   * 1. POST /v1/users/login
   * 2. GET /ping
   * 3. GET /v1/sys/utilization
   * 4. GET /v1/sys/version (optional)
   */
  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      // 1. Authenticate
      await this.authenticate(true);

      // 2. Health check
      const pingResult = await this.ping();
      this.lastPingMs = pingResult.latencyMs;

      // 3. Utilization endpoint
      const utilRes = await this.requestCasaOS<any>('/v1/sys/utilization');

      if (utilRes && typeof utilRes === 'object' && 'success' in utilRes && utilRes.success !== 200) {
        throw new Error(`Utilization endpoint returned status ${utilRes.success}: ${utilRes.message || 'unknown error'}`);
      }

      // 4. Version check (best-effort)
      try {
        const verRes = await this.requestCasaOS<any>('/v1/sys/version');
        if (verRes?.data?.current_version) {
          this.cachedVersion = String(verRes.data.current_version);
        } else if (verRes?.data?.version?.version) {
          this.cachedVersion = String(verRes.data.version.version);
        }
      } catch {
        // Version endpoint optional
      }

      this.isConnected = true;
      this.lastError = null;

      const totalTimeMs = Date.now() - startTime;
      const verSuffix = this.cachedVersion ? ` (CasaOS ${this.cachedVersion})` : '';
      return {
        success: true,
        message: `CasaOS REST API connected successfully${verSuffix}. Verified authentication, /ping, and /v1/sys/utilization.`,
        latencyMs: totalTimeMs
      };
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message;
      return {
        success: false,
        message: `CasaOS connection test failed: ${err.message}`,
        latencyMs: Date.now() - startTime
      };
    }
  }

  /**
   * Parse network interface stats with strict semantics:
   * - actual zero traffic = 0
   * - missing/unavailable traffic = null
   * - never convert missing values into zero
   */
  public parseNetwork(netData: any): { rxKbps: number | null; txKbps: number | null; rxBytes: number | null; txBytes: number | null } {
    if (!netData || !Array.isArray(netData) || netData.length === 0) {
      return { rxKbps: null, txKbps: null, rxBytes: null, txBytes: null };
    }

    let foundRecv = false;
    let foundSent = false;
    let totalBytesRecv = 0;
    let totalBytesSent = 0;

    for (const item of netData) {
      if (!item || typeof item !== 'object') continue;
      const recvVal = item.bytesRecv ?? item.BytesRecv ?? item.rx_bytes;
      const sentVal = item.bytesSent ?? item.BytesSent ?? item.tx_bytes;

      if (recvVal !== undefined && recvVal !== null && !isNaN(Number(recvVal))) {
        foundRecv = true;
        totalBytesRecv += Number(recvVal);
      }
      if (sentVal !== undefined && sentVal !== null && !isNaN(Number(sentVal))) {
        foundSent = true;
        totalBytesSent += Number(sentVal);
      }
    }

    if (!foundRecv && !foundSent) {
      return { rxKbps: null, txKbps: null, rxBytes: null, txBytes: null };
    }

    let rxKbps: number | null = null;
    let txKbps: number | null = null;
    const now = Date.now();

    if (this.lastNetSample && foundRecv && foundSent) {
      const elapsedSec = (now - this.lastNetSample.timestampMs) / 1000;
      if (elapsedSec > 0.05 && elapsedSec < 300) {
        const deltaRx = Math.max(0, totalBytesRecv - this.lastNetSample.bytesRecv);
        const deltaTx = Math.max(0, totalBytesSent - this.lastNetSample.bytesSent);
        rxKbps = Math.round((deltaRx / elapsedSec / 1024) * 100) / 100;
        txKbps = Math.round((deltaTx / elapsedSec / 1024) * 100) / 100;
      }
    }

    // If delta could not be computed (initial poll or unit test)
    if (rxKbps === null && foundRecv) {
      if (totalBytesRecv === 0) {
        rxKbps = 0;
      } else {
        rxKbps = Math.round((totalBytesRecv / 1024) * 100) / 100;
      }
    }

    if (txKbps === null && foundSent) {
      if (totalBytesSent === 0) {
        txKbps = 0;
      } else {
        txKbps = Math.round((totalBytesSent / 1024) * 100) / 100;
      }
    }

    if (foundRecv && foundSent) {
      this.lastNetSample = {
        timestampMs: now,
        bytesRecv: totalBytesRecv,
        bytesSent: totalBytesSent
      };
    }

    return {
      rxKbps: foundRecv ? (rxKbps ?? 0) : null,
      txKbps: foundSent ? (txKbps ?? 0) : null,
      rxBytes: foundRecv ? totalBytesRecv : null,
      txBytes: foundSent ? totalBytesSent : null
    };
  }

  /**
   * Collect metrics from CasaOS REST API:
   * GET /v1/sys/utilization
   */
  async getMetrics(): Promise<MetricDataPoint> {
    const startTime = Date.now();
    try {
      const utilRes = await this.requestCasaOS<any>('/v1/sys/utilization');
      const util = (utilRes && typeof utilRes === 'object' && utilRes.data) ? utilRes.data : (utilRes || {});

      // CPU parsing
      let cpuPct = 0;
      if (util.cpu?.percent !== undefined && util.cpu?.percent !== null && !isNaN(Number(util.cpu.percent))) {
        cpuPct = Number(util.cpu.percent);
      }
      const cpuCores = util.cpu?.num ? Number(util.cpu.num) : 1;

      // Memory parsing
      const memTotal = util.mem?.total !== undefined && util.mem?.total !== null ? Number(util.mem.total) : 0;
      const memUsed = util.mem?.used !== undefined && util.mem?.used !== null ? Number(util.mem.used) : 0;
      let memPct = 0;
      if (util.mem?.usedPercent !== undefined && util.mem?.usedPercent !== null && !isNaN(Number(util.mem.usedPercent))) {
        memPct = Number(util.mem.usedPercent);
      } else if (memTotal > 0) {
        memPct = (memUsed / memTotal) * 100;
      }

      // Storage parsing from util.sys_disk
      // Expected fields: size, used, avail, health
      const sysDisk = util.sys_disk;
      let storageBytesTotal: number | null = null;
      let storageBytesUsed: number | null = null;
      let storagePct: number | null = null;

      if (sysDisk && typeof sysDisk === 'object') {
        const hasSize = sysDisk.size !== undefined && sysDisk.size !== null && !isNaN(Number(sysDisk.size));
        const hasUsed = sysDisk.used !== undefined && sysDisk.used !== null && !isNaN(Number(sysDisk.used));

        if (hasSize) {
          storageBytesTotal = Number(sysDisk.size);
        }
        if (hasUsed) {
          storageBytesUsed = Number(sysDisk.used);
        }

        if (hasSize && hasUsed && storageBytesTotal! > 0) {
          storagePct = Math.round(((storageBytesUsed! / storageBytesTotal!) * 100) * 10) / 10;
        } else if (sysDisk.usedPercent !== undefined && sysDisk.usedPercent !== null && !isNaN(Number(sysDisk.usedPercent))) {
          storagePct = Math.round(Number(sysDisk.usedPercent) * 10) / 10;
        }
      }

      // Network parsing
      const net = this.parseNetwork(util.net);

      this.isConnected = true;
      this.lastError = null;

      return {
        timestamp: new Date().toISOString(),
        cpu: Math.round(cpuPct * 10) / 10,
        cpuCoresTotal: cpuCores,
        memory: Math.round(memPct * 10) / 10,
        memoryBytesUsed: memUsed,
        memoryBytesTotal: memTotal,
        storage: storagePct,
        storageBytesUsed: storageBytesUsed,
        storageBytesTotal: storageBytesTotal,
        networkRxKbps: net.rxKbps,
        networkTxKbps: net.txKbps,
        uptimeSeconds: null, // CasaOS REST API does not provide numeric uptime; do not fabricate
        latencyMs: Date.now() - startTime
      };
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message || 'Failed to collect CasaOS metrics';
      throw err;
    }
  }

  /**
   * Return rich normalized telemetry directly for MonitoringPoller
   */
  async getNormalizedTelemetry(): Promise<NormalizedTelemetry> {
    const startTime = Date.now();
    const metrics = await this.getMetrics();
    const latencyMs = Date.now() - startTime;

    return {
      id: `tel-${this.config.id || 'casaos'}-${Date.now().toString(36)}`,
      connectionId: this.config.id || 'casaos',
      timestamp: metrics.timestamp,
      cpu: {
        utilizationPct: metrics.cpu,
        coresTotal: metrics.cpuCoresTotal || 1
      },
      memory: {
        usedBytes: metrics.memoryBytesUsed || 0,
        totalBytes: metrics.memoryBytesTotal || 0,
        utilizationPct: metrics.memory
      },
      storage: {
        usedBytes: metrics.storageBytesUsed ?? null,
        totalBytes: metrics.storageBytesTotal ?? null,
        utilizationPct: metrics.storage ?? null
      },
      network: {
        rxBytesPerSec: null,
        txBytesPerSec: null,
        rxKbps: metrics.networkRxKbps,
        txKbps: metrics.networkTxKbps
      },
      uptimeSeconds: null,
      latencyMs: metrics.latencyMs || latencyMs,
      status: 'ONLINE'
    };
  }

  async getEvents(): Promise<SystemEvent[]> {
    return [];
  }

  public getCachedVersion(): string | null {
    return this.cachedVersion;
  }
}
