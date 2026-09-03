import React, { useState, useEffect } from 'react';
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
  EyeOff,
  Shield,
  ShieldAlert,
  Globe
} from 'lucide-react';
import { InfrastructureType, ProviderConnectionConfig, InfrastructureConnection } from '../../types/index';
import { api } from '../../lib/api';
import { useNotifications } from '../../context/NotificationContext';

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onCreated?: () => void;
  connectionToEdit?: InfrastructureConnection | null;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onCreated,
  connectionToEdit
}) => {
  const { showToast } = useNotifications();
  const [type, setType] = useState<InfrastructureType>('ESXI');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('443');
  const [useHttps, setUseHttps] = useState(true);
  const [verifyTls, setVerifyTls] = useState(true); // default true: verify TLS certs
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pollIntervalSec, setPollIntervalSec] = useState('30');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number; latencyMs?: number; version?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [duplicateError, setDuplicateError] = useState<{ message: string; existingName?: string } | null>(null);

  const isEditMode = Boolean(connectionToEdit);

  useEffect(() => {
    if (connectionToEdit) {
      setType(connectionToEdit.type || 'ESXI');
      setName(connectionToEdit.name || '');
      setHost(connectionToEdit.host || '');
      setPort(String(connectionToEdit.port || (connectionToEdit.useHttps ? 443 : 80)));
      setUseHttps(connectionToEdit.useHttps ?? true);
      setVerifyTls(!connectionToEdit.skipSslVerify);
      setUsername(connectionToEdit.username || 'root');
      setPassword('');
      setPollIntervalSec(String(connectionToEdit.pollIntervalSec || 30));
    } else {
      setType('ESXI');
      setName('');
      setHost('');
      setPort('443');
      setUseHttps(true);
      setVerifyTls(true); // Default: verify TLS certificates
      setUsername('root');
      setPassword('');
      setToken('');
      setPollIntervalSec('30');
    }
    setTestResult(null);
    setDuplicateError(null);
    setShowPassword(false);
  }, [connectionToEdit, isOpen]);

  if (!isOpen) return null;

  const notifySuccess = () => {
    if (onSuccess) onSuccess();
    if (onCreated) onCreated();
  };

  const handleTypeChange = (selected: InfrastructureType) => {
    setType(selected);
    setTestResult(null);
    setDuplicateError(null);
    if (selected === 'ESXI') {
      setPort(useHttps ? '443' : '80');
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

  const handleProtocolChange = (https: boolean) => {
    setUseHttps(https);
    if (type === 'ESXI') {
      setPort(https ? '443' : '80');
    }
  };

  const handleTestConnection = async () => {
    if (!host || !port) {
      showToast('Validation Error', 'Please enter a valid Host / IP address and Port', 'WARNING');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setDuplicateError(null);
    try {
      const result = await api.testConnectionConfig({
        type,
        host,
        port: parseInt(port, 10),
        useHttps,
        skipSslVerify: !verifyTls,
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
      showToast('Validation Error', 'Please fill in display name, host/IP, and port', 'WARNING');
      return;
    }

    setIsSubmitting(true);
    setDuplicateError(null);
    try {
      const config: ProviderConnectionConfig = {
        name: name.trim(),
        type,
        host: host.trim(),
        port: parseInt(port, 10),
        useHttps,
        skipSslVerify: !verifyTls,
        username: username.trim(),
        password: password || undefined,
        token: token || undefined,
        pollIntervalSec: parseInt(pollIntervalSec, 10) || 30
      };

      if (isEditMode && connectionToEdit) {
        await api.updateConnection(connectionToEdit.id, config);
        showToast('Connection Updated', `Updated node '${name}'`, 'INFO');
      } else {
        await api.createConnection(config);
        showToast('Connection Added', `Successfully added and verified node '${name}'`, 'INFO');
      }

      notifySuccess();
      onClose();
    } catch (err: any) {
      if (err.status === 409 || err.code === 'DUPLICATE_CONNECTION') {
        const existingName = err.data?.existingConnection?.name;
        setDuplicateError({
          message: err.message || 'This infrastructure node is already registered in the dashboard.',
          existingName
        });
        showToast('Connection Exists', err.message, 'WARNING');
      } else {
        showToast(isEditMode ? 'Update Failed' : 'Connection Failed', err.message || 'Failed to save connection', 'CRITICAL');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div 
        id="add-connection-modal"
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEditMode ? `Edit Infrastructure Node (${name || connectionToEdit?.name})` : 'Connect Infrastructure Node'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditMode ? 'Update credentials and endpoint parameters' : 'Register VMware ESXi hypervisor, CasaOS, Docker, or Proxmox host'}
              </p>
            </div>
          </div>
          <button 
            id="btn-close-add-connection"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Provider Selection */}
          {!isEditMode && (
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
          )}

          {/* Node Display Name & Host/IP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Display Name *
              </label>
              <input
                id="input-conn-name"
                type="text"
                required
                placeholder={type === 'ESXI' ? 'e.g. esxi-prod-cluster-01' : 'e.g. storage-node-01'}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Host / IP / FQDN *
              </label>
              <input
                id="input-conn-host"
                type="text"
                required
                placeholder="192.168.1.100 or esxi01.corp.local"
                value={host}
                onChange={e => setHost(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Accepts IPv4 address, hostname, FQDN, or host:port
              </p>
            </div>
          </div>

          {/* Protocol & Port & Poll Interval */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Protocol
              </label>
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-700">
                <button
                  type="button"
                  id="btn-protocol-https"
                  onClick={() => handleProtocolChange(true)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    useHttps ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  HTTPS
                </button>
                <button
                  type="button"
                  id="btn-protocol-http"
                  onClick={() => handleProtocolChange(false)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    !useHttps ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  HTTP
                </button>
              </div>
            </div>

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
          </div>

          {/* TLS Certificate Verification Options */}
          {useHttps && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <div className="pt-0.5">
                <input
                  id="checkbox-verify-tls"
                  type="checkbox"
                  checked={verifyTls}
                  onChange={e => setVerifyTls(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="checkbox-verify-tls" className="text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5">
                  {verifyTls ? (
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Verify TLS / SSL Certificate</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Recommended enabled)</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {verifyTls
                    ? 'Strict certificate validation is enabled. Connection will verify CA chain and hostname.'
                    : 'Certificate validation is disabled. Required for self-signed ESXi lab certificates.'}
                </p>
              </div>
            </div>
          )}

          {/* Authentication Credentials */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Authentication Credentials (AES-256-GCM Encrypted)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Username / Account</label>
                <input
                  id="input-conn-username"
                  type="text"
                  placeholder={type === 'ESXI' ? 'root' : 'admin'}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Password {isEditMode && <span className="text-slate-500 font-normal">(Leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    id="input-conn-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isEditMode ? '••••••••••••' : 'ESXi root password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500 pr-9"
                  />
                  <button
                    type="button"
                    id="btn-toggle-show-password"
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

          {/* Duplicate connection warning banner */}
          {duplicateError && (
            <div id="duplicate-conn-banner" className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-300 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-amber-200">Connection Already Exists</div>
                <p className="text-amber-300/90 leading-relaxed">{duplicateError.message}</p>
                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      notifySuccess();
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-medium transition-colors"
                  >
                    View Existing Node
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateError(null)}
                    className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Test connection result banner */}
          {testResult && (
            <div 
              id="test-connection-result-banner"
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">
                  {testResult.success ? 'Connectivity Verified' : 'Connection Failed'}
                </span>
                <span className="text-slate-300 leading-relaxed">{testResult.message}</span>
                {testResult.latencyMs !== undefined && (
                  <span className="text-[11px] text-cyan-400 block mt-1 font-mono">
                    Round-trip Latency: {testResult.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
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
                  <span>Testing Connectivity...</span>
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
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isEditMode ? 'Update Node Configuration' : 'Save & Connect Node'}</span>
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
