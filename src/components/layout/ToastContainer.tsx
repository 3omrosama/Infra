import React from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map(toast => {
        let borderColor = 'border-cyan-500/30';
        let bgGlow = 'bg-slate-900/95';
        let Icon = Info;
        let iconColor = 'text-cyan-400';

        if (toast.type === 'CRITICAL') {
          borderColor = 'border-rose-500/40';
          iconColor = 'text-rose-400';
          Icon = AlertCircle;
        } else if (toast.type === 'WARNING') {
          borderColor = 'border-amber-500/40';
          iconColor = 'text-amber-400';
          Icon = AlertCircle;
        } else if (toast.title.toLowerCase().includes('success')) {
          borderColor = 'border-emerald-500/40';
          iconColor = 'text-emerald-400';
          Icon = CheckCircle2;
        }

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto p-4 rounded-xl border ${borderColor} ${bgGlow} shadow-2xl backdrop-blur-md text-slate-100 flex items-start gap-3 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
          >
            <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-white">{toast.title}</h4>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">{toast.message}</p>
            </div>
            <button
              id={`close-toast-${toast.id}`}
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
