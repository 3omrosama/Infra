import React, { useState } from 'react';
import { 
  Home, 
  Boxes, 
  HardDrive, 
  Power, 
  RotateCw, 
  ExternalLink, 
  RefreshCw, 
  Search, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  Thermometer
} from 'lucide-react';
import { CasaOSServer, CasaOSApp } from '../types/index';
import { formatBytes, formatUptime } from '../lib/utils';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

interface CasaOSViewProps {
  servers: CasaOSServer[];
  apps: CasaOSApp[];
  onRefresh: () => void;
  canManage: boolean;
}

export const CasaOSView: React.FC<CasaOSViewProps> = ({
  servers = [],
  apps = [],
  onRefresh,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const safeServers = servers || [];
  const safeApps = apps || [];
  const [selectedServerId, setSelectedServerId] = useState<string | null>(safeServers[0]?.id || null);
  
  // Pending App Action state
  const [pendingAppAction, setPendingAppAction] = useState<{
    app: CasaOSApp;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);

  const selectedServer = safeServers.find(s => s.id === selectedServerId) || safeServers[0];

  const filteredApps = safeApps.filter(app => {
    const matchesSearch = 
      app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesServer = !selectedServerId || app.connectionId === selectedServer?.connectionId;
    return matchesSearch && matchesServer;
  });

  const handleTriggerAppAction = (app: CasaOSApp, action: 'start' | 'stop' | 'restart') => {
    setPendingAppAction({ app, action });
  };

  const handleExecuteConfirmedAppAction = async (reason?: string) => {
    if (!pendingAppAction) return;
    const { app, action } = pendingAppAction;

    try {
      const res = await api.executeAppAction(app.connectionId, app.id, action, reason);
      showToast('App Action Executed', res.message, 'INFO');
      setPendingAppAction(null);
      onRefresh();
    } catch (err: any) {
      showToast('App Action Failed', err.message, 'CRITICAL');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">CasaOS Edge Gateways</h2>
          <p className="text-xs text-slate-400">
            Homelab & edge container orchestrators, disk health, and self-hosted applications
          </p>
        </div>

        <button
          id="btn-refresh-casaos"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Edge Apps</span>
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Home className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No CasaOS Servers Connected</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Connect a CasaOS or ZimaOS node from the Infrastructure page to manage edge applications.
          </p>
        </div>
      ) : (
        <>
          {/* Selected Server Metrics & Hardware Strip */}
          {selectedServer && (
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    <Home className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedServer.hostname}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      CasaOS v{selectedServer.version} • Kernel {selectedServer.kernelVersion}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                    {selectedServer.status}
                  </span>
                </div>
              </div>

              {/* Hardware stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">CPU Utilization</p>
                  <p className="text-base font-bold text-cyan-400 mt-0.5">{selectedServer.cpuUsagePct.toFixed(1)}%</p>
                  <p className="text-[11px] text-slate-500 font-mono">Load Avg: 0.42, 0.38</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">System RAM</p>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">{selectedServer.memoryUsagePct.toFixed(1)}%</p>
                  <p className="text-[11px] text-slate-500 font-mono">Capacity: 32 GB DDR4</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Physical Storage</p>
                  <p className="text-base font-bold text-purple-400 mt-0.5">{selectedServer.storageUsagePct.toFixed(1)}%</p>
                  <p className="text-[11px] text-slate-500 font-mono">Pool: 2x 4TB RAID1</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Node Uptime</p>
                  <p className="text-base font-bold text-white mt-0.5">{formatUptime(selectedServer.uptimeSeconds)}</p>
                  <p className="text-[11px] text-slate-500 font-mono">Active</p>
                </div>
              </div>

              {/* Physical Storage & Disks */}
              {selectedServer.disks && selectedServer.disks.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Attached Drives & SMART Health
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedServer.disks.map((disk, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <HardDrive className="w-4 h-4 text-cyan-400" />
                          <div>
                            <p className="font-bold text-white">{disk.model}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{disk.path} • {formatBytes(disk.sizeBytes)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          {disk.temperatureC && (
                            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                              <span>{disk.temperatureC}°C</span>
                            </div>
                          )}
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400">
                            {disk.smartStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Installed Applications Grid */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Installed Edge Applications</h3>
                <span className="text-xs font-mono text-slate-400">({filteredApps.length} Apps)</span>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredApps.map(app => {
                const isRunning = app.status === 'running';

                return (
                  <div
                    key={app.id}
                    id={`casaos-app-${app.id}`}
                    className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={app.iconUrl}
                            alt={app.title}
                            onError={(e: any) => { e.target.src = 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/docker.png'; }}
                            className="w-10 h-10 rounded-xl bg-slate-800 p-1.5 border border-slate-700/60 object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="font-bold text-white text-sm">{app.title}</h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">{app.image}</p>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded-md ${
                          isRunning
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {app.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                        {app.description || 'Docker containerized self-hosted service managed by CasaOS.'}
                      </p>
                    </div>

                    {/* App Ports & Action Footer */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[11px] font-mono text-slate-400">
                        {app.port ? `Port :${app.port}` : 'Bridge Net'}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {app.port && isRunning && (
                          <a
                            href={`http://${selectedServer?.ipAddress || selectedServer?.host || 'localhost'}:${app.port}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 transition-colors"
                            title="Open Web Interface"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {canManage && (
                          <>
                            {isRunning ? (
                              <>
                                <button
                                  id={`btn-restart-app-${app.id}`}
                                  onClick={() => handleTriggerAppAction(app, 'restart')}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors"
                                  title="Restart Container"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`btn-stop-app-${app.id}`}
                                  onClick={() => handleTriggerAppAction(app, 'stop')}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors"
                                  title="Stop Container"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                id={`btn-start-app-${app.id}`}
                                onClick={() => handleTriggerAppAction(app, 'start')}
                                className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                                title="Start Container"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Confirmation Dialog for App Actions */}
      {pendingAppAction && (
        <ConfirmDialog
          isOpen={Boolean(pendingAppAction)}
          title={`Execute '${pendingAppAction.action.toUpperCase()}' on ${pendingAppAction.app.title}`}
          message={`Are you sure you want to execute '${pendingAppAction.action}' on CasaOS application '${pendingAppAction.app.title}'?`}
          confirmLabel={`Execute ${pendingAppAction.action}`}
          isDestructive={pendingAppAction.action === 'stop'}
          onConfirm={handleExecuteConfirmedAppAction}
          onCancel={() => setPendingAppAction(null)}
        />
      )}
    </div>
  );
};
