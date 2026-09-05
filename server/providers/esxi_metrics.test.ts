import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ESXiProvider } from './esxi';

describe('EsxiProvider Network Metrics', () => {
    it('Should propagate null Rx/Tx when telemetry is missing', async () => {
        const provider = new ESXiProvider({ id: 'test', host: 'test', username: 'test', password: 'test' } as any);
        
        // Mock getNormalizedTelemetry to return null for network stats
        provider.getNormalizedTelemetry = async () => ({
            id: 'test',
            connectionId: 'test',
            hostId: 'test',
            timestamp: new Date().toISOString(),
            cpu: { utilizationPct: 0, coresTotal: 1 },
            memory: { utilizationPct: 0, usedBytes: 0, totalBytes: 100 },
            storage: { utilizationPct: 0, usedBytes: 0, totalBytes: 100 },
            network: { rxKbps: null, txKbps: null },
            uptimeSeconds: 0,
            latencyMs: 0
        } as any);

        const metrics = await provider.getMetrics();
        assert.strictEqual(metrics.networkRxKbps, null);
        assert.strictEqual(metrics.networkTxKbps, null);
    });

    it('Should return null for both Rx/Tx on fallback metrics', async () => {
        const provider = new ESXiProvider({ id: 'test', host: 'test', username: 'test', password: 'test' } as any);
        
        // Force an error in getNormalizedTelemetry to trigger fallback
        provider.getNormalizedTelemetry = async () => { throw new Error('Failed'); };

        const metrics = await provider.getMetrics();
        assert.strictEqual(metrics.networkRxKbps, null);
        assert.strictEqual(metrics.networkTxKbps, null);
    });
});
