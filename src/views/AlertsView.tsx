import React, { useState } from 'react';
import { 
  AlertOctagon, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Plus, 
  RefreshCw, 
  Check, 
  Trash2, 
  Sliders, 
  X,
  Filter
} from 'lucide-react';
import { Alert, AlertRule, AlertSeverity } from '../types/index';
import { formatRelativeTime } from '../lib/utils';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

interface AlertsViewProps {
  alerts: Alert[];
  rules: AlertRule[];
  onRefresh: () => void;
  canManage: boolean;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts = [],
  rules = [],
  onRefresh,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [activeTab, setActiveTab] = useState<'incidents' | 'rules'>('incidents');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  
  // New Rule Form State
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleMetric, setRuleMetric] = useState('cpu');
  const [ruleThreshold, setRuleThreshold] = useState('85');
  const [ruleSeverity, setRuleSeverity] = useState<AlertSeverity>('CRITICAL');

  const safeAlerts = alerts || [];
  const safeRules = rules || [];

  const filteredAlerts = safeAlerts.filter(a => {
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchesSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
    return matchesStatus && matchesSeverity;
  });

  const handleAcknowledge = async (id: string) => {
    try {
      await api.acknowledgeAlert(id);
      showToast('Incident Acknowledged', 'Alert status updated to ACKNOWLEDGED', 'INFO');
      onRefresh();
    } catch (err: any) {
      showToast('Error', err.message, 'CRITICAL');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.resolveAlert(id);
      showToast('Incident Resolved', 'Alert status marked as RESOLVED', 'INFO');
      onRefresh();
    } catch (err: any) {
      showToast('Error', err.message, 'CRITICAL');
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAlertRule({
        name: ruleName,
        metric: ruleMetric,
        condition: 'gt',
        threshold: parseFloat(ruleThreshold),
        durationSec: 60,
        severity: ruleSeverity
      });
      showToast('Rule Created', `New alert rule '${ruleName}' created`, 'INFO');
      setShowAddRuleModal(false);
      setRuleName('');
      onRefresh();
    } catch (err: any) {
      showToast('Error', err.message, 'CRITICAL');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.deleteAlertRule(id);
      showToast('Rule Removed', 'Alert rule deleted', 'INFO');
      onRefresh();
    } catch (err: any) {
      showToast('Error', err.message, 'CRITICAL');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Alerts & Incident Response Center</h2>
          <p className="text-xs text-slate-400">
            Real-time threshold evaluations, notification policies, and incident management
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {canManage && activeTab === 'rules' && (
            <button
              onClick={() => setShowAddRuleModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Rule</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('incidents')}
          className={`py-3 border-b-2 transition-all ${
            activeTab === 'incidents'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Active Incidents ({alerts.filter(a => a.status === 'ACTIVE').length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`py-3 border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Alert Rules & Thresholds ({rules.length})
        </button>
      </div>

      {activeTab === 'incidents' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
              {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                    statusFilter === s
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Severity:</span>
              {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map(sev => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                    severityFilter === sev
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Incidents Table */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Severity / Incident</th>
                    <th className="py-3.5 px-4">Source Node</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Triggered</th>
                    <th className="py-3.5 px-4">Observed / Threshold</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No active or matching infrastructure alerts found
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.map(alert => {
                      return (
                        <tr key={alert.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-4 px-4">
                            <div className="flex items-start gap-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${
                                alert.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : (alert.severity === 'WARNING' ? 'bg-amber-500 text-black' : 'bg-cyan-500 text-white')
                              }`}>
                                {alert.severity}
                              </span>
                              <div>
                                <h4 className="font-bold text-white text-sm">{alert.title}</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{alert.message}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 font-mono text-slate-300">
                            {alert.source}
                          </td>

                          <td className="py-4 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              alert.status === 'ACTIVE'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : (alert.status === 'ACKNOWLEDGED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30')
                            }`}>
                              {alert.status}
                            </span>
                          </td>

                          <td className="py-4 px-4 font-mono text-slate-400">
                            {formatRelativeTime(alert.createdAt)}
                          </td>

                          <td className="py-4 px-4 font-mono text-slate-300">
                            {alert.valueObserved ? `${alert.valueObserved.toFixed(1)}%` : '—'} / {alert.threshold ? `${alert.threshold}%` : '—'}
                          </td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canManage && alert.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleAcknowledge(alert.id)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold transition-colors"
                                >
                                  Ack
                                </button>
                              )}
                              {canManage && alert.status !== 'RESOLVED' && (
                                <button
                                  onClick={() => handleResolve(alert.id)}
                                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition-colors"
                                >
                                  Resolve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Rules Table */
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Rule Name</th>
                <th className="py-3.5 px-4">Monitored Metric</th>
                <th className="py-3.5 px-4">Threshold</th>
                <th className="py-3.5 px-4">Trigger Severity</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {safeRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No alert rules configured
                  </td>
                </tr>
              ) : (
                safeRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-4 font-bold text-white text-sm">{rule.name}</td>
                    <td className="py-4 px-4 font-mono text-cyan-400 uppercase">{rule.metric}</td>
                    <td className="py-4 px-4 font-mono text-slate-300">&gt; {rule.threshold}%</td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rule.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-black'
                      }`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                        {rule.isEnabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      {canManage && (
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Alert Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create Alert Rule</h3>
              <button onClick={() => setShowAddRuleModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Critical High RAM Warning"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Metric</label>
                  <select
                    value={ruleMetric}
                    onChange={e => setRuleMetric(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500"
                  >
                    <option value="cpu">CPU Utilization</option>
                    <option value="memory">Memory Allocation</option>
                    <option value="storage">Storage Datastore</option>
                    <option value="status">Node Reachability</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Threshold (%)</label>
                  <input
                    type="number"
                    required
                    value={ruleThreshold}
                    onChange={e => setRuleThreshold(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Severity</label>
                <select
                  value={ruleSeverity}
                  onChange={e => setRuleSeverity(e.target.value as AlertSeverity)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="WARNING">WARNING</option>
                  <option value="INFO">INFO</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
