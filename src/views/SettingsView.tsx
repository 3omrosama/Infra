import React, { useState, useEffect } from 'react';
import { Sliders, Bell, Sparkles, Shield, Save, RefreshCw, Key, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useNotifications } from '../context/NotificationContext';

export const SettingsView: React.FC = () => {
  const { showToast } = useNotifications();
  const [settings, setSettings] = useState<any>({
    pollIntervalSec: 30,
    demoMode: true,
    webhookUrl: '',
    slackWebhook: '',
    discordWebhook: '',
    alertRetentionDays: 30
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (e: any) {
      showToast('Error', e.message, 'CRITICAL');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      showToast('Settings Saved', 'Platform configuration successfully updated', 'INFO');
    } catch (err: any) {
      showToast('Save Failed', err.message, 'CRITICAL');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Platform Configuration & Integrations</h2>
        <p className="text-xs text-slate-400">
          Global polling parameters, outbound notification webhooks, encryption keys, and demo mode
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Polling & Monitoring */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Monitoring & Polling Engine</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Telemetry Polling Interval (Seconds)</label>
              <select
                value={settings.pollIntervalSec}
                onChange={e => setSettings({ ...settings, pollIntervalSec: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 font-mono"
              >
                <option value={10}>10 Seconds (High Precision / Fast)</option>
                <option value={30}>30 Seconds (Standard NOC)</option>
                <option value={60}>60 Seconds (Low Overhead)</option>
                <option value={300}>5 Minutes (Conservative)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Audit Log Retention (Days)</label>
              <input
                type="number"
                value={settings.alertRetentionDays || 30}
                onChange={e => setSettings({ ...settings, alertRetentionDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Demo Mode Toggle */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Synthetic Demo Simulation Mode</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When enabled, populates synthetic live hypervisors, containers, and live simulated telemetry stream.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-toggle-demo-mode"
              onClick={() => setSettings({ ...settings, demoMode: !settings.demoMode })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                settings.demoMode
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {settings.demoMode ? 'DEMO MODE: ACTIVE' : 'DEMO MODE: DISABLED'}
            </button>
          </div>
        </div>

        {/* Outbound Webhook Alerts */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Notification Channels & Webhooks</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Slack Incident Webhook URL</label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={settings.slackWebhook || ''}
                onChange={e => setSettings({ ...settings, slackWebhook: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Discord Alerts Webhook URL</label>
              <input
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={settings.discordWebhook || ''}
                onChange={e => setSettings({ ...settings, discordWebhook: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
