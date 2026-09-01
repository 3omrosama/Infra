import { InfrastructureProvider, ProviderConnectionConfig, ConnectionType } from '../../src/types/index.js';
import { ESXiProvider } from './esxi.js';
import { CasaOSProvider } from './casaos.js';
import { DockerProvider } from './docker.js';
import { DemoProvider } from './demo.js';
import { store } from '../db/store.js';
import { decryptSecret } from '../crypto.js';

class ProviderRegistry {
  private instances: Map<string, InfrastructureProvider> = new Map();

  public getProvider(config: ProviderConnectionConfig): InfrastructureProvider {
    // Decrypt credentials if stored encrypted form is present and plain password/token is not provided
    const effectiveConfig: ProviderConnectionConfig = { ...config };
    if (config.encryptedSecret && config.secretIv && config.secretTag && !config.password && !config.token) {
      const decrypted = decryptSecret(config.encryptedSecret, config.secretIv, config.secretTag);
      if (config.type === 'CASAOS' || config.type === 'DOCKER' || config.type === 'PROXMOX') {
        effectiveConfig.token = decrypted;
      }
      effectiveConfig.password = decrypted;
    }

    const existing = this.instances.get(effectiveConfig.id || '');
    if (existing) {
      existing.config = effectiveConfig;
      return existing;
    }

    // Only use DemoProvider if connection is explicitly marked as demo and demoMode is enabled
    if (effectiveConfig.isDemo && store.settings.demoMode) {
      const demoProvider = new DemoProvider(effectiveConfig);
      if (effectiveConfig.id) {
        this.instances.set(effectiveConfig.id, demoProvider);
      }
      return demoProvider;
    }

    let provider: InfrastructureProvider;
    switch (effectiveConfig.type) {
      case 'ESXI':
        provider = new ESXiProvider(effectiveConfig);
        break;
      case 'CASAOS':
        provider = new CasaOSProvider(effectiveConfig);
        break;
      case 'DOCKER':
        provider = new DockerProvider(effectiveConfig);
        break;
      default:
        provider = new DemoProvider(effectiveConfig);
        break;
    }

    if (effectiveConfig.id) {
      this.instances.set(effectiveConfig.id, provider);
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
