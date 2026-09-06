import React, { useState, useMemo } from 'react';
import { 
  Server,
  Cpu, 
  Power, 
  RotateCw, 
  Pause, 
  Search, 
  RefreshCw, 
  Eye, 
  ChevronDown,
  Layers,
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
import { VirtualMachine, ESXiHost, InfrastructureConnection, ConnectionStatus } from '../types/index';
import { formatBytes, formatUptime } from '../lib/utils';
import { VMDetailModal } from '../components/modals/VMDetailModal';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

export interface HostVmGroup {
  id: string; // connectionId or synthetic ID
  connectionId: string;
  displayName: string;
  hostname: string;
  ipAddress?: string;
  version?: string;
  status: ConnectionStatus;
  cpuUsagePct?: number | null;
  memoryUsagePct?: number | null;
  storageUsagePct?: number | null;
  cpuCores?: number;
  memoryBytesTotal?: number;
  uptimeSeconds?: number;
  isOrphan?: boolean;
  allVms: VirtualMachine[];
  matchingVms: VirtualMachine[];
  runningCount: number;
  stoppedCount: number;
  suspendedCount: number;
  totalVmCount: number;
}

interface VirtualMachinesViewProps {
  vms: VirtualMachine[];
  hosts?: ESXiHost[];
  connections?: InfrastructureConnection[];
  onRefresh: () => void;
  canManage: boolean;
}

export const VirtualMachinesView: React.FC<VirtualMachinesViewProps> = ({
  vms = [],
  hosts = [],
  connections = [],
  onRefresh,
  canManage
}) => {
  const { showToast } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'STOPPED' | 'SUSPENDED'>('ALL');
  const [selectedVmForDetail, setSelectedVmForDetail] = useState<VirtualMachine | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Independent collapsed state per host/connection ID (default all expanded: false)
  const [collapsedHostIds, setCollapsedHostIds] = useState<Record<string, boolean>>({});

  const toggleHostCollapse = (groupId: string) => {
    setCollapsedHostIds(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };
  
  // Power Action Confirmation State
  const [pendingAction, setPendingAction] = useState<{
    vm: VirtualMachine;
    action: 'power-on' | 'power-off' | 'restart' | 'suspend';
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  // Build Host -> VM Groups with stable ordering
  const hostGroups = useMemo<HostVmGroup[]>(() => {
    const safeVms = vms || [];
    const safeHosts = hosts || [];
    const safeConnections = connections || [];

    // Filter connections for ESXi or generic hypervisor connections
    const esxiConnections = safeConnections.filter(c => c.type === 'ESXI');

    // Index lookups
    const connMap = new Map<string, InfrastructureConnection>();
    for (const conn of safeConnections) {
      connMap.set(conn.id, conn);
    }

    const hostByConnId = new Map<string, ESXiHost>();
    for (const host of safeHosts) {
      if (host.connectionId) {
        hostByConnId.set(host.connectionId, host);
      }
    }

    // Group VMs by connectionId
    const vmsByConnId = new Map<string, VirtualMachine[]>();
    for (const vm of safeVms) {
      const connId = vm.connectionId || 'unassigned';
      if (!vmsByConnId.has(connId)) {
        vmsByConnId.set(connId, []);
      }
      vmsByConnId.get(connId)!.push(vm);
    }

    const groups: HostVmGroup[] = [];
    const processedConnIds = new Set<string>();

    // Step 1: Add groups for all known ESXi infrastructure connections in stable order
    for (const conn of esxiConnections) {
      processedConnIds.add(conn.id);
      const host = hostByConnId.get(conn.id);
      const allVms = vmsByConnId.get(conn.id) || [];

      groups.push({
        id: conn.id,
        connectionId: conn.id,
        displayName: conn.name || host?.hostname || host?.ipAddress || `ESXi Host (${conn.id.slice(0, 8)})`,
        hostname: host?.hostname || conn.host || 'ESXi Hypervisor',
        ipAddress: host?.ipAddress || conn.host || undefined,
        version: host?.version,
        status: conn.status || (host?.powerState === 'RUNNING' ? 'ONLINE' : 'OFFLINE'),
        cpuUsagePct: typeof host?.cpuUsagePct === 'number' && !isNaN(host.cpuUsagePct) ? host.cpuUsagePct : null,
        memoryUsagePct: typeof host?.memoryUsagePct === 'number' && !isNaN(host.memoryUsagePct) ? host.memoryUsagePct : null,
        storageUsagePct: typeof host?.storageUsagePct === 'number' && !isNaN(host.storageUsagePct) ? host.storageUsagePct : null,
        cpuCores: host?.cpuCores,
        memoryBytesTotal: host?.memoryBytesTotal,
        uptimeSeconds: host?.uptimeSeconds,
        isOrphan: false,
        allVms,
        matchingVms: [],
        runningCount: 0,
        stoppedCount: 0,
        suspendedCount: 0,
        totalVmCount: allVms.length
      });
    }

    // Step 2: Add any ESXi hosts that have no matching connection object in state
    for (const host of safeHosts) {
      if (!processedConnIds.has(host.connectionId)) {
        processedConnIds.add(host.connectionId);
        const conn = connMap.get(host.connectionId);
        const allVms = vmsByConnId.get(host.connectionId) || [];

        groups.push({
          id: host.connectionId || host.id,
          connectionId: host.connectionId || host.id,
          displayName: conn?.name || host.hostname || host.ipAddress || `ESXi Host (${host.id.slice(0, 8)})`,
          hostname: host.hostname || conn?.host || 'ESXi Hypervisor',
          ipAddress: host.ipAddress || conn?.host || undefined,
          version: host.version,
          status: conn?.status || (host.powerState === 'RUNNING' ? 'ONLINE' : 'OFFLINE'),
          cpuUsagePct: typeof host.cpuUsagePct === 'number' && !isNaN(host.cpuUsagePct) ? host.cpuUsagePct : null,
          memoryUsagePct: typeof host.memoryUsagePct === 'number' && !isNaN(host.memoryUsagePct) ? host.memoryUsagePct : null,
          storageUsagePct: typeof host.storageUsagePct === 'number' && !isNaN(host.storageUsagePct) ? host.storageUsagePct : null,
          cpuCores: host.cpuCores,
          memoryBytesTotal: host.memoryBytesTotal,
          uptimeSeconds: host.uptimeSeconds,
          isOrphan: false,
          allVms,
          matchingVms: [],
          runningCount: 0,
          stoppedCount: 0,
          suspendedCount: 0,
          totalVmCount: allVms.length
        });
      }
    }

    // Step 3: Add orphan / unassigned groups for any VMs referencing unknown connectionIds
    for (const [connId, allVms] of vmsByConnId.entries()) {
      if (!processedConnIds.has(connId)) {
        processedConnIds.add(connId);
        const conn = connMap.get(connId);

        if (conn) {
          groups.push({
            id: conn.id,
            connectionId: conn.id,
            displayName: conn.name || `Host (${conn.id.slice(0, 8)})`,
            hostname: conn.host || 'Hypervisor Host',
            ipAddress: conn.host || undefined,
            status: conn.status || 'ONLINE',
            cpuUsagePct: null,
            memoryUsagePct: null,
            storageUsagePct: null,
            isOrphan: false,
            allVms,
            matchingVms: [],
            runningCount: 0,
            stoppedCount: 0,
            suspendedCount: 0,
            totalVmCount: allVms.length
          });
        } else {
          groups.push({
            id: connId,
            connectionId: connId,
            displayName: connId !== 'unassigned' 
              ? `Unknown / Unassigned Host (${connId.length > 8 ? connId.slice(0, 8) : connId})`
              : 'Unassigned Virtual Machines',
            hostname: 'Unassigned Host',
            ipAddress: undefined,
            status: 'OFFLINE',
            cpuUsagePct: null,
            memoryUsagePct: null,
            storageUsagePct: null,
            isOrphan: true,
            allVms,
            matchingVms: [],
            runningCount: 0,
            stoppedCount: 0,
            suspendedCount: 0,
            totalVmCount: allVms.length
          });
        }
      }
    }

    // Compute status counts and filter matching VMs for each group
    for (const group of groups) {
      group.runningCount = group.allVms.filter(v => v.powerState === 'RUNNING').length;
      group.stoppedCount = group.allVms.filter(v => v.powerState === 'STOPPED').length;
      group.suspendedCount = group.allVms.filter(v => v.powerState === 'SUSPENDED').length;
      group.totalVmCount = group.allVms.length;

      group.matchingVms = group.allVms.filter(vm => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch = !query || (
          vm.name.toLowerCase().includes(query) ||
          vm.guestOs.toLowerCase().includes(query) ||
          (Boolean(vm.ipAddress) && vm.ipAddress!.toLowerCase().includes(query))
        );
        const matchesStatus = statusFilter === 'ALL' || vm.powerState === statusFilter;
        return matchesSearch && matchesStatus;
      });
    }

    return groups;
  }, [vms, hosts, connections, searchQuery, statusFilter]);

  // Determine which groups to display
  const isSearchActive = Boolean(searchQuery.trim());
  const isFilterActive = statusFilter !== 'ALL';

  const visibleGroups = useMemo(() => {
    if (!isSearchActive && !isFilterActive) {
      // In default state, show all host groups (including empty hosts with 0 VMs)
      return hostGroups;
    }
    // When searching or filtering, only show groups that have matching VMs
    return hostGroups.filter(g => g.matchingVms.length > 0);
  }, [hostGroups, isSearchActive, isFilterActive]);

  // Aggregate fleet metrics
  const totalFleetVms = vms.length;
  const totalRunningVms = vms.filter(v => v.powerState === 'RUNNING').length;
  const totalStoppedVms = vms.filter(v => v.powerState === 'STOPPED').length;
  const totalSuspendedVms = vms.filter(v => v.powerState === 'SUSPENDED').length;

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.resolve(onRefresh());
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const handleTriggerPowerAction = (vm: VirtualMachine, action: 'power-on' | 'power-off' | 'restart' | 'suspend') => {
    setPendingAction({ vm, action });
  };

  const handleExecuteConfirmedAction = async (reason?: string) => {
    if (!pendingAction || isExecutingAction) return;
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
            Real-time hypervisor guest instances, vCPU/RAM allocation, and audited lifecycle controls grouped by host
          </p>
        </div>

        <button
          id="btn-refresh-vms"
          disabled={isRefreshing}
          aria-disabled={isRefreshing}
          aria-busy={isRefreshing}
          onClick={handleRefreshClick}
          className={`flex items-center justify-center gap-1.5 min-w-[124px] px-3 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-all self-start sm:self-auto select-none ${
            isRefreshing
              ? 'opacity-75 cursor-not-allowed text-cyan-300 border-cyan-500/30'
              : 'hover:bg-slate-800 hover:text-white active:scale-95'
          }`}
          title="Refresh virtual machine fleet"
        >
          <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Fleet'}</span>
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

      {/* Host Groups Content */}
      {hostGroups.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No ESXi Hypervisors Connected</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Connect an ESXi host via the Infrastructure inventory to start monitoring hypervisor hardware and guest VMs.
          </p>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Virtual Machines Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No virtual machines match current filter "{statusFilter}" {searchQuery ? `and search query "${searchQuery}"` : ''}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map(group => {
            // While searching, automatically expand groups with matching VMs; otherwise respect user's independent collapse state
            const isCollapsed = isSearchActive ? false : Boolean(collapsedHostIds[group.id]);
            const displayVms = isSearchActive || isFilterActive ? group.matchingVms : group.allVms;

            return (
              <div
                key={group.id}
                id={`esxi-host-group-${group.id}`}
                className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden shadow-lg transition-all"
              >
                {/* Host Section Header & Accordion Trigger */}
                <div
                  id={`esxi-host-header-${group.id}`}
                  onClick={() => toggleHostCollapse(group.id)}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${
                      group.isOrphan
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                    }`}>
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white tracking-tight">{group.displayName}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          group.status === 'ONLINE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : (group.status === 'DEGRADED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30')
                        }`}>
                          {group.status}
                        </span>
                        {group.version && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 text-[10px] font-mono">
                            v{group.version}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {group.ipAddress ? `IP ${group.ipAddress}` : (group.isOrphan ? 'Unassigned Infrastructure Connection' : 'ESXi Bare-Metal Hypervisor')}
                        {group.uptimeSeconds != null ? ` • Uptime ${formatUptime(group.uptimeSeconds)}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Summary Telemetry Metrics & Collapse Button */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-between lg:justify-end">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs">
                      {group.cpuUsagePct != null && (
                        <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">Host CPU</span>
                          <span className="font-bold text-cyan-400">{group.cpuUsagePct.toFixed(1)}%</span>
                        </div>
                      )}
                      {group.memoryUsagePct != null && (
                        <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">Host RAM</span>
                          <span className="font-bold text-emerald-400">{group.memoryUsagePct.toFixed(1)}%</span>
                        </div>
                      )}
                      {group.storageUsagePct != null && (
                        <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">Storage</span>
                          <span className="font-bold text-purple-400">{group.storageUsagePct.toFixed(1)}%</span>
                        </div>
                      )}
                      <div className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-center">
                        <span className="text-[10px] text-slate-500 uppercase block">VMs</span>
                        <span className="font-bold text-white">
                          <span className="text-emerald-400">{group.runningCount}</span>
                          <span className="text-slate-400 font-normal"> / {group.totalVmCount}</span>
                        </span>
                      </div>
                    </div>

                    <div
                      aria-label={isCollapsed ? 'Expand host group' : 'Collapse host group'}
                      className={`p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 ml-1 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                        isCollapsed ? 'rotate-0' : 'rotate-180'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Expanded VM Table with Smooth Grid Row Transition */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
                    isCollapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
                  }`}
                >
                  <div className="overflow-hidden">
                    {displayVms.length === 0 ? (
                      <div className="p-8 text-center border-t border-slate-800/60 bg-slate-950/40">
                        <p className="text-xs text-slate-500 font-mono">
                          {group.totalVmCount === 0
                            ? 'No virtual machines provisioned on this hypervisor host'
                            : 'No virtual machines match current filter criteria on this host'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border-t border-slate-800/60">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                            <tr>
                              <th className="py-3 px-4">Virtual Machine</th>
                              <th className="py-3 px-4">Power State</th>
                              <th className="py-3 px-4">vCPU Load</th>
                              <th className="py-3 px-4">Memory Usage</th>
                              <th className="py-3 px-4">IP Address</th>
                              <th className="py-3 px-4">Uptime</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-medium bg-slate-950/20">
                            {displayVms.map(vm => {
                              const cpuCount = vm.cpuCount ?? (vm as any).cpuCores ?? 1;

                              return (
                                <tr key={vm.id} className="hover:bg-slate-800/40 transition-colors">
                                  {/* Name & OS */}
                                  <td className="py-3.5 px-4">
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
                                            id={`vm-name-${vm.id}`}
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
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold font-mono ${
                                      vm.powerState === 'RUNNING'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : (vm.powerState === 'SUSPENDED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30')
                                    }`}>
                                      {vm.powerState}
                                    </span>
                                  </td>

                                  {/* vCPU */}
                                  <td className="py-3.5 px-4">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-mono">
                                        <span className="text-white font-semibold">{cpuCount} vCPU</span>
                                        <span className="text-cyan-400">{vm.cpuUsagePct.toFixed(1)}%</span>
                                      </div>
                                      <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-cyan-500 rounded-full"
                                          style={{ width: `${Math.min(100, Math.max(0, vm.cpuUsagePct))}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>

                                  {/* Memory */}
                                  <td className="py-3.5 px-4">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-mono">
                                        <span className="text-white font-semibold">{formatBytes(vm.memoryBytes)}</span>
                                        <span className="text-emerald-400">{vm.memoryUsagePct.toFixed(1)}%</span>
                                      </div>
                                      <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-emerald-500 rounded-full"
                                          style={{ width: `${Math.min(100, Math.max(0, vm.memoryUsagePct))}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>

                                  {/* IP */}
                                  <td className="py-3.5 px-4 font-mono text-slate-300">
                                    {vm.ipAddress || '—'}
                                  </td>

                                  {/* Uptime */}
                                  <td className="py-3.5 px-4 font-mono text-slate-400">
                                    {formatUptime(vm.uptimeSeconds)}
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3.5 px-4 text-right">
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
                                              {vm.powerState === 'RUNNING' && (
                                                <button
                                                  id={`btn-suspend-vm-${vm.id}`}
                                                  onClick={() => handleTriggerPowerAction(vm, 'suspend')}
                                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors"
                                                  title="Suspend VM"
                                                >
                                                  <Pause className="w-3.5 h-3.5" />
                                                </button>
                                              )}
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VM Detail Inspector Modal */}
      <VMDetailModal
        vm={selectedVmForDetail}
        onClose={() => setSelectedVmForDetail(null)}
        onPowerAction={handleTriggerPowerAction}
        canManage={canManage}
      />

      {/* Destructive Power Action Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction ? `Confirm '${pendingAction.action.toUpperCase()}' on ${pendingAction.vm.name}` : ''}
        message={pendingAction ? `Are you sure you want to execute '${pendingAction.action}' on virtual machine '${pendingAction.vm.name}'? This action will be logged in the immutable security audit trail.` : ''}
        confirmLabel={pendingAction ? `Execute ${pendingAction.action}` : ''}
        loadingLabel={pendingAction ? `Executing ${pendingAction.action}...` : ''}
        isLoading={isExecutingAction}
        isDestructive={pendingAction?.action === 'power-off'}
        requireReason={true}
        onConfirm={handleExecuteConfirmedAction}
        onCancel={() => {
          if (!isExecutingAction) {
            setPendingAction(null);
          }
        }}
      />
    </div>
  );
};
