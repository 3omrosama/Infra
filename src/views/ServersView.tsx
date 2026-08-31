import React from 'react';
import { Server, Cpu, HardDrive, Network, ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import { InfrastructureConnection } from '../types/index';
import { formatBytes, formatUptime } from '../lib/utils';

interface ServersViewProps {
  connections: InfrastructureConnection[];
  onRefresh: () => void;
  onNavigateToNode: (id: string) => void;
}

export const ServersView: React.FC<ServersViewProps> = ({
  connections = [],
  onRefresh,
  onNavigateToNode
}) => {
  const safeConnections = connections || [];
  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Compute Nodes & Physical Blades</h2>
          <p className="text-xs text-slate-400">
            Hardware server chassis inventory, BMC/IPMI interfaces, and physical rack topology
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Hardware</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {safeConnections.map(conn => (
          <div
            key={conn.id}
            id={`server-blade-${conn.id}`}
            className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400 border border-slate-700/60">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{conn.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{conn.host}:{conn.port}</p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded-md ${
                  conn.status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  {conn.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Node Architecture</span>
                  <span className="font-semibold text-white">x86_64 Multi-Core</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Type Protocol</span>
                  <span className="font-mono text-cyan-400">{conn.type}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">Telemetry: {conn.pollIntervalSec}s rate</span>
              <button
                onClick={() => onNavigateToNode(conn.id)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Inspect Details →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
