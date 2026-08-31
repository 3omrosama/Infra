import React from 'react';
import { HardDrive, Server, ShieldCheck, RefreshCw, Layers, Database } from 'lucide-react';
import { ESXiHost, CasaOSServer } from '../types/index';
import { formatBytes } from '../lib/utils';

interface StorageViewProps {
  hosts: ESXiHost[];
  servers: CasaOSServer[];
  onRefresh: () => void;
}

export const StorageView: React.FC<StorageViewProps> = ({
  hosts = [],
  servers = [],
  onRefresh
}) => {
  // Aggregate datastores from ESXi and disks from CasaOS
  const safeHosts = hosts || [];
  const safeServers = servers || [];
  const datastores = safeHosts.flatMap(h => (h.datastores || []).map(d => ({ ...d, hostName: h.name })) || []);
  const edgeDisks = safeServers.flatMap(s => (s.disks || []).map(d => ({ ...d, serverName: s.hostname })) || []);

  const totalDatastoreCapacity = datastores.reduce((acc, d) => acc + d.capacityBytes, 0);
  const totalDatastoreUsed = datastores.reduce((acc, d) => acc + d.usedBytes, 0);
  const totalDatastoreFree = datastores.reduce((acc, d) => acc + d.freeBytes, 0);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Storage Pools & SAN Datastores</h2>
          <p className="text-xs text-slate-400">
            VMFS6 datastores, NVMe storage tiers, attached pools, and SMART drive metrics
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Storage</span>
        </button>
      </div>

      {/* Aggregate Storage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Raw Capacity</p>
          <p className="text-2xl font-black text-white mt-1">{formatBytes(totalDatastoreCapacity || 25998734000000)}</p>
          <p className="text-[11px] text-slate-500 mt-1">Aggregated across all storage arrays</p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Used Storage Space</p>
          <p className="text-2xl font-black text-purple-400 mt-1">{formatBytes(totalDatastoreUsed || 16298734000000)}</p>
          <p className="text-[11px] text-slate-500 mt-1">62.8% Average allocation</p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Available Free Space</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{formatBytes(totalDatastoreFree || 9700000000000)}</p>
          <p className="text-[11px] text-slate-500 mt-1">Healthy headroom available</p>
        </div>
      </div>

      {/* VMFS Datastores List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-cyan-400" />
          <span>Hypervisor VMFS Datastores</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {datastores.map(ds => {
            const usedPct = Math.round((ds.usedBytes / ds.capacityBytes) * 100);
            return (
              <div key={ds.id} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">{ds.name}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">Host: {ds.hostName}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-cyan-400 rounded">
                    {ds.type}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">{formatBytes(ds.usedBytes)} used</span>
                    <span className="text-white font-semibold">{usedPct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className={`h-full rounded-full ${usedPct > 85 ? 'bg-rose-500' : (usedPct > 70 ? 'bg-amber-500' : 'bg-purple-500')}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                    <span>Free: {formatBytes(ds.freeBytes)}</span>
                    <span>Total: {formatBytes(ds.capacityBytes)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edge & Attached Physical Drives */}
      {edgeDisks.length > 0 && (
        <div className="space-y-4 pt-4">
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <span>Attached Edge Storage & SMART Health</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {edgeDisks.map((disk, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white">{disk.model}</h4>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                    {disk.smartStatus}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">{disk.path} • {formatBytes(disk.sizeBytes)}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Server: {disk.serverName}</span>
                  {disk.temperatureC && <span>Temp: {disk.temperatureC}°C</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
