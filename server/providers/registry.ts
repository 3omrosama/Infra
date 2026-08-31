import { InfrastructureProvider, ProviderConnectionConfig, ConnectionType } from '../../src/types/index.js';
import { ESXiProvider } from './esxi.js';
import { CasaOSProvider } from './casaos.js';
import { DockerProvider } from './docker.js';
import { DemoProvider } from './demo.js';
import { store } from '../db/store.js';

class ProviderRegistry {
  private instances: Map<string, InfrastructureProvider> = new Map();

  public getProvider(config: ProviderConnectionConfig): InfrastructureProvider {
    const existing = this.instances.get(config.id || '');
    if (existing) {
      existing.config = config;
      return existing;
    }

    // If demo mode is active and this connection is a demo node, use DemoProvider
    if (config.id && (config.id.startsWith('conn-esxi-') || config.id.startsWith('conn-casaos-') || config.id.startsWith('conn-docker-')) && store.settings.demoMode) {
      const demoProvider = new DemoProvider(config);
      this.instances.set(config.id, demoProvider);
      return demoProvider;
    }

    let provider: InfrastructureProvider;
    switch (config.type) {
      case 'ESXI':
        provider = new ESXiProvider(config);
        break;
      case 'CASAOS':
        provider = new CasaOSProvider(config);
        break;
      case 'DOCKER':
        provider = new DockerProvider(config);
        break;
      default:
        provider = new DemoProvider(config);
        break;
    }

    if (config.id) {
      this.instances.set(config.id, provider);
    }
    return provider;
  }

  public removeProvider(id: string) {
    const provider = this.instances.get(id);
    if (provider) {
      provider.disconnect().catch(() => {});
      this.instances.delete(id);
    }
  }

  public getAllActiveProviders(): InfrastructureProvider[] {
    return Array.from(this.instances.values());
  }

  public clearAll() {
    this.instances.forEach(p => p.disconnect().catch(() => {}));
    this.instances.clear();
  }
}

export const providerRegistry = new ProviderRegistry();
