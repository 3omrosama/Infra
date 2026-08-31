import React, { useState } from 'react';
import { 
  Boxes, 
  Power, 
  RotateCw, 
  Search, 
  RefreshCw, 
  Layers, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Terminal,
  Server
} from 'lucide-react';
import { DockerContainer } from '../types/index';
import { formatBytes, formatRelativeTime } from '../lib/utils';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

interface DockerViewProps {
  containers: DockerContainer[];
  onRefresh: () => void;
  canManage: boolean;
}

export const DockerView: React.FC<DockerViewProps> = ({
  containers = [],
  onRefresh,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'EXITED'>('ALL');
  
  const [pendingContainerAction, setPendingContainerAction] = useState<{
    container: DockerContainer;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);

  const safeContainers = containers || [];
  const filteredContainers = safeContainers.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.image.toLowerCase().includes(searchQuery.toLowerCase());
    
    const isRunning = c.state === 'running';
    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'RUNNING' && isRunning) || 
      (statusFilter === 'EXITED' && !isRunning);

    return matchesSearch && matchesStatus;
  });

  const handleTriggerAction = (container: DockerContainer, action: 'start' | 'stop' | 'restart') => {
    setPendingContainerAction({ container, action });
  };

  const handleExecuteConfirmedAction = async (reason?: string) => {
    if (!pendingContainerAction) return;
    const { container, action } = pendingContainerAction;

    try {
      const res = await api.executeContainerAction(container.connectionId, container.id, action, reason);
      showToast('Container Action Executed', res.message, 'INFO');
      setPendingContainerAction(null);
      onRefresh();
    } catch (err: any) {
      showToast('Action Failed', err.message, 'CRITICAL');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Docker Containers & Daemon</h2>
          <p className="text-xs text-slate-400">
            Native Docker socket daemon instances, container lifecycles, and port bindings
          </p>
        </div>

        <button
          id="btn-refresh-docker"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Containers</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            id="docker-search-input"
            type="text"
            placeholder="Search containers by name or image..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['ALL', 'RUNNING', 'EXITED'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === status
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Containers Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Container</th>
                <th className="py-3.5 px-4">State</th>
                <th className="py-3.5 px-4">Port Mappings</th>
                <th className="py-3.5 px-4">Restart Count</th>
                <th className="py-3.5 px-4">Created</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No Docker containers match current filter parameters
                  </td>
                </tr>
              ) : (
                filteredContainers.map(container => {
                  const isRunning = container.state === 'running';

                  return (
                    <tr key={container.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name & Image */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${
                            isRunning 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            <Boxes className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-white text-sm">{container.name}</span>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{container.image}</p>
                          </div>
                        </div>
                      </td>

                      {/* State */}
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold font-mono ${
                          isRunning
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {container.status}
                        </span>
                      </td>

                      {/* Ports */}
                      <td className="py-4 px-4 font-mono text-slate-300">
                        {container.ports?.map(p => `${p.publicPort ? `${p.publicPort}:` : ''}${p.privatePort}/${p.type}`).join(', ') || 'None'}
                      </td>

                      {/* Restart count */}
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {container.restartCount} restarts
                      </td>

                      {/* Created */}
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {formatRelativeTime(container.created)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && (
                            <>
                              {isRunning ? (
                                <>
                                  <button
                                    id={`btn-restart-docker-${container.id}`}
                                    onClick={() => handleTriggerAction(container, 'restart')}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors"
                                    title="Restart Container"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    id={`btn-stop-docker-${container.id}`}
                                    onClick={() => handleTriggerAction(container, 'stop')}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors"
                                    title="Stop Container"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  id={`btn-start-docker-${container.id}`}
                                  onClick={() => handleTriggerAction(container, 'start')}
                                  className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                                  title="Start Container"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
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

      {/* Confirmation Dialog */}
      {pendingContainerAction && (
        <ConfirmDialog
          isOpen={Boolean(pendingContainerAction)}
          title={`Execute '${pendingContainerAction.action.toUpperCase()}' on ${pendingContainerAction.container.name}`}
          message={`Are you sure you want to execute '${pendingContainerAction.action}' on Docker container '${pendingContainerAction.container.name}'?`}
          confirmLabel={`Execute ${pendingContainerAction.action}`}
          isDestructive={pendingContainerAction.action === 'stop'}
          onConfirm={handleExecuteConfirmedAction}
          onCancel={() => setPendingContainerAction(null)}
        />
      )}
    </div>
  );
};
