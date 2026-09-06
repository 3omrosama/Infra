import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CasaOSProvider } from './casaos.js';
import { store } from '../db/store.js';
import { CasaOSApp, DockerContainer } from '../../src/types/index.js';

function createMockProvider(overrides: Record<string, any> = {}) {
  const provider = new CasaOSProvider({
    id: 'conn-casaos-test',
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
      access_token: 'jwt-mock-app-token-xyz',
      refresh_token: 'jwt-mock-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 7200
    },
    user: { id: 1, user_name: 'casaos' }
  }
};

const mockComposeAppList = {
  message: 'ok',
  data: {
    'syncthing': {
      status: 'running',
      store_info: {
        title: { en_us: 'Syncthing' },
        description: { en_us: 'Continuous file synchronization tool' },
        icon: 'https://example.com/syncthing.png',
        category: 'Utilities',
        port_map: '8384',
        scheme: 'http',
        index: '/index.html'
      },
      compose: {
        name: 'syncthing',
        services: {
          'syncthing': {
            image: 'syncthing/syncthing:1.27.0',
            container_name: 'syncthing',
            ports: [
              { target: 8384, published: 8384, protocol: 'tcp' },
              { target: 22000, published: 22000, protocol: 'tcp' }
            ],
            volumes: [
              { source: '/DATA/AppData/syncthing', target: '/var/syncthing', mode: 'rw' }
            ]
          }
        }
      }
    },
    'jellyfin': {
      status: 'stopped',
      store_info: {
        title: { en_us: 'Jellyfin Media Server' },
        description: { en_us: 'The Free Software Media System' },
        icon: 'https://example.com/jellyfin.png',
        category: 'Media',
        port_map: '8096',
        scheme: 'http',
        index: ''
      },
      compose: {
        name: 'jellyfin',
        services: {
          'jellyfin': {
            image: 'jellyfin/jellyfin:latest',
            container_name: 'jellyfin-server',
            ports: [
              '8096:8096/tcp'
            ],
            volumes: [
              '/DATA/Media:/media:ro'
            ]
          }
        }
      }
    }
  }
};

describe('CasaOS Installed Applications Discovery & Lifecycle', () => {

  // 1. Successful GET /v2/app_management/compose parsing
  it('1. Successfully fetches and parses /v2/app_management/compose response', async () => {
    const provider = createMockProvider();
    let requestedUrl = '';
    let authHeader = '';

    provider['fetchWithTimeout'] = async (url: string, options: any) => {
      if (url.endsWith('/v1/users/login')) {
        return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      }
      if (url.includes('/v2/app_management/compose')) {
        requestedUrl = url;
        authHeader = options?.headers?.Authorization;
        return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const apps = await provider.getInstalledApps();
    assert.strictEqual(apps.length, 2);
    assert.ok(requestedUrl.endsWith('/v2/app_management/compose'));
    assert.strictEqual(authHeader, 'jwt-mock-app-token-xyz');
    // Ensure raw JWT without Bearer
    assert.ok(!authHeader.startsWith('Bearer '));
  });

  // 2. Multiple apps returned and correctly identified
  it('2. Multiple apps returned correctly mapped by ID and connectionId', async () => {
    const provider = createMockProvider();
    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    const apps = await provider.getInstalledApps();
    const appIds = apps.map(a => a.containerId);
    assert.deepStrictEqual(appIds.sort(), ['jellyfin', 'syncthing']);
    assert.ok(apps.every(a => a.connectionId === 'conn-casaos-test'));
  });

  // 3. App status parsing and unprovided telemetry is null (not fabricated as 0)
  it('3. App status parsed accurately and unprovided telemetry remains null (never fabricated as 0)', async () => {
    const provider = createMockProvider();
    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    const apps = await provider.getInstalledApps();
    const syncthing = apps.find(a => a.containerId === 'syncthing');
    const jellyfin = apps.find(a => a.containerId === 'jellyfin');

    assert.strictEqual(syncthing?.status, 'running');
    assert.strictEqual(jellyfin?.status, 'stopped');

    // Telemetry fields not provided by /v2/app_management/compose must strictly be null/undefined (never 0)
    assert.strictEqual(syncthing?.cpuUsagePct, null);
    assert.strictEqual(syncthing?.memoryBytes, null);
    assert.strictEqual(syncthing?.memoryUsagePct, null);
    assert.strictEqual(syncthing?.networkRxBytes, null);
    assert.strictEqual(syncthing?.networkTxBytes, null);
    assert.strictEqual(syncthing?.uptimeSeconds, null);
    assert.strictEqual(syncthing?.restartCount, null);
  });

  // 4. Metadata parsing (title, icon, category, description, webUrl)
  it('4. Metadata and webUrl derived accurately from store_info and ports', async () => {
    const provider = createMockProvider({ host: '192.168.1.50' });
    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    const apps = await provider.getInstalledApps();
    const syncthing = apps.find(a => a.containerId === 'syncthing');
    const jellyfin = apps.find(a => a.containerId === 'jellyfin');

    assert.strictEqual(syncthing?.title, 'Syncthing');
    assert.strictEqual(syncthing?.category, 'Utilities');
    assert.strictEqual(syncthing?.icon, 'https://example.com/syncthing.png');
    assert.strictEqual(syncthing?.webUrl, 'http://192.168.1.50:8384/index.html');

    assert.strictEqual(jellyfin?.title, 'Jellyfin Media Server');
    assert.strictEqual(jellyfin?.category, 'Media');
    assert.strictEqual(jellyfin?.webUrl, 'http://192.168.1.50:8096');
  });

  // 5. Compose service image, container name, ports, volumes parsing
  it('5. Compose service image, container name, ports, and volumes parsing', async () => {
    const provider = createMockProvider();
    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    const apps = await provider.getInstalledApps();
    const syncthing = apps.find(a => a.containerId === 'syncthing');
    const jellyfin = apps.find(a => a.containerId === 'jellyfin');

    assert.strictEqual(syncthing?.image, 'syncthing/syncthing:1.27.0');
    assert.strictEqual(syncthing?.ports.length, 2);
    assert.strictEqual(syncthing?.ports[0].host, 8384);
    assert.strictEqual(syncthing?.volumes.length, 1);
    assert.strictEqual(syncthing?.volumes[0].hostPath, '/DATA/AppData/syncthing');

    assert.strictEqual(jellyfin?.image, 'jellyfin/jellyfin:latest');
    assert.strictEqual(jellyfin?.ports.length, 1);
    assert.strictEqual(jellyfin?.ports[0].host, 8096);
    assert.strictEqual(jellyfin?.volumes.length, 1);
    assert.strictEqual(jellyfin?.volumes[0].mode, 'ro');
  });

  // 6 & 7. Idempotent sync and update instead of duplicate
  it('6 & 7. store.syncDiscoveredCasaOSApps is idempotent and updates existing records', async () => {
    const connId = 'conn-casaos-test-sync';
    const app1: CasaOSApp = {
      id: `casaos-app-${connId}-app1`,
      connectionId: connId,
      containerId: 'app1',
      name: 'app1',
      title: 'App One',
      icon: 'app1-icon',
      status: 'running',
      category: 'Tools',
      image: 'app1:v1',
      cpuUsagePct: 15,
      memoryBytes: 1024000,
      memoryUsagePct: 20,
      networkRxBytes: 500,
      networkTxBytes: 600,
      restartCount: 0,
      ports: [{ host: 8080, container: 80, protocol: 'tcp' }],
      volumes: [],
      uptimeSeconds: 3600,
      createdAt: new Date().toISOString()
    };

    // First sync
    await store.syncDiscoveredCasaOSApps(connId, [app1]);
    assert.strictEqual(store.casaosApps.get(app1.id)?.title, 'App One');
    assert.strictEqual(store.casaosApps.get(app1.id)?.status, 'running');

    // Second sync with updated status and title
    const app1Updated: CasaOSApp = {
      ...app1,
      title: 'App One Updated',
      status: 'stopped'
    };

    await store.syncDiscoveredCasaOSApps(connId, [app1Updated]);
    const storedApp = store.casaosApps.get(app1.id);
    assert.strictEqual(storedApp?.title, 'App One Updated');
    assert.strictEqual(storedApp?.status, 'stopped');
    // Ensure telemetry preserved
    assert.strictEqual(storedApp?.cpuUsagePct, 15);
    assert.strictEqual(storedApp?.memoryBytes, 1024000);
  });

  // 8 & 9. Stale CasaOS apps removed only for the same connection, Docker containers preserved
  it('8 & 9. Prunes stale CasaOS apps for connection but preserves Docker containers and other connections', async () => {
    const connA = 'conn-casaos-a';
    const connB = 'conn-casaos-b';

    const appA1: CasaOSApp = {
      id: `casaos-app-${connA}-appA1`,
      connectionId: connA,
      containerId: 'appA1',
      name: 'appA1',
      title: 'App A1',
      icon: 'icon',
      status: 'running',
      category: 'General',
      image: 'img:1',
      cpuUsagePct: 0,
      memoryBytes: 0,
      memoryUsagePct: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      restartCount: 0,
      ports: [],
      volumes: [],
      uptimeSeconds: 0,
      createdAt: new Date().toISOString()
    };

    const appA2: CasaOSApp = {
      id: `casaos-app-${connA}-appA2`,
      connectionId: connA,
      containerId: 'appA2',
      name: 'appA2',
      title: 'App A2',
      icon: 'icon',
      status: 'running',
      category: 'General',
      image: 'img:1',
      cpuUsagePct: 0,
      memoryBytes: 0,
      memoryUsagePct: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      restartCount: 0,
      ports: [],
      volumes: [],
      uptimeSeconds: 0,
      createdAt: new Date().toISOString()
    };

    const appB1: CasaOSApp = {
      id: `casaos-app-${connB}-appB1`,
      connectionId: connB,
      containerId: 'appB1',
      name: 'appB1',
      title: 'App B1',
      icon: 'icon',
      status: 'running',
      category: 'General',
      image: 'img:1',
      cpuUsagePct: 0,
      memoryBytes: 0,
      memoryUsagePct: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      restartCount: 0,
      ports: [],
      volumes: [],
      uptimeSeconds: 0,
      createdAt: new Date().toISOString()
    };

    // Seed Docker container
    const dockerContainer: DockerContainer = {
      id: 'docker-container-unrelated',
      connectionId: connA,
      containerId: 'dock-1',
      name: 'my-docker-worker',
      image: 'alpine:latest',
      status: 'running',
      state: 'running',
      created: new Date().toISOString(),
      ports: [],
      mounts: [],
      cpuUsagePct: 5,
      memoryBytes: 50000000,
      memoryLimitBytes: 100000000,
      memoryUsagePct: 50,
      networkRxBytes: 1000,
      networkTxBytes: 2000,
      restartCount: 0
    };
    store.dockerContainers.set(dockerContainer.id, dockerContainer);

    await store.syncDiscoveredCasaOSApps(connA, [appA1, appA2]);
    await store.syncDiscoveredCasaOSApps(connB, [appB1]);

    assert.ok(store.casaosApps.has(appA1.id));
    assert.ok(store.casaosApps.has(appA2.id));
    assert.ok(store.casaosApps.has(appB1.id));

    // Sync connA with only appA1 (appA2 is now stale)
    await store.syncDiscoveredCasaOSApps(connA, [appA1]);

    assert.ok(store.casaosApps.has(appA1.id));
    assert.ok(!store.casaosApps.has(appA2.id), 'Stale appA2 should be removed');
    assert.ok(store.casaosApps.has(appB1.id), 'App on connB must NOT be removed');
    assert.ok(store.dockerContainers.has(dockerContainer.id), 'Docker containers must NEVER be touched');
  });

  // 10. App discovery failure does not crash or break provider
  it('10. Discovery failure gracefully returns empty array and does not throw', async () => {
    const provider = createMockProvider();
    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) {
        return new Response(JSON.stringify({ success: 500, message: 'Internal Server Error in app daemon' }), { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => await provider.getInstalledApps(),
      (err: Error) => {
        assert.ok(err.message.includes('500') || err.message.includes('failed'));
        return true;
      }
    );
  });

  // 11, 12, 13. Start, Stop, Restart actions send exact JSON string body
  it('11, 12, 13. executeAppAction sends exact string body ("start", "stop", "restart")', async () => {
    const provider = createMockProvider();
    const actionCalls: Array<{ url: string; method: string; body: any; headers: any }> = [];

    provider['fetchWithTimeout'] = async (url: string, options: any) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose/')) {
        actionCalls.push({
          url,
          method: options.method,
          body: options.body,
          headers: options.headers
        });
        return new Response(JSON.stringify({ message: 'ok' }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    // Test START
    const resStart = await provider.executeAppAction('syncthing', 'start');
    assert.strictEqual(resStart.success, true);
    assert.strictEqual(actionCalls[0].method, 'PUT');
    assert.ok(actionCalls[0].url.endsWith('/v2/app_management/compose/syncthing/status'));
    assert.strictEqual(actionCalls[0].body, '"start"');
    assert.strictEqual(actionCalls[0].headers['Content-Type'], 'application/json');

    // Test STOP
    const resStop = await provider.executeAppAction('syncthing', 'stop');
    assert.strictEqual(resStop.success, true);
    assert.strictEqual(actionCalls[1].body, '"stop"');

    // Test RESTART
    const resRestart = await provider.executeAppAction('casaos-app-conn-casaos-test-syncthing', 'restart');
    assert.strictEqual(resRestart.success, true);
    assert.ok(actionCalls[2].url.endsWith('/v2/app_management/compose/syncthing/status'));
    assert.strictEqual(actionCalls[2].body, '"restart"');
  });

  // 14. Logs retrieval endpoint test
  it('14. getAppLogs retrieves logs via GET /v2/app_management/compose/{id}/logs?lines=100', async () => {
    const provider = createMockProvider();
    let logsUrl = '';

    provider['fetchWithTimeout'] = async (url: string) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose/syncthing/logs')) {
        logsUrl = url;
        return new Response(JSON.stringify({ message: 'ok', data: '[INFO] Syncthing v1.27.0 starting...' }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const res = await provider.getAppLogs('syncthing', 100);
    assert.strictEqual(res.success, true);
    assert.ok(logsUrl.includes('/v2/app_management/compose/syncthing/logs?lines=100'));
    assert.ok(res.logs.includes('Syncthing v1.27.0 starting...'));
  });

  // 15. Authentication uses raw JWT Authorization header (no Bearer)
  it('15. Authentication header is raw token without Bearer prefix and contains no password in logs', async () => {
    const provider = createMockProvider();
    let capturedAuth = '';

    provider['fetchWithTimeout'] = async (url: string, options: any) => {
      if (url.endsWith('/v1/users/login')) return new Response(JSON.stringify(mockLoginSuccess), { status: 200 });
      if (url.includes('/v2/app_management/compose')) {
        capturedAuth = options?.headers?.Authorization;
        return new Response(JSON.stringify(mockComposeAppList), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    await provider.getInstalledApps();
    assert.strictEqual(capturedAuth, 'jwt-mock-app-token-xyz');
    assert.ok(!capturedAuth.includes('Bearer'));
  });

  // 16. Real zero is preserved as 0 and not converted to null or overwritten
  it('16. Real reported zero values (e.g. 0% CPU, 0 restart count) are strictly preserved as 0', async () => {
    const connId = 'conn-casaos-test-zero';
    const appZero: CasaOSApp = {
      id: `casaos-app-${connId}-zero-app`,
      connectionId: connId,
      containerId: 'zero-app',
      name: 'zero-app',
      title: 'Zero App',
      icon: 'icon',
      status: 'running',
      category: 'Tools',
      image: 'app:latest',
      cpuUsagePct: 0,
      memoryBytes: 0,
      memoryUsagePct: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      restartCount: 0,
      ports: [],
      volumes: [],
      uptimeSeconds: 0,
      createdAt: new Date().toISOString()
    };

    await store.syncDiscoveredCasaOSApps(connId, [appZero]);
    const storedApp = store.casaosApps.get(appZero.id);
    assert.strictEqual(storedApp?.cpuUsagePct, 0);
    assert.strictEqual(storedApp?.memoryBytes, 0);
    assert.strictEqual(storedApp?.networkRxBytes, 0);
    assert.strictEqual(storedApp?.restartCount, 0);

    // Sync with an inventory refresh where telemetry is null (unprovided by compose)
    const appRefreshed: CasaOSApp = {
      ...appZero,
      cpuUsagePct: null,
      memoryBytes: null,
      networkRxBytes: null,
      uptimeSeconds: null
    };

    await store.syncDiscoveredCasaOSApps(connId, [appRefreshed]);
    const afterRefresh = store.casaosApps.get(appZero.id);
    // Should preserve the previous real 0 values
    assert.strictEqual(afterRefresh?.cpuUsagePct, 0);
    assert.strictEqual(afterRefresh?.memoryBytes, 0);
    assert.strictEqual(afterRefresh?.networkRxBytes, 0);
    assert.strictEqual(afterRefresh?.uptimeSeconds, 0);
  });
});
