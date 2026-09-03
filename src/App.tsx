import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { InfrastructureView } from './views/InfrastructureView';
import { ESXiView } from './views/ESXiView';
import { VirtualMachinesView } from './views/VirtualMachinesView';
import { CasaOSView } from './views/CasaOSView';
import { DockerView } from './views/DockerView';
import { ServersView } from './views/ServersView';
import { StorageView } from './views/StorageView';
import { NetworkView } from './views/NetworkView';
import { MonitoringView } from './views/MonitoringView';
import { AlertsView } from './views/AlertsView';
import { LogsView } from './views/LogsView';
import { TasksView } from './views/TasksView';
import { UsersView } from './views/UsersView';
import { SettingsView } from './views/SettingsView';

import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandMenu } from './components/layout/CommandMenu';
import { ToastContainer } from './components/layout/ToastContainer';
import { AddConnectionModal } from './components/modals/AddConnectionModal';

import { 
  DashboardSummary, 
  InfrastructureConnection, 
  ESXiHost, 
  VirtualMachine, 
  CasaOSServer, 
  CasaOSApp, 
  DockerContainer, 
  Alert, 
  AlertRule 
} from './types/index';
import { api } from './lib/api';

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isConnected: isSocketConnected, lastMetric, alerts: socketAlerts } = useSocket();
  const { showToast } = useNotifications();

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);

  // Global Data State
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [connections, setConnections] = useState<InfrastructureConnection[]>([]);
  const [esxiHosts, setEsxiHosts] = useState<ESXiHost[]>([]);
  const [vms, setVms] = useState<VirtualMachine[]>([]);
  const [casaosServers, setCasaosServers] = useState<CasaOSServer[]>([]);
  const [casaosApps, setCasaosApps] = useState<CasaOSApp[]>([]);
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Fetch all cluster infrastructure data
  const loadAllData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [
        summaryRes,
        connectionsRes,
        esxiHostsRes,
        vmsRes,
        casaosServersRes,
        casaosAppsRes,
        dockerRes,
        alertsRes,
        rulesRes
      ] = await Promise.allSettled([
        api.getDashboardSummary(),
        api.getConnections(),
        api.getAllHosts(),
        api.getAllVMs(),
        api.getAllCasaOSServers(),
        api.getAllCasaOSApps(),
        api.getAllContainers(),
        api.getAlerts(),
        api.getAlertRules()
      ]);

      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (connectionsRes.status === 'fulfilled') setConnections(connectionsRes.value);
      if (esxiHostsRes.status === 'fulfilled') setEsxiHosts(esxiHostsRes.value);
      if (vmsRes.status === 'fulfilled') setVms(vmsRes.value);
      if (casaosServersRes.status === 'fulfilled') setCasaosServers(casaosServersRes.value);
      if (casaosAppsRes.status === 'fulfilled') setCasaosApps(casaosAppsRes.value);
      if (dockerRes.status === 'fulfilled') setDockerContainers(dockerRes.value);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value);
      if (rulesRes.status === 'fulfilled') setAlertRules(rulesRes.value);
    } catch (err) {
      console.error('Error fetching cluster data:', err);
    } finally {
      setIsDataLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated, loadAllData]);

  // Handle Real-time Metric Updates
  useEffect(() => {
    if (lastMetric && summary && (summary.hasLiveInfrastructure || summary.isDemoMode)) {
      setSummary(prev => {
        if (!prev || (!prev.hasLiveInfrastructure && !prev.isDemoMode)) return prev;
        const currentHist = prev.historicalMetrics || [];
        const newHistorical = [...(currentHist.length > 0 ? currentHist.slice(1) : []), lastMetric];
        return {
          ...prev,
          metrics: {
            ...prev.metrics,
            cpuUtilizationPct: lastMetric.cpu ?? prev.metrics?.cpuUtilizationPct ?? null,
            memoryUtilizationPct: lastMetric.memory ?? prev.metrics?.memoryUtilizationPct ?? null,
            storageUtilizationPct: lastMetric.storage ?? prev.metrics?.storageUtilizationPct ?? null,
            networkTrafficRxKbps: lastMetric.networkRxKbps ?? prev.metrics?.networkTrafficRxKbps ?? null,
            networkTrafficTxKbps: lastMetric.networkTxKbps ?? prev.metrics?.networkTrafficTxKbps ?? null
          },
          historicalMetrics: newHistorical
        };
      });
    }
  }, [lastMetric, summary?.hasLiveInfrastructure, summary?.isDemoMode]);

  // Handle Real-time Alerts from Socket
  useEffect(() => {
    if (socketAlerts && socketAlerts.length > 0) {
      const newest = socketAlerts[socketAlerts.length - 1];
      if (newest) {
        showToast(newest.title, newest.message, newest.severity);
      }
      loadAllData();
    }
  }, [socketAlerts, showToast, loadAllData]);

  const handleToggleDemoMode = async () => {
    try {
      const res = await api.toggleDemoMode();
      showToast(
        res.demoMode ? 'Demo Mode Enabled' : 'Live Hardware Mode',
        res.demoMode ? 'Synthetic infrastructure topology and telemetry active' : 'Live hardware mode active. Connect physical/virtual nodes.',
        'INFO'
      );
      await loadAllData();
    } catch (err: any) {
      showToast('Mode Switch Error', err?.message || 'Failed to toggle mode', 'ERROR');
    }
  };

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandMenuOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-400 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span>Authenticating NOC session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  const canManage = user.role === 'ADMIN' || user.role === 'OPERATOR';

  const unreadAlertsCount = alerts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        alertCount={unreadAlertsCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          onOpenSearch={() => setIsCommandMenuOpen(true)}
          onOpenAddConnection={() => setIsAddConnectionOpen(true)}
          onRefreshData={loadAllData}
          isDemoMode={Boolean(summary?.isDemoMode)}
          onToggleDemoMode={handleToggleDemoMode}
        />

        {/* Viewport Router */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              isLoading={isDataLoading}
              onNavigate={setActiveTab}
              onOpenAddConnection={() => setIsAddConnectionOpen(true)}
              onAcknowledgeAlert={async (id) => {
                await api.acknowledgeAlert(id);
                loadAllData();
              }}
              canManage={canManage}
            />
          )}

          {activeTab === 'infrastructure' && (
            <InfrastructureView
              connections={connections}
              onRefresh={loadAllData}
              onOpenAddModal={() => setIsAddConnectionOpen(true)}
              canManage={canManage}
            />
          )}

          {activeTab === 'esxi' && (
            <ESXiView
              hosts={esxiHosts}
              onRefresh={loadAllData}
              onNavigateToVMs={() => setActiveTab('vms')}
            />
          )}

          {activeTab === 'vms' && (
            <VirtualMachinesView
              vms={vms}
              onRefresh={loadAllData}
              canManage={canManage}
            />
          )}

          {activeTab === 'casaos' && (
            <CasaOSView
              servers={casaosServers}
              apps={casaosApps}
              onRefresh={loadAllData}
              canManage={canManage}
            />
          )}

          {activeTab === 'docker' && (
            <DockerView
              containers={dockerContainers}
              onRefresh={loadAllData}
              canManage={canManage}
            />
          )}

          {activeTab === 'servers' && (
            <ServersView
              connections={connections}
              onRefresh={loadAllData}
              onNavigateToNode={() => setActiveTab('infrastructure')}
            />
          )}

          {activeTab === 'storage' && (
            <StorageView
              hosts={esxiHosts}
              servers={casaosServers}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'network' && (
            <NetworkView
              hosts={esxiHosts}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'monitoring' && (
            <MonitoringView />
          )}

          {activeTab === 'alerts' && (
            <AlertsView
              alerts={alerts}
              rules={alertRules}
              onRefresh={loadAllData}
              canManage={canManage}
            />
          )}

          {activeTab === 'logs' && (
            <LogsView />
          )}

          {activeTab === 'tasks' && (
            <TasksView />
          )}

          {activeTab === 'users' && (
            <UsersView />
          )}

          {activeTab === 'settings' && (
            <SettingsView />
          )}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandMenu
        isOpen={isCommandMenuOpen}
        onClose={() => setIsCommandMenuOpen(false)}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setIsCommandMenuOpen(false);
        }}
        onOpenAddConnection={() => {
          setIsCommandMenuOpen(false);
          setIsAddConnectionOpen(true);
        }}
        onRefreshData={() => {
          loadAllData();
          setIsCommandMenuOpen(false);
        }}
        canManage={canManage}
      />

      {/* Add Infrastructure Connection Modal */}
      <AddConnectionModal
        isOpen={isAddConnectionOpen}
        onClose={() => setIsAddConnectionOpen(false)}
        onCreated={() => {
          setIsAddConnectionOpen(false);
          loadAllData();
        }}
      />

      {/* Toast Notification Container */}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
