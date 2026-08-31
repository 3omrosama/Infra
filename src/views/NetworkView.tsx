import React from 'react';
import { Network, Server, ArrowUpRight, ArrowDownRight, RefreshCw, Radio } from 'lucide-react';
import { ESXiHost } from '../types/index';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface NetworkViewProps {
  hosts: ESXiHost[];
  onRefresh: () => void;
}

export const NetworkView: React.FC<NetworkViewProps> = ({
  hosts = [],
  onRefresh
}) => {
  const safeHosts = hosts || [];
  const allNetworks = safeHosts.flatMap(h => (h.networks || []).map(n => ({ ...n, hostName: h.name })) || []);

  const mockNetFlow = [
    { time: '12:00', ingress: 24.5, egress: 18.2 },
    { time: '12:15', ingress: 31.0, egress: 22.8 },
    { time: '12:30', ingress: 45.2, egress: 38.4 },
    { time: '12:45', ingress: 28.6, egress: 19.5 },
    { time: '13:00', ingress: 52.1, egress: 41.0 },
    { time: '13:15', ingress: 36.4, egress: 27.8 }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Virtual Networking & VLANs</h2>
          <p className="text-xs text-slate-400">
            vSwitches, standard port groups, 802.1Q VLAN trunking, and physical uplink adapters
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Networks</span>
        </button>
      </div>

      {/* Network Traffic Visualizer */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Aggregated Uplink Throughput</h3>
            <p className="text-xs text-slate-400">Real-time Gbps throughput across all physical NIC interfaces</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Ingress
            </span>
            <span className="flex items-center gap-1.5 text-purple-400">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Egress
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockNetFlow}>
              <defs>
                <linearGradient id="netRxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="netTxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} unit=" Mb" tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }} />
              <Area type="monotone" dataKey="ingress" stroke="#3b82f6" fill="url(#netRxGrad)" strokeWidth={2} name="Ingress (Mbps)" />
              <Area type="monotone" dataKey="egress" stroke="#a855f7" fill="url(#netTxGrad)" strokeWidth={2} name="Egress (Mbps)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Port Groups & vSwitches */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          <span>Configured Port Groups & Switches</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allNetworks.map(net => (
            <div key={net.id} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">{net.name}</h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Switch: {net.vswitch}</p>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  VLAN {net.vlanId}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Host:</span>
                  <span className="text-white font-mono">{net.hostName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Physical Uplinks:</span>
                  <span className="text-cyan-400 font-mono">{net.uplinks.join(', ')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Security Policy:</span>
                  <span className="text-emerald-400">Promiscuous: Reject</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
