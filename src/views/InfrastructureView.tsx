import React, { useState } from 'react';
import { 
  Server, 
  Layers, 
  Home, 
  Boxes, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Activity, 
  ExternalLink, 
  Clock, 
  Lock,
  Radio,
  Search
} from 'lucide-react';
import { InfrastructureConnection } from '../types/index';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';
import { formatRelativeTime } from '../lib/utils';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';

interface InfrastructureViewProps {
  connections: InfrastructureConnection[];
  onRefresh: () => void;
  onOpenAddModal: () => void;
  canManage: boolean;
}

export const InfrastructureView: React.FC<InfrastructureViewProps> = ({
  connections = [],
  onRefresh,
  onOpenAddModal,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<InfrastructureConnection | null>(null);

  const safeConnections = connections || [];
  const filteredConnections = safeConnections.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTestConnection = async (conn: InfrastructureConnection) => {
    setTestingId(conn.id);
    try {
      const result = await api.testConnection(conn.id);
      if (result.success) {
        showToast('Connection Test Passed', `${conn.name} is reachable (${result.latencyMs}ms)`, 'INFO');
      } else {
        showToast('Connection Test Failed', `${conn.name}: ${result.message}`, 'CRITICAL');
      }
      onRefresh();
    } catch (err: any) {
      showToast('Test Error', err.message, 'CRITICAL');
    } finally {
      setTestingId(null);
    }
  };

  const handleSyncConnection = async (conn: InfrastructureConnection) => {
    setSyncingId(conn.id);
    try {
      await api.syncConnection(conn.id);
      showToast('Node Synchronized', `Refreshed telemetry for ${conn.name}`, 'INFO');
      onRefresh();
    } catch (err: any) {
      showToast('Sync Failed', err.message, 'CRITICAL');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteConnection = async () => {
    if (!nodeToDelete) return;
    try {
      await api.deleteConnection(nodeToDelete.id);
      showToast('Node Removed', `Removed ${nodeToDelete.name} from infrastructure registry`, 'INFO');
      setNodeToDelete(null);
      onRefresh();
    } catch (err: any) {
      showToast('Delete Failed', err.message, 'CRITICAL');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Infrastructure Inventory</h2>
          <p className="text-xs text-slate-400">
            Registered hypervisors, server nodes, edge gateways, and container daemons
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-infra-refresh"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {canManage && (
            <button
              id="btn-infra-add-node"
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Node</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            id="infra-search-input"
            type="text"
            placeholder="Search by node name, IP address, or provider type..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="text-xs font-mono text-slate-400 pr-2">
          {filteredConnections.length} of {connections.length} Nodes
        </div>
      </div>

      {/* Nodes Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Node / Hostname</th>
                <th className="py-3.5 px-4">Provider Type</th>
                <th className="py-3.5 px-4">Endpoint Address</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Poll Rate</th>
                <th className="py-3.5 px-4">Last Seen</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No infrastructure connections match your filter criteria
                  </td>
                </tr>
              ) : (
                filteredConnections.map(conn => {
                  let TypeIcon = Server;
                  if (conn.type === 'CASAOS') TypeIcon = Home;
                  if (conn.type === 'DOCKER') TypeIcon = Boxes;
                  if (conn.type === 'PROXMOX') TypeIcon = Layers;

                  return (
                    <tr key={conn.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-slate-800/80 text-cyan-400 border border-slate-700/60">
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-sm">{conn.name}</span>
                              {conn.isDemo && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded">
                                  DEMO
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">ID: {conn.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Provider Type */}
                      <td className="py-4 px-4">
                        <span className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
                          {conn.type}
                        </span>
                      </td>

                      {/* Host & Port */}
                      <td className="py-4 px-4 font-mono text-slate-300">
                        {conn.useHttps ? 'https://' : 'http://'}{conn.host}:{conn.port}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            conn.status === 'ONLINE' ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : (conn.status === 'DEGRADED' ? 'bg-amber-400' : 'bg-rose-500')
                          }`} />
                          <span className={`font-mono text-xs font-semibold ${
                            conn.status === 'ONLINE' ? 'text-emerald-400' : (conn.status === 'DEGRADED' ? 'text-amber-400' : 'text-rose-400')
                          }`}>
                            {conn.status}
                          </span>
                        </div>
                        {conn.errorDetails && (
                          <p className="text-[10px] text-rose-400 truncate max-w-xs mt-0.5">{conn.errorDetails}</p>
                        )}
                      </td>

                      {/* Poll Interval */}
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {conn.pollIntervalSec}s
                      </td>

                      {/* Last Seen */}
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {formatRelativeTime(conn.lastSeen || '')}
                      </td>

                      {/* Action buttons */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`btn-test-conn-${conn.id}`}
                            onClick={() => handleTestConnection(conn)}
                            disabled={testingId === conn.id}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Test connectivity & latency"
                          >
                            <Activity className={`w-3.5 h-3.5 ${testingId === conn.id ? 'animate-spin text-cyan-400' : ''}`} />
                          </button>

                          <button
                            id={`btn-sync-conn-${conn.id}`}
                            onClick={() => handleSyncConnection(conn)}
                            disabled={syncingId === conn.id}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Force immediate telemetry poll"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingId === conn.id ? 'animate-spin text-cyan-400' : ''}`} />
                          </button>

                          {canManage && (
                            <button
                              id={`btn-delete-conn-${conn.id}`}
                              onClick={() => setNodeToDelete(conn)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Delete connection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(nodeToDelete)}
        title={`Remove Node '${nodeToDelete?.name}'?`}
        message={`Are you sure you want to disconnect and delete '${nodeToDelete?.name}'? Associated inventory records and telemetry logs will be unlinked.`}
        confirmLabel="Disconnect & Delete Node"
        isDestructive={true}
        onConfirm={handleDeleteConnection}
        onCancel={() => setNodeToDelete(null)}
      />
    </div>
  );
};
