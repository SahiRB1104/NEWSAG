import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, Flag, RefreshCw, Search } from 'lucide-react';
import {
  adminApi,
  type SentimentFeedback as SentimentFeedbackType,
  type SentimentAnomalyConfig,
  type SentimentAnomalyReport,
  type SentimentHeatmapCell,
  type SentimentTrendPoint,
} from '../services/admin.service';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { notify } from '../lib/notify';
import { useAsyncState } from '../hooks/useAsyncState';
import { SearchSkeleton } from '../components/ui/skeletons/SearchSkeleton';
import { newsService } from '../services/news.service';
import RightSlideOver from '../components/ui/RightSlideOver';

interface SentimentFeedbackProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

type FilterValue = 'all' | 'positive' | 'neutral' | 'negative';
type SourceFilterValue = 'all' | 'explicit' | 'implicit_bookmark' | 'implicit_read_later';
type SentimentLabel = Exclude<FilterValue, 'all'>;

const sentimentLabels: SentimentLabel[] = ['positive', 'neutral', 'negative'];

const normalizeSentiment = (label?: string): SentimentLabel => {
  const lower = String(label ?? '').trim().toLowerCase();
  if (lower.includes('pos')) return 'positive';
  if (lower.includes('neg')) return 'negative';
  return 'neutral';
};

const formatSentimentLabel = (label?: string) => {
  const normalized = normalizeSentiment(label);
  if (normalized === 'positive') return 'Positive';
  if (normalized === 'negative') return 'Negative';
  return 'Neutral';
};

const formatSourceLabel = (source?: string) => {
  if (source === 'implicit_bookmark') return 'Implicit Bookmark';
  if (source === 'implicit_read_later') return 'Implicit Read Later';
  if (source === 'explicit') return 'Explicit';
  return source ?? 'Unknown';
};

const confidenceToPercent = (confidence?: number) => {
  if (!Number.isFinite(confidence)) return 0;

  const value = confidence as number;
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
};

const getSentimentColor = (label?: string) => {
  switch (normalizeSentiment(label)) {
    case 'positive':
      return 'bg-emerald-900/65 text-emerald-200 border border-white/15';
    case 'neutral':
      return 'bg-slate-900/65 text-slate-100 border border-white/15';
    case 'negative':
      return 'bg-rose-900/65 text-rose-200 border border-white/15';
    default:
      return '';
  }
};

const heatCellClass = (value: number, sentiment: SentimentLabel) => {
  if (value <= 0) return 'bg-slate-100 dark:bg-slate-800';
  if (sentiment === 'positive') {
    if (value >= 10) return 'bg-emerald-500';
    if (value >= 5) return 'bg-emerald-300';
    return 'bg-emerald-200';
  }
  if (sentiment === 'negative') {
    if (value >= 10) return 'bg-rose-500';
    if (value >= 5) return 'bg-rose-300';
    return 'bg-rose-200';
  }
  if (value >= 10) return 'bg-slate-500';
  if (value >= 5) return 'bg-slate-300';
  return 'bg-slate-200';
};

const SentimentAnalyticsCharts = React.memo(({
  trendPoints,
  sentimentStats,
}: {
  trendPoints: SentimentTrendPoint[];
  sentimentStats: any;
}) => {
  const pieData = useMemo(() => [
    { name: 'Positive', value: sentimentStats?.counts?.positive ?? 0, color: '#10b981' },
    { name: 'Neutral', value: sentimentStats?.counts?.neutral ?? 0, color: '#64748b' },
    { name: 'Negative', value: sentimentStats?.counts?.negative ?? 0, color: '#f43f5e' },
  ], [sentimentStats]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Sentiment Trend (30 Days)</h3>
        <div className="h-64">
          {trendPoints.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendPoints}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="positive_ratio" name="Positive %" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="neutral_ratio" name="Neutral %" stroke="#64748b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="negative_ratio" name="Negative %" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">Trend data unavailable</div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Distribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

const SentimentHeatmap = React.memo(({
  heatmapCells,
  heatmapSources,
}: {
  heatmapCells: SentimentHeatmapCell[];
  heatmapSources: string[];
}) => {
  const heatmapByKey = useMemo(() => {
    const next = new Map<string, SentimentHeatmapCell>();
    heatmapCells.forEach((cell) => {
      next.set(`${cell.source}:${cell.sentiment}`, cell);
    });
    return next;
  }, [heatmapCells]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Source-wise Sentiment Heatmap</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            <div>Source</div>
            <div>Positive</div>
            <div>Neutral</div>
            <div>Negative</div>
          </div>
          <div className="space-y-2">
            {heatmapSources.length ? heatmapSources.map((source) => (
              <div key={source} className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] gap-2 items-center">
                <div className="text-xs text-slate-700 dark:text-slate-300 truncate pr-2">{formatSourceLabel(source)}</div>
                {sentimentLabels.map((sentiment) => {
                  const value = heatmapByKey.get(`${source}:${sentiment}`)?.value ?? 0;
                  return (
                    <div key={`${source}-${sentiment}`} className={`h-8 rounded-md flex items-center justify-center text-xs font-semibold ${heatCellClass(value, sentiment)}`}>
                      {value}
                    </div>
                  );
                })}
              </div>
            )) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No heatmap data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const SentimentFeedback: React.FC<SentimentFeedbackProps> = ({ showNotification }) => {
  const {
    data: samples,
    loading,
    error: fetchError,
    executeLatest,
    setData: setSamplesData,
  } = useAsyncState<SentimentFeedbackType[]>({
    initialData: [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Unknown error',
  });
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sentimentStats, setSentimentStats] = useState<any>(null);
  const [trendPoints, setTrendPoints] = useState<SentimentTrendPoint[]>([]);
  const [heatmapCells, setHeatmapCells] = useState<SentimentHeatmapCell[]>([]);
  const [heatmapSources, setHeatmapSources] = useState<string[]>([]);
  const [anomalyConfig, setAnomalyConfig] = useState<SentimentAnomalyConfig | null>(null);
  const [anomalyReport, setAnomalyReport] = useState<SentimentAnomalyReport | null>(null);
  const [selectedSample, setSelectedSample] = useState<SentimentFeedbackType | null>(null);
  const [panelSummary, setPanelSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [overrideLabel, setOverrideLabel] = useState<'positive' | 'neutral' | 'negative'>('neutral');
  const [overrideReason, setOverrideReason] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [panelBusy, setPanelBusy] = useState(false);
  void showNotification;

  const fetchSamples = useCallback(async () => {
    try {
      await executeLatest(() => adminApi.getSentimentFeedback(300), (result) => result.feedback);

      try {
        const stats = await adminApi.getSentimentStats();
        setSentimentStats(stats);
      } catch {
        notify.warning('Unable to load sentiment distribution stats right now.');
      }

      try {
        const [trends, heatmap, config, anomalies] = await Promise.all([
          adminApi.getSentimentTrends(30),
          adminApi.getSentimentHeatmap(30),
          adminApi.getSentimentAnomalyConfig(),
          adminApi.getSentimentAnomalies(),
        ]);
        setTrendPoints(trends.points || []);
        setHeatmapCells(heatmap.cells || []);
        setHeatmapSources(heatmap.sources || []);
        setAnomalyConfig(config);
        setAnomalyReport(anomalies);
        if (anomalies.alert) {
          notify.warning(anomalies.message);
        }
      } catch {
        notify.warning('Sentiment analytics visuals are temporarily unavailable.');
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      notify.error(`Failed to load sentiment samples: ${message}`);
      return false;
    }
  }, [executeLatest]);

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  const handleManualRefresh = async () => {
    const refreshed = await fetchSamples();
    if (refreshed) {
      notify.success('Sentiment feedback refreshed.');
    }
  };

  const filteredSamples = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return samples.filter((sample) => {
      if (filter !== 'all' && normalizeSentiment(sample.ai_label) !== filter) {
        return false;
      }

      if (sourceFilter !== 'all' && sample.source !== sourceFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = `${sample.article_id} ${sample.text} ${sample.source}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [samples, filter, sourceFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSamples.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, sourceFilter, searchQuery, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedSamples = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSamples.slice(start, start + pageSize);
  }, [filteredSamples, currentPage, pageSize]);

  const visibleStart = filteredSamples.length ? (currentPage - 1) * pageSize + 1 : 0;
  const visibleEnd = Math.min(currentPage * pageSize, filteredSamples.length);

  const updateSample = useCallback((id: string, updater: (sample: SentimentFeedbackType) => SentimentFeedbackType) => {
    setSamplesData((current) => current.map((sample) => sample.id === id ? updater(sample) : sample));
  }, [setSamplesData]);

  useEffect(() => {
    if (!selectedSample) {
      setPanelSummary('');
      setSummaryLoading(false);
      return;
    }

    setOverrideLabel(normalizeSentiment(selectedSample.final_label || selectedSample.ai_label));
    setOverrideReason('');
    setFlagReason(selectedSample.review_reason || '');
    setPanelSummary('');
    let ignore = false;

    const loadSummary = async () => {
      if (!selectedSample.article_url) {
        setSummaryLoading(false);
        if (!ignore) {
          setPanelSummary(selectedSample.text || 'No summary available for this entry.');
        }
        return;
      }

      setSummaryLoading(true);
      try {
        const response = await newsService.getSummary(
          selectedSample.article_url,
          selectedSample.text,
          selectedSample.text,
          'en',
          selectedSample.article_id,
          selectedSample.source,
          selectedSample.article_id
        );
        if (!ignore) {
          setPanelSummary(response.summary || selectedSample.text || 'No summary available.');
        }
      } catch {
        if (!ignore) {
          setPanelSummary(selectedSample.text || 'No summary available for this entry.');
        }
      } finally {
        if (!ignore) {
          setSummaryLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      ignore = true;
    };
  }, [selectedSample]);

  const handleOverrideSave = async () => {
    if (!selectedSample) return;
    try {
      setPanelBusy(true);
      await adminApi.overrideSentimentLabel(selectedSample.id, overrideLabel, overrideReason.trim() || undefined);
      notify.success('Manual sentiment override saved.');
      updateSample(selectedSample.id, (sample) => ({
        ...sample,
        final_label: overrideLabel,
        user_label: overrideLabel,
      }));
      setSelectedSample((current) =>
        current
          ? {
              ...current,
              final_label: overrideLabel,
              user_label: overrideLabel,
              sentiment_history: current.sentiment_history,
          }
          : current
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      notify.error(`Failed to save manual override: ${message}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selectedSample) return;
    try {
      setPanelBusy(true);
      const result = await adminApi.reanalyzeSentimentFeedback(selectedSample.id);
      notify.success(`Re-analyzed: ${result.previous_ai_label || 'Unknown'} → ${result.new_ai_label}`);
      updateSample(selectedSample.id, (sample) => ({
        ...sample,
        ai_label: result.new_ai_label as SentimentFeedbackType['ai_label'],
        ai_confidence: result.new_ai_confidence,
        final_label: result.new_final_label as SentimentFeedbackType['final_label'],
        sentiment_history: [
          ...(sample.sentiment_history || []),
          result.sentiment_history as any,
        ],
      }));
      setSelectedSample((current) =>
        current
          ? {
              ...current,
              ai_label: result.new_ai_label as SentimentFeedbackType['ai_label'],
              ai_confidence: result.new_ai_confidence,
              final_label: result.new_final_label as SentimentFeedbackType['final_label'],
              sentiment_history: [
                ...(current.sentiment_history || []),
                result.sentiment_history as any,
              ],
          }
          : current
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      notify.error(`Failed to re-analyze feedback: ${message}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const handleAnomalyConfigSave = async () => {
    if (!anomalyConfig) return;
    try {
      setPanelBusy(true);
      const saved = await adminApi.saveSentimentAnomalyConfig(anomalyConfig);
      setAnomalyConfig(saved);
      const report = await adminApi.getSentimentAnomalies();
      setAnomalyReport(report);
      if (report.alert) {
        notify.warning(report.message);
      } else {
        notify.success('Sentiment anomaly settings saved.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      notify.error(`Failed to save anomaly settings: ${message}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const handleFlagToggle = async (flagged: boolean) => {
    if (!selectedSample) return;
    try {
      setPanelBusy(true);
      await adminApi.flagSentimentFeedback(selectedSample.id, flagged, flagReason.trim() || undefined);
      notify.success(flagged ? 'Entry flagged for review.' : 'Entry unflagged.');
      updateSample(selectedSample.id, (sample) => ({
        ...sample,
        review_flag: flagged,
        review_reason: flagReason.trim() || undefined,
      }));
      setSelectedSample((current) =>
        current
          ? {
              ...current,
              review_flag: flagged,
              review_reason: flagReason.trim() || undefined,
          }
          : current
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      notify.error(`Failed to update review flag: ${message}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const escapeCsv = (value: unknown) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

  const handleExport = () => {
    if (!filteredSamples.length) {
      notify.warning('No sentiment feedback to export for the selected filter.');
      return;
    }

    const headers = [
      'id',
      'article_id',
      'text',
      'ai_label',
      'ai_confidence',
      'user_label',
      'final_label',
      'source',
      'used_for_training',
      'created_at',
    ];

    const rows = filteredSamples.map((s) => [
      escapeCsv(s.id),
      escapeCsv(s.article_id),
      escapeCsv(s.text),
      escapeCsv(s.ai_label),
      escapeCsv(confidenceToPercent(s.ai_confidence).toFixed(2)),
      escapeCsv(s.user_label),
      escapeCsv(s.final_label),
      escapeCsv(s.source),
      escapeCsv(s.used_for_training),
      escapeCsv(s.created_at),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = url;
    const safeQuery = searchQuery.trim() ? `-q-${searchQuery.trim().slice(0, 20).replace(/\s+/g, '-')}` : '';
    anchor.download = `sentiment-feedback-${filter}-${sourceFilter}${safeQuery}-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    notify.success(`Exported ${filteredSamples.length} feedback rows.`);
  };

  return (
    
    <div className="space-y-6">
      {anomalyReport?.alert && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-900 dark:text-amber-100">
          <p className="text-sm font-semibold">Negative sentiment spike detected</p>
          <p className="text-sm mt-1">{anomalyReport.message}</p>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Sentiment Feedback Browser
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={loading}
                className="w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleExport}
                disabled={!filteredSamples.length}
                className="w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} aria-hidden="true" />
                Export Filtered
              </button>
            </div>
          </div>

      <SentimentAnalyticsCharts trendPoints={trendPoints} sentimentStats={sentimentStats} />

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Negative Spike Threshold</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {anomalyReport ? `${anomalyReport.negative_ratio}% negative in the last ${anomalyReport.window_hours}h` : 'Loading anomaly report...'}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Window Hours</span>
            <input
              type="number"
              min={1}
              max={168}
              value={anomalyConfig?.window_hours ?? 24}
              onChange={(e) => setAnomalyConfig((prev) => ({
                window_hours: Number(e.target.value),
                negative_threshold: prev?.negative_threshold ?? 50,
                minimum_samples: prev?.minimum_samples ?? 20,
              }))}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Negative Threshold %</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={anomalyConfig?.negative_threshold ?? 50}
              onChange={(e) => setAnomalyConfig((prev) => ({
                window_hours: prev?.window_hours ?? 24,
                negative_threshold: Number(e.target.value),
                minimum_samples: prev?.minimum_samples ?? 20,
              }))}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Minimum Samples</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={anomalyConfig?.minimum_samples ?? 20}
              onChange={(e) => setAnomalyConfig((prev) => ({
                window_hours: prev?.window_hours ?? 24,
                negative_threshold: prev?.negative_threshold ?? 50,
                minimum_samples: Number(e.target.value),
              }))}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </label>
          <button
            type="button"
            disabled={!anomalyConfig || panelBusy}
            onClick={handleAnomalyConfigSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            Save Threshold
          </button>
        </div>
      </div>

      <SentimentHeatmap heatmapCells={heatmapCells} heatmapSources={heatmapSources} />

     

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterValue)}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilterValue)}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="explicit">Explicit</option>
              <option value="implicit_bookmark">Implicit Bookmark</option>
              <option value="implicit_read_later">Implicit Read Later</option>
            </select>

            <div className="sm:col-span-2 xl:col-span-2 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search article, text, or source"
                className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              Showing {visibleStart}-{visibleEnd} of {filteredSamples.length} rows
            </p>
            <div className="flex items-center gap-2">
              <span>Rows/page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as 25 | 50 | 100)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Samples List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SearchSkeleton />
          </div>
        ) : fetchError ? (
          <ErrorState
            title="Unable to load sentiment feedback"
            message={fetchError}
            onRetry={fetchSamples}
          />
        ) : filteredSamples.length === 0 ? (
          <EmptyState
            title="No Sentiment Feedback"
            description="No feedback samples match your current filter yet."
            illustration="search"
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {pagedSamples.map((sample) => (
              <div
                key={sample.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                onClick={() => setSelectedSample(sample)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white mb-1">
                      Article: {sample.article_id}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                      {sample.text}
                    </p>
                    {sample.review_flag && (
                      <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={12} aria-hidden="true" />
                        Flagged for review
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap backdrop-blur-md shadow-lg shadow-black/30 ${getSentimentColor(
                      sample.ai_label
                    )}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        normalizeSentiment(sample.ai_label) === 'positive'
                          ? 'bg-emerald-300'
                          : normalizeSentiment(sample.ai_label) === 'negative'
                            ? 'bg-rose-300'
                            : 'bg-slate-200'
                      }`}
                    />
                    <span>{formatSentimentLabel(sample.ai_label)}</span>
                    <span>{confidenceToPercent(sample.ai_confidence).toFixed(0)}%</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatSourceLabel(sample.source)} • {new Date(sample.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {!loading && !fetchError && filteredSamples.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Positive</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{sentimentStats?.percentages?.positive !== undefined ? `${sentimentStats.percentages.positive}%` : '—%'}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Neutral</p>
          <p className="text-3xl font-bold text-slate-600 dark:text-slate-400">{sentimentStats?.percentages?.neutral !== undefined ? `${sentimentStats.percentages.neutral}%` : '—%'}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Negative</p>
          <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{sentimentStats?.percentages?.negative !== undefined ? `${sentimentStats.percentages.negative}%` : '—%'}</p>
        </div>
      </div>

      <RightSlideOver
        isOpen={!!selectedSample}
        onClose={() => setSelectedSample(null)}
        title="Article Detail"
      >
        {selectedSample && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Article URL</p>
              {selectedSample.article_url ? (
                <a
                  href={selectedSample.article_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 break-all"
                >
                  {selectedSample.article_url}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No URL stored for this item.</p>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Snippet</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedSample.text}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sentiment & Confidence</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide backdrop-blur-md shadow-lg shadow-black/30 ${getSentimentColor(selectedSample.final_label || selectedSample.ai_label)}`}>
                  <span>{formatSentimentLabel(selectedSample.final_label || selectedSample.ai_label)}</span>
                  <span>{confidenceToPercent(selectedSample.ai_confidence).toFixed(0)}%</span>
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${confidenceToPercent(selectedSample.ai_confidence)}%` }} />
              </div>
            </div>

            <div className="text-sm text-slate-600 dark:text-slate-400">
              <p>Interaction: {formatSourceLabel(selectedSample.source)}</p>
              <p>Date/Time: {selectedSample.created_at ? new Date(selectedSample.created_at).toLocaleString() : 'N/A'}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">AI Summary</p>
              {summaryLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading summary...</p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{panelSummary || 'No summary available.'}</p>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Sentiment History</p>
              {selectedSample.sentiment_history?.length ? (
                <div className="space-y-2">
                  {selectedSample.sentiment_history.map((h, idx) => (
                    <div key={`${h.changed_at || idx}`} className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                      <p>{h.old_label || '-'} {'->'} {h.new_label || '-'}</p>
                      <p className="text-slate-500 dark:text-slate-400">{h.reason || 'No reason'} • {h.changed_at ? new Date(h.changed_at).toLocaleString() : 'N/A'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No re-analysis/override history yet.</p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Manual Override</p>
              <div className="grid grid-cols-3 gap-2">
                {(['positive', 'neutral', 'negative'] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOverrideLabel(label)}
                    className={`px-3 py-2 text-xs rounded-lg border ${overrideLabel === label ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </button>
                ))}
              </div>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="Override reason (optional)"
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={panelBusy}
                onClick={handleOverrideSave}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save Override
              </button>
              <button
                type="button"
                disabled={panelBusy}
                onClick={handleReanalyze}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                <Search size={14} aria-hidden="true" />
                Re-Analyze
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Flag For Review</p>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={2}
                placeholder="Reason for review flag (optional)"
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={panelBusy}
                  onClick={() => handleFlagToggle(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  <Flag size={14} aria-hidden="true" />
                  Flag
                </button>
                <button
                  type="button"
                  disabled={panelBusy}
                  onClick={() => handleFlagToggle(false)}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg disabled:opacity-50"
                >
                  Remove Flag
                </button>
              </div>
            </div>
          </div>
        )}
      </RightSlideOver>
    </div>
  );
};

export default SentimentFeedback;
