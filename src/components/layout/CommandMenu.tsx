import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Server, 
  Cpu, 
  Boxes, 
  HardDrive, 
  AlertOctagon, 
  ScrollText, 
  Settings, 
  X,
  Layers
} from 'lucide-react';
import { NavItemKey } from './Sidebar';

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavItemKey) => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : undefined;
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickActions: { label: string; tab: NavItemKey; category: string; icon: any }[] = [
    { label: 'View Main Operations Dashboard', tab: 'dashboard', category: 'Navigation', icon: Layers },
    { label: 'Inspect All Infrastructure Nodes & Inventory', tab: 'infrastructure', category: 'Navigation', icon: Server },
    { label: 'Manage VMware ESXi Hypervisors', tab: 'esxi', category: 'Compute', icon: Server },
    { label: 'Virtual Machines Fleet & Power States', tab: 'vms', category: 'Compute', icon: Cpu },
    { label: 'CasaOS Edge & Homelab Applications', tab: 'casaos', category: 'Edge', icon: Boxes },
    { label: 'Docker Containers, Volumes & Images', tab: 'docker', category: 'Containers', icon: Boxes },
    { label: 'Storage Pools & Datastores', tab: 'storage', category: 'Storage', icon: HardDrive },
    { label: 'Live Telemetry & Metrics Charts', tab: 'monitoring', category: 'Observability', icon: Server },
    { label: 'Active Alerts & Incident Response', tab: 'alerts', category: 'Observability', icon: AlertOctagon },
    { label: 'System Logs & Centralized Event Tail', tab: 'logs', category: 'Observability', icon: ScrollText },
    { label: 'Audit Trail & Operations History', tab: 'tasks', category: 'Governance', icon: ScrollText },
    { label: 'Platform Settings & Node Configurations', tab: 'settings', category: 'Admin', icon: Settings }
  ];

  const filtered = quickActions.filter(a => 
    a.label.toLowerCase().includes(query.toLowerCase()) || 
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div 
        id="global-command-palette-modal"
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/60">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            id="input-command-palette-query"
            type="text"
            placeholder="Type a command, host name, or page to jump..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-white text-base focus:outline-none placeholder:text-slate-500 font-medium"
          />
          <button 
            id="btn-close-command-palette"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No matching commands or resources found for "{query}"
            </div>
          ) : (
            filtered.map((action, idx) => {
              const Icon = action.icon;
              return (
                <button
                  key={idx}
                  id={`command-action-${action.tab}`}
                  onClick={() => {
                    onNavigate(action.tab);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl text-left hover:bg-slate-800/70 text-slate-200 hover:text-white transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 text-slate-400 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{action.label}</p>
                      <p className="text-xs text-slate-400">{action.category}</p>
                    </div>
                  </div>
                  <kbd className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 text-slate-400 rounded border border-slate-800">
                    Jump ↵
                  </kbd>
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 bg-slate-950/70 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Navigate with ↵ or click</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
