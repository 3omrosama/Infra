import React, { useState } from 'react';
import { 
  Cpu, 
  Power, 
  RotateCw, 
  Pause, 
  Search, 
  RefreshCw, 
  SlidersHorizontal, 
  Eye, 
  HardDrive, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Layers
} from 'lucide-react';
import { VirtualMachine } from '../types/index';
import { formatBytes, formatUptime } from '../lib/utils';
import { VMDetailModal } from '../components/modals/VMDetailModal';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

interface VirtualMachinesViewProps {
  vms: VirtualMachine[];
  onRefresh: () => void;
  canManage: boolean;
}

export const VirtualMachinesView: React.FC<VirtualMachinesViewProps> = ({
  vms = [],
  onRefresh,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'STOPPED' | 'SUSPENDED'>('ALL');
  const [selectedVmForDetail, setSelectedVmForDetail] = useState<VirtualMachine | null>(null);
  
  // Power Action Confirmation State
  const [pendingAction, setPendingAction] = useState<{
    vm: VirtualMachine;
    action: 'power-on' | 'power-off' | 'restart' | 'suspend';
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  const safeVms = vms || [];
  const filteredVms = safeVms.filter(vm => {
    const matchesSearch = 
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.guestOs.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vm.ipAddress && vm.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'ALL' || vm.powerState === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleTriggerPowerAction = (vm: VirtualMachine, action: 'power-on' | 'power-off' | 'restart' | 'suspend') => {
    setPendingAction({ vm, action });
  };

  const handleExecuteConfirmedAction = async (reason?: string) => {
    if (!pendingAction) return;
    const { vm, action } = pendingAction;
    setIsExecutingAction(true);

    try {
      const res = await api.executeVMAction(vm.connectionId, vm.id, action, reason);
      showToast('VM Action Executed', res.message, 'INFO');
      setPendingAction(null);
      if (selectedVmForDetail && selectedVmForDetail.id === vm.id) {
        setSelectedVmForDetail(res.vm);
      }
      onRefresh();
    } catch (err: any) {
      showToast('Action Failed', err.message, 'CRITICAL');
    } finally {
      setIsExecutingAction(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Virtual Machine Fleet</h2>
          <p className="text-xs text-slate-400">
            Real-time hypervisor guest instances, vCPU/RAM allocation, and audited lifecycle controls
          </p>
        </div>

        <button
          id="btn-refresh-vms"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Fleet</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            id="vm-search-input"
            type="text"
            placeholder="Search by VM name, guest operating system, or IP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'RUNNING', 'STOPPED', 'SUSPENDED'] as const).map(status => (
            <button
              key={status}
              id={`btn-vm-filter-${status.toLowerCase()}`}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === status
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* VM Grid / Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Virtual Machine</th>
                <th className="py-3.5 px-4">Power State</th>
                <th className="py-3.5 px-4">vCPU Load</th>
                <th className="py-3.5 px-4">Memory Usage</th>
                <th className="py-3.5 px-4">IP Address</th>
                <th className="py-3.5 px-4">Uptime</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredVms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No virtual machines found matching current filter parameters
                  </td>
                </tr>
              ) : (
                filteredVms.map(vm => {
                  return (
                    <tr key={vm.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name & OS */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${
                            vm.powerState === 'RUNNING' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : (vm.powerState === 'SUSPENDED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700')
                          }`}>
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span 
                                onClick={() => setSelectedVmForDetail(vm)}
                                className="font-bold text-white text-sm hover:text-cyan-300 cursor-pointer"
                              >
                                {vm.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{vm.guestOs}</span>
                          </div>
                        </div>
                      </td>

                      {/* Power State */}
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold font-mono ${
                          vm.powerState === 'RUNNING'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : (vm.powerState === 'SUSPENDED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30')
                        }`}>
                          {vm.powerState}
                        </span>
                      </td>

                      {/* vCPU */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-semibold">{vm.cpuCores} vCPU</span>
                            <span className="text-cyan-400">{vm.cpuUsagePct.toFixed(1)}%</span>
                          </div>
                          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full"
                              style={{ width: `${Math.min(100, vm.cpuUsagePct)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Memory */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-semibold">{formatBytes(vm.memoryBytes)}</span>
                            <span className="text-emerald-400">{vm.memoryUsagePct.toFixed(1)}%</span>
                          </div>
                          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, vm.memoryUsagePct)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* IP */}
                      <td className="py-4 px-4 font-mono text-slate-300">
                        {vm.ipAddress || '—'}
                      </td>

                      {/* Uptime */}
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {formatUptime(vm.uptimeSeconds)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Detail */}
                          <button
                            id={`btn-inspect-vm-${vm.id}`}
                            onClick={() => setSelectedVmForDetail(vm)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Inspect VM hardware & telemetry"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Power Actions (Audited) */}
                          {canManage && (
                            <>
                              {vm.powerState === 'STOPPED' ? (
                                <button
                                  id={`btn-power-on-vm-${vm.id}`}
                                  onClick={() => handleTriggerPowerAction(vm, 'power-on')}
                                  className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                                  title="Power On"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <>
                                  <button
                                    id={`btn-restart-vm-${vm.id}`}
                                    onClick={() => handleTriggerPowerAction(vm, 'restart')}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors"
                                    title="Graceful Restart"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    id={`btn-power-off-vm-${vm.id}`}
                                    onClick={() => handleTriggerPowerAction(vm, 'power-off')}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors"
                                    title="Power Off"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                </>
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

      {/* VM Detail Inspector Modal */}
      <VMDetailModal
        vm={selectedVmForDetail}
        onClose={() => setSelectedVmForDetail(null)}
        onPowerAction={handleTriggerPowerAction}
        canManage={canManage}
      />

      {/* Destructive Power Action Confirmation */}
      {pendingAction && (
        <ConfirmDialog
          isOpen={Boolean(pendingAction)}
          title={`Confirm '${pendingAction.action.toUpperCase()}' on ${pendingAction.vm.name}`}
          message={`Are you sure you want to execute '${pendingAction.action}' on virtual machine '${pendingAction.vm.name}'? This action will be logged in the immutable security audit trail.`}
          confirmLabel={`Execute ${pendingAction.action}`}
          isDestructive={pendingAction.action === 'power-off'}
          requireReason={true}
          onConfirm={handleExecuteConfirmedAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
};
