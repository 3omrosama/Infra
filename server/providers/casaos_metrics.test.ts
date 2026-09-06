import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CasaOSProvider } from './casaos.js';

function createMockProvider(overrides: Record<string, any> = {}) {
  const provider = new CasaOSProvider({
    id: 'casaos-test-1',
    name: 'CasaOS Test Node',
    type: 'CASAOS',
    host: '192.168.1.50',
    port: 80,
    useHttps: false,
    username: 'casaos',
    password: 'correct-password',
    pollIntervalSec: 30,
    ...overrides
  } as any);
  return provider;
}

const mockLoginSuccess = {
  success: 200,
  message: 'ok',
  data: {
    token: {
      access_token: 'jwt-mock-token-abc-123',
      refresh_token: 'jwt-mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 7200
    },
    user: { id: 1, user_name: 'casaos' }
  }
};

const mockUtilizationWithDisk = {
  success: 200,
  message: 'ok',
  data: {
    cpu: {
      percent: 18.5,
      num: 4,
      temperature: 41,
      model: 'Intel Celeron N5105'
    },
    mem: {
      total: 8589934592,
      used: 3435973836,
      free: 5153960756,
      usedPercent: 40.0
    },
    sys_disk: {
      size: 512000000000,
      used: 128000000000,
      avail: 384000000000,
      health: true
    },
    net: [
      {
        name: 'eth0',
        bytesRecv: 10240, // 10 KB
        bytesSent: 20480, // 20 KB
        packetsRecv: 100,
        packetsSent: 150,
        state: 'up'
      }
    ]
  }
};

const mockUtilizationWithoutDisk = {
  success: 200,
  message: 'ok',
  data: {
    cpu: {
      percent: 18.5,
      num: 4,
      temperature: 41,
      model: 'Intel Celeron N5105'
    },
    mem: {
      total: 8589934592,
      used: 3435973836,
      free: 5153960756,
      usedPercent: 40.0
    },
    net: [
      {
        name: 'eth0',
        bytesRecv: 10240,
        bytesSent: 20480,
        packetsRecv: 100,
        packetsSent: 150,
        state: 'up'
      }
    ]
  }
};

describe('CasaOS Native REST API Provider', () => {
  // 1. Successful CasaOS login
  it('1. Successful CasaOS login returns access token and stores in memory', async () => {
    const provider = createMockProvider();
    let loginBodySent: any = null;

    provider['fetchWithTimeout'] = async (url: string, options: RequestInit = {}) => {
      if (url.endsWith('/v1/users/login')) {
        loginBodySent = JSON.parse(options.body as string);
        return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const token = await provider.authenticate();
    assert.strictEqual(token, 'jwt-mock-token-abc-123');
    assert.strictEqual(provider['accessToken'], 'jwt-mock-token-abc-123');
    assert.strictEqual(loginBodySent.username, 'casaos');
    assert.strictEqual(loginBodySent.password, 'correct-password');
  });

  // 2. Failed login
  it('2. Failed login throws descriptive error and sets disconnected', async () => {
    const provider = createMockProvider({ password: 'wrong-password' });

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) {
        return new Response(JSON.stringify({
          success: 401,
          message: 'error_user_not_exist_or_pwd_invalid'
        }), { status: 401 });
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => await provider.authenticate(true),
      (err: Error) => {
        assert.ok(err.message.includes('CasaOS login failed') || err.message.includes('error_user_not_exist_or_pwd_invalid'));
        return true;
      }
    );
    assert.strictEqual(provider['accessToken'], null);
  });

  // 3. Successful telemetry retrieval
  it('3. Successful telemetry retrieval fetches metrics and normalized telemetry', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string, options: RequestInit = {}) => {
      if (url.endsWith('/v1/users/login')) {
        return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      }
      if (url.endsWith('/v1/sys/utilization')) {
        // Verify Authorization header sends raw access_token (not Bearer)
        const auth = (options.headers as any)?.Authorization;
        assert.strictEqual(auth, 'jwt-mock-token-abc-123');
        return new Response(JSON.stringify(mockUtilizationWithDisk), { status: 200 });
      }
      if (url.includes('/v1/sys/disk')) {
        throw new Error('/v1/sys/disk should not be requested');
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.ok(metrics.timestamp);
    assert.strictEqual(metrics.cpu, 18.5);
    assert.strictEqual(metrics.memory, 40.0);
    assert.strictEqual(metrics.storage, 25.0);
    assert.strictEqual(metrics.storageBytesTotal, 512000000000);
    assert.strictEqual(metrics.storageBytesUsed, 128000000000);

    const telemetry = await provider.getNormalizedTelemetry();
    assert.strictEqual(telemetry.cpu.utilizationPct, 18.5);
    assert.strictEqual(telemetry.memory.utilizationPct, 40.0);
    assert.strictEqual(telemetry.storage.utilizationPct, 25.0);
    assert.strictEqual(telemetry.storage.totalBytes, 512000000000);
    assert.strictEqual(telemetry.storage.usedBytes, 128000000000);
    assert.strictEqual(telemetry.status, 'ONLINE');
  });

  // 4. CPU parsing
  it('4. Correctly parses CPU percent and cores', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            cpu: { percent: 45.82, num: 8 }
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.cpu, 45.8);
    assert.strictEqual(metrics.cpuCoresTotal, 8);
  });

  // 5. Memory parsing
  it('5. Correctly parses Memory used, total, and utilization percentage', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            mem: { total: 16000000000, used: 8000000000, usedPercent: 50.0 }
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.memory, 50.0);
    assert.strictEqual(metrics.memoryBytesTotal, 16000000000);
    assert.strictEqual(metrics.memoryBytesUsed, 8000000000);
  });

  // 6. Disk parsing from sys_disk
  it('6. Correctly parses sys_disk size, used, and computes storage percentage', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            cpu: { percent: 10, num: 2 },
            mem: { total: 1000, used: 200, usedPercent: 20 },
            sys_disk: {
              size: 1000000000000,
              used: 750000000000,
              avail: 250000000000,
              health: true
            }
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.storage, 75.0);
    assert.strictEqual(metrics.storageBytesTotal, 1000000000000);
    assert.strictEqual(metrics.storageBytesUsed, 750000000000);

    const telemetry = await provider.getNormalizedTelemetry();
    assert.strictEqual(telemetry.storage.utilizationPct, 75.0);
    assert.strictEqual(telemetry.storage.totalBytes, 1000000000000);
    assert.strictEqual(telemetry.storage.usedBytes, 750000000000);
  });

  // 6b. sys_disk missing
  it('6b. sys_disk missing leaves storage metrics strictly null (never converted to zero)', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify(mockUtilizationWithoutDisk), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.storage, null);
    assert.strictEqual(metrics.storageBytesTotal, null);
    assert.strictEqual(metrics.storageBytesUsed, null);

    const telemetry = await provider.getNormalizedTelemetry();
    assert.strictEqual(telemetry.storage.utilizationPct, null);
    assert.strictEqual(telemetry.storage.totalBytes, null);
    assert.strictEqual(telemetry.storage.usedBytes, null);
  });

  // 6c. /v1/sys/disk is never requested
  it('6c. /v1/sys/disk is never requested during testConnection or getMetrics', async () => {
    const provider = createMockProvider();
    const requestedUrls: string[] = [];

    provider['fetchWithTimeout'] = async (url: string) => {
      requestedUrls.push(url);
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/ping')) return new Response('pong', { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) return new Response(JSON.stringify(mockUtilizationWithDisk), { status: 200 });
      if (url.endsWith('/v1/sys/version')) return new Response(JSON.stringify({ success: 200, data: { current_version: '0.4.4' } }), { status: 200 });
      if (url.includes('/v1/sys/disk')) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response('Not found', { status: 404 });
    };

    const testRes = await provider.testConnection();
    assert.strictEqual(testRes.success, true);

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.storage, 25.0);

    const diskRequested = requestedUrls.some(u => u.includes('/v1/sys/disk'));
    assert.strictEqual(diskRequested, false, '/v1/sys/disk must never be called');
  });

  // 7. Network RX/TX parsing
  it('7. Correctly parses Network RX and TX rates', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            net: [
              { name: 'eth0', bytesRecv: 10240, bytesSent: 20480 },
              { name: 'eth1', bytesRecv: 5120, bytesSent: 10240 }
            ]
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    // Total recv = 15360 bytes / 1024 = 15 Kbps; total sent = 30720 bytes / 1024 = 30 Kbps
    assert.strictEqual(metrics.networkRxKbps, 15);
    assert.strictEqual(metrics.networkTxKbps, 30);
  });

  // 8. Zero network traffic remains zero
  it('8. Zero network traffic strictly remains zero (not null or omitted)', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            net: [
              { name: 'eth0', bytesRecv: 0, bytesSent: 0 }
            ]
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.networkRxKbps, 0);
    assert.strictEqual(metrics.networkTxKbps, 0);
  });

  // 9. Missing network data becomes null
  it('9. Missing or empty network data strictly becomes null (never converted to zero)', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) {
        return new Response(JSON.stringify({
          success: 200,
          data: {
            cpu: { percent: 10 },
            mem: { total: 1000, used: 200 },
            net: [] // Empty network interface list
          }
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.networkRxKbps, null);
    assert.strictEqual(metrics.networkTxKbps, null);

    const parsedNull = provider.parseNetwork(null);
    assert.strictEqual(parsedNull.rxKbps, null);
    assert.strictEqual(parsedNull.txKbps, null);
  });

  // 10. 401 causes one re-authentication and retry
  it('10. 401 Unauthorized causes one re-authentication and retry succeeds', async () => {
    const provider = createMockProvider();
    let loginCount = 0;
    let utilAttempts = 0;

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) {
        loginCount++;
        return new Response(JSON.stringify({
          ...mockLoginSuccess,
          data: {
            token: { access_token: `token-attempt-${loginCount}`, expires_at: Math.floor(Date.now() / 1000) + 3600 }
          }
        }), { status: 200 });
      }
      if (url.endsWith('/v1/sys/utilization')) {
        utilAttempts++;
        if (utilAttempts === 1) {
          // Return 401 on first try
          return new Response(JSON.stringify({ success: 401, message: 'token expired' }), { status: 401 });
        }
        // Succeed on retry
        return new Response(JSON.stringify(mockUtilizationWithDisk), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.cpu, 18.5);
    assert.strictEqual(loginCount, 2, 'Should authenticate initially then re-authenticate on 401');
    assert.strictEqual(utilAttempts, 2, 'Should retry utilization request once');
  });

  // 11. Persistent authentication failure does not loop
  it('11. Persistent 401 failure throws error after one retry and avoids infinite loop', async () => {
    const provider = createMockProvider();
    let loginCount = 0;
    let requestCount = 0;

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) {
        loginCount++;
        return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      }
      if (url.endsWith('/v1/sys/utilization')) {
        requestCount++;
        // Always return 401
        return new Response(JSON.stringify({ success: 401, message: 'unauthorized' }), { status: 401 });
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => await provider.requestCasaOS('/v1/sys/utilization'),
      (err: Error) => {
        assert.ok(err.message.includes('401') || err.message.includes('unauthorized'));
        return true;
      }
    );

    assert.strictEqual(requestCount, 2, 'Must attempt at most 2 requests (original + 1 retry)');
    assert.strictEqual(loginCount, 2, 'Must authenticate at most 2 times');
  });

  // 12. /ping failure marks connection unavailable
  it('12. /ping failure marks testConnection as failed and provider disconnected', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/ping')) {
        return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
      }
      return new Response(JSON.stringify(mockUtilizationWithDisk), { status: 200 });
    };

    const testRes = await provider.testConnection();
    assert.strictEqual(testRes.success, false);
    assert.ok(testRes.message.includes('Ping failed') || testRes.message.includes('500'));
    assert.strictEqual(provider.isConnected, false);
  });

  // 13. Missing uptime remains null
  it('13. Missing uptime strictly remains null (not zero, not fabricated)', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.endsWith('/v1/sys/utilization')) return new Response(JSON.stringify(mockUtilizationWithDisk), { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    const metrics = await provider.getMetrics();
    assert.strictEqual(metrics.uptimeSeconds, null);

    const telemetry = await provider.getNormalizedTelemetry();
    assert.strictEqual(telemetry.uptimeSeconds, null);
  });

  // 14. Provider does not crash when CasaOS API is unavailable
  it('14. Provider cleanly handles unreachable network errors without crashing', async () => {
    const provider = createMockProvider();

    provider['fetchWithTimeout'] = async () => {
      throw new Error('fetch failed: connect ECONNREFUSED 192.168.1.50:80');
    };

    const testRes = await provider.testConnection();
    assert.strictEqual(testRes.success, false);
    assert.ok(testRes.message.includes('ECONNREFUSED'));
    assert.strictEqual(provider.isConnected, false);

    await assert.rejects(
      async () => await provider.getMetrics(),
      (err: Error) => {
        assert.ok(err.message.includes('ECONNREFUSED') || err.message.includes('failed'));
        return true;
      }
    );
    assert.strictEqual(provider.isConnected, false);
    assert.ok(provider.lastError?.includes('ECONNREFUSED'));
  });
});
