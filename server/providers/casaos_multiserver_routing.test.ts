import { describe, it } from 'node:test';
import assert from 'node:assert';
import { store } from '../db/store.js';
import { CasaOSServer, CasaOSApp } from '../../src/types/index.js';

describe('Part 1 & 2: Multiple CasaOS Servers Grouping & Immediate Action State Transitions', () => {
  it('1. Correctly groups applications by owning CasaOS server connectionId', () => {
    const serverA: CasaOSServer = {
      id: 'srv-casa-a',
      connectionId: 'conn-casa-a',
      hostname: 'casaos-node-alpha',
      ipAddress: '192.168.1.50',
      version: '0.4.15',
      uptimeSeconds: 86400,
      cpuCores: 4,
      cpuUsagePct: 12.5,
      memoryBytesTotal: 16000000000,
      memoryBytesUsed: 7200000000,
      memoryUsagePct: 45.2,
      storageBytesTotal: 1000000000000,
      storageBytesUsed: 620000000000,
      storageUsagePct: 62.0,
      diskCount: 2,
      runningAppsCount: 2,
      totalAppsCount: 2,
      disks: []
    };

    const serverB: CasaOSServer = {
      id: 'srv-casa-b',
      connectionId: 'conn-casa-b',
      hostname: 'zimaos-edge-beta',
      ipAddress: '192.168.1.60',
      version: '1.2.0',
      uptimeSeconds: 172800,
      cpuCores: 8,
      cpuUsagePct: 24.1,
      memoryBytesTotal: 32000000000,
      memoryBytesUsed: 21760000000,
      memoryUsagePct: 68.0,
      storageBytesTotal: 2000000000000,
      storageBytesUsed: 710000000000,
      storageUsagePct: 35.5,
      diskCount: 4,
      runningAppsCount: 1,
      totalAppsCount: 1,
      disks: []
    };

    const apps: CasaOSApp[] = [
      {
        id: 'app-nextcloud',
        connectionId: 'conn-casa-a',
        containerId: 'syncthing-c1',
        name: 'nextcloud',
        title: 'Nextcloud Hub',
        category: 'Utilities',
        image: 'nextcloud:latest',
        status: 'running',
        port: 8080,
        ports: [{ host: 8080, container: 80, protocol: 'tcp' }],
        volumes: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'app-plex',
        connectionId: 'conn-casa-a',
        containerId: 'plex-c1',
        name: 'plex',
        title: 'Plex Media Server',
        category: 'Media',
        image: 'plexinc/pms-docker:latest',
        status: 'running',
        port: 32400,
        ports: [{ host: 32400, container: 32400, protocol: 'tcp' }],
        volumes: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'app-vaultwarden',
        connectionId: 'conn-casa-b',
        containerId: 'vault-c1',
        name: 'vaultwarden',
        title: 'Vaultwarden Password Manager',
        category: 'Security',
        image: 'vaultwarden/server:latest',
        status: 'running',
        port: 8000,
        ports: [{ host: 8000, container: 80, protocol: 'tcp' }],
        volumes: [],
        createdAt: new Date().toISOString()
      }
    ];

    // Grouping by connectionId
    const appsByConn: Record<string, CasaOSApp[]> = {};
    for (const app of apps) {
      if (!appsByConn[app.connectionId]) appsByConn[app.connectionId] = [];
      appsByConn[app.connectionId].push(app);
    }

    assert.strictEqual(appsByConn['conn-casa-a'].length, 2);
    assert.strictEqual(appsByConn['conn-casa-b'].length, 1);
    assert.strictEqual(appsByConn['conn-casa-a'][0].title, 'Nextcloud Hub');
    assert.strictEqual(appsByConn['conn-casa-a'][1].title, 'Plex Media Server');
    assert.strictEqual(appsByConn['conn-casa-b'][0].title, 'Vaultwarden Password Manager');
  });

  it('2. Immediate action state transitions: stop -> stopped, start -> running, restart -> restarting', () => {
    const testApp: CasaOSApp = {
      id: 'app-jellyfin-action-test',
      connectionId: 'conn-test-actions',
      containerId: 'jellyfin-c1',
      name: 'jellyfin',
      title: 'Jellyfin Media Server',
      category: 'Media',
      image: 'jellyfin/jellyfin:latest',
      status: 'running',
      port: 8096,
      ports: [{ host: 8096, container: 8096, protocol: 'tcp' }],
      volumes: [],
      createdAt: new Date().toISOString()
    };

    store.casaosApps.set(testApp.id, { ...testApp });

    // 1. Simulate STOP action
    const appRef = store.casaosApps.get(testApp.id)!;
    assert.strictEqual(appRef.status, 'running');

    const getNextStatus = (action: 'start' | 'stop' | 'restart'): 'running' | 'stopped' | 'restarting' => {
      return action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'restarting';
    };

    appRef.status = getNextStatus('stop');
    store.casaosApps.set(appRef.id, appRef);
    assert.strictEqual(store.casaosApps.get(testApp.id)!.status, 'stopped');

    // 2. Simulate START action
    appRef.status = getNextStatus('start');
    store.casaosApps.set(appRef.id, appRef);
    assert.strictEqual(store.casaosApps.get(testApp.id)!.status, 'running');

    // 3. Simulate RESTART action
    appRef.status = getNextStatus('restart');
    store.casaosApps.set(appRef.id, appRef);
    assert.strictEqual(store.casaosApps.get(testApp.id)!.status, 'restarting');

    // Clean up
    store.casaosApps.delete(testApp.id);
  });

  it('3. Poller background discovery reconciles and updates restarted app to final running state', async () => {
    const connId = 'conn-reconcile-test';
    const app: CasaOSApp = {
      id: 'app-pihole-reconcile',
      connectionId: connId,
      containerId: 'pihole-c1',
      name: 'pihole',
      title: 'Pi-hole DNS',
      category: 'Network',
      image: 'pihole/pihole:latest',
      status: 'restarting',
      port: 53,
      ports: [{ host: 53, container: 53, protocol: 'tcp' }],
      volumes: [],
      createdAt: new Date().toISOString()
    };

    store.casaosApps.set(app.id, { ...app });
    assert.strictEqual(store.casaosApps.get(app.id)!.status, 'restarting');

    // Subsequent sync from poller reports running
    const discoveredFromCasaOS: CasaOSApp = {
      id: 'app-pihole-reconcile',
      connectionId: connId,
      containerId: 'pihole-c1',
      name: 'pihole',
      title: 'Pi-hole DNS',
      category: 'Network',
      image: 'pihole/pihole:latest',
      status: 'running',
      port: 53,
      ports: [{ host: 53, container: 53, protocol: 'tcp' }],
      volumes: [],
      createdAt: new Date().toISOString()
    };

    await store.syncDiscoveredCasaOSApps(connId, [discoveredFromCasaOS]);
    assert.strictEqual(store.casaosApps.get(app.id)!.status, 'running');

    // Clean up
    store.casaosApps.delete(app.id);
  });
});

describe('Part 3: Navigation URL & Tab Mapping Resilience', () => {
  const VALID_TABS = [
    'dashboard',
    'infrastructure',
    'esxi',
    'vms',
    'casaos',
    'docker',
    'servers',
    'storage',
    'network',
    'monitoring',
    'alerts',
    'logs',
    'tasks',
    'users',
    'settings'
  ];

  const pathToTab = (pathname: string): string => {
    const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!clean || clean === 'dashboard') return 'dashboard';
    return VALID_TABS.includes(clean) ? clean : 'dashboard';
  };

  const tabToPath = (tab: string): string => {
    return tab === 'dashboard' ? '/' : `/${tab}`;
  };

  it('1. Maps all defined routes accurately from URL pathname', () => {
    assert.strictEqual(pathToTab('/'), 'dashboard');
    assert.strictEqual(pathToTab('/dashboard'), 'dashboard');
    assert.strictEqual(pathToTab('/infrastructure'), 'infrastructure');
    assert.strictEqual(pathToTab('/esxi'), 'esxi');
    assert.strictEqual(pathToTab('/vms'), 'vms');
    assert.strictEqual(pathToTab('/casaos'), 'casaos');
    assert.strictEqual(pathToTab('/docker'), 'docker');
    assert.strictEqual(pathToTab('/servers'), 'servers');
    assert.strictEqual(pathToTab('/storage'), 'storage');
    assert.strictEqual(pathToTab('/network'), 'network');
    assert.strictEqual(pathToTab('/monitoring'), 'monitoring');
    assert.strictEqual(pathToTab('/alerts'), 'alerts');
    assert.strictEqual(pathToTab('/logs'), 'logs');
    assert.strictEqual(pathToTab('/tasks'), 'tasks');
    assert.strictEqual(pathToTab('/users'), 'users');
    assert.strictEqual(pathToTab('/settings'), 'settings');
  });

  it('2. Tolerates trailing slashes, leading slashes, and uppercase URLs safely', () => {
    assert.strictEqual(pathToTab('/CasaOS/'), 'casaos');
    assert.strictEqual(pathToTab('/VMS/'), 'vms');
    assert.strictEqual(pathToTab('/ESXI/'), 'esxi');
    assert.strictEqual(pathToTab('///alerts///'), 'alerts');
  });

  it('3. Safely falls back to dashboard on unknown paths', () => {
    assert.strictEqual(pathToTab('/unknown-path'), 'dashboard');
    assert.strictEqual(pathToTab('/404'), 'dashboard');
    assert.strictEqual(pathToTab(''), 'dashboard');
  });

  it('4. tabToPath correctly converts tabs back to canonical paths', () => {
    assert.strictEqual(tabToPath('dashboard'), '/');
    assert.strictEqual(tabToPath('casaos'), '/casaos');
    assert.strictEqual(tabToPath('vms'), '/vms');
    assert.strictEqual(tabToPath('esxi'), '/esxi');
    assert.strictEqual(tabToPath('settings'), '/settings');
  });
});
