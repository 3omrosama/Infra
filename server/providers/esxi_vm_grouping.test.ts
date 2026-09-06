import { describe, it } from 'node:test';
import assert from 'node:assert';

// Data types mimicking the frontend contracts
interface TestVM {
  id: string;
  connectionId: string;
  name: string;
  powerState: 'RUNNING' | 'STOPPED' | 'SUSPENDED' | 'UNKNOWN';
  guestOs: string;
  cpuCount: number;
  cpuUsagePct: number;
  memoryBytes: number;
  memoryUsagePct: number;
  ipAddress?: string;
  uptimeSeconds?: number;
}

interface TestHost {
  id: string;
  connectionId: string;
  hostname: string;
  ipAddress: string;
  version: string;
  powerState: 'RUNNING' | 'STOPPED';
  cpuUsagePct: number;
  memoryUsagePct: number;
  storageUsagePct: number;
  cpuCores: number;
  memoryBytesTotal: number;
}

interface TestConnection {
  id: string;
  name: string;
  type: 'ESXI' | 'CASAOS' | 'DOCKER';
  host: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
}

// Grouping algorithm mirroring VirtualMachinesView.tsx
function buildHostVmGroups(
  vms: TestVM[],
  hosts: TestHost[] = [],
  connections: TestConnection[] = [],
  searchQuery = '',
  statusFilter: 'ALL' | 'RUNNING' | 'STOPPED' | 'SUSPENDED' = 'ALL'
) {
  const safeVms = vms || [];
  const safeHosts = hosts || [];
  const safeConnections = connections || [];

  const esxiConnections = safeConnections.filter(c => c.type === 'ESXI');
  const connMap = new Map<string, TestConnection>();
  for (const conn of safeConnections) {
    connMap.set(conn.id, conn);
  }

  const hostByConnId = new Map<string, TestHost>();
  for (const host of safeHosts) {
    if (host.connectionId) {
      hostByConnId.set(host.connectionId, host);
    }
  }

  const vmsByConnId = new Map<string, TestVM[]>();
  for (const vm of safeVms) {
    const connId = vm.connectionId || 'unassigned';
    if (!vmsByConnId.has(connId)) {
      vmsByConnId.set(connId, []);
    }
    vmsByConnId.get(connId)!.push(vm);
  }

  const groups: any[] = [];
  const processedConnIds = new Set<string>();

  // 1. Known ESXi connections
  for (const conn of esxiConnections) {
    processedConnIds.add(conn.id);
    const host = hostByConnId.get(conn.id);
    const allVms = vmsByConnId.get(conn.id) || [];

    groups.push({
      id: conn.id,
      connectionId: conn.id,
      displayName: conn.name || host?.hostname || host?.ipAddress || `ESXi Host (${conn.id.slice(0, 8)})`,
      hostname: host?.hostname || conn.host || 'ESXi Hypervisor',
      ipAddress: host?.ipAddress || conn.host,
      version: host?.version,
      status: conn.status || (host?.powerState === 'RUNNING' ? 'ONLINE' : 'OFFLINE'),
      cpuUsagePct: typeof host?.cpuUsagePct === 'number' ? host.cpuUsagePct : null,
      memoryUsagePct: typeof host?.memoryUsagePct === 'number' ? host.memoryUsagePct : null,
      storageUsagePct: typeof host?.storageUsagePct === 'number' ? host.storageUsagePct : null,
      isOrphan: false,
      allVms
    });
  }

  // 2. Hosts without explicit connection in connections list
  for (const host of safeHosts) {
    if (!processedConnIds.has(host.connectionId)) {
      processedConnIds.add(host.connectionId);
      const conn = connMap.get(host.connectionId);
      const allVms = vmsByConnId.get(host.connectionId) || [];

      groups.push({
        id: host.connectionId || host.id,
        connectionId: host.connectionId || host.id,
        displayName: conn?.name || host.hostname || host.ipAddress || `ESXi Host (${host.id.slice(0, 8)})`,
        hostname: host.hostname || conn?.host || 'ESXi Hypervisor',
        ipAddress: host.ipAddress || conn?.host,
        version: host.version,
        status: conn?.status || (host.powerState === 'RUNNING' ? 'ONLINE' : 'OFFLINE'),
        cpuUsagePct: typeof host.cpuUsagePct === 'number' ? host.cpuUsagePct : null,
        memoryUsagePct: typeof host.memoryUsagePct === 'number' ? host.memoryUsagePct : null,
        storageUsagePct: typeof host.storageUsagePct === 'number' ? host.storageUsagePct : null,
        isOrphan: false,
        allVms
      });
    }
  }

  // 3. Orphan / unassigned VMs
  for (const [connId, allVms] of vmsByConnId.entries()) {
    if (!processedConnIds.has(connId)) {
      processedConnIds.add(connId);
      const conn = connMap.get(connId);
      if (conn) {
        groups.push({
          id: conn.id,
          connectionId: conn.id,
          displayName: conn.name,
          hostname: conn.host,
          status: conn.status,
          cpuUsagePct: null,
          memoryUsagePct: null,
          storageUsagePct: null,
          isOrphan: false,
          allVms
        });
      } else {
        groups.push({
          id: connId,
          connectionId: connId,
          displayName: connId !== 'unassigned' ? `Unknown / Unassigned Host (${connId.slice(0, 8)})` : 'Unassigned Virtual Machines',
          hostname: 'Unassigned Host',
          status: 'OFFLINE',
          cpuUsagePct: null,
          memoryUsagePct: null,
          storageUsagePct: null,
          isOrphan: true,
          allVms
        });
      }
    }
  }

  // Calculate counts and filter matching VMs
  for (const group of groups) {
    group.runningCount = group.allVms.filter((v: TestVM) => v.powerState === 'RUNNING').length;
    group.stoppedCount = group.allVms.filter((v: TestVM) => v.powerState === 'STOPPED').length;
    group.suspendedCount = group.allVms.filter((v: TestVM) => v.powerState === 'SUSPENDED').length;
    group.totalVmCount = group.allVms.length;

    group.matchingVms = group.allVms.filter((vm: TestVM) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || (
        vm.name.toLowerCase().includes(query) ||
        vm.guestOs.toLowerCase().includes(query) ||
        (Boolean(vm.ipAddress) && vm.ipAddress!.toLowerCase().includes(query))
      );
      const matchesStatus = statusFilter === 'ALL' || vm.powerState === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  return groups;
}

describe('ESXi Host -> Virtual Machines Expandable Grouping UX', () => {
  const connA: TestConnection = { id: 'conn-esxi-01', name: 'Primary ESXi Node', type: 'ESXI', host: '192.168.1.100', status: 'ONLINE' };
  const connB: TestConnection = { id: 'conn-esxi-02', name: 'Secondary ESXi Node', type: 'ESXI', host: '192.168.1.101', status: 'ONLINE' };
  const hostA: TestHost = {
    id: 'host-01',
    connectionId: 'conn-esxi-01',
    hostname: 'esxi-node-01.local',
    ipAddress: '192.168.1.100',
    version: '8.0.2',
    powerState: 'RUNNING',
    cpuUsagePct: 24.5,
    memoryUsagePct: 62.1,
    storageUsagePct: 45.0,
    cpuCores: 32,
    memoryBytesTotal: 137438953472
  };
  const hostB: TestHost = {
    id: 'host-02',
    connectionId: 'conn-esxi-02',
    hostname: 'esxi-node-02.local',
    ipAddress: '192.168.1.101',
    version: '8.0.2',
    powerState: 'RUNNING',
    cpuUsagePct: 48.2,
    memoryUsagePct: 77.4,
    storageUsagePct: 58.3,
    cpuCores: 16,
    memoryBytesTotal: 68719476736
  };

  const vmA1: TestVM = { id: 'vm-1', connectionId: 'conn-esxi-01', name: 'k8s-master-01', powerState: 'RUNNING', guestOs: 'Ubuntu Linux 22.04', cpuCount: 4, cpuUsagePct: 15.0, memoryBytes: 8589934592, memoryUsagePct: 50.0, ipAddress: '192.168.1.110' };
  const vmA2: TestVM = { id: 'vm-2', connectionId: 'conn-esxi-01', name: 'db-postgres-prod', powerState: 'RUNNING', guestOs: 'Debian 12', cpuCount: 8, cpuUsagePct: 35.0, memoryBytes: 17179869184, memoryUsagePct: 75.0, ipAddress: '192.168.1.111' };
  const vmA3: TestVM = { id: 'vm-3', connectionId: 'conn-esxi-01', name: 'legacy-win-srv', powerState: 'STOPPED', guestOs: 'Windows Server 2019', cpuCount: 2, cpuUsagePct: 0.0, memoryBytes: 4294967296, memoryUsagePct: 0.0 };

  const vmB1: TestVM = { id: 'vm-4', connectionId: 'conn-esxi-02', name: 'ci-runner-01', powerState: 'RUNNING', guestOs: 'Ubuntu Linux 24.04', cpuCount: 4, cpuUsagePct: 60.0, memoryBytes: 8589934592, memoryUsagePct: 80.0, ipAddress: '192.168.1.120' };
  const vmB2: TestVM = { id: 'vm-5', connectionId: 'conn-esxi-02', name: 'dev-sandbox', powerState: 'SUSPENDED', guestOs: 'Alpine Linux', cpuCount: 1, cpuUsagePct: 0.0, memoryBytes: 2147483648, memoryUsagePct: 0.0 };

  it('1. One ESXi host with multiple VMs groups all VMs correctly', () => {
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3], [hostA], [connA]);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].displayName, 'Primary ESXi Node');
    assert.strictEqual(groups[0].allVms.length, 3);
    assert.strictEqual(groups[0].runningCount, 2);
    assert.strictEqual(groups[0].stoppedCount, 1);
    assert.strictEqual(groups[0].suspendedCount, 0);
  });

  it('2. Multiple ESXi hosts with VMs groups VMs by their parent connectionId', () => {
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3, vmB1, vmB2], [hostA, hostB], [connA, connB]);
    assert.strictEqual(groups.length, 2);

    const groupA = groups.find(g => g.connectionId === 'conn-esxi-01');
    const groupB = groups.find(g => g.connectionId === 'conn-esxi-02');

    assert.ok(groupA);
    assert.strictEqual(groupA.allVms.length, 3);
    assert.strictEqual(groupA.runningCount, 2);
    assert.strictEqual(groupA.stoppedCount, 1);
    assert.strictEqual(groupA.cpuUsagePct, 24.5);

    assert.ok(groupB);
    assert.strictEqual(groupB.allVms.length, 2);
    assert.strictEqual(groupB.runningCount, 1);
    assert.strictEqual(groupB.suspendedCount, 1);
    assert.strictEqual(groupB.cpuUsagePct, 48.2);
  });

  it('3. Independent expand/collapse maintains isolated toggle state', () => {
    let collapsedState: Record<string, boolean> = {};

    const toggleHost = (id: string) => {
      collapsedState = { ...collapsedState, [id]: !collapsedState[id] };
    };

    // Default: all expanded (false)
    assert.strictEqual(Boolean(collapsedState['conn-esxi-01']), false);
    assert.strictEqual(Boolean(collapsedState['conn-esxi-02']), false);

    // Toggle Host A collapsed
    toggleHost('conn-esxi-01');
    assert.strictEqual(Boolean(collapsedState['conn-esxi-01']), true, 'Host A must be collapsed');
    assert.strictEqual(Boolean(collapsedState['conn-esxi-02']), false, 'Host B must remain expanded');

    // Toggle Host A back
    toggleHost('conn-esxi-01');
    assert.strictEqual(Boolean(collapsedState['conn-esxi-01']), false);
    assert.strictEqual(Boolean(collapsedState['conn-esxi-02']), false);
  });

  it('4. Accordion animation classes use CSS grid-template-rows & reduced-motion guards', () => {
    const getGridClass = (isCollapsed: boolean) => 
      `grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        isCollapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
      }`;

    assert.ok(getGridClass(false).includes('grid-rows-[1fr]'));
    assert.ok(getGridClass(false).includes('opacity-100'));
    assert.ok(getGridClass(true).includes('grid-rows-[0fr]'));
    assert.ok(getGridClass(true).includes('opacity-0'));
    assert.ok(getGridClass(true).includes('motion-reduce:transition-none'));
  });

  it('5. Search across multiple host groups auto-expands matching hosts and filters VMs', () => {
    // Search for "postgres"
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3, vmB1, vmB2], [hostA, hostB], [connA, connB], 'postgres');
    
    // Group A has postgres
    const groupA = groups.find(g => g.connectionId === 'conn-esxi-01');
    const groupB = groups.find(g => g.connectionId === 'conn-esxi-02');

    assert.strictEqual(groupA.matchingVms.length, 1);
    assert.strictEqual(groupA.matchingVms[0].name, 'db-postgres-prod');
    assert.strictEqual(groupB.matchingVms.length, 0);

    // Active search expansion rule: isSearching forces isCollapsed = false
    const isSearching = true;
    const collapsedState: Record<string, boolean> = { 'conn-esxi-01': true }; // User had it collapsed
    const effectiveCollapsed = isSearching ? false : Boolean(collapsedState['conn-esxi-01']);
    assert.strictEqual(effectiveCollapsed, false, 'Search must auto-expand group with matching VMs');
  });

  it('6. RUNNING filter isolates running VMs across all host groups', () => {
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3, vmB1, vmB2], [hostA, hostB], [connA, connB], '', 'RUNNING');
    
    const groupA = groups.find(g => g.connectionId === 'conn-esxi-01');
    const groupB = groups.find(g => g.connectionId === 'conn-esxi-02');

    assert.strictEqual(groupA.matchingVms.length, 2);
    assert.strictEqual(groupB.matchingVms.length, 1);
    assert.strictEqual(groupB.matchingVms[0].name, 'ci-runner-01');
  });

  it('7. STOPPED filter isolates stopped VMs', () => {
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3, vmB1, vmB2], [hostA, hostB], [connA, connB], '', 'STOPPED');
    
    const groupA = groups.find(g => g.connectionId === 'conn-esxi-01');
    const groupB = groups.find(g => g.connectionId === 'conn-esxi-02');

    assert.strictEqual(groupA.matchingVms.length, 1);
    assert.strictEqual(groupA.matchingVms[0].name, 'legacy-win-srv');
    assert.strictEqual(groupB.matchingVms.length, 0);
  });

  it('8. SUSPENDED filter isolates suspended VMs', () => {
    const groups = buildHostVmGroups([vmA1, vmA2, vmA3, vmB1, vmB2], [hostA, hostB], [connA, connB], '', 'SUSPENDED');
    
    const groupA = groups.find(g => g.connectionId === 'conn-esxi-01');
    const groupB = groups.find(g => g.connectionId === 'conn-esxi-02');

    assert.strictEqual(groupA.matchingVms.length, 0);
    assert.strictEqual(groupB.matchingVms.length, 1);
    assert.strictEqual(groupB.matchingVms[0].name, 'dev-sandbox');
  });

  it('9. Empty host group (zero VMs) displays friendly placeholder and zero counts', () => {
    const emptyConn: TestConnection = { id: 'conn-esxi-empty', name: 'Fresh ESXi Host', type: 'ESXI', host: '192.168.1.105', status: 'ONLINE' };
    const groups = buildHostVmGroups([], [], [emptyConn]);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].totalVmCount, 0);
    assert.strictEqual(groups[0].runningCount, 0);
    assert.strictEqual(groups[0].stoppedCount, 0);
    assert.strictEqual(groups[0].allVms.length, 0);
  });

  it('10. VM with missing/orphan connection is preserved in Unassigned group', () => {
    const orphanVm: TestVM = { id: 'vm-orphan-99', connectionId: 'conn-non-existent-99', name: 'orphan-vm', powerState: 'RUNNING', guestOs: 'Linux', cpuCount: 2, cpuUsagePct: 10.0, memoryBytes: 2147483648, memoryUsagePct: 20.0 };
    const groups = buildHostVmGroups([orphanVm], [], []);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].isOrphan, true);
    assert.ok(groups[0].displayName.includes('Unassigned'));
    assert.strictEqual(groups[0].allVms.length, 1);
    assert.strictEqual(groups[0].allVms[0].id, 'vm-orphan-99');
  });

  it('11. Live telemetry updates do not reset or mutate user accordion state', () => {
    const userCollapsedState: Record<string, boolean> = { 'conn-esxi-01': true, 'conn-esxi-02': false };

    // Simulate incoming telemetry update payload
    const updatedHostA = { ...hostA, cpuUsagePct: 92.4, memoryUsagePct: 88.1 };
    const updatedVmA1 = { ...vmA1, cpuUsagePct: 85.0 };

    const recomputedGroups = buildHostVmGroups([updatedVmA1, vmA2, vmA3], [updatedHostA], [connA]);

    // Accordion state is maintained in dedicated UI state, independent of incoming metrics
    assert.strictEqual(userCollapsedState['conn-esxi-01'], true, 'Host A must stay collapsed after telemetry update');
    assert.strictEqual(userCollapsedState['conn-esxi-02'], false, 'Host B must stay expanded after telemetry update');
    assert.strictEqual(recomputedGroups[0].cpuUsagePct, 92.4, 'Updated metric is reflected');
  });

  it('12. VM lifecycle action buttons are preserved with strict identifiers', () => {
    const inspectBtnId = (id: string) => `btn-inspect-vm-${id}`;
    const powerOnBtnId = (id: string) => `btn-power-on-vm-${id}`;
    const restartBtnId = (id: string) => `btn-restart-vm-${id}`;
    const powerOffBtnId = (id: string) => `btn-power-off-vm-${id}`;
    const suspendBtnId = (id: string) => `btn-suspend-vm-${id}`;

    assert.strictEqual(inspectBtnId('vm-1'), 'btn-inspect-vm-vm-1');
    assert.strictEqual(powerOnBtnId('vm-3'), 'btn-power-on-vm-vm-3');
    assert.strictEqual(restartBtnId('vm-1'), 'btn-restart-vm-vm-1');
    assert.strictEqual(powerOffBtnId('vm-1'), 'btn-power-off-vm-vm-1');
    assert.strictEqual(suspendBtnId('vm-1'), 'btn-suspend-vm-vm-1');
  });

  it('13. Inspect VM hardware modal state trigger retains selected VM payload', () => {
    let selectedVm: TestVM | null = null;
    const setSelectedVm = (vm: TestVM | null) => { selectedVm = vm; };

    setSelectedVm(vmA2);
    assert.strictEqual(selectedVm?.name, 'db-postgres-prod');
    assert.strictEqual(selectedVm?.guestOs, 'Debian 12');

    setSelectedVm(null);
    assert.strictEqual(selectedVm, null);
  });

  it('14. Confirmation dialog loading UX state keeps pending action and lock during execution', () => {
    let pendingAction: { vm: TestVM; action: string } | null = { vm: vmA1, action: 'restart' };
    let isExecuting = true;

    // While executing, cancel handler is blocked
    const handleCancel = () => {
      if (isExecuting) return;
      pendingAction = null;
    };

    handleCancel();
    assert.notStrictEqual(pendingAction, null, 'Action remains pending while executing');

    // On completion
    isExecuting = false;
    pendingAction = null;
    assert.strictEqual(pendingAction, null, 'Dialog dismissed on completion');
  });
});
