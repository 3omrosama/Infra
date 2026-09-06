import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Cpu, 
  HardDrive, 
  Network, 
  Power, 
  RotateCw, 
  Pause, 
  X, 
  Activity, 
  ShieldCheck, 
  Layers, 
  Clock, 
  Info,
  CheckCircle2
} from 'lucide-react';
import { VirtualMachine } from '../../types/index';
import { formatBytes, formatUptime } from '../../lib/utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useModalAnimation } from '../../hooks/useModalAnimation';

interface VMDetailModalProps {
  vm: VirtualMachine | null;
  onClose: () => void;
  onPowerAction: (vm: VirtualMachine, action: 'power-on' | 'power-off' | 'restart' | 'suspend') => void;
  canManage: boolean;
}

export const VMDetailModal: React.FC<VMDetailModalProps> = ({
  vm,
  onClose,
  onPowerAction,
  canManage
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'disks' | 'network'>('overview');

  const {
    isMounted,
    isVisible,
    activeData,
    handleClose,
    handleBackdropClick,
    getCardClass
  } = useModalAnimation<VirtualMachine>(Boolean(vm), {
    onClose,
    data: vm || undefined,
    exitDurationMs: 200
  });

  if (!isMounted) return null;

  const currentVm = (vm || activeData) as VirtualMachine;
  if (!currentVm) return null;

  // Generate realistic sparkline timeline for VM inspector
  const mockSparklines = [
    { time: '10m', cpu: Math.max(10, currentVm.cpuUsagePct - 8), memory: currentVm.memoryUsagePct - 2 },
    { time: '8m', cpu: Math.max(15, currentVm.cpuUsagePct + 4), memory: currentVm.memoryUsagePct + 1 },
    { time: '6m', cpu: Math.max(12, currentVm.cpuUsagePct - 3), memory: currentVm.memoryUsagePct },
    { time: '4m', cpu: Math.max(20, currentVm.cpuUsagePct + 7), memory: currentVm.memoryUsagePct + 3 },
    { time: '2m', cpu: Math.max(14, currentVm.cpuUsagePct - 1), memory: currentVm.memoryUsagePct + 2 },
    { time: 'Now', cpu: currentVm.cpuUsagePct, memory: currentVm.memoryUsagePct }
  ];

  const modalNode = (
    <div 
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vm-detail-title"
    >
      <div 
        id="vm-detail-modal"
        className={getCardClass("w-full max-w-3xl my-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh]")}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              currentVm.powerState === 'RUNNING' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : (currentVm.powerState === 'SUSPENDED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700')
            }`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="vm-detail-title" className="text-base font-bold text-white tracking-tight">{currentVm.name}</h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md font-mono ${
                  currentVm.powerState === 'RUNNING'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : (currentVm.powerState === 'SUSPENDED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30')
                }`}>
                  {currentVm.powerState}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{currentVm.guestOs} • ID: {currentVm.externalVmId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canManage && (
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {currentVm.powerState === 'STOPPED' ? (
                  <button
                    id="btn-vm-modal-power-on"
                    onClick={() => onPowerAction(currentVm, 'power-on')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Power On</span>
                  </button>
                ) : (
                  <>
                    <button
                      id="btn-vm-modal-restart"
                      onClick={() => onPowerAction(currentVm, 'restart')}
                      className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg"
                      title="Restart Guest OS"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      id="btn-vm-modal-suspend"
                      onClick={() => onPowerAction(currentVm, 'suspend')}
                      className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg"
                      title="Suspend VM"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                    <button
                      id="btn-vm-modal-power-off"
                      onClick={() => onPowerAction(currentVm, 'power-off')}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg"
                      title="Power Off VM"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}
            <button 
              id="btn-close-vm-modal"
              onClick={handleClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/30 gap-6 text-xs font-semibold">
          {[
            { id: 'overview', label: 'Overview & Hardware' },
            { id: 'metrics', label: 'Performance Metrics' },
            { id: 'disks', label: 'Disks & Datastore' },
            { id: 'network', label: 'Network & Interfaces' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Primary Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">vCPU Cores</p>
                  <p className="text-xl font-bold text-white mt-1">{currentVm.cpuCount} vCPUs</p>
                  <p className="text-xs text-cyan-400 font-mono mt-0.5">{currentVm.cpuUsagePct.toFixed(1)}% active</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Allocated Memory</p>
                  <p className="text-xl font-bold text-white mt-1">{formatBytes(currentVm.memoryBytes)}</p>
                  <p className="text-xs text-cyan-400 font-mono mt-0.5">{currentVm.memoryUsagePct.toFixed(1)}% active</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Virtual Disk</p>
                  <p className="text-xl font-bold text-white mt-1">{formatBytes(currentVm.storageBytes)}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{currentVm.storageUsagePct.toFixed(1)}% used</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Uptime</p>
                  <p className="text-xl font-bold text-white mt-1">{formatUptime(currentVm.uptimeSeconds)}</p>
                  <p className="text-xs text-emerald-400 font-mono mt-0.5">Continuous</p>
                </div>
              </div>

              {/* Guest Environment Details */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>VMware Guest Integration State</span>
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">IP Address:</span>
                    <span className="ml-2 font-mono text-slate-200">{currentVm.ipAddress || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">VMware Tools:</span>
                    <span className="ml-2 font-mono text-emerald-400">Guest Agent Connected</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Hardware Compatibility:</span>
                    <span className="ml-2 font-mono text-slate-200">vSphere Virtual Hardware</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Host Identifier:</span>
                    <span className="ml-2 font-mono text-slate-200">{currentVm.hostId || 'Hypervisor Host'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  vCPU & RAM Utilization (Real-Time)
                </h4>
                <div className="h-48 w-full bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockSparklines}>
                      <defs>
                        <linearGradient id="vmCpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} unit="%" tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Area type="monotone" dataKey="cpu" stroke="#06b6d4" fill="url(#vmCpuGrad)" strokeWidth={2} name="CPU %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'disks' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Hard Disk 1 (SCSI 0:0)</h4>
                    <p className="text-[11px] text-slate-400 font-mono">{currentVm.datastoreName || 'datastore-nvme-01'}/[{currentVm.name}]/{currentVm.name}.vmdk</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-white">{formatBytes(currentVm.storageBytes)} Provisioned</p>
                  <p className="text-[11px] text-emerald-400 font-mono">Thin Provisioned</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Network className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Network Adapter 1 (VMXNET3)</h4>
                    <p className="text-[11px] text-slate-400 font-mono">Connected to: {currentVm.networkName || 'VM Network (VLAN 100)'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-slate-200">{currentVm.ipAddress || 'IP Not Assigned / Unreported'}</p>
                  <p className="text-[11px] text-slate-400 font-mono">vSphere PortGroup</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">Last Synchronized: {new Date().toLocaleTimeString()}</span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};

