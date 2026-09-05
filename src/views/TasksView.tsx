import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Clock, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { AuditLog } from '../types/index';
import { api } from '../lib/api';
import { formatRelativeTime } from '../lib/utils';

export const TasksView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAudit = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (e) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Security Audit Trail & Task History</h2>
          <p className="text-xs text-slate-400">
            Cryptographically sealed and immutable audit trail of operator actions and power commands
          </p>
        </div>

        <button
          onClick={fetchAudit}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Audit</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Operator</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Target Resource</th>
                <th className="py-3.5 px-4">Execution Details & Rationale</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No audit records logged yet
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr key={log.id ? `${log.id}-${idx}` : `log-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-cyan-600/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] uppercase">
                          {log.username.substring(0, 2)}
                        </div>
                        <span className="font-bold text-white">{log.username}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 font-mono font-semibold text-cyan-400">
                      {log.action}
                    </td>

                    <td className="py-4 px-4 font-mono text-slate-300">
                      {log.target || 'System'}
                    </td>

                    <td className="py-4 px-4 text-slate-300">
                      <p className="line-clamp-1">{log.details}</p>
                    </td>

                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        log.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>

                    <td className="py-4 px-4 font-mono text-slate-400">
                      {formatRelativeTime(log.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
