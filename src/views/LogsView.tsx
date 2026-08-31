import React, { useState, useEffect } from 'react';
import { ScrollText, Search, RefreshCw, Download, Filter, Radio } from 'lucide-react';
import { SystemEvent } from '../types/index';
import { api } from '../lib/api';

export const LogsView: React.FC = () => {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEvents({
        severity: severityFilter || undefined,
        search: searchQuery || undefined
      });
      setEvents(data);
    } catch (e) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [severityFilter]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noc-system-logs-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">System Logs & Centralized Telemetry Stream</h2>
          <p className="text-xs text-slate-400">
            Real-time event logging across hypervisors, containers, and monitoring services
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Tail Logs</span>
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search event logs by message, source, or event type..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchLogs()}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Severity:</span>
          {(['', 'CRITICAL', 'WARNING', 'INFO'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                severityFilter === s
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {s || 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Terminal Box */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 font-mono text-xs shadow-2xl overflow-hidden space-y-2">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 text-[11px] text-slate-500">
          <span>STREAM: /var/log/noc-infra-telemetry.log</span>
          <span>{events.length} records buffered</span>
        </div>

        <div className="max-h-[600px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
          {events.length === 0 ? (
            <div className="py-12 text-center text-slate-600">No log records found</div>
          ) : (
            events.map(event => {
              let sevColor = 'text-cyan-400';
              if (event.severity === 'CRITICAL') sevColor = 'text-rose-400 font-bold';
              if (event.severity === 'WARNING') sevColor = 'text-amber-400 font-bold';

              return (
                <div key={event.id} className="flex items-start gap-3 hover:bg-slate-900/60 p-1.5 rounded transition-colors">
                  <span className="text-slate-500 shrink-0">
                    {new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 ${
                    event.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : (event.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400')
                  }`}>
                    {event.severity}
                  </span>
                  <span className="text-slate-400 shrink-0 font-semibold">[{event.source}]</span>
                  <span className="text-slate-300 flex-1">{event.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
