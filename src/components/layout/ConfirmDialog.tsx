import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loadingLabel?: string;
  isLoading?: boolean;
  isDestructive?: boolean;
  requireReason?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm Action',
  loadingLabel,
  isLoading = false,
  isDestructive = false,
  requireReason = false,
  onConfirm,
  onCancel
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isLoading) return;
    if (requireReason && !reason.trim()) {
      setError('Please provide an operational rationale for this action');
      return;
    }
    setError('');
    onConfirm(reason);
  };

  const handleCancel = () => {
    if (isLoading) return;
    setReason('');
    setError('');
    onCancel();
  };

  const displayLabel = isLoading
    ? (loadingLabel || `${confirmLabel.replace(/^Execute\s+/i, 'Executing ')}...`)
    : confirmLabel;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-busy={isLoading}
    >
      <div 
        id="confirm-dialog-modal"
        className="w-full max-w-lg bg-slate-900 border border-slate-700/70 rounded-2xl p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDestructive ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
              {isDestructive ? <ShieldAlert className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-lg font-bold text-white tracking-tight">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Audited infrastructure management action</p>
            </div>
          </div>
          <button 
            id="btn-close-confirm-dialog"
            onClick={handleCancel}
            disabled={isLoading}
            aria-disabled={isLoading}
            className={`p-1 rounded-lg transition-colors ${
              isLoading
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-sm text-slate-300 leading-relaxed">
          {message}
        </div>

        {requireReason && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Operational Rationale (Audit Log)
            </label>
            <input
              id="confirm-action-reason"
              type="text"
              placeholder="e.g. Scheduled emergency restart due to high CPU thread lock"
              value={reason}
              disabled={isLoading}
              onChange={e => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              className={`w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-opacity ${
                isLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
            {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-cancel-confirm"
            onClick={handleCancel}
            disabled={isLoading}
            aria-disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              isLoading
                ? 'text-slate-500 bg-slate-800/50 cursor-not-allowed'
                : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700'
            }`}
          >
            Cancel
          </button>
          <button
            id="btn-execute-confirm"
            onClick={handleConfirm}
            disabled={isLoading}
            aria-disabled={isLoading}
            aria-busy={isLoading}
            className={`flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all shadow-lg ${
              isDestructive
                ? (isLoading
                    ? 'bg-rose-700/80 cursor-not-allowed shadow-none opacity-90'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 active:scale-95')
                : (isLoading
                    ? 'bg-cyan-700/80 cursor-not-allowed shadow-none opacity-90'
                    : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20 active:scale-95')
            }`}
          >
            {isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-white flex-shrink-0" />
            )}
            <span>{displayLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
