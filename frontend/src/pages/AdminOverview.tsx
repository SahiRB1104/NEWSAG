import React, { useEffect, useState } from 'react';
import { Activity, BookOpenText, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/admin.service';
import { EmptyState } from '../components/ui/EmptyState';
import { notify } from '../lib/notify';
import { Button } from '../components/ui/Button';

interface AdminOverviewProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

interface KPICard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: 'indigo' | 'emerald' | 'amber' | 'rose';
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ showNotification }) => {
  const navigate = useNavigate();
  void showNotification;
  const [kpis, setKpis] = useState<KPICard[]>([
    {
      label: 'Total Users',
      value: '—',
      icon: <Users size={18} aria-hidden="true" />,
      color: 'indigo',
    },
    {
      label: 'Active This Week',
      value: '—',
      icon: <TrendingUp size={18} aria-hidden="true" />,
      color: 'emerald',
    },
    {
      label: 'Articles Indexed',
      value: '—',
      icon: <BookOpenText size={18} aria-hidden="true" />,
      color: 'amber',
    },
    {
      label: 'Avg Sentiment (Pos)',
      value: '—',
      icon: <Activity size={18} aria-hidden="true" />,
      color: 'rose',
    },
  ]);

  const [_loading, setLoading] = useState(true);
  const [_trainingStats, setTrainingStats] = useState<any>(null);
  const [hitStatus, setHitStatus] = useState<any>(null);
  const [hitHistory, setHitHistory] = useState<Array<{date: string; count: number}>>([]);
  const [hitHistoryError, setHitHistoryError] = useState(false);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const mergeTodayHitFallback = (
    history: Array<{ date: string; count: number }>,
    todayHits?: number
  ) => {
    if (!todayHits || todayHits <= 0 || history.length === 0) return history;

    const today = new Date().toISOString().slice(0, 10);
    return history.map((entry) => {
      if (entry.date === today && entry.count < todayHits) {
        return { ...entry, count: todayHits };
      }
      return entry;
    });
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Fetch training stats
        const stats = await adminApi.getTrainingStats();
        setTrainingStats(stats);

        // Fetch GNews hit status
        const hits = await adminApi.getHitCounterStatus();
        setHitStatus(hits);

        // Fetch hit history (7 days)
        try {
          const history = await adminApi.getHitHistory(7);
          setHitHistory(mergeTodayHitFallback(history.history || [], hits?.today_hits));
          setHitHistoryError(false);
        } catch {
          setHitHistory([]);
          setHitHistoryError(true);
          notify.warning('Hit history is temporarily unavailable.');
        }

        // Fetch system status (redis/db/gnews)
        try {
          const sys = await adminApi.getSystemStatus();
          setSystemStatus(sys);
        } catch {
          notify.warning('System status could not be loaded.');
        }

        // (sentiment distribution shown on Sentiment Feedback page)

        // Fetch admin metrics and update KPI cards
        // Fetch admin metrics and update KPI cards with loading/error handling
        setMetricsLoading(true);
        setMetricsError(null);
        try {
          const metrics = await adminApi.getAdminMetrics();

          const formatSentiment = (val: number | null) => {
            if (val === null || val === undefined) return '—';
            if (val > 0 && val <= 1) return `${Math.round(val * 100)}%`;
            return `${Math.round(val)}%`;
          };

          setKpis((prev) =>
            prev.map((kpi) => {
              switch (kpi.label) {
                case 'Total Users':
                  return { ...kpi, value: metrics.total_users ?? '—' };
                case 'Active This Week':
                  return { ...kpi, value: metrics.active_this_week ?? '—' };
                case 'Articles Indexed':
                  return { ...kpi, value: metrics.articles_indexed ?? '—' };
                case 'Avg Sentiment (Pos)':
                  return { ...kpi, value: formatSentiment(metrics.avg_sentiment) };
                default:
                  return kpi;
              }
            })
          );
          // If metrics.total_users is null or 0, attempt authoritative Clerk count
          if (!metrics.total_users || metrics.total_users === 0) {
            try {
              const clerk = await adminApi.getClerkUserCount();
              if (clerk) {
                const display = typeof clerk.total_users === 'number' ? clerk.total_users : '—';
                setKpis((prev) =>
                  prev.map((kpi) => (kpi.label === 'Total Users' ? { ...kpi, value: display } : kpi))
                );
              }
            } catch (e) {
              // ignore fallback errors
            }
          }
        } catch (err) {
          notify.error('Failed to fetch admin metrics.');
          setMetricsError(err instanceof Error ? err.message : 'Failed to load metrics');
        } finally {
          setMetricsLoading(false);
        }

        setLoading(false);
      } catch (err) {
        notify.error(`Error loading metrics: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [showNotification]);

  const colorClasses = {
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
  };

  const chartTotal = hitHistory.reduce((sum, item) => sum + item.count, 0);
  const chartMax = hitHistory.length ? Math.max(...hitHistory.map((item) => item.count)) : 0;
  const chartAvg = hitHistory.length ? Number((chartTotal / hitHistory.length).toFixed(1)) : 0;

  return (
    <div className="space-y-4 pb-3">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow min-h-[96px]"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`p-2 rounded-lg ${colorClasses[kpi.color]}`}>
                {kpi.icon}
              </div>
              {kpi.trend && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded">
                  {kpi.trend}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {kpi.label}
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {metricsLoading ? (
                <span className="inline-block h-6 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
              ) : metricsError ? (
                <span className="text-sm font-semibold text-rose-600">Error</span>
              ) : (
                kpi.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* GNews Hits History (moved up) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">GNews Hits (Last 7 days)</h3>
          {!hitHistoryError && hitHistory.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Total: {chartTotal}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Avg/day: {chartAvg}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Max/day: {chartMax}
              </span>
            </div>
          )}
        </div>
        {hitHistoryError ? (
          <EmptyState
            title="Hit History Unavailable"
            description="The metrics history endpoint is currently unavailable. Try again shortly or check system health."
            action={{ label: 'Open System Ops', href: '/admin/ops' }}
            illustration="generic"
          />
        ) : hitHistory && hitHistory.length > 0 ? (
          <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Daily hits</span>
              <span>Max scale: {Math.max(chartMax, 1)}</span>
            </div>
            <div className="flex items-end gap-2 h-28">
            {(() => {
              const max = Math.max(...hitHistory.map(h => h.count), 1);
              return hitHistory.map((h) => (
                <div key={h.date} className="flex-1 h-full flex flex-col justify-end text-center">
                  <div className="mb-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{h.count}</div>
                  <div className="flex-1 flex items-end justify-center">
                    <div
                      title={`${h.date}: ${h.count}`}
                      className="bg-indigo-500 dark:bg-indigo-400 rounded-t-md transition-all"
                      style={{
                        width: '76%',
                        height: h.count > 0 ? `${Math.max((h.count / max) * 100, 8)}%` : '0%',
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">{h.date.split('-').slice(1).join('-')}</div>
                </div>
              ));
            })()}
          </div>
          </div>
        ) : (
          <EmptyState
            title="No Hit History"
            description="We do not have enough GNews usage data yet. Check back after traffic starts flowing."
            action={{ label: 'Open System Ops', href: '/admin/ops' }}
            illustration="generic"
          />
        )}
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Redis Cache Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Connection</span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">Connected</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Hit Rate</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{systemStatus?.redis?.hit_rate ? `${systemStatus.redis.hit_rate.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Memory Usage</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{systemStatus?.redis?.memory_usage ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            GNews API Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Today's Hits</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {hitStatus?.today_hits ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Remaining Quota</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {hitStatus?.remaining_hits}/{hitStatus?.max_hits ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Status</span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    hitStatus?.warning ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                ></span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {hitStatus?.warning ? 'Warning' : 'OK'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions (moved down) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await notify.promise(adminApi.refreshAllCache(), {
                loading: 'Refreshing all cache categories...',
                success: 'Cache refresh started',
                error: 'Failed to refresh cache',
              });
            }}
            className="h-auto min-h-[88px] w-full flex-col items-start justify-start px-4 py-3 text-left"
          >
            <p className="font-medium text-slate-900 dark:text-white mb-1">Refresh News Cache</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Clear and reload all categories</p>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await notify.promise(adminApi.resetHitCounter(), {
                loading: 'Resetting daily GNews quota...',
                success: 'Hit counter reset',
                error: 'Failed to reset quota',
              });
            }}
            className="h-auto min-h-[88px] w-full flex-col items-start justify-start px-4 py-3 text-left"
          >
            <p className="font-medium text-slate-900 dark:text-white mb-1">Reset GNews Quota</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Reset daily hit counter</p>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/admin/audit')}
            className="h-auto min-h-[88px] w-full flex-col items-start justify-start px-4 py-3 text-left"
          >
            <p className="font-medium text-slate-900 dark:text-white mb-1">View Audit Log</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">See recent admin actions</p>
          </Button>
        </div>
      </div>
      {/* Sentiment distribution is shown on the Sentiment Feedback page */}
    </div>
  );
};

export default AdminOverview;
