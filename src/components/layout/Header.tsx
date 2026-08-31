import React, { useState } from 'react';
import { 
  Search, 
  Bell, 
  Radio, 
  Plus, 
  Sparkles, 
  LogOut, 
  Shield, 
  Check, 
  X, 
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNotifications } from '../../context/NotificationContext';
import { api } from '../../lib/api';
import { formatRelativeTime } from '../../lib/utils';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenAddConnection: () => void;
  onRefreshData?: () => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onOpenAddConnection,
  onRefreshData,
  isDemoMode,
  onToggleDemoMode
}) => {
  const { user, logout, canManage } = useAuth();
  const { isConnected, lastTelemetryTimestamp } = useSocket();
  const { notifications = [], unreadCount = 0, markAsRead, markAllAsRead } = useNotifications();
  const safeNotifications = notifications || [];
  const safeUnreadCount = unreadCount || 0;
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    if (onRefreshData) await onRefreshData();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <header
      id="main-app-header"
      className="h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between z-20 sticky top-0"
    >
      {/* Left: Global Search & Quick Status */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <button
          id="btn-global-search-trigger"
          onClick={onOpenSearch}
          className="flex items-center gap-3 px-3.5 py-2 bg-slate-900/80 hover:bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 text-sm transition-all w-full max-w-md shadow-inner group"
        >
          <Search className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          <span className="flex-1 text-left text-xs text-slate-400">Search hosts, VMs, containers, alerts, logs...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-slate-800/80 border border-slate-700/60 rounded-md">
            ⌘K
          </kbd>
        </button>

        {/* Live WS Status Indicator */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800/60 text-xs">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-mono text-[11px] text-slate-300">
            {isConnected ? 'TELEMETRY LIVE' : 'CONNECTING WS'}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Manual Refresh */}
        <button
          id="btn-manual-refresh"
          onClick={handleManualRefresh}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl border border-slate-800/60 transition-colors"
          title="Force telemetry poll"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>

        {/* Demo Mode Toggle Badge */}
        <button
          id="btn-toggle-demo-mode"
          onClick={onToggleDemoMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            isDemoMode
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Toggle between Live Hardware and Simulated Demo telemetry"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{isDemoMode ? 'DEMO MODE (ACTIVE)' : 'LIVE MODE'}</span>
        </button>

        {/* Add Connection (Admin/Operator) */}
        {canManage && (
          <button
            id="btn-header-add-connection"
            onClick={onOpenAddConnection}
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Node</span>
          </button>
        )}

        {/* Notifications Bell */}
        <div className="relative">
          <button
            id="btn-notifications-toggle"
            onClick={() => setShowNotificationsDrawer(!showNotificationsDrawer)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl border border-slate-800/60 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {safeUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-bounce">
                {safeUnreadCount > 9 ? '9+' : safeUnreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Drawer */}
          {showNotificationsDrawer && (
            <div 
              id="notifications-drawer-dropdown"
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2"
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Notifications</h3>
                  {safeUnreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-400 rounded-full">
                      {safeUnreadCount} unread
                    </span>
                  )}
                </div>
                {safeUnreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                {safeNotifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No notifications or alert events logged
                  </div>
                ) : (
                  safeNotifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      className={`p-3.5 text-xs transition-colors cursor-pointer hover:bg-slate-800/40 flex items-start gap-3 ${
                        !n.isRead ? 'bg-slate-800/20' : ''
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                        n.severity === 'CRITICAL' ? 'bg-rose-500' : (n.severity === 'WARNING' ? 'bg-amber-500' : 'bg-cyan-500')
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-200 truncate">{n.title}</h4>
                          <span className="text-[10px] text-slate-500">{formatRelativeTime(n.createdAt)}</span>
                        </div>
                        <p className="text-slate-400 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            id="btn-user-menu-toggle"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs font-semibold transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-xs uppercase">
              {user?.username?.substring(0, 2) || 'OP'}
            </div>
            <span className="hidden md:inline font-mono">{user?.username}</span>
          </button>

          {showUserDropdown && (
            <div
              id="user-menu-dropdown"
              className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in"
            >
              <div className="p-3 border-b border-slate-800/80 mb-1">
                <p className="text-xs font-bold text-white">{user?.username}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                <div className="mt-1.5 inline-block px-2 py-0.5 bg-slate-800 text-[10px] font-mono rounded text-cyan-400">
                  Role: {user?.role}
                </div>
              </div>

              <button
                id="btn-user-logout"
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out Session</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
