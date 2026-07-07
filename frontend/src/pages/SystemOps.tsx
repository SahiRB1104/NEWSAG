import React, { useState, useEffect } from 'react';
import { AlertTriangle, Database, Eye, RefreshCcw, RotateCw, Server, Settings2 } from 'lucide-react';
import { adminApi, type SystemStatus } from '../services/admin.service';
import { notify } from '../lib/notify';
import { Button } from '../components/ui/Button';

interface SystemOpsProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

export const SystemOps: React.FC<SystemOpsProps> = ({ showNotification }) => {
  void showNotification;
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const chatbot = systemStatus?.chatbot;
  const chatbotConnected = chatbot?.connected ?? false;
  const chatbotStatusClass = chatbotConnected ? 'bg-emerald-500' : 'bg-rose-500';
  const chatbotStatusText = chatbotConnected ? 'Online' : 'Offline';
  const gnewsRemaining = systemStatus?.gnews?.remaining;
  const gnewsStatusClass =
    typeof gnewsRemaining !== 'number'
      ? 'bg-amber-500'
      : gnewsRemaining > 0
        ? 'bg-emerald-500'
        : 'bg-rose-500';
  const gnewsStatusText =
    typeof gnewsRemaining !== 'number'
      ? 'Initializing'
      : gnewsRemaining > 0
        ? 'Ready'
        : 'Limit Reached';

  const formatUtcDateTime = (value?: string | null) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const sys = await adminApi.getSystemStatus();
        setSystemStatus(sys);
      } catch {
        notify.warning('System status is temporarily unavailable.');
      }
    };

    fetchStatus();
  }, []);

  const handleRefreshCache = async (category?: string) => {
    setRefreshing(category || 'all');
    try {
      const op = category ? adminApi.refreshCategoryCache(category) : adminApi.refreshAllCache();
      await notify.promise(op, {
        loading: `Refreshing ${category ? category : 'all'} cache...`,
        success: `Cache ${category ? `for ${category}` : 'refresh'} triggered`,
        error: 'Failed to refresh cache',
      });
    } catch {
      // Toast is already handled by notify.promise.
    } finally {
      setRefreshing(null);
    }
  };

  const handleResetQuota = async () => {
    setResetting(true);
    try {
      await notify.promise(adminApi.resetHitCounter(), {
        loading: 'Resetting GNews quota...',
        success: 'GNews quota reset',
        error: 'Failed to reset quota',
      });
    } catch {
      // Toast is already handled by notify.promise.
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cache Management */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <RefreshCcw size={18} aria-hidden="true" />
          Cache Management
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Manually refresh news caches for specific categories or all at once.
        </p>

        <div className="space-y-3">
          <Button
            onClick={() => handleRefreshCache()}
            disabled={refreshing === 'all'}
            isLoading={refreshing === 'all'}
            className="w-full justify-center"
          >
            <RotateCw size={16} className={refreshing === 'all' ? 'animate-spin' : ''} aria-hidden="true" />
            {refreshing === 'all' ? 'Refreshing...' : 'Refresh All Categories'}
          </Button>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {[
              'general',
              'nation',
              'business',
              'technology',
              'sports',
              'entertainment',
              'health',
            ].map((category) => (
              <Button
                key={category}
                variant="secondary"
                size="sm"
                onClick={() => handleRefreshCache(category)}
                disabled={refreshing === category}
                isLoading={refreshing === category}
                className="capitalize"
              >
                {refreshing === category ? (
                  <>
                    <RotateCw size={14} className="inline animate-spin mr-1" aria-hidden="true" />
                    ...
                  </>
                ) : (
                  category
                )}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* GNews API Management */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings2 size={18} aria-hidden="true" />
          GNews API Quota Reset
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Reset the daily hit counter (100 requests per day, UTC). Useful for testing or quota troubleshooting.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Current Status</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Today's Hits</span>
                <span className="font-semibold text-slate-900 dark:text-white">{systemStatus?.gnews?.today_hits ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Remaining</span>
                <span className="font-semibold text-slate-900 dark:text-white">{systemStatus?.gnews?.remaining ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Reset Time (UTC)</span>
                <span className="font-semibold text-slate-900 dark:text-white">{systemStatus?.gnews?.reset_time ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-2">
              <AlertTriangle size={16} aria-hidden="true" />
              Warning
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Resetting quota will clear today's hit counter. Use only for testing or when instructed by support.
            </p>
          </div>
        </div>

        <Button
          variant="danger"
          onClick={handleResetQuota}
          disabled={resetting}
          isLoading={resetting}
        >
          {resetting ? 'Resetting...' : 'Reset Quota'}
        </Button>
      </div>

      {/* Monitoring & Logs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Eye size={18} aria-hidden="true" />
          Monitoring
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          View system health, logs, and performance metrics.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              <Database size={14} className="inline mr-2" aria-hidden="true" />
              Database Status
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Connection</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${systemStatus?.database?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  <span className="text-slate-900 dark:text-white">{systemStatus?.database?.connected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Latency</span>
                <span className="text-slate-900 dark:text-white">{systemStatus?.database?.latency_ms ? `${systemStatus.database.latency_ms.toFixed(1)} ms` : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Collections</span>
                <span className="text-slate-900 dark:text-white">{systemStatus?.database?.collections ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              <Server size={14} className="inline mr-2" aria-hidden="true" />
              Service Status
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">ML Models</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span className="text-slate-900 dark:text-white">Ready</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Cache (Redis)</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${systemStatus?.redis?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  <span className="text-slate-900 dark:text-white">{systemStatus?.redis?.connected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">API (GNews)</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${gnewsStatusClass}`}></span>
                  <span className="text-slate-900 dark:text-white">{gnewsStatusText}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Chatbot (LLM)</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${chatbotStatusClass}`}></span>
                  <span className="text-slate-900 dark:text-white">{chatbotStatusText}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg md:col-span-2">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              <Server size={14} className="inline mr-2" aria-hidden="true" />
              Chatbot Telemetry
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Provider</span>
                <span className="text-slate-900 dark:text-white uppercase">{chatbot?.provider ?? 'ollama'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">LLM Name</span>
                <span className="text-slate-900 dark:text-white">{chatbot?.llm_name ?? 'Ollama'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Model</span>
                <span className="text-slate-900 dark:text-white">{chatbot?.model_name ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Mode</span>
                <span className="text-slate-900 dark:text-white capitalize">{chatbot?.deployment_mode ?? 'unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Token Usage (Today)</span>
                <span className="text-slate-900 dark:text-white">{chatbot?.tokens_today?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Requests (Today)</span>
                <span className="text-slate-900 dark:text-white">{chatbot?.tokens_today?.requests ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Avg Latency</span>
                <span className="text-slate-900 dark:text-white">{typeof chatbot?.avg_latency_ms === 'number' ? `${chatbot.avg_latency_ms.toFixed(1)} ms` : '—'}</span>
              </div>
              <div className="flex items-center justify-between md:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Last Request</span>
                <span className="text-slate-900 dark:text-white">{formatUtcDateTime(chatbot?.last_request_at)}</span>
              </div>
            </div>
            {chatbot?.last_error && (
              <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">
                Last error: {chatbot.last_error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemOps;
