import React, { useState } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Network, 
  Activity, 
  Layers, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { ESXiHost } from '../types/index';
import { formatBytes, formatUptime } from '../lib/utils';

interface ESXiViewProps {
  hosts: ESXiHost[];
  onRefresh: () => void;
  onNavigateToVMs: () => void;
}

export const ESXiView: React.FC<ESXiViewProps> = ({
  hosts = [],
  onRefresh,
  onNavigateToVMs
}) => {
  const safeHosts = hosts || [];
  const [selectedHostId, setSelectedHostId] = useState<string | null>(safeHosts[0]?.id || null);

  const selectedHost = safeHosts.find(h => h.id === selectedHostId) || safeHosts[0];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">VMware ESXi Hypervisors</h2>
          <p className="text-xs text-slate-400">
            Bare-metal hypervisor cluster nodes, VMFS datastores, and virtual distributed switches
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-refresh-esxi"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            id="btn-esxi-jump-vms"
            onClick={onNavigateToVMs}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all"
          >
            <Cpu className="w-4 h-4" />
            <span>View All Hosted VMs</span>
          </button>
        </div>
      </div>

      {hosts.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No ESXi Hypervisors Connected</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Connect an ESXi host via the Infrastructure inventory to start monitoring hypervisor hardware and VMs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Host Nodes List Column */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hypervisor Nodes</h3>
            {hosts.map(host => {
              const isSelected = selectedHost?.id === host.id;
              return (
                <div
                  key={host.id}
                  id={`esxi-card-${host.id}`}
                  onClick={() => setSelectedHostId(host.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500 shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400 border border-slate-700/60">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{host.name}</h4>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{host.ipAddress}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {host.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-[11px]">
                    <div>
                      <p className="text-slate-500">CPU</p>
                      <p className="font-mono font-semibold text-white mt-0.5">{host.cpuUsagePct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">RAM</p>
                      <p className="font-mono font-semibold text-white mt-0.5">{host.memoryUsagePct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Uptime</p>
                      <p className="font-mono font-semibold text-slate-300 mt-0.5">{formatUptime(host.uptimeSeconds)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Host Deep Dive Details */}
          {selectedHost && (
            <div className="lg:col-span-2 space-y-6">
              {/* Hardware Overview Card */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedHost.name} Specifications</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedHost.model}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-cyan-400 font-mono text-xs font-semibold">
                      {selectedHost.version} (Build {selectedHost.buildNumber})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">CPU Sockets</p>
                    <p className="text-base font-bold text-white mt-0.5">{selectedHost.cpuSockets} Socket(s)</p>
                    <p className="text-[11px] text-cyan-400 font-mono">{selectedHost.cpuCores} Cores Total</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Physical Memory</p>
                    <p className="text-base font-bold text-white mt-0.5">{formatBytes(selectedHost.memoryTotalBytes)}</p>
                    <p className="text-[11px] text-emerald-400 font-mono">{formatBytes(selectedHost.memoryUsedBytes)} Used</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Power State</p>
                    <p className="text-base font-bold text-emerald-400 mt-0.5">{selectedHost.powerState}</p>
                    <p className="text-[11px] text-slate-400 font-mono">ACPI Standard</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Host Uptime</p>
                    <p className="text-base font-bold text-white mt-0.5">{formatUptime(selectedHost.uptimeSeconds)}</p>
                    <p className="text-[11px] text-slate-400 font-mono">Continuous</p>
                  </div>
                </div>
              </div>

              {/* Datastores Table */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Mounted VMFS Datastores</h3>
                  </div>
                  <span className="text-xs font-mono text-slate-500">{selectedHost.datastores?.length || 0} Stores</span>
                </div>

                <div className="space-y-3">
                  {selectedHost.datastores?.map(ds => {
                    const usedPct = Math.round((ds.usedBytes / ds.capacityBytes) * 100);
                    return (
                      <div key={ds.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{ds.name}</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded">
                              {ds.type}
                            </span>
                          </div>
                          <span className="font-mono text-slate-300">
                            {formatBytes(ds.freeBytes)} Free of {formatBytes(ds.capacityBytes)}
                          </span>
                        </div>

                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${usedPct > 85 ? 'bg-rose-500' : (usedPct > 70 ? 'bg-amber-500' : 'bg-cyan-500')}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Virtual Networks & vSwitches */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Virtual Switches & Port Groups</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedHost.networks?.map(net => (
                    <div key={net.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white">{net.name}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-cyan-400 rounded">
                          VLAN {net.vlanId}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">vSwitch: {net.vswitch}</p>
                      <p className="text-[11px] text-slate-500 font-mono">Uplinks: {net.uplinks.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
