export interface NormalizedEndpoint {
  type: string;
  host: string;
  port: number;
  useHttps: boolean;
  key: string;
}

/**
 * Normalizes host, port, protocol, and generates a deterministic connection fingerprint key.
 *
 * Examples treated as the SAME endpoint:
 *   - 172.16.0.7
 *   - https://172.16.0.7
 *   - 172.16.0.7:443
 *   - https://172.16.0.7:443
 *   - 172.16.0.7:443/sdk
 */
export function normalizeEndpoint(
  rawType: string,
  rawHost: string,
  rawPort?: number | string,
  rawUseHttps?: boolean
): NormalizedEndpoint {
  const type = (rawType || '').trim().toUpperCase();
  let host = (rawHost || '').trim();
  let useHttps = rawUseHttps !== undefined ? Boolean(rawUseHttps) : true;

  // Handle embedded protocols like https://172.16.0.7 or http://172.16.0.7
  if (host.toLowerCase().startsWith('https://')) {
    useHttps = true;
    host = host.slice(8);
  } else if (host.toLowerCase().startsWith('http://')) {
    useHttps = false;
    host = host.slice(7);
  }

  // Strip trailing path like /sdk, /api, /
  const slashIdx = host.indexOf('/');
  if (slashIdx !== -1) {
    host = host.substring(0, slashIdx);
  }

  // Extract port if present in host (e.g. 172.16.0.7:443 or localhost:443)
  let port: number | undefined;
  if (host.includes(':') && !host.startsWith('[')) {
    const parts = host.split(':');
    host = parts[0];
    const parsedPort = parseInt(parts[1], 10);
    if (!isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  }

  if (port === undefined) {
    if (rawPort !== undefined && rawPort !== null && rawPort !== '') {
      const parsed = typeof rawPort === 'number' ? rawPort : parseInt(String(rawPort), 10);
      if (!isNaN(parsed) && parsed > 0) {
        port = parsed;
      }
    }
  }

  if (port === undefined) {
    if (type === 'ESXI') port = useHttps ? 443 : 80;
    else if (type === 'CASAOS') port = 80;
    else if (type === 'DOCKER') port = 2375;
    else if (type === 'PROXMOX') port = 8006;
    else if (type === 'TRUENAS') port = useHttps ? 443 : 80;
    else port = useHttps ? 443 : 80;
  }

  const normalizedHost = host.toLowerCase().trim();
  const key = `${type}:${normalizedHost}:${port}:${useHttps ? 'https' : 'http'}`;

  return {
    type,
    host: normalizedHost,
    port,
    useHttps,
    key
  };
}
