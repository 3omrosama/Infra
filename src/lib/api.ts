import { 
  User, 
  DashboardSummary, 
  InfrastructureConnection, 
  ESXiHost, 
  VirtualMachine, 
  CasaOSServer, 
  CasaOSApp, 
  DockerContainer, 
  DockerImage, 
  DockerVolume, 
  Alert, 
  AlertRule, 
  NotificationItem, 
  SystemEvent, 
  AuditLog, 
  MetricDataPoint,
  ProviderConnectionConfig,
  ProviderTestResult
} from '../types/index';

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const token = localStorage.getItem('noc_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      if (res.status === 401 && !res.url.endsWith('/api/auth/login')) {
        localStorage.removeItem('noc_auth_token');
      }
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }
    return res.json();
  }

  // Auth
  async login(username: string, password: string): Promise<{ user: User; token: string; expiresAt: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return this.handleResponse(res);
  }

  async getMe(): Promise<{ user: User }> {
    const res = await fetch('/api/auth/me', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', headers: this.getHeaders() }).catch(() => {});
  }

  // Dashboard
  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await fetch('/api/dashboard', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  // Infrastructure Connections
  async getConnections(): Promise<InfrastructureConnection[]> {
    const res = await fetch('/api/infrastructure', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async createConnection(data: ProviderConnectionConfig): Promise<InfrastructureConnection> {
    const res = await fetch('/api/infrastructure', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async updateConnection(id: string, data: Partial<ProviderConnectionConfig>): Promise<InfrastructureConnection> {
    const res = await fetch(`/api/infrastructure/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async deleteConnection(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/infrastructure/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async testConnection(id: string): Promise<ProviderTestResult> {
    const res = await fetch(`/api/infrastructure/${id}/test`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async syncConnection(id: string): Promise<{ success: boolean; connection: InfrastructureConnection }> {
    const res = await fetch(`/api/infrastructure/${id}/sync`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async toggleDemoMode(): Promise<{ success: boolean; demoMode: boolean }> {
    const res = await fetch('/api/infrastructure/demo/toggle', {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  // ESXi & Virtual Machines
  async getAllVMs(): Promise<VirtualMachine[]> {
    const res = await fetch('/api/esxi/all-vms', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async getAllHosts(): Promise<ESXiHost[]> {
    const res = await fetch('/api/esxi/all-hosts', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async executeVMAction(connectionId: string, vmId: string, action: 'power-on' | 'power-off' | 'restart' | 'suspend', reason?: string): Promise<{ success: boolean; message: string; vm: VirtualMachine }> {
    const res = await fetch(`/api/esxi/${connectionId}/vms/${vmId}/action`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ action, reason })
    });
    return this.handleResponse(res);
  }

  // CasaOS
  async getAllCasaOSServers(): Promise<CasaOSServer[]> {
    const res = await fetch('/api/casaos/all-servers', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async getAllCasaOSApps(): Promise<CasaOSApp[]> {
    const res = await fetch('/api/casaos/all-apps', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async executeAppAction(connectionId: string, appId: string, action: 'start' | 'stop' | 'restart', reason?: string): Promise<{ success: boolean; message: string; app: CasaOSApp }> {
    const res = await fetch(`/api/casaos/${connectionId}/apps/${appId}/action`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ action, reason })
    });
    return this.handleResponse(res);
  }

  // Docker
  async getAllContainers(): Promise<DockerContainer[]> {
    const res = await fetch('/api/docker/all-containers', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async executeContainerAction(connectionId: string, containerId: string, action: 'start' | 'stop' | 'restart', reason?: string): Promise<{ success: boolean; message: string; container: DockerContainer }> {
    const res = await fetch(`/api/docker/${connectionId}/containers/${containerId}/action`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ action, reason })
    });
    return this.handleResponse(res);
  }

  // Monitoring
  async getMetrics(range = '24h'): Promise<{ range: string; data: MetricDataPoint[]; pollIntervalSec: number }> {
    const res = await fetch(`/api/monitoring/metrics?range=${range}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  // Alerts
  async getAlerts(params?: { status?: string; severity?: string }): Promise<Alert[]> {
    const q = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/alerts${q ? `?${q}` : ''}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async acknowledgeAlert(id: string): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}/acknowledge`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async resolveAlert(id: string): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}/resolve`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async getAlertRules(): Promise<AlertRule[]> {
    const res = await fetch('/api/alerts/rules', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async createAlertRule(data: Partial<AlertRule>): Promise<AlertRule> {
    const res = await fetch('/api/alerts/rules', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async deleteAlertRule(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/alerts/rules/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  // Notifications
  async getNotifications(): Promise<NotificationItem[]> {
    const res = await fetch('/api/notifications', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async markNotificationRead(id: string): Promise<NotificationItem> {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    const res = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  async testNotification(): Promise<NotificationItem> {
    const res = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  // Logs & Audit
  async getEvents(params?: { severity?: string; source?: string; search?: string }): Promise<SystemEvent[]> {
    const q = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/logs${q ? `?${q}` : ''}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async getAuditLogs(params?: { action?: string; username?: string; search?: string }): Promise<AuditLog[]> {
    const q = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/logs/audit${q ? `?${q}` : ''}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  // Users
  async getUsers(): Promise<User[]> {
    const res = await fetch('/api/users', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async createUser(data: { username: string; email: string; password: string; role: string }): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async updateUser(id: string, data: Partial<User & { password?: string }>): Promise<User> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async deleteUser(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  // Settings
  async getSettings(): Promise<any> {
    const res = await fetch('/api/settings', { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async updateSettings(data: any): Promise<any> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(res);
  }

  async resetDemo(): Promise<{ success: boolean }> {
    const res = await fetch('/api/settings/reset-demo', {
      method: 'POST',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }
}

export const api = new ApiClient();
