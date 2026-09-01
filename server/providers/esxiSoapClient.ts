import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import net from 'node:net';

export interface ESXiAboutInfo {
  name: string;
  fullName: string;
  vendor: string;
  version: string;
  build: string;
  osType: string;
  productLineId: string;
  apiType: string;
  apiVersion: string;
}

export interface ESXiServiceContent {
  rootFolder: { type: string; value: string };
  propertyCollector: { type: string; value: string };
  viewManager?: { type: string; value: string };
  sessionManager?: { type: string; value: string };
  eventManager?: { type: string; value: string };
  about: ESXiAboutInfo;
}

export interface ESXiObjectContent {
  obj: { type: string; value: string };
  props: Record<string, any>;
}

export interface SoapHttpResponse {
  statusCode: number;
  statusMessage: string;
  headers: http.IncomingHttpHeaders;
  body: string;
  cookie?: string;
}

export function escapeXml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createSoapEnvelope(bodyContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
 xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    ${bodyContent}
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Minimal, resilient XML Tag extractor & Parser for VMware SOAP responses
 */
export class XmlParser {
  /**
   * Extract text inside the first occurrence of <tagName>...</tagName> (ignores namespaces like vim25:tag)
   */
  static extractTag(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract all occurrences of <tagName>...</tagName>
   */
  static extractAllTags(xml: string, tagName: string): string[] {
    const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagName}>`, 'gi');
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      results.push(match[1].trim());
    }
    return results;
  }

  /**
   * Extract attribute from opening tag
   */
  static extractAttribute(xml: string, tagName: string, attrName: string): string | null {
    const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tagName}\\s+[^>]*${attrName}=["']([^"']+)["'][^>]*>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Check for SOAP Fault and return friendly error string
   */
  static checkFault(xml: string): string | null {
    if (!xml.includes('Fault>') && !xml.includes(':Fault')) return null;

    const faultString = XmlParser.extractTag(xml, 'faultstring') || XmlParser.extractTag(xml, 'faultcode');
    const detail = XmlParser.extractTag(xml, 'detail');

    if (detail && (detail.includes('InvalidLogin') || detail.includes('CannotCompleteLoginFault') || detail.includes('InvalidCredentialsFault'))) {
      return 'Invalid username or password for ESXi host.';
    }
    if (detail && detail.includes('NotAuthenticated')) {
      return 'ESXi session is not authenticated or has expired.';
    }
    if (faultString) {
      return faultString;
    }
    return 'Unknown VMware SOAP Fault returned by ESXi server.';
  }

  /**
   * Parse <returnval> or <objects> into key-value property map
   */
  static parseObjectProperties(xmlObjBlock: string): ESXiObjectContent {
    const objTag = XmlParser.extractTag(xmlObjBlock, 'obj') || '';
    const objType = XmlParser.extractAttribute(xmlObjBlock, 'obj', 'type') || 'Unknown';
    const objValue = objTag.replace(/<[^>]+>/g, '').trim();

    const props: Record<string, any> = {};
    const propSets = XmlParser.extractAllTags(xmlObjBlock, 'propSet');

    for (const prop of propSets) {
      const name = XmlParser.extractTag(prop, 'name');
      const val = XmlParser.extractTag(prop, 'val');
      if (name && val !== null) {
        // Parse primitive or nested
        props[name] = XmlParser.parseValue(val);
      }
    }

    return {
      obj: { type: objType, value: objValue },
      props
    };
  }

  /**
   * Parse XML string value into appropriate JS primitive or nested object
   */
  static parseValue(valXml: string): any {
    // If value is empty
    if (!valXml) return '';

    // Check if value contains nested tags
    if (valXml.includes('<') && valXml.includes('>')) {
      const result: Record<string, any> = {};
      const tagRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g;
      let match: RegExpExecArray | null;
      let matchedAny = false;

      while ((match = tagRegex.exec(valXml)) !== null) {
        matchedAny = true;
        const tagName = match[1];
        const innerVal = match[2].trim();
        const parsed = XmlParser.parseValue(innerVal);

        if (result[tagName] !== undefined) {
          if (Array.isArray(result[tagName])) {
            result[tagName].push(parsed);
          } else {
            result[tagName] = [result[tagName], parsed];
          }
        } else {
          result[tagName] = parsed;
        }
      }

      if (matchedAny) return result;
    }

    // Primitive conversions
    const cleaned = valXml.trim();
    if (cleaned === 'true') return true;
    if (cleaned === 'false') return false;
    if (/^-?\d+$/.test(cleaned)) {
      const num = Number(cleaned);
      if (Number.isSafeInteger(num)) return num;
      return cleaned; // Keep as string for very large ints
    }
    if (/^-?\d+\.\d+$/.test(cleaned)) {
      return parseFloat(cleaned);
    }
    return cleaned;
  }
}

/**
 * Real VMware vSphere SOAP SDK Client
 */
export class ESXiSoapClient {
  public connectionId?: string;
  public host: string;
  public port: number;
  public useHttps: boolean;
  public skipSslVerify: boolean;
  private sessionCookie: string | null = null;
  private serviceContent: ESXiServiceContent | null = null;

  constructor(options: {
    connectionId?: string;
    host: string;
    port?: number;
    useHttps?: boolean;
    skipSslVerify?: boolean;
  }) {
    this.connectionId = options.connectionId;
    this.host = options.host.trim();
    this.useHttps = options.useHttps ?? true;
    this.port = options.port || (this.useHttps ? 443 : 80);
    this.skipSslVerify = options.skipSslVerify ?? false;
  }

  public getSessionCookie(): string | null {
    return this.sessionCookie;
  }

  public setSessionCookie(cookie: string | null) {
    this.sessionCookie = cookie;
  }

  public destroy() {
    this.sessionCookie = null;
    this.serviceContent = null;
  }

  /**
   * Execute low-level HTTP/HTTPS SOAP request with isolated per-connection TLS settings
   */
  async request(soapBodyXml: string, soapAction = 'urn:vim25/6.0', timeoutMs = 15000, retryCount = 1): Promise<SoapHttpResponse> {
    const envelope = createSoapEnvelope(soapBodyXml);
    const transport = this.useHttps ? https : http;
    const endpointUrl = `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/sdk`;

    const headers: Record<string, string | number> = {
      'Host': `${this.host}:${this.port}`,
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${soapAction}"`,
      'Content-Length': Buffer.byteLength(envelope, 'utf8'),
      'User-Agent': 'VMware-client/6.0',
      'Connection': 'close'
    };

    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }

    const executeAttempt = (): Promise<SoapHttpResponse> => {
      return new Promise<SoapHttpResponse>((resolve, reject) => {
        const reqOptions: https.RequestOptions = {
          hostname: this.host,
          port: this.port,
          path: '/sdk',
          method: 'POST',
          headers,
          timeout: timeoutMs,
          agent: false // Avoid socket pooling issues with ESXi rhttpproxy
        };

        if (this.useHttps) {
          if (this.skipSslVerify) {
            reqOptions.rejectUnauthorized = false;
            reqOptions.checkServerIdentity = () => undefined;
          } else {
            reqOptions.rejectUnauthorized = true;
          }
        }

        const req = transport.request(reqOptions, (res) => {
          let responseBody = '';
          res.setEncoding('utf8');

          res.on('data', (chunk) => {
            responseBody += chunk;
          });

          res.on('end', () => {
            let cookie: string | undefined = undefined;
            const setCookieHeader = res.headers['set-cookie'];
            if (setCookieHeader) {
              const rawCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
              for (const c of rawCookies) {
                if (c.includes('vmware_soap_session')) {
                  const match = c.match(/vmware_soap_session="?[^";]+"?/);
                  if (match) {
                    cookie = match[0];
                    break;
                  }
                }
              }
              if (!cookie && rawCookies.length > 0) {
                cookie = rawCookies[0].split(';')[0];
              }
            }

            // Check if response contains a SOAP Fault
            const fault = XmlParser.checkFault(responseBody);
            if (fault && res.statusCode !== 200) {
              const faultErr: any = new Error(fault);
              faultErr.statusCode = res.statusCode;
              reject(faultErr);
              return;
            }

            resolve({
              statusCode: res.statusCode || 200,
              statusMessage: res.statusMessage || '',
              headers: res.headers,
              body: responseBody,
              cookie
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error(`Connection timed out after ${timeoutMs}ms connecting to ESXi at ${this.host}:${this.port}`));
        });

        req.on('error', (err: any) => {
          // Log structured diagnostic without passwords or sensitive tokens
          console.error(`[ESXiSoapClient] Diagnostic Error: connectionId=${this.connectionId || 'n/a'} endpoint=${endpointUrl} proto=${this.useHttps ? 'HTTPS' : 'HTTP'} port=${this.port} skipSslVerify=${this.skipSslVerify} code=${err.code || 'UNKNOWN'} msg="${err.message}"`);

          if (
            err.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
            err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            err.code === 'CERT_HAS_EXPIRED' ||
            err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
          ) {
            reject(new Error(`SSL certificate verification failed (${err.code}). Please enable 'Skip SSL Check' if your ESXi host uses self-signed certificates.`));
          } else if (err.code === 'ECONNREFUSED') {
            reject(new Error(`Connection refused at ${this.host}:${this.port}. Check if ESXi management daemon (hostd/rhttpproxy) is running on port ${this.port}.`));
          } else if (err.code === 'ENOTFOUND') {
            reject(new Error(`Host '${this.host}' not found (DNS resolution failed).`));
          } else if (err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH') {
            reject(new Error(`Host at ${this.host}:${this.port} is unreachable (Network timeout / No route to host).`));
          } else {
            reject(err);
          }
        });

        req.write(envelope);
        req.end();
      });
    };

    try {
      return await executeAttempt();
    } catch (err: any) {
      // Retry once for transient socket reset or idle connection close
      if (retryCount > 0 && (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('socket disconnected') || err.message?.includes('socket hang up'))) {
        console.warn(`[ESXiSoapClient] Retrying request on ${endpointUrl} after transient socket reset (${err.code || err.message})`);
        return this.request(soapBodyXml, soapAction, timeoutMs, retryCount - 1);
      }
      throw err;
    }
  }

  /**
   * Step 1: Retrieve ServiceContent (ServiceInstance.RetrieveServiceContent)
   */
  async retrieveServiceContent(): Promise<ESXiServiceContent> {
    if (this.serviceContent) return this.serviceContent;

    const soapBody = `
      <RetrieveServiceContent xmlns="urn:vim25">
        <_this type="ServiceInstance">ServiceInstance</_this>
      </RetrieveServiceContent>
    `;

    const res = await this.request(soapBody, 'urn:vim25');
    const returnVal = XmlParser.extractTag(res.body, 'returnval');
    if (!returnVal) {
      throw new Error('Invalid SOAP response: missing returnval in RetrieveServiceContent');
    }

    const rootFolderVal = XmlParser.extractTag(returnVal, 'rootFolder') || 'ha-folder-root';
    const rootFolderType = XmlParser.extractAttribute(returnVal, 'rootFolder', 'type') || 'Folder';

    const propCollVal = XmlParser.extractTag(returnVal, 'propertyCollector') || 'ha-property-collector';
    const propCollType = XmlParser.extractAttribute(returnVal, 'propertyCollector', 'type') || 'PropertyCollector';

    const viewMgrVal = XmlParser.extractTag(returnVal, 'viewManager') || 'ha-view-mgr';
    const viewMgrType = XmlParser.extractAttribute(returnVal, 'viewManager', 'type') || 'ViewManager';

    const sessionMgrVal = XmlParser.extractTag(returnVal, 'sessionManager') || 'ha-sessionmgr';
    const sessionMgrType = XmlParser.extractAttribute(returnVal, 'sessionManager', 'type') || 'SessionManager';

    const eventMgrVal = XmlParser.extractTag(returnVal, 'eventManager');
    const eventMgrType = XmlParser.extractAttribute(returnVal, 'eventManager', 'type') || 'EventManager';

    const aboutXml = XmlParser.extractTag(returnVal, 'about') || '';
    const about: ESXiAboutInfo = {
      name: XmlParser.extractTag(aboutXml, 'name') || 'VMware ESXi',
      fullName: XmlParser.extractTag(aboutXml, 'fullName') || 'VMware ESXi',
      vendor: XmlParser.extractTag(aboutXml, 'vendor') || 'VMware, Inc.',
      version: XmlParser.extractTag(aboutXml, 'version') || '8.0.0',
      build: XmlParser.extractTag(aboutXml, 'build') || '',
      osType: XmlParser.extractTag(aboutXml, 'osType') || 'vmnix-x86',
      productLineId: XmlParser.extractTag(aboutXml, 'productLineId') || 'esx',
      apiType: XmlParser.extractTag(aboutXml, 'apiType') || 'HostAgent',
      apiVersion: XmlParser.extractTag(aboutXml, 'apiVersion') || '8.0.0.0'
    };

    this.serviceContent = {
      rootFolder: { type: rootFolderType, value: rootFolderVal },
      propertyCollector: { type: propCollType, value: propCollVal },
      viewManager: { type: viewMgrType, value: viewMgrVal },
      sessionManager: { type: sessionMgrType, value: sessionMgrVal },
      eventManager: eventMgrVal ? { type: eventMgrType, value: eventMgrVal } : undefined,
      about
    };

    return this.serviceContent;
  }

  /**
   * Step 2: Authenticate session (SessionManager.Login)
   */
  async login(username: string, password?: string): Promise<{ success: boolean; sessionKey?: string }> {
    const sc = await this.retrieveServiceContent();
    const sessionMgr = sc.sessionManager || { type: 'SessionManager', value: 'ha-sessionmgr' };

    const soapBody = `
      <Login xmlns="urn:vim25">
        <_this type="${sessionMgr.type}">${sessionMgr.value}</_this>
        <userName>${escapeXml(username)}</userName>
        <password>${escapeXml(password || '')}</password>
      </Login>
    `;

    const res = await this.request(soapBody, 'urn:vim25');
    if (res.cookie) {
      this.sessionCookie = res.cookie;
    }

    const returnVal = XmlParser.extractTag(res.body, 'returnval');
    const sessionKey = returnVal ? XmlParser.extractTag(returnVal, 'key') || undefined : undefined;

    return { success: true, sessionKey };
  }

  /**
   * Step 3: Logout session (SessionManager.Logout)
   */
  async logout(): Promise<void> {
    if (!this.sessionCookie && !this.serviceContent) return;

    try {
      const sessionMgr = this.serviceContent?.sessionManager || { type: 'SessionManager', value: 'ha-sessionmgr' };
      const soapBody = `
        <Logout xmlns="urn:vim25">
          <_this type="${sessionMgr.type}">${sessionMgr.value}</_this>
        </Logout>
      `;
      await this.request(soapBody, 'urn:vim25', 3000);
    } catch {
      // Ignore logout errors
    } finally {
      this.sessionCookie = null;
    }
  }

  /**
   * Step 4: Create a ContainerView for recursive inventory traversal
   */
  async createContainerView(types: string[]): Promise<string> {
    const sc = await this.retrieveServiceContent();
    const viewMgr = sc.viewManager || { type: 'ViewManager', value: 'ha-view-mgr' };
    const rootFolder = sc.rootFolder || { type: 'Folder', value: 'ha-folder-root' };

    const typeTags = types.map(t => `<type>${t}</type>`).join('\n');
    const soapBody = `
      <CreateContainerView xmlns="urn:vim25">
        <_this type="${viewMgr.type}">${viewMgr.value}</_this>
        <container type="${rootFolder.type}">${rootFolder.value}</container>
        ${typeTags}
        <recursive>true</recursive>
      </CreateContainerView>
    `;

    const res = await this.request(soapBody, 'urn:vim25');
    const returnVal = XmlParser.extractTag(res.body, 'returnval');
    if (!returnVal) {
      throw new Error('Failed to create ContainerView: empty returnval');
    }
    return returnVal.replace(/<[^>]+>/g, '').trim();
  }

  /**
   * Step 5: Query properties on objects using PropertyCollector
   */
  async retrieveInventoryObjects(
    containerViewId: string,
    specifications: Array<{ type: string; properties: string[] }>
  ): Promise<ESXiObjectContent[]> {
    const sc = await this.retrieveServiceContent();
    const propCollector = sc.propertyCollector || { type: 'PropertyCollector', value: 'ha-property-collector' };

    const propSetsXml = specifications
      .map(spec => {
        const pathSets = spec.properties.map(p => `<pathSet>${p}</pathSet>`).join('\n');
        return `
          <propSet>
            <type>${spec.type}</type>
            <all>false</all>
            ${pathSets}
          </propSet>
        `;
      })
      .join('\n');

    const soapBody = `
      <RetrievePropertiesEx xmlns="urn:vim25">
        <_this type="${propCollector.type}">${propCollector.value}</_this>
        <specSet>
          ${propSetsXml}
          <objectSet>
            <obj type="ContainerView">${containerViewId}</obj>
            <skip>true</skip>
            <selectSet xsi:type="TraversalSpec">
              <name>traverseView</name>
              <type>ContainerView</type>
              <path>view</path>
              <skip>false</skip>
            </selectSet>
          </objectSet>
        </specSet>
        <options>
          <maxObjects>300</maxObjects>
        </options>
      </RetrievePropertiesEx>
    `;

    try {
      const res = await this.request(soapBody, 'urn:vim25');
      const objectsBlocks = XmlParser.extractAllTags(res.body, 'objects');
      return objectsBlocks.map(block => XmlParser.parseObjectProperties(block));
    } catch (ex: any) {
      // Fallback for older ESXi versions that only support RetrieveProperties
      if (ex.message?.includes('Method') || ex.message?.includes('not found') || ex.message?.includes('RetrievePropertiesEx')) {
        const fallbackBody = `
          <RetrieveProperties xmlns="urn:vim25">
            <_this type="${propCollector.type}">${propCollector.value}</_this>
            <specSet>
              ${propSetsXml}
              <objectSet>
                <obj type="ContainerView">${containerViewId}</obj>
                <skip>true</skip>
                <selectSet xsi:type="TraversalSpec">
                  <name>traverseView</name>
                  <type>ContainerView</type>
                  <path>view</path>
                  <skip>false</skip>
                </selectSet>
              </objectSet>
            </specSet>
          </RetrieveProperties>
        `;
        const res = await this.request(fallbackBody, 'urn:vim25');
        const objectsBlocks = XmlParser.extractAllTags(res.body, 'objects');
        return objectsBlocks.map(block => XmlParser.parseObjectProperties(block));
      }
      throw ex;
    }
  }

  /**
   * Clean up container view
   */
  async destroyView(viewId: string): Promise<void> {
    try {
      const soapBody = `
        <DestroyView xmlns="urn:vim25">
          <_this type="ContainerView">${viewId}</_this>
        </DestroyView>
      `;
      await this.request(soapBody, 'urn:vim25', 3000);
    } catch {
      // Ignore teardown errors
    }
  }
}
