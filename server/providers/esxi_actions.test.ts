import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ESXiProvider } from './esxi.js';
import { store } from '../db/store.js';
import { ESXiSoapDaemon } from '../services/esxiSoapDaemon.js';
import { VirtualMachine } from '../../src/types/index.js';

describe('ESXi VM Lifecycle Actions & Security Validations', () => {
  const daemonPort = 7445;
  const daemon = new ESXiSoapDaemon(daemonPort);
  const connId = 'test-esxi-conn-actions';
  const otherConnId = 'other-esxi-conn-actions';

  let provider: ESXiProvider;

  before(async () => {
    await daemon.start();

    provider = new ESXiProvider({
      id: connId,
      name: 'Test ESXi Host',
      type: 'ESXI',
      host: '127.0.0.1',
      port: daemonPort,
      username: 'root',
      password: 'password123',
      useHttps: true,
      skipSslVerify: true
    } as any);

    store.connections.set(connId, {
      id: connId,
      name: 'Test ESXi Host',
      type: 'ESXI',
      host: '127.0.0.1',
      port: daemonPort,
      useHttps: true,
      skipSslVerify: true,
      status: 'ONLINE',
      pollIntervalSec: 30,
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  after(async () => {
    await daemon.stop();
  });

  it('1. Power On: executes PowerOnVM_Task with correct MORef and updates VM powerState to RUNNING', async () => {
    const vm: VirtualMachine = {
      id: 'vm-test-pwr-on',
      connectionId: connId,
      externalVmId: 'vm-101',
      name: 'prod-k8s-node-01',
      powerState: 'STOPPED',
      cpuCount: 4,
      cpuUsagePct: 0,
      memoryBytes: 8589934592,
      memoryUsagePct: 0,
      storageBytes: 107374182400,
      storageUsagePct: 50,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-on');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('completed successfully'));

    const updatedVm = store.virtualMachines.get(vm.id);
    assert.strictEqual(updatedVm?.powerState, 'RUNNING');
  });

  it('2. Power Off: executes PowerOffVM_Task with correct MORef and updates VM powerState to STOPPED', async () => {
    const vm: VirtualMachine = {
      id: 'vm-test-pwr-off',
      connectionId: connId,
      externalVmId: 'vm-102',
      name: 'prod-db-postgres-replica',
      powerState: 'RUNNING',
      cpuCount: 8,
      cpuUsagePct: 45,
      memoryBytes: 17179869184,
      memoryUsagePct: 60,
      storageBytes: 214748364800,
      storageUsagePct: 40,
      uptimeSeconds: 125000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-off');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('completed successfully'));

    const updatedVm = store.virtualMachines.get(vm.id);
    assert.strictEqual(updatedVm?.powerState, 'STOPPED');
    assert.strictEqual(updatedVm?.cpuUsagePct, 0);
    assert.strictEqual(updatedVm?.memoryUsagePct, 0);
  });

  it('3. Restart / Reset: executes ResetVM_Task with correct MORef and sets powerState to RUNNING and resets uptime', async () => {
    const vm: VirtualMachine = {
      id: 'vm-test-restart',
      connectionId: connId,
      externalVmId: 'vm-103',
      name: 'prod-redis-sentinel-02',
      powerState: 'RUNNING',
      cpuCount: 2,
      cpuUsagePct: 20,
      memoryBytes: 4294967296,
      memoryUsagePct: 30,
      storageBytes: 53687091200,
      storageUsagePct: 15,
      uptimeSeconds: 84000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'restart');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('completed successfully'));

    const updatedVm = store.virtualMachines.get(vm.id);
    assert.strictEqual(updatedVm?.powerState, 'RUNNING');
    assert.strictEqual(updatedVm?.uptimeSeconds, 0);
  });

  it('4. Suspend: executes SuspendVM_Task with correct MORef and updates VM powerState to SUSPENDED', async () => {
    const vm: VirtualMachine = {
      id: 'vm-test-suspend',
      connectionId: connId,
      externalVmId: 'vm-104',
      name: 'staging-qa-runner-02',
      powerState: 'RUNNING',
      cpuCount: 4,
      cpuUsagePct: 10,
      memoryBytes: 8589934592,
      memoryUsagePct: 25,
      storageBytes: 107374182400,
      storageUsagePct: 20,
      uptimeSeconds: 45000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'suspend');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('completed successfully'));

    const updatedVm = store.virtualMachines.get(vm.id);
    assert.strictEqual(updatedVm?.powerState, 'SUSPENDED');
    assert.strictEqual(updatedVm?.cpuUsagePct, 0);
  });

  it('5. Cross-connection rejection: blocks power action if VM belongs to a different connectionId', async () => {
    const vm: VirtualMachine = {
      id: 'vm-other-tenant',
      connectionId: otherConnId, // Different connection!
      externalVmId: 'vm-999',
      name: 'other-cluster-vm',
      powerState: 'STOPPED',
      cpuCount: 2,
      cpuUsagePct: 0,
      memoryBytes: 4294967296,
      memoryUsagePct: 0,
      storageBytes: 53687091200,
      storageUsagePct: 10,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-on');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Security validation rejected'));
    assert.strictEqual(store.virtualMachines.get(vm.id)?.powerState, 'STOPPED');
  });

  it('6. Missing VM: returns friendly error when vmId does not exist in inventory', async () => {
    const result = await provider.executeVMAction('non-existent-vm-id-9999', 'power-on');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found in inventory'));
  });

  it('7. Missing externalVmId: rejects action if externalVmId is empty or missing', async () => {
    const vm: VirtualMachine = {
      id: 'vm-no-moref',
      connectionId: connId,
      externalVmId: '', // Missing MORef!
      name: 'corrupted-vm-record',
      powerState: 'STOPPED',
      cpuCount: 1,
      cpuUsagePct: 0,
      memoryBytes: 1073741824,
      memoryUsagePct: 0,
      storageBytes: 10737418240,
      storageUsagePct: 5,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-on');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('missing a valid ESXi Managed Object Reference'));
  });

  it('8. InvalidPowerState fault: surfaces descriptive error when ESXi rejects invalid power state', async () => {
    const vm: VirtualMachine = {
      id: 'vm-fault-invalid-state',
      connectionId: connId,
      externalVmId: 'vm-fault-invalid-state',
      name: 'vm-invalid-state-tester',
      powerState: 'STOPPED',
      cpuCount: 2,
      cpuUsagePct: 0,
      memoryBytes: 4294967296,
      memoryUsagePct: 0,
      storageBytes: 53687091200,
      storageUsagePct: 10,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-off');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Invalid VM power state'));
    assert.strictEqual(store.virtualMachines.get(vm.id)?.powerState, 'STOPPED');
  });

  it('9. NoPermission fault: surfaces descriptive permission error when ESXi rejects unauthorized user', async () => {
    const vm: VirtualMachine = {
      id: 'vm-fault-no-permission',
      connectionId: connId,
      externalVmId: 'vm-fault-no-permission',
      name: 'vm-no-permission-tester',
      powerState: 'RUNNING',
      cpuCount: 2,
      cpuUsagePct: 15,
      memoryBytes: 4294967296,
      memoryUsagePct: 20,
      storageBytes: 53687091200,
      storageUsagePct: 10,
      uptimeSeconds: 3600,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-off');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Permission denied'));
    assert.strictEqual(store.virtualMachines.get(vm.id)?.powerState, 'RUNNING');
  });

  it('10. Task Failure: detects asynchronous task error during polling and reports error', async () => {
    const vm: VirtualMachine = {
      id: 'vm-task-fail',
      connectionId: connId,
      externalVmId: 'vm-task-fail',
      name: 'vm-failing-task-tester',
      powerState: 'STOPPED',
      cpuCount: 2,
      cpuUsagePct: 0,
      memoryBytes: 4294967296,
      memoryUsagePct: 0,
      storageBytes: 53687091200,
      storageUsagePct: 10,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    const result = await provider.executeVMAction(vm.id, 'power-on');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('ESXi task failed'));
    assert.strictEqual(store.virtualMachines.get(vm.id)?.powerState, 'STOPPED');
  });

  it('11. Task Timeout: acknowledges accepted task if task execution exceeds bounded wait', async () => {
    const vm: VirtualMachine = {
      id: 'vm-task-timeout',
      connectionId: connId,
      externalVmId: 'vm-task-timeout',
      name: 'vm-slow-task-tester',
      powerState: 'STOPPED',
      cpuCount: 2,
      cpuUsagePct: 0,
      memoryBytes: 4294967296,
      memoryUsagePct: 0,
      storageBytes: 53687091200,
      storageUsagePct: 10,
      uptimeSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.virtualMachines.set(vm.id, vm);

    // Test with low timeout to test bounded timeout behavior quickly
    const client: any = (provider as any).client;
    const originalWaitForTask = client.waitForTask;
    client.waitForTask = function (this: any, taskMoRef: string) {
      return originalWaitForTask.call(this, taskMoRef, 400, 100);
    };

    try {
      const result = await provider.executeVMAction(vm.id, 'power-on');

      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('was accepted by ESXi and task is processing in background'));
    } finally {
      client.waitForTask = originalWaitForTask;
    }
  });
});
