import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, User, Key, AlertCircle, Sparkles, Server } from 'lucide-react';
import { DEMO_ACCOUNTS, DEFAULT_DEMO_CREDENTIALS } from '../constants/demoAccounts';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState(DEFAULT_DEMO_CREDENTIALS.username);
  const [password, setPassword] = useState(DEFAULT_DEMO_CREDENTIALS.password);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials or inactive account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/25 text-white font-black text-xl">
            NOC
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">IT Infrastructure Manager</h1>
          <p className="text-xs text-slate-400">Enterprise Node & Virtualization Control Plane</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                id="login-input-username"
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                id="login-input-password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            id="btn-login-submit"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-cyan-600/25 transition-all mt-2"
          >
            {isLoading ? 'Authenticating Operator...' : 'Sign In to Infrastructure Console'}
          </button>
        </form>

        {/* Demo Accounts Quick-Fill */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Pre-Configured Demo Accounts:</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map(account => (
              <button
                key={account.id}
                type="button"
                id={`btn-quick-fill-${account.role.toLowerCase()}`}
                onClick={() => handleQuickFill(account.username, account.password)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors"
              >
                <p className={`text-xs font-bold ${account.badgeColorClass}`}>{account.label}</p>
                <p className="text-[10px] text-slate-500 font-mono">{account.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="text-[11px] text-slate-500 font-mono">
            Encrypted AES-256 Auth • Strict RBAC Enforced
          </p>
        </div>
      </div>
    </div>
  );
};
