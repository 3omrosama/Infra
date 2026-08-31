import React from 'react';
import { 
  LayoutDashboard, 
  Network, 
  Server, 
  Cpu, 
  Boxes, 
  HardDrive, 
  Activity, 
  AlertOctagon, 
  ScrollText, 
  CheckSquare, 
  Users, 
  Settings, 
  Home,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavItemKey = 
  | 'dashboard'
  | 'infrastructure'
  | 'esxi'
  | 'vms'
  | 'casaos'
  | 'docker'
  | 'servers'
  | 'storage'
  | 'network'
  | 'monitoring'
  | 'alerts'
  | 'logs'
  | 'tasks'
  | 'users'
  | 'settings';

export type NavTab = NavItemKey;

interface SidebarProps {
  currentTab?: NavItemKey;
  activeTab?: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeAlertsCount?: number;
  alertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  activeAlertsCount = 0,
  alertCount = 0
}) => {
  const selectedTab = currentTab || activeTab || 'dashboard';
  const totalAlerts = alertCount || activeAlertsCount || 0;
  const { user } = useAuth();

  const navItems: { key: NavItemKey; label: string; icon: any; badge?: number; adminOnly?: boolean }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'infrastructure', label: 'Infrastructure', icon: Layers },
    { key: 'esxi', label: 'ESXi Hosts', icon: Server },
    { key: 'vms', label: 'Virtual Machines', icon: Cpu },
    { key: 'casaos', label: 'CasaOS', icon: Home },
    { key: 'docker', label: 'Docker Apps', icon: Boxes },
    { key: 'servers', label: 'Physical Servers', icon: Server },
    { key: 'storage', label: 'Storage & SAN', icon: HardDrive },
    { key: 'network', label: 'Networks & VLAN', icon: Network },
    { key: 'monitoring', label: 'Live Telemetry', icon: Activity },
    { key: 'alerts', label: 'Alerts', icon: AlertOctagon, badge: totalAlerts },
    { key: 'logs', label: 'System Logs', icon: ScrollText },
    { key: 'tasks', label: 'Audit Trail', icon: CheckSquare },
    { key: 'users', label: 'Access & RBAC', icon: Users, adminOnly: true },
    { key: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <aside
      id="main-sidebar-nav"
      className={`relative flex flex-col bg-slate-950/95 border-r border-slate-800/80 transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black tracking-wider">
              NOC
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                InfraManager
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded">
                  PRO
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-mono tracking-tight">v2026.8-ENTERPRISE</p>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="w-9 h-9 mx-auto rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black">
            N
          </div>
        )}

        <button
          id="btn-toggle-sidebar"
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
        {navItems.map(item => {
          if (item.adminOnly && user?.role !== 'ADMIN') return null;

          const isActive = selectedTab === item.key;
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              id={`nav-item-${item.key}`}
              onClick={() => onSelectTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80 border border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
              {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full animate-pulse">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / User Profile & Role Info */}
      <div className="p-3 border-t border-slate-800/80">
        {!isCollapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/70">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-400 uppercase">
              {user?.username?.substring(0, 2) || 'OP'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.username || 'Operator'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${user?.role === 'ADMIN' ? 'bg-purple-400' : 'bg-emerald-400'}`} />
                <p className="text-[10px] font-mono text-slate-400 uppercase">{user?.role || 'VIEWER'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-400 uppercase">
              {user?.username?.substring(0, 2) || 'OP'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
