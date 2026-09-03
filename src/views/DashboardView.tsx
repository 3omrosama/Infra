import React from 'react';
import { 
  Server, 
  Cpu, 
  Boxes, 
  AlertOctagon, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownRight, 
  HardDrive, 
  Radio, 
  Clock, 
  Layers,
  Sparkles,
  RefreshCw,
  Plus
} from 'lucide-react';
import { DashboardSummary } from '../types/index';
import { formatBytes, formatNetworkSpeed, formatRelativeTime } from '../lib/utils';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  Legend
} from 'recharts';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  isLoading: boolean;
  onNavigate: (tab: any) => void;
  onOpenAddConnection: () => void;
  onAcknowledgeAlert?: (alertId: string) => void;
  canManage: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  isLoading,
  onNavigate,
  onOpenAddConnection,
  onAcknowledgeAlert,
  canManage
}) => {
  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs font-mono text-slate-400">Loading infrastructure telemetry...</p>
        </div>
      </div>
    );
  }

  // Format chart timestamp
  const chartData = (summary.historicalMetrics || []).map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: m.cpu ?? 0,
    memory: m.memory ?? 0,
    storage: m.storage ?? 0,
    rx: Math.round((m.networkRxKbps || 0) / 1000), // Mbps
    tx: Math.round((m.networkTxKbps || 0) / 1000)  // Mbps
  }));

  const healthScore = summary.healthScore ?? 100;
  const healthColor = healthScore >= 90 ? 'text-emerald-400' : (healthScore >= 70 ? 'text-amber-400' : 'text-rose-400');
  const healthBg = healthScore >= 90 ? 'bg-emerald-500/10 border-emerald-500/20' : (healthScore >= 70 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20');
  const activeAlerts = summary.activeAlerts || [];
  const recentEvents = summary.recentEvents || [];
  const recentAuditLogs = summary.recentAuditLogs || [];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Top Banner / Cluster Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Health Score Card */}
        <div className={`p-5 rounded-2xl border ${healthBg} flex items-center justify-between`}>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fleet Health Index</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl font-black ${healthColor}`}>{healthScore}%</span>
              <span className="text-xs text-slate-400 font-mono">
                {healthScore >= 90 ? 'OPTIMAL' : (healthScore >= 70 ? 'DEGRADED' : 'CRITICAL')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Real-time composite telemetry</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-cyan-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
        </div>

        {/* Total Nodes */}
        <div 
          onClick={() => onNavigate('infrastructure')}
          className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Infrastructure Nodes</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-white">{summary.nodes?.total ?? 0}</span>
              <span className="text-xs text-emerald-400 font-mono font-semibold">{summary.nodes?.online ?? 0} Online</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {(summary.nodes?.offline ?? 0) > 0 ? `${summary.nodes.offline} Offline` : 'All nodes reachable'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 group-hover:bg-cyan-500/20 text-slate-400 group-hover:text-cyan-300 transition-colors">
            <Server className="w-7 h-7" />
          </div>
        </div>

        {/* Virtual Machines */}
        <div 
          onClick={() => onNavigate('vms')}
          className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Virtual Machines</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-white">{summary.vms?.total ?? 0}</span>
              <span className="text-xs text-emerald-400 font-mono font-semibold">{summary.vms?.running ?? 0} Running</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{summary.vms?.stopped ?? 0} Stopped • {summary.vms?.suspended ?? 0} Paused</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 group-hover:bg-cyan-500/20 text-slate-400 group-hover:text-cyan-300 transition-colors">
            <Cpu className="w-7 h-7" />
          </div>
        </div>

        {/* Docker & Containers */}
        <div 
          onClick={() => onNavigate('docker')}
          className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Containers & Apps</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-white">{summary.containers?.total ?? 0}</span>
              <span className="text-xs text-emerald-400 font-mono font-semibold">{summary.containers?.running ?? 0} Active</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">CasaOS & Docker engine instances</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 group-hover:bg-cyan-500/20 text-slate-400 group-hover:text-cyan-300 transition-colors">
            <Boxes className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Active Incidents Banner (if any) */}
      {activeAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 animate-bounce" />
              <span>Active Infrastructure Incidents ({activeAlerts.length})</span>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
            >
              View all in Incident Center →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.slice(0, 2).map(alert => (
              <div 
                key={alert.id}
                className="p-3 rounded-xl bg-slate-950/80 border border-rose-500/20 flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white">
                      {alert.severity}
                    </span>
                    <h4 className="font-semibold text-white truncate">{alert.title}</h4>
                  </div>
                  <p className="text-slate-400 mt-1 text-[11px] line-clamp-1">{alert.message}</p>
                </div>
                {canManage && onAcknowledgeAlert && (
                  <button
                    onClick={() => onAcknowledgeAlert(alert.id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold shrink-0"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Time Telemetry & Resource Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CPU Utilization Meter */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Cluster CPU Load</h3>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-400">
              {(summary.metrics?.cpuUtilizationPct ?? 0).toFixed(1)}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                (summary.metrics?.cpuUtilizationPct ?? 0) > 80 ? 'bg-rose-500' : ((summary.metrics?.cpuUtilizationPct ?? 0) > 60 ? 'bg-amber-500' : 'bg-cyan-500')
              }`}
              style={{ width: `${Math.min(100, summary.metrics?.cpuUtilizationPct ?? 0)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>{summary.metrics?.cpuCoresTotal ? `Aggregated ${summary.metrics.cpuCoresTotal} Cores` : 'Cores: Dynamic'}</span>
            <span>Live Telemetry</span>
          </div>
        </div>

        {/* Memory Utilization Meter */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Memory Allocation</h3>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {(summary.metrics?.memoryUtilizationPct ?? 0).toFixed(1)}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                (summary.metrics?.memoryUtilizationPct ?? 0) > 85 ? 'bg-rose-500' : ((summary.metrics?.memoryUtilizationPct ?? 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500')
              }`}
              style={{ width: `${Math.min(100, summary.metrics?.memoryUtilizationPct ?? 0)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>
              Used: {summary.metrics?.memoryBytesUsed ? formatBytes(summary.metrics.memoryBytesUsed) : `${(summary.metrics?.memoryUtilizationPct ?? 0).toFixed(1)}%`}
            </span>
            <span>
              Capacity: {summary.metrics?.memoryBytesTotal ? formatBytes(summary.metrics.memoryBytesTotal) : '--'}
            </span>
          </div>
        </div>

        {/* Storage Pool Meter */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Storage Datastores</h3>
            </div>
            <span className="text-xs font-mono font-bold text-purple-400">
              {(summary.metrics?.storageUtilizationPct ?? 0).toFixed(1)}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div 
              className="h-full rounded-full bg-purple-500 transition-all duration-500"
              style={{ width: `${Math.min(100, summary.metrics?.storageUtilizationPct ?? 0)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>
              Used: {summary.metrics?.storageBytesUsed ? formatBytes(summary.metrics.storageBytesUsed) : `${(summary.metrics?.storageUtilizationPct ?? 0).toFixed(1)}%`}
            </span>
            <span>
              Capacity: {summary.metrics?.storageBytesTotal ? formatBytes(summary.metrics.storageBytesTotal) : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Utilization Timeline */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Cluster Workload History</h3>
              <p className="text-xs text-slate-400">CPU and Memory load over last 24 intervals</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> CPU
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> RAM
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2.5} dot={false} name="CPU %" />
                <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2.5} dot={false} name="RAM %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Network Throughput Chart */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Network Bandwidth (Mbps)</h3>
              <p className="text-xs text-slate-400">Aggregated inbound & outbound traffic</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Ingress (Rx)
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Egress (Tx)
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} unit="M" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="rx" stroke="#3b82f6" fill="url(#rxGrad)" strokeWidth={2} name="Rx (Mbps)" />
                <Area type="monotone" dataKey="tx" stroke="#a855f7" fill="url(#txGrad)" strokeWidth={2} name="Tx (Mbps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Audit & Event Ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Events */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-tight">System Events</h3>
            <button
              onClick={() => onNavigate('logs')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              View System Logs →
            </button>
          </div>

          <div className="divide-y divide-slate-800/60">
            {recentEvents.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">No system events logged</p>
            ) : (
              recentEvents.slice(0, 5).map(event => (
                <div key={event.id} className="py-2.5 flex items-start gap-3 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                    event.severity === 'CRITICAL' ? 'bg-rose-500' : (event.severity === 'WARNING' ? 'bg-amber-500' : 'bg-cyan-500')
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-200 truncate">{event.message}</p>
                      <span className="text-[10px] text-slate-500 font-mono">{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">{event.source} • {event.eventType}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Audit Log Trail */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-tight">Security & Management Audit</h3>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Full Audit Trail →
            </button>
          </div>

          <div className="divide-y divide-slate-800/60">
            {recentAuditLogs.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">No recent audit logs</p>
            ) : (
              recentAuditLogs.slice(0, 5).map(log => (
                <div key={log.id} className="py-2.5 flex items-start gap-3 text-xs">
                  <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-[10px] text-cyan-400 uppercase shrink-0 mt-0.5">
                    {log.username?.substring(0, 2) || 'OP'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-200 truncate">{log.details}</p>
                      <span className="text-[10px] text-slate-500 font-mono">{formatRelativeTime(log.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      User: {log.username} • Action: {log.action} • {log.status}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
