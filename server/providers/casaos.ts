import { BaseInfrastructureProvider } from './base.js';
import { 
  ProviderConnectionConfig, 
  ProviderTestResult, 
  MetricDataPoint, 
  SystemEvent 
} from '../../src/types/index.js';
import { Client } from 'ssh2';

export class CasaOSProvider extends BaseInfrastructureProvider {
  constructor(config: ProviderConnectionConfig) {
    super(config);
  }

  private async executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream.on('close', (code) => {
            conn.end();
            if (code !== 0) reject(new Error(`Command failed with code ${code}`));
            else resolve(output.trim());
          }).on('data', (data) => {
            output += data;
          }).stderr.on('data', (data) => {
            console.error('STDERR: ' + data);
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.config.host,
        port: Number(this.config.port) || 22,
        username: this.config.username,
        password: this.config.password
      });
    });
  }

  async connect(): Promise<boolean> {
    try {
      await this.testConnection();
      this.isConnected = true;
      return true;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    try {
      await this.executeCommand('uptime');
      return {
        success: true,
        message: 'SSH connection established and command executed successfully.',
        latencyMs: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        success: false,
        message: `SSH connection failed: ${err.message}`,
        latencyMs: Date.now() - startTime
      };
    }
  }

  async getMetrics(): Promise<MetricDataPoint> {
    try {
      // Collect host metrics via SSH
      const [cpu, memory, storage, network, uptime] = await Promise.all([
        this.executeCommand("top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'"), // Simplified
        this.executeCommand("free -m | awk 'NR==2{print $3, $2}'"),
        this.executeCommand("df -h / | awk 'NR==2{print $3, $2}'"),
        this.executeCommand("cat /proc/net/dev | grep eth0 | awk '{print $2, $10}'"), // Simplified
        this.executeCommand("cat /proc/uptime | awk '{print $1}'")
      ]);

      const [memUsed, memTotal] = memory.trim().split(/\s+/).map(Number);
      const [diskUsed, diskTotal] = storage.trim().split(/\s+/).map(Number);
      const [rx, tx] = network.trim().split(/\s+/).map(Number);

      return {
        timestamp: new Date().toISOString(),
        cpu: parseFloat(cpu) || 0,
        memory: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
        storage: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
        networkRxKbps: rx / 1024,
        networkTxKbps: tx / 1024,
        uptimeSeconds: parseInt(uptime)
      };
    } catch (err) {
      console.error('Failed to collect CasaOS metrics:', err);
      return {
        timestamp: new Date().toISOString(),
        cpu: 0,
        memory: 0,
        storage: 0,
        networkRxKbps: null,
        networkTxKbps: null
      };
    }
  }

  async getEvents(): Promise<SystemEvent[]> {
    return [];
  }
}
