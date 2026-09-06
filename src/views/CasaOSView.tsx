import React, { useState, useEffect, useMemo } from 'react';
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
  Thermometer,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers
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

  // Local apps state for immediate optimistic action reflection
  const [localApps, setLocalApps] = useState<CasaOSApp[]>(apps || []);
  useEffect(() => {
    setLocalApps(apps || []);
  }, [apps]);

  // Independent collapsed state per server ID (default all expanded: false)
  const [collapsedServerIds, setCollapsedServerIds] = useState<Record<string, boolean>>({});

  const toggleServerCollapse = (serverId: string) => {
    setCollapsedServerIds(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  // Pending App Action state
  const [pendingAppAction, setPendingAppAction] = useState<{
    app: CasaOSApp;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);

  // Group apps by connectionId
  const appsByConnection = useMemo(() => {
    const map: Record<string, CasaOSApp[]> = {};
    for (const app of localApps) {
      if (!map[app.connectionId]) {
        map[app.connectionId] = [];
      }
      map[app.connectionId].push(app);
    }
    return map;
  }, [localApps]);

  const handleTriggerAppAction = (app: CasaOSApp, action: 'start' | 'stop' | 'restart') => {
    setPendingAppAction({ app, action });
  };

  const handleExecuteConfirmedAppAction = async (reason?: string) => {
    if (!pendingAppAction) return;
    const { app, action } = pendingAppAction;

    // Determine target immediate status
    const targetStatus = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'restarting';

    // Apply immediate UI state update
    setLocalApps(prev => prev.map(a => a.id === app.id ? { ...a, status: targetStatus } : a));
    setPendingAppAction(null);

    try {
      const res = await api.executeAppAction(app.connectionId, app.id, action, reason);
      showToast('App Action Executed', res.message, 'INFO');
      if (res.app) {
        setLocalApps(prev => prev.map(a => a.id === res.app.id ? res.app : a));
      }
      onRefresh();
    } catch (err: any) {
      // Revert to incoming prop state if failed
      setLocalApps(apps || []);
      showToast('App Action Failed', err.message, 'CRITICAL');
    }
  };

  const totalDiscoveredApps = localApps.length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Global Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">CasaOS Edge Gateways</h2>
          <p className="text-xs text-slate-400">
            Homelab & edge container orchestrators, multi-node disk health, and self-hosted applications
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Global Search across all servers */}
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter edge apps..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            id="btn-refresh-casaos"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {safeServers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Home className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No CasaOS Servers Connected</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Connect a CasaOS or ZimaOS node from the Infrastructure page to manage edge applications.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {safeServers.map(server => {
            const isCollapsed = Boolean(collapsedServerIds[server.id]);
            const serverApps = appsByConnection[server.connectionId] || [];
            
            // Filter this server's apps by search
            const filteredServerApps = serverApps.filter(app => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return (
                app.title.toLowerCase().includes(q) ||
                app.image.toLowerCase().includes(q) ||
                (app.description && app.description.toLowerCase().includes(q))
              );
            });

            const runningAppsCount = serverApps.filter(a => a.status === 'running').length;

            return (
              <div 
                key={server.id} 
                id={`casaos-server-group-${server.id}`}
                className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden shadow-lg transition-all"
              >
                {/* Server Section Header & Accordion Bar */}
                <div 
                  onClick={() => toggleServerCollapse(server.id)}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
                      <Home className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white tracking-tight">{server.hostname}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          server.status === 'ONLINE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {server.status || 'ONLINE'}
                        </span>
                        {server.version && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 text-[10px] font-mono">
                            v{server.version}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {server.ipAddress ? `IP ${server.ipAddress}` : 'Edge Orchestrator'}
                        {server.kernelVersion ? ` • Kernel ${server.kernelVersion}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Summary Telemetry Metrics & Collapse Button */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-between lg:justify-end">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs">
                      <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                        <span className="text-[10px] text-slate-500 uppercase block">CPU</span>
                        <span className="font-bold text-cyan-400">{server.cpuUsagePct != null ? `${server.cpuUsagePct.toFixed(1)}%` : '—'}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                        <span className="text-[10px] text-slate-500 uppercase block">RAM</span>
                        <span className="font-bold text-emerald-400">{server.memoryUsagePct != null ? `${server.memoryUsagePct.toFixed(1)}%` : '—'}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                        <span className="text-[10px] text-slate-500 uppercase block">Storage</span>
                        <span className="font-bold text-purple-400">{server.storageUsagePct != null ? `${server.storageUsagePct.toFixed(1)}%` : '—'}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                        <span className="text-[10px] text-slate-500 uppercase block">Apps</span>
                        <span className="font-bold text-white">{runningAppsCount}/{serverApps.length}</span>
                      </div>
                    </div>

                    <button 
                      type="button"
                      aria-label={isCollapsed ? 'Expand server group' : 'Collapse server group'}
                      className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors ml-1"
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Content: Hardware Strip, Attached Disks, and Server Applications */}
                {!isCollapsed && (
                  <div className="p-5 pt-0 space-y-5 border-t border-slate-800/50">
                    {/* Hardware Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">CPU Utilization</p>
                        <p className="text-base font-bold text-cyan-400 mt-0.5">
                          {server.cpuUsagePct != null ? `${server.cpuUsagePct.toFixed(1)}%` : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">{server.cpuCores ? `${server.cpuCores} Cores` : 'Edge Compute'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">System RAM</p>
                        <p className="text-base font-bold text-emerald-400 mt-0.5">
                          {server.memoryUsagePct != null ? `${server.memoryUsagePct.toFixed(1)}%` : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {server.memoryBytesTotal ? formatBytes(server.memoryBytesTotal) : 'System Memory'}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Physical Storage</p>
                        <p className="text-base font-bold text-purple-400 mt-0.5">
                          {server.storageUsagePct != null ? `${server.storageUsagePct.toFixed(1)}%` : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {server.storageBytesTotal ? formatBytes(server.storageBytesTotal) : 'Primary Pool'}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Node Uptime</p>
                        <p className="text-base font-bold text-white mt-0.5">
                          {server.uptimeSeconds != null ? formatUptime(server.uptimeSeconds) : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">Active</p>
                      </div>
                    </div>

                    {/* Physical Storage & Disks */}
                    {server.disks && server.disks.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                          Attached Drives & SMART Health
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {server.disks.map((disk, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                                <div className="truncate">
                                  <p className="font-bold text-white truncate">{disk.model}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">{disk.path} • {formatBytes(disk.sizeBytes)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-right shrink-0">
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

                    {/* Installed Applications for this Server Group */}
                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-cyan-400" />
                          <h4 className="text-sm font-bold text-white">
                            Applications on {server.hostname}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-400">
                            {filteredServerApps.length} {filteredServerApps.length === 1 ? 'App' : 'Apps'}
                          </span>
                        </div>
                      </div>

                      {filteredServerApps.length === 0 ? (
                        <div className="p-6 text-center bg-slate-950/50 border border-slate-800/60 rounded-xl">
                          <Boxes className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">
                            {searchQuery.trim() ? `No applications matching "${searchQuery}" on this node.` : 'No applications installed on this CasaOS server.'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredServerApps.map(app => {
                            const isRunning = app.status === 'running';
                            const isRestarting = app.status === 'restarting';

                            return (
                              <div
                                key={app.id}
                                id={`casaos-app-${app.id}`}
                                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img
                                        src={app.iconUrl}
                                        alt={app.title}
                                        onError={(e: any) => { e.target.src = 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/docker.png'; }}
                                        className="w-9 h-9 rounded-lg bg-slate-800 p-1 border border-slate-700/60 object-contain shrink-0"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="min-w-0">
                                        <h5 className="font-bold text-white text-sm truncate">{app.title}</h5>
                                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[170px]">{app.image}</p>
                                      </div>
                                    </div>

                                    <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded shrink-0 ${
                                      isRunning
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : isRestarting
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}>
                                      {app.status}
                                    </span>
                                  </div>

                                  <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">
                                    {app.description || 'Docker containerized service managed by CasaOS.'}
                                  </p>
                                </div>

                                {/* Ports & Controls */}
                                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                                  <div className="text-[11px] font-mono text-slate-400">
                                    {app.port ? `Port :${app.port}` : 'Bridge Net'}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {app.port && isRunning && (
                                      <a
                                        href={`http://${server.ipAddress || server.hostname || 'localhost'}:${app.port}`}
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
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

