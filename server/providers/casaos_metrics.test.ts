import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CasaOSProvider } from './casaos.js';

describe('CasaOSProvider SSH Metrics', () => {
    it('Should correctly handle metric collection (Mocked SSH)', async () => {
        const provider = new CasaOSProvider({ id: 'test', host: 'localhost', port: 22, username: 'test', password: 'test' } as any);
        
        // Mock executeCommand to avoid actual SSH connection
        provider['executeCommand'] = async (cmd: string) => {
            if (cmd.includes('top')) return '10.5';
            if (cmd.includes('free')) return '2048 8192';
            if (cmd.includes('df')) return '10 100';
            if (cmd.includes('awk \'{print $2, $10}\'')) return '10240 20480';
            if (cmd.includes('uptime')) return '3600';
            return '';
        };

        const metrics = await provider.getMetrics();
        assert.strictEqual(metrics.cpu, 10.5);
        assert.ok(metrics.memory > 0);
        assert.ok(metrics.storage > 0);
        assert.strictEqual(metrics.networkRxKbps, 10); // 10240 / 1024
        assert.strictEqual(metrics.networkTxKbps, 20); // 20480 / 1024
    });
});
