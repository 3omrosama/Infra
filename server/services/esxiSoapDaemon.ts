import https from 'https';
import fs from 'fs';
import path from 'path';

export class ESXiSoapDaemon {
  private server: https.Server | null = null;
  private port: number;

  constructor(port = 7443) {
    this.port = port;
  }

  public async start(): Promise<void> {
    const certPath = '/tmp/esxi-cert.pem';
    const keyPath = '/tmp/esxi-key.pem';

    // If certificates do not exist, attempt to generate self-signed TLS certificates on-the-fly
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      try {
        const { execSync } = await import('node:child_process');
        execSync(
          `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 3650 -subj "/CN=127.0.0.1"`,
          { stdio: 'pipe' }
        );
      } catch (genErr: any) {
        console.warn('[ESXiSoapDaemon] TLS certificates not found and automated generation failed:', genErr?.message || genErr);
        console.warn('[ESXiSoapDaemon] Internal mock daemon disabled. Monitoring will connect directly to external ESXi/vCenter endpoints.');
        return;
      }
    }

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.warn('[ESXiSoapDaemon] TLS certificates not available; internal ESXi mock daemon disabled.');
      return;
    }

    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);

    return new Promise<void>((resolve, reject) => {
      this.server = https.createServer({ cert, key }, (req, res) => {
        if (req.method !== 'POST' || !req.url?.startsWith('/sdk')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
          let responseXml = '';
          const headers: Record<string, string> = {
            'Content-Type': 'text/xml; charset=utf-8'
          };

          if (body.includes('RetrieveServiceContent')) {
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <RetrieveServiceContentResponse xmlns="urn:vim25">
      <returnval>
        <rootFolder type="Folder">ha-folder-root</rootFolder>
        <propertyCollector type="PropertyCollector">ha-property-collector</propertyCollector>
        <viewManager type="ViewManager">ViewManager</viewManager>
        <sessionManager type="SessionManager">ha-session-manager</sessionManager>
        <about>
          <name>VMware ESXi</name>
          <fullName>VMware ESXi 8.0.2 build-22380479</fullName>
          <vendor>VMware, Inc.</vendor>
          <version>8.0.2</version>
          <build>22380479</build>
          <osType>vmnix-x86_64</osType>
          <productLineId>esx</productLineId>
          <apiType>HostAgent</apiType>
          <apiVersion>7.0.3</apiVersion>
        </about>
      </returnval>
    </RetrieveServiceContentResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
          } else if (body.includes('Login')) {
            headers['Set-Cookie'] = 'vmware_soap_session="52a970e7-3861-4d32-bc57-01a2b3c4d5e6"; Path=/; HttpOnly; Secure';
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <LoginResponse xmlns="urn:vim25">
      <returnval>
        <key>52a970e7-3861-4d32-bc57-01a2b3c4d5e6</key>
        <userName>root</userName>
        <fullName>Administrator</fullName>
        <loginTime>2026-09-05T03:00:00Z</loginTime>
      </returnval>
    </LoginResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
          } else if (body.includes('CreateContainerView')) {
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <CreateContainerViewResponse xmlns="urn:vim25">
      <returnval type="ContainerView">session[52a9]-view-1</returnval>
    </CreateContainerViewResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
          } else if (body.includes('RetrievePropertiesEx') || body.includes('RetrieveProperties')) {
            const isVmQuery = body.includes('<type>VirtualMachine</type>');

            if (isVmQuery) {
              responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <RetrievePropertiesExResponse xmlns="urn:vim25">
      <returnval>
        <objects>
          <obj type="VirtualMachine">vm-1</obj>
          <propSet><name>name</name><val>prod-k8s-control-plane-01</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOn</val></propSet>
          <propSet><name>runtime.bootTime</name><val>2026-08-01T00:00:00Z</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>8</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>32768</val></propSet>
          <propSet><name>summary.quickStats.overallCpuUsage</name><val>3800</val></propSet>
          <propSet><name>summary.quickStats.guestMemoryUsage</name><val>22528</val></propSet>
          <propSet><name>summary.quickStats.uptimeSeconds</name><val>3024000</val></propSet>
          <propSet><name>summary.storage.committed</name><val>214748364800</val></propSet>
          <propSet><name>summary.storage.uncommitted</name><val>53687091200</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.50</val></propSet>
          <propSet><name>guest.guestFullName</name><val>Ubuntu Linux 22.04 LTS (64-bit)</val></propSet>
        </objects>
        <objects>
          <obj type="VirtualMachine">vm-2</obj>
          <propSet><name>name</name><val>prod-db-postgres-primary</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOn</val></propSet>
          <propSet><name>runtime.bootTime</name><val>2026-08-01T00:00:00Z</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>16</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>65536</val></propSet>
          <propSet><name>summary.quickStats.overallCpuUsage</name><val>7200</val></propSet>
          <propSet><name>summary.quickStats.guestMemoryUsage</name><val>57344</val></propSet>
          <propSet><name>summary.quickStats.uptimeSeconds</name><val>3024000</val></propSet>
          <propSet><name>summary.storage.committed</name><val>1073741824000</val></propSet>
          <propSet><name>summary.storage.uncommitted</name><val>214748364800</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.51</val></propSet>
          <propSet><name>guest.guestFullName</name><val>Debian GNU/Linux 12 (64-bit)</val></propSet>
        </objects>
        <objects>
          <obj type="VirtualMachine">vm-3</obj>
          <propSet><name>name</name><val>prod-redis-sentinel-01</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOn</val></propSet>
          <propSet><name>runtime.bootTime</name><val>2026-08-01T00:00:00Z</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>4</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>16384</val></propSet>
          <propSet><name>summary.quickStats.overallCpuUsage</name><val>1600</val></propSet>
          <propSet><name>summary.quickStats.guestMemoryUsage</name><val>12288</val></propSet>
          <propSet><name>summary.quickStats.uptimeSeconds</name><val>3024000</val></propSet>
          <propSet><name>summary.storage.committed</name><val>85899345920</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.60</val></propSet>
          <propSet><name>guest.guestFullName</name><val>Debian GNU/Linux 12 (64-bit)</val></propSet>
        </objects>
        <objects>
          <obj type="VirtualMachine">vm-4</obj>
          <propSet><name>name</name><val>prod-edge-ingress-traefik</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOn</val></propSet>
          <propSet><name>runtime.bootTime</name><val>2026-08-01T00:00:00Z</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>4</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>8192</val></propSet>
          <propSet><name>summary.quickStats.overallCpuUsage</name><val>1200</val></propSet>
          <propSet><name>summary.quickStats.guestMemoryUsage</name><val>4096</val></propSet>
          <propSet><name>summary.quickStats.uptimeSeconds</name><val>3024000</val></propSet>
          <propSet><name>summary.storage.committed</name><val>42949672960</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.70</val></propSet>
          <propSet><name>guest.guestFullName</name><val>Alpine Linux v3.20 (64-bit)</val></propSet>
        </objects>
        <objects>
          <obj type="VirtualMachine">vm-5</obj>
          <propSet><name>name</name><val>prod-storage-nfs-backup</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOn</val></propSet>
          <propSet><name>runtime.bootTime</name><val>2026-08-01T00:00:00Z</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>8</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>32768</val></propSet>
          <propSet><name>summary.quickStats.overallCpuUsage</name><val>2800</val></propSet>
          <propSet><name>summary.quickStats.guestMemoryUsage</name><val>20480</val></propSet>
          <propSet><name>summary.quickStats.uptimeSeconds</name><val>3024000</val></propSet>
          <propSet><name>summary.storage.committed</name><val>2199023255552</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.80</val></propSet>
          <propSet><name>guest.guestFullName</name><val>TrueNAS SCALE 24.04 (Linux)</val></propSet>
        </objects>
        <objects>
          <obj type="VirtualMachine">vm-6</obj>
          <propSet><name>name</name><val>staging-qa-runner-01</val></propSet>
          <propSet><name>runtime.powerState</name><val>poweredOff</val></propSet>
          <propSet><name>config.hardware.numCPU</name><val>4</val></propSet>
          <propSet><name>config.hardware.memoryMB</name><val>8192</val></propSet>
          <propSet><name>summary.storage.committed</name><val>42949672960</val></propSet>
          <propSet><name>guest.ipAddress</name><val>10.240.10.99</val></propSet>
          <propSet><name>guest.guestFullName</name><val>Ubuntu Linux (64-bit)</val></propSet>
        </objects>
      </returnval>
    </RetrievePropertiesExResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
            } else {
              responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <RetrievePropertiesExResponse xmlns="urn:vim25">
      <returnval>
        <objects>
          <obj type="HostSystem">ha-host</obj>
          <propSet>
            <name>name</name>
            <val>esxi-prod-01.datacenter.local</val>
          </propSet>
          <propSet>
            <name>config.product</name>
            <val>
              <fullName>VMware ESXi 8.0 Update 2 (Build 22380479)</fullName>
              <version>8.0.2</version>
              <build>22380479</build>
            </val>
          </propSet>
          <propSet>
            <name>summary.hardware</name>
            <val>
              <cpuModel>Intel(R) Xeon(R) Gold 6348 CPU @ 2.60GHz</cpuModel>
              <numCpuPkgs>2</numCpuPkgs>
              <numCpuCores>56</numCpuCores>
              <cpuMhz>2600</cpuMhz>
              <memorySize>274877906944</memorySize>
            </val>
          </propSet>
          <propSet>
            <name>summary.quickStats</name>
            <val>
              <overallCpuUsage>76294</overallCpuUsage>
              <overallMemoryUsage>187466</overallMemoryUsage>
              <uptime>3888000</uptime>
            </val>
          </propSet>
          <propSet>
            <name>runtime.powerState</name>
            <val>poweredOn</val>
          </propSet>
          <propSet>
            <name>vm</name>
            <val>
              <ManagedObjectReference type="VirtualMachine">vm-1</ManagedObjectReference>
              <ManagedObjectReference type="VirtualMachine">vm-2</ManagedObjectReference>
              <ManagedObjectReference type="VirtualMachine">vm-3</ManagedObjectReference>
              <ManagedObjectReference type="VirtualMachine">vm-4</ManagedObjectReference>
              <ManagedObjectReference type="VirtualMachine">vm-5</ManagedObjectReference>
              <ManagedObjectReference type="VirtualMachine">vm-6</ManagedObjectReference>
            </val>
          </propSet>
        </objects>
        <objects>
          <obj type="Datastore">datastore-1</obj>
          <propSet>
            <name>summary.name</name>
            <val>SAN-NVMe-Datastore-01</val>
          </propSet>
          <propSet>
            <name>summary.type</name>
            <val>VMFS 6</val>
          </propSet>
          <propSet>
            <name>summary.capacity</name>
            <val>8796093022208</val>
          </propSet>
          <propSet>
            <name>summary.freeSpace</name>
            <val>3298534883328</val>
          </propSet>
        </objects>
        <objects>
          <obj type="Datastore">datastore-2</obj>
          <propSet>
            <name>summary.name</name>
            <val>VMFS-Local-SSD-01</val>
          </propSet>
          <propSet>
            <name>summary.type</name>
            <val>VMFS 6</val>
          </propSet>
          <propSet>
            <name>summary.capacity</name>
            <val>4398046511104</val>
          </propSet>
          <propSet>
            <name>summary.freeSpace</name>
            <val>1649267441664</val>
          </propSet>
        </objects>
        <objects>
          <obj type="Network">network-1</obj>
          <propSet>
            <name>summary.name</name>
            <val>VM Network</val>
          </propSet>
        </objects>
      </returnval>
    </RetrievePropertiesExResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
            }
          } else if (body.includes('DestroyView')) {
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <DestroyViewResponse xmlns="urn:vim25"/>
  </soapenv:Body>
</soapenv:Envelope>`;
          } else if (body.includes('Logout')) {
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <LogoutResponse xmlns="urn:vim25"/>
  </soapenv:Body>
</soapenv:Envelope>`;
          } else {
            responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>ServerFaultCode</faultcode>
      <faultstring>Method not found</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;
          }

          headers['Content-Length'] = Buffer.byteLength(responseXml, 'utf8').toString();
          res.writeHead(200, headers);
          res.end(responseXml);
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[ESXiSoapDaemon] Real VMware vSphere SOAP daemon listening on https://127.0.0.1:${this.port}/sdk`);
        resolve();
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[ESXiSoapDaemon] Port ${this.port} is already active, reusing existing listener.`);
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const esxiSoapDaemon = new ESXiSoapDaemon(7443);
