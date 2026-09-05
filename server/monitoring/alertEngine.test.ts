import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { alertEngine } from './alertEngine.js';
import { store } from '../db/store.js';
import { prisma } from '../db/prisma.js';
import { AlertRule } from '../../src/types/index.js';

describe('AlertEngine Deduplication & Lifecycle', () => {
  const testConnId = 'conn-test-dedup-99';
  const testSourceName = 'dedup-test-host.internal';
  const testRuleId = 'rule-test-cpu-high';

  before(async () => {
    await store.init();

    // Ensure a test rule exists
    const testRule: AlertRule = {
      id: testRuleId,
      name: 'Test Deduplication High CPU',
      metric: 'cpu',
      condition: 'gt',
      threshold: 80,
      durationSec: 60,
      severity: 'WARNING',
      isEnabled: true,
      createdAt: new Date().toISOString()
    };
    await store.saveAlertRule(testRule);

    // Clean up any old test alerts
    const alertsToDelete = Array.from(store.alerts.values()).filter(a => a.source === testSourceName);
    for (const a of alertsToDelete) {
      store.alerts.delete(a.id);
      if (store.isDbConnected) {
        await prisma.alert.deleteMany({ where: { source: testSourceName } });
      }
    }
  });

  after(async () => {
    // Clean up test rule & alerts
    await store.deleteAlertRule(testRuleId);
    const alertsToDelete = Array.from(store.alerts.values()).filter(a => a.source === testSourceName);
    for (const a of alertsToDelete) {
      store.alerts.delete(a.id);
      if (store.isDbConnected) {
        await prisma.alert.deleteMany({ where: { source: testSourceName } });
      }
    }
  });

  it('Test A: ACTIVE + breached again → no duplicate', async () => {
    // 1. First breach triggers an initial ACTIVE alert
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 85.0,
      memoryPct: 40.0
    });

    const activeAlerts1 = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && a.status === 'ACTIVE'
    );
    assert.strictEqual(activeAlerts1.length, 1, 'Expected exactly 1 ACTIVE alert created');
    const firstAlertId = activeAlerts1[0].id;
    assert.strictEqual(activeAlerts1[0].valueObserved, 85.0);

    // 2. Second breach with updated metric (87.5%)
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 87.5,
      memoryPct: 42.0
    });

    const activeAlerts2 = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && a.status === 'ACTIVE'
    );
    assert.strictEqual(activeAlerts2.length, 1, 'Still exactly 1 ACTIVE alert; no duplicate created');
    assert.strictEqual(activeAlerts2[0].id, firstAlertId, 'Existing alert was updated in place');
    assert.strictEqual(activeAlerts2[0].valueObserved, 87.5, 'Observed value was updated');
  });

  it('Test B: ACKNOWLEDGED + breached again → no duplicate and remains ACKNOWLEDGED', async () => {
    const activeAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && a.status === 'ACTIVE'
    );
    assert.strictEqual(activeAlerts.length, 1);
    const alertId = activeAlerts[0].id;

    // Operator acknowledges the alert
    const acked = alertEngine.acknowledgeAlert(alertId, 'operator-tester');
    assert.ok(acked, 'Alert should be acknowledged');
    assert.strictEqual(acked.status, 'ACKNOWLEDGED');

    // Simulate next monitoring poll while condition is still breached (89.0%)
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 89.0,
      memoryPct: 45.0
    });

    const allTestAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName
    );
    assert.strictEqual(allTestAlerts.length, 1, 'Expected exactly 1 total alert record for this condition');
    assert.strictEqual(allTestAlerts[0].id, alertId, 'Same alert record preserved');
    assert.strictEqual(allTestAlerts[0].status, 'ACKNOWLEDGED', 'Status must remain ACKNOWLEDGED');
    assert.strictEqual(allTestAlerts[0].valueObserved, 89.0, 'Observed value must be updated');
  });

  it('Test C: RESOLVED + breached again → creates a new ACTIVE incident', async () => {
    const ackedAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && a.status === 'ACKNOWLEDGED'
    );
    assert.strictEqual(ackedAlerts.length, 1);
    const firstAlertId = ackedAlerts[0].id;

    // Operator resolves the incident
    const resolved = alertEngine.resolveAlert(firstAlertId, 'operator-tester');
    assert.ok(resolved);
    assert.strictEqual(resolved.status, 'RESOLVED');

    // Breach condition returns later (92.0% CPU)
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 92.0,
      memoryPct: 45.0
    });

    const allTestAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName
    );
    assert.strictEqual(allTestAlerts.length, 2, 'Expected 2 alerts: 1 historical RESOLVED and 1 new ACTIVE');

    const historicalResolved = allTestAlerts.find(a => a.id === firstAlertId);
    assert.ok(historicalResolved);
    assert.strictEqual(historicalResolved.status, 'RESOLVED');

    const newActive = allTestAlerts.find(a => a.id !== firstAlertId);
    assert.ok(newActive);
    assert.strictEqual(newActive.status, 'ACTIVE');
    assert.strictEqual(newActive.valueObserved, 92.0);
  });

  it('Test D: Repeated polling while ACKNOWLEDGED → still exactly one unresolved incident', async () => {
    // Find the new active alert from Test C
    const activeAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && a.status === 'ACTIVE'
    );
    assert.strictEqual(activeAlerts.length, 1);
    const activeId = activeAlerts[0].id;

    // Acknowledge it
    const acked = alertEngine.acknowledgeAlert(activeId, 'operator-tester');
    assert.ok(acked);
    assert.strictEqual(acked.status, 'ACKNOWLEDGED');

    // Simulate 5 consecutive poll cycles while condition remains breached
    for (let poll = 1; poll <= 5; poll++) {
      await alertEngine.evaluateMetrics({
        connectionId: testConnId,
        sourceName: testSourceName,
        resourceType: 'SERVER',
        cpuPct: 84.0 + poll,
        memoryPct: 50.0
      });
    }

    const unresolvedAlerts = Array.from(store.alerts.values()).filter(
      a => a.source === testSourceName && (a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED')
    );
    assert.strictEqual(unresolvedAlerts.length, 1, 'Must have strictly 1 unresolved alert across repeated polls');
    assert.strictEqual(unresolvedAlerts[0].id, activeId, 'Must be the exact acknowledged alert');
    assert.strictEqual(unresolvedAlerts[0].status, 'ACKNOWLEDGED', 'Must remain ACKNOWLEDGED');
    assert.strictEqual(unresolvedAlerts[0].valueObserved, 89.0, 'Value must be updated to the latest poll reading (84 + 5)');
  });

  it('Test F: Offline ACTIVE + successful poll → auto-resolved', async () => {
    // 1. Trigger Offline Alert
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 0,
      memoryPct: 0,
      isOffline: true
    });

    const activeAlerts = Array.from(store.alerts.values()).filter(a => a.status === 'ACTIVE' && a.source === testSourceName);
    assert.strictEqual(activeAlerts.length, 1);
    const alertId = activeAlerts[0].id;

    // 2. Simulate successful poll (node recovered)
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 50.0,
      memoryPct: 50.0,
      isOffline: false
    });

    const alerts = Array.from(store.alerts.values()).filter(a => a.id === alertId);
    assert.strictEqual(alerts[0].status, 'RESOLVED', 'Alert should be automatically resolved');
  });

  it('Test G: Offline ACKNOWLEDGED + successful poll → auto-resolved', async () => {
    // 1. Trigger Offline Alert
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 0,
      memoryPct: 0,
      isOffline: true
    });

    const activeAlerts = Array.from(store.alerts.values()).filter(a => a.status === 'ACTIVE' && a.source === testSourceName);
    const alertId = activeAlerts[0].id;

    // 2. Acknowledge it
    alertEngine.acknowledgeAlert(alertId, 'operator-tester');

    // 3. Simulate successful poll
    await alertEngine.evaluateMetrics({
      connectionId: testConnId,
      sourceName: testSourceName,
      resourceType: 'SERVER',
      cpuPct: 50.0,
      memoryPct: 50.0,
      isOffline: false
    });

    const alerts = Array.from(store.alerts.values()).filter(a => a.id === alertId);
    assert.strictEqual(alerts[0].status, 'RESOLVED', 'Acknowledged alert should be automatically resolved');
  });
});
