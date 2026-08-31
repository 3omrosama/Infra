import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Network, RefreshCw, Clock, Radio } from 'lucide-react';
import { MetricDataPoint } from '../types/index';
import { api } from '../lib/api';
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

export const MonitoringView: React.FC = () => {
  const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [metrics, setMetrics] = useState<MetricDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = async (selectedRange: string) => {
    setIsLoading(true);
    try {
      const res = await api.getMetrics(selectedRange);
      setMetrics(res.data);
    } catch (err) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics(range);
  }, [range]);

  const chartData = metrics.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: m.cpu,
    memory: m.memory,
    storage: m.storage,
    rx: Math.round(m.networkRxKbps / 1000),
    tx: Math.round(m.networkTxKbps / 1000)
  }));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Live Telemetry & Metrics</h2>
          <p className="text-xs text-slate-400">
            High-precision time series instrumentation of compute, memory, datastore IOPS, and network throughput
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          {(['1h', '6h', '24h', '7d'] as const).map(r => (
            <button
              key={r}
              id={`btn-range-${r}`}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === r
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => fetchMetrics(range)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Chart 1: CPU & Memory Combined */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Compute & Memory Utilization (%)</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> CPU Load
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> RAM Load
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }} />
              <Line type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2.5} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2.5} dot={false} name="RAM %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Network Traffic (Rx / Tx) */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Network Bandwidth (Mbps)</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Ingress (Rx)
            </span>
            <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Egress (Tx)
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="monRxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="monTxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} unit=" Mb" tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }} />
              <Area type="monotone" dataKey="rx" stroke="#3b82f6" fill="url(#monRxGrad)" strokeWidth={2} name="Rx (Mbps)" />
              <Area type="monotone" dataKey="tx" stroke="#a855f7" fill="url(#monTxGrad)" strokeWidth={2} name="Tx (Mbps)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
