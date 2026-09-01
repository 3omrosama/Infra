import React, { useState } from 'react';
import { 
  Server, 
  Layers, 
  Home, 
  Boxes, 
  Lock, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { InfrastructureType, ProviderConnectionConfig } from '../../types/index';
import { api } from '../../lib/api';
import { useNotifications } from '../../context/NotificationContext';

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { showToast } = useNotifications();
  const [type, setType] = useState<InfrastructureType>('ESXI');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('443');
  const [useHttps, setUseHttps] = useState(true);
  const [skipSslVerify, setSkipSslVerify] = useState(true);
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pollIntervalSec, setPollIntervalSec] = useState('30');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleTypeChange = (selected: InfrastructureType) => {
    setType(selected);
    setTestResult(null);
    if (selected === 'ESXI') {
      setPort('443');
      setUseHttps(true);
      setUsername('root');
    } else if (selected === 'CASAOS') {
      setPort('80');
      setUseHttps(false);
      setUsername('casaos');
    } else if (selected === 'DOCKER') {
      setPort('2375');
      setUseHttps(false);
      setUsername('');
    } else if (selected === 'PROXMOX') {
      setPort('8006');
      setUseHttps(true);
      setUsername('root@pam');
    } else if (selected === 'TRUENAS') {
      setPort('443');
      setUseHttps(true);
      setUsername('root');
    }
  };

  const handleTestConnection = async () => {
    if (!host || !port) {
      showToast('Validation Error', 'Please enter host IP/FQDN and port to test connection', 'WARNING');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnectionConfig({
        type,
        host,
        port: parseInt(port, 10),
        useHttps,
        skipSslVerify,
        username,
        password: password || undefined,
        token: token || undefined
      });
      setTestResult(result);
      if (result.success) {
        showToast('Connection Test Succeeded', result.message, 'INFO');
      } else {
        showToast('Connection Test Failed', result.message, 'CRITICAL');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed'
      });
      showToast('Connection Test Failed', err.message || 'Connection test failed', 'CRITICAL');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !host || !port) {
      showToast('Validation Error', 'Please fill in the connection name, host IP/FQDN, and port', 'WARNING');
      return;
    }

    setIsSubmitting(true);
    try {
      const config: ProviderConnectionConfig = {
        name,
        type,
        host,
        port: parseInt(port, 10),
        useHttps,
        skipSslVerify,
        username,
        password: password || undefined,
        token: token || undefined,
        pollIntervalSec: parseInt(pollIntervalSec, 10)
      };

      await api.createConnection(config);
      showToast('Connection Added', `Successfully added and verified node '${name}'`, 'INFO');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast('Connection Failed', err.message || 'Failed to add connection', 'CRITICAL');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div 
        id="add-connection-modal"
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Connect Infrastructure Node</h3>
              <p className="text-xs text-slate-400">Add VMware ESXi, CasaOS, Docker, or Proxmox host</p>
            </div>
          </div>
          <button 
            id="btn-close-add-connection"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Provider Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              Infrastructure Provider Type
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'ESXI', label: 'VMware ESXi', icon: Server },
                { id: 'CASAOS', label: 'CasaOS / ZimaOS', icon: Home },
                { id: 'DOCKER', label: 'Docker Daemon', icon: Boxes },
                { id: 'PROXMOX', label: 'Proxmox VE', icon: Layers },
                { id: 'TRUENAS', label: 'TrueNAS CORE/SCALE', icon: Server }
              ].map(item => {
                const Icon = item.icon;
                const isSelected = type === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`btn-select-type-${item.id}`}
                    onClick={() => handleTypeChange(item.id as InfrastructureType)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all text-left ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Node Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Display Name *
              </label>
              <input
                id="input-conn-name"
                type="text"
                required
                placeholder="e.g. esxi-prod-cluster-01"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Host IP / FQDN *
              </label>
              <input
                id="input-conn-host"
                type="text"
                required
                placeholder="192.168.1.100 or esxi.internal"
                value={host}
                onChange={e => setHost(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Network and Ports */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Port *
              </label>
              <input
                id="input-conn-port"
                type="number"
                required
                value={port}
                onChange={e => setPort(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Poll Interval (s)
              </label>
              <input
                id="input-conn-poll"
                type="number"
                min="5"
                max="300"
                value={pollIntervalSec}
                onChange={e => setPollIntervalSec(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <div className="flex flex-col justify-end pb-1 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={useHttps}
                  onChange={e => setUseHttps(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900"
                />
                <span>Use HTTPS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={skipSslVerify}
                  onChange={e => setSkipSslVerify(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900"
                />
                <span>Skip SSL Check</span>
              </label>
            </div>
          </div>

          {/* Credentials */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Authentication Credentials (AES-256 Encrypted)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Username / Account</label>
                <input
                  id="input-conn-username"
                  type="text"
                  placeholder="root or admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Password</label>
                <div className="relative">
                  <input
                    id="input-conn-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {(type === 'CASAOS' || type === 'DOCKER' || type === 'PROXMOX') && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">API Token / Secret Key (Optional)</label>
                <input
                  id="input-conn-token"
                  type="password"
                  placeholder="API Key or Bearer Token"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* Test connection result banner */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
              testResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              id="btn-test-add-conn"
              disabled={isTesting || isSubmitting}
              onClick={handleTestConnection}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 rounded-xl transition-all disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Probing Node...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-cancel-add-conn"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn-submit-add-conn"
                disabled={isSubmitting || isTesting}
                className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Save & Verify Node</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
