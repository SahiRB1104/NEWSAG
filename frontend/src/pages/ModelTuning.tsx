import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../services/admin.service';
import { EmptyState } from '../components/ui/EmptyState';
import { notify } from '../lib/notify';
import { Skeleton } from '../components/ui/Skeleton';
import DataImprovementTips from '../components/ui/DataImprovementTips';

interface ModelTuningProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

type ModelType = 'sentiment' | 'credibility';
type TrainingDataSource = 'internal' | 'external' | 'combined';
type TabType = 'jobs' | 'data-quality' | 'versions' | 'logs';

type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'cancelling'
  | 'not_running'
  | string;

const TAB_ITEMS: Array<{ key: TabType; label: string }> = [
  { key: 'jobs', label: 'Fine-tuning jobs' },
  { key: 'data-quality', label: 'Data quality' },
  { key: 'versions', label: 'Version history' },
  { key: 'logs', label: 'Live logs' },
];

const JOBS_PAGE_SIZE = 20;

const toDateTs = (dateValue?: string | null): number => {
  if (!dateValue) return 0;
  const ts = new Date(dateValue).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const mapStatus = (status: JobStatus): 'running' | 'completed' | 'failed' | 'skipped' | 'queued' | 'cancelled' => {
  if (status === 'success' || status === 'completed') return 'completed';
  if (status === 'error' || status === 'failed') return 'failed';
  if (status === 'cancelled' || status === 'cancelling' || status === 'not_running') return 'cancelled';
  if (status === 'running') return 'running';
  if (status === 'skipped') return 'skipped';
  return 'queued';
};

export const ModelTuning: React.FC<ModelTuningProps> = ({ showNotification }) => {
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [tuning, setTuning] = useState<ModelType | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [trainingStats, setTrainingStats] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<TabType>('jobs');
  const [configOpen, setConfigOpen] = useState<ModelType | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | 'completed' | 'running' | 'failed' | 'skipped' | 'cancelled'>('all');
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsHistory, setJobsHistory] = useState<any[]>([]);
  const [jobsMeta, setJobsMeta] = useState({
    page: 1,
    page_size: JOBS_PAGE_SIZE,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  });

  const [metrics, setMetrics] = useState<any>({});
  const [dataQuality, setDataQuality] = useState<any>({});
  const [versions, setVersions] = useState<any>({});

  const [csvModel, setCsvModel] = useState<ModelType>('sentiment');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMappingMode, setCsvMappingMode] = useState<'auto' | 'manual'>('auto');
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvValidation, setCsvValidation] = useState<any>(null);
  const [csvValidating, setCsvValidating] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResultTab, setCsvResultTab] = useState<'rows' | 'valid' | 'invalid' | 'duplicate'>('rows');

  const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);

  const liveLogsSocketRef = useRef<WebSocket | null>(null);
  const liveLogsCountRef = useRef(0);

  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [hyperparams, setHyperparams] = useState({
    sentiment: {
      learning_rate: 0.0001,
      epochs: 5,
      batch_size: 32,
      optimizer: 'Adam',
      warmup_steps: 100,
      dropout: 0.1,
    },
    credibility: {
      learning_rate: 0.0001,
      epochs: 5,
      batch_size: 32,
      optimizer: 'Adam',
      warmup_steps: 100,
      dropout: 0.1,
    },
  });

  const [trainingSource, setTrainingSource] = useState<Record<ModelType, TrainingDataSource>>({
    sentiment: 'internal',
    credibility: 'internal',
  });

  void showNotification;

  const recentJobs = useMemo(() => {
    return (trainingStats?.recent_jobs || []).map((job: any, idx: number) => ({
      ...job,
      id: job.id ?? job.job_id ?? idx,
      status: mapStatus(job.status),
      model: (job.model || '').toLowerCase(),
    }));
  }, [trainingStats]);

  const sortedRecentJobs = useMemo(() => {
    return [...recentJobs].sort((a: any, b: any) => toDateTs(b.date) - toDateTs(a.date));
  }, [recentJobs]);

  const runningJob = useMemo(() => {
    return sortedRecentJobs.find((job: any) => job.status === 'running');
  }, [sortedRecentJobs]);

  const hasRunningJob = !!runningJob;

  const getPrimaryLogJobId = (stats: any): string | null => {
    const incomingJobs = (stats?.recent_jobs || []).map((j: any) => ({
      ...j,
      status: mapStatus(j.status),
    }));
    const ordered = [...incomingJobs].sort((a, b) => toDateTs(b.date) - toDateTs(a.date));
    const active = ordered.find((j: any) => j.status === 'running');
    const latest = active || ordered[0];
    return (latest?.job_id as string) || (latest?.id as string) || null;
  };

  const fetchLogs = async (jobId: string, silent = false) => {
    if (!jobId) return;
    if (!silent) setLogsLoading(true);

    try {
      const response = await adminApi.getTrainingLogs(jobId);
      const rawLogs = response?.logs || [];
      const ordered = [...rawLogs].sort((a: any, b: any) => {
        const epochDelta = (a.epoch || 0) - (b.epoch || 0);
        if (epochDelta !== 0) return epochDelta;
        return (a.step || 0) - (b.step || 0);
      });
      setJobLogs(ordered);
    } catch (error) {
      if (!silent) {
        notify.error(`Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      if (!silent) setLogsLoading(false);
    }
  };

  const fetchJobsHistory = async (
    silent = false,
    page: number = jobsPage,
    status: 'all' | 'completed' | 'running' | 'failed' | 'skipped' | 'cancelled' = jobStatusFilter
  ) => {
    if (!silent) setJobsLoading(true);

    try {
      const response = await adminApi.getTuningJobsHistory(page, JOBS_PAGE_SIZE, status);
      const normalizedJobs = (response?.jobs || []).map((job: any, idx: number) => ({
        ...job,
        id: job.id ?? job.job_id ?? `${page}-${idx}`,
        status: mapStatus(job.status),
        model: (job.model || '').toLowerCase(),
      }));

      setJobsHistory(normalizedJobs);
      setJobsMeta({
        page: response?.page ?? page,
        page_size: response?.page_size ?? JOBS_PAGE_SIZE,
        total: response?.total ?? normalizedJobs.length,
        total_pages: response?.total_pages ?? 0,
        has_next: !!response?.has_next,
        has_prev: !!response?.has_prev,
      });
    } catch (error) {
      notify.error(`Failed to fetch tuning jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (!silent) setJobsLoading(false);
    }
  };

  const fetchData = async (silent = false, preserveLogJobId: string | null = null) => {
    if (!silent) setLoading(true);

    try {
      const stats = await adminApi.getTrainingStats();
      setTrainingStats(stats);

      const [sentimentMetrics, credibilityMetrics, sentimentQuality, credibilityQuality, sentimentVersions, credibilityVersions] =
        await Promise.all([
          adminApi.getModelMetrics('sentiment'),
          adminApi.getModelMetrics('credibility'),
          adminApi.getDataQualityStats('sentiment'),
          adminApi.getDataQualityStats('credibility'),
          adminApi.getModelVersions('sentiment'),
          adminApi.getModelVersions('credibility'),
        ]);

      setMetrics({ sentiment: sentimentMetrics, credibility: credibilityMetrics });
      setDataQuality({ sentiment: sentimentQuality, credibility: credibilityQuality });
      setVersions({ sentiment: sentimentVersions, credibility: credibilityVersions });

      const preferredJobId = preserveLogJobId ?? getPrimaryLogJobId(stats);
      if (preferredJobId) {
        setActiveLogJobId(preferredJobId);
        await fetchLogs(preferredJobId, true);
      } else {
        setActiveLogJobId(null);
        setJobLogs([]);
      }
    } catch (err) {
      notify.error(`Failed to load tuning data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    liveLogsCountRef.current = jobLogs.length;
  }, [jobLogs.length]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchJobsHistory(false, jobsPage, jobStatusFilter);
  }, [jobsPage, jobStatusFilter]);

  useEffect(() => {
    if (activeTab !== 'logs' || !activeLogJobId || !isLoaded || !isSignedIn) {
      if (liveLogsSocketRef.current) {
        liveLogsSocketRef.current.close();
        liveLogsSocketRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const connectLiveLogs = async () => {
      const token = await getToken();
      if (cancelled || !token) return;

      if (liveLogsSocketRef.current) {
        liveLogsSocketRef.current.close();
        liveLogsSocketRef.current = null;
      }

      const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
      const socketBase = apiBase.replace(/^http/, 'ws');
      const socketUrl = new URL(`/api/admin/tuning/logs/ws/${encodeURIComponent(activeLogJobId)}`, socketBase);
      socketUrl.searchParams.set('token', token);
      socketUrl.searchParams.set('known_count', String(liveLogsCountRef.current));

      const socket = new WebSocket(socketUrl.toString());
      liveLogsSocketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) {
          setLogsLoading(false);
        }
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type !== 'snapshot' || !Array.isArray(payload.logs)) {
            return;
          }

          const ordered = [...payload.logs].sort((a: any, b: any) => {
            const epochDelta = (a.epoch || 0) - (b.epoch || 0);
            if (epochDelta !== 0) return epochDelta;
            return (a.step || 0) - (b.step || 0);
          });

          setJobLogs(ordered);
        } catch (error) {
          if (!cancelled) {
            notify.error(`Live logs update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setLogsLoading(false);
        }
      };

      socket.onclose = () => {
        if (liveLogsSocketRef.current === socket) {
          liveLogsSocketRef.current = null;
        }
        if (!cancelled) {
          setLogsLoading(false);
        }
      };
    };

    void connectLiveLogs();

    return () => {
      cancelled = true;
      if (liveLogsSocketRef.current) {
        liveLogsSocketRef.current.close();
        liveLogsSocketRef.current = null;
      }
    };
  }, [activeTab, activeLogJobId, getToken, isLoaded, isSignedIn]);

  const handleTriggerTune = async (model: ModelType) => {
    setTuning(model);

    try {
      const params = hyperparams[model];
      const operation = adminApi.startFineTuningWithHyperparameters(model, undefined, trainingSource[model], {
        learning_rate: params.learning_rate,
        epochs: params.epochs,
        batch_size: params.batch_size,
        optimizer: params.optimizer,
        warmup_steps: params.warmup_steps,
        dropout: params.dropout,
      });

      notify.promise(operation, {
        loading: `Starting ${model} fine-tuning...`,
        success: `${model} model fine-tuning started`,
        error: 'Failed to start fine-tuning',
      });

      const response = await operation;

      if (response?.job_id) {
        setActiveLogJobId(response.job_id);
        setActiveTab('logs');
        setJobLogs([]);
        setLogsLoading(true);
        await fetchLogs(response.job_id, true);
      }

      await fetchData(true, response?.job_id ?? null);
      setJobsPage(1);
      await fetchJobsHistory(true, 1, jobStatusFilter);
    } finally {
      setTuning(null);
      setConfigOpen(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setCancelling(jobId);

    try {
      const response = await adminApi.cancelFineTuning(jobId);
      const normalizedStatus = mapStatus(response?.status || 'cancelled');
      if (normalizedStatus === 'cancelled') {
        notify.success('Fine-tuning cancelled successfully');
      } else {
        notify.info(response?.message || 'Job is already finished');
      }

      await fetchData(true);
      await fetchJobsHistory(true, 1, jobStatusFilter);
    } finally {
      setCancelling(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    setDeletingJob(jobId);
    try {
      await adminApi.deleteTuningJob(jobId);
      notify.success('Job deleted successfully');

      if (activeLogJobId === jobId) {
        setActiveLogJobId(null);
        setJobLogs([]);
      }

      await fetchData(true);
      await fetchJobsHistory(true, 1, jobStatusFilter);
    } catch (error) {
      notify.error(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingJob(null);
    }
  };

  const getRequiredCsvFields = (modelType: ModelType): string[] => {
    return modelType === 'sentiment' ? ['text', 'label'] : ['title_or_text', 'label'];
  };

  const getCsvFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      text: 'Text',
      label: 'Label',
      title_or_text: 'Title or Text',
    };
    return labels[field] || field;
  };

  const handleValidateCsv = async () => {
    if (!csvFile) {
      notify.error('Please select a CSV file first');
      return;
    }

    setCsvValidating(true);
    try {
      const mappingPayload = csvMappingMode === 'manual' ? csvMapping : undefined;
      const response = await adminApi.validateTrainingCsv(csvModel, csvFile, mappingPayload);
      setCsvValidation(response);
      setCsvMapping(response?.mapping || {});
      setCsvResultTab('rows');

      if (response?.ready_to_import) {
        notify.success('CSV validation passed. Ready to import.');
      } else {
        notify.info('CSV validated with issues. Resolve required mapping fields before import.');
      }
    } catch (error) {
      notify.error(`CSV validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCsvValidating(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) {
      notify.error('Please select a CSV file first');
      return;
    }

    if (!csvValidation || !csvValidation.ready_to_import || csvValidation.model_type !== csvModel) {
      notify.error('Please validate CSV and resolve required fields before import');
      return;
    }

    setCsvImporting(true);
    try {
      const mappingPayload = csvMappingMode === 'manual' ? csvMapping : csvValidation.mapping;
      const response = await adminApi.importTrainingCsvWithMapping(csvModel, csvFile, mappingPayload);

      notify.success(
        `${response?.message || 'CSV imported'} (Imported: ${response?.imported ?? 0}, Skipped: ${response?.skipped ?? 0})`
      );

      setCsvValidation(null);
      setCsvFile(null);
      setCsvMapping({});
      setCsvResultTab('rows');

      try {
        await fetchData(true);
      } catch (refreshError) {
        notify.warning(
          `Imported successfully, but refresh failed: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}`
        );
      }
    } catch (error) {
      notify.error(`CSV import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCsvImporting(false);
    }
  };

  const getStatusIcon = (status: JobStatus) => {
    const normalized = mapStatus(status);

    switch (normalized) {
      case 'running':
        return <Loader2 size={14} className="text-amber-500 animate-spin" aria-hidden="true" />;
      case 'completed':
        return <CheckCircle2 size={14} className="text-emerald-500" aria-hidden="true" />;
      case 'failed':
        return <XCircle size={14} className="text-rose-500" aria-hidden="true" />;
      case 'skipped':
        return <Ban size={14} className="text-slate-500" aria-hidden="true" />;
      case 'cancelled':
        return <Ban size={14} className="text-orange-500" aria-hidden="true" />;
      default:
        return <Clock3 size={14} className="text-slate-400" aria-hidden="true" />;
    }
  };

  const statusPill = (status: JobStatus) => {
    const normalized = mapStatus(status);

    if (normalized === 'completed') {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    }
    if (normalized === 'running') {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    }
    if (normalized === 'failed') {
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    }
    if (normalized === 'cancelled') {
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    }
    return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
  };

  const getModelHealthColor = (health: number | null) => {
    if (health === null || health === undefined) return 'bg-slate-300 dark:bg-slate-600';
    if (health >= 85) return 'bg-emerald-500';
    if (health >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getModelStatusLabel = (modelType: ModelType) => {
    const modelRunning = sortedRecentJobs.some((j: any) => j.model === modelType && j.status === 'running');
    if (modelRunning) return { label: 'Active', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' };
    return { label: 'Ready', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' };
  };

  const openModelVersions = (modelType: ModelType) => {
    setActiveTab('versions');
    const modelVersions = versions[modelType]?.versions || [];
    if (modelVersions.length === 0) {
      notify.info(`No ${modelType} versions yet`);
    }
  };

  const ModelCard = ({ title, modelType }: { title: string; modelType: ModelType }) => {
    const modelMetrics = metrics[modelType];
    const modelVersions = (versions[modelType]?.versions || []).slice().sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
    const activeOrLatestVersion = modelVersions.find((v: any) => v.is_active) || modelVersions[0];
    const latestCompletedJob = sortedRecentJobs.find((job: any) => job.model === modelType && job.status === 'completed');

    const modelStats = modelType === 'sentiment' ? trainingStats?.sentiment_model : trainingStats?.credibility_model;
    const availableSamples = modelStats?.internal_training_samples ?? modelStats?.training_samples;
    const externalSamples = modelStats?.external_training_samples ?? 0;
    const minRequiredSamples = modelStats?.min_required_samples;
    const samplesShortfall = modelStats?.samples_shortfall;

    const isConfigOpen = configOpen === modelType;

    const accuracy = modelMetrics?.accuracy ?? activeOrLatestVersion?.accuracy ?? latestCompletedJob?.accuracy ?? null;
    const f1Score = modelMetrics?.f1_score ?? activeOrLatestVersion?.f1_score ?? latestCompletedJob?.f1_score ?? null;
    const loss =
      modelMetrics?.loss ??
      activeOrLatestVersion?.loss ??
      latestCompletedJob?.training_loss ??
      latestCompletedJob?.eval_loss ??
      null;

    const modelHealth = modelMetrics?.model_health ?? (accuracy != null ? accuracy * 100 : null);
    const status = getModelStatusLabel(modelType);

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.className}`}>{status.label}</span>
        </div>

        <div className="space-y-1 mb-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Last trained</span>
            <span className="text-slate-900 dark:text-white font-medium">
              {modelType === 'sentiment'
                ? trainingStats?.sentiment_model?.last_trained
                  ? new Date(trainingStats.sentiment_model.last_trained).toLocaleString()
                  : '—'
                : trainingStats?.credibility_model?.last_trained
                ? new Date(trainingStats.credibility_model.last_trained).toLocaleString()
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Project samples</span>
            <span className="text-slate-900 dark:text-white font-medium">
              {availableSamples ?? '—'}{minRequiredSamples != null ? ` / ${minRequiredSamples}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">External samples</span>
            <span className="text-slate-900 dark:text-white font-medium">{externalSamples}</span>
          </div>
          {samplesShortfall > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-300">Need {samplesShortfall} more samples to meet minimum training threshold.</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Accuracy</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {accuracy != null ? `${(accuracy * 100).toFixed(1)}%` : '--'}
            </p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">F1 score</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{f1Score != null ? f1Score.toFixed(2) : '--'}</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Loss</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{loss != null ? Number(loss).toFixed(2) : '--'}</p>
          </div>
        </div>

        <div className="mb-3">
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getModelHealthColor(modelHealth)}`}
              style={{ width: `${Math.min(100, Math.max(0, modelHealth || 0))}%` }}
            />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Model health: <span className="font-semibold">{modelHealth != null ? `${Math.round(modelHealth)}%` : '--'}</span>
            {modelHealth != null && modelHealth < 85 ? ' - needs more training data' : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2">
          <button
            onClick={() => handleTriggerTune(modelType)}
            disabled={tuning === modelType}
            className="flex items-center justify-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tuning === modelType ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            <span className="font-semibold text-xs">{tuning === modelType ? 'Starting...' : 'Start fine-tuning'}</span>
          </button>

          <button
            onClick={() => openModelVersions(modelType)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="font-semibold text-xs">Report</span>
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        </div>

        <button
          onClick={() => setConfigOpen(isConfigOpen ? null : modelType)}
          className="w-full flex items-center justify-between px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <span>Hyperparameters</span>
          {isConfigOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>

        {isConfigOpen && (
          <div className="mt-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Training data source</span>
              <select
                value={trainingSource[modelType]}
                onChange={(e) =>
                  setTrainingSource((prev) => ({
                    ...prev,
                    [modelType]: e.target.value as TrainingDataSource,
                  }))
                }
                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="internal">Internal (project data)</option>
                <option value="external">External (CSV imports)</option>
                <option value="combined">Combined (internal + external)</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-600 dark:text-slate-400">Learning rate</span>
                <input
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  max="0.1"
                  value={hyperparams[modelType].learning_rate}
                  onChange={(e) =>
                    setHyperparams((prev) => ({
                      ...prev,
                      [modelType]: { ...prev[modelType], learning_rate: parseFloat(e.target.value) },
                    }))
                  }
                  className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-600 dark:text-slate-400">Epochs</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={hyperparams[modelType].epochs}
                  onChange={(e) =>
                    setHyperparams((prev) => ({
                      ...prev,
                      [modelType]: { ...prev[modelType], epochs: parseInt(e.target.value, 10) },
                    }))
                  }
                  className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-600 dark:text-slate-400">Batch size</span>
                <select
                  value={hyperparams[modelType].batch_size}
                  onChange={(e) =>
                    setHyperparams((prev) => ({
                      ...prev,
                      [modelType]: { ...prev[modelType], batch_size: parseInt(e.target.value, 10) },
                    }))
                  }
                  className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                  <option value={64}>64</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-600 dark:text-slate-400">Optimizer</span>
                <select
                  value={hyperparams[modelType].optimizer}
                  onChange={(e) =>
                    setHyperparams((prev) => ({
                      ...prev,
                      [modelType]: { ...prev[modelType], optimizer: e.target.value },
                    }))
                  }
                  className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="Adam">Adam</option>
                  <option value="AdamW">AdamW</option>
                  <option value="SGD">SGD</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };

  const DataQualityTab = () => {
    const sentimentQuality = dataQuality.sentiment || {};
    const credibilityQuality = dataQuality.credibility || {};
    const requiredFields = getRequiredCsvFields(csvModel);
    const headers = csvValidation?.headers || [];
    const previewRows = Array.isArray(csvValidation?.validation?.preview_rows) ? csvValidation.validation.preview_rows : [];
    const validPreviewRows = previewRows.filter((row: any) => row.valid);
    const invalidIssues = Array.isArray(csvValidation?.validation?.issues) ? csvValidation.validation.issues.slice(0, 50) : [];
    const duplicatePreviewRows = previewRows.filter((row: any, idx: number, arr: any[]) => {
      const id = String(row.article_id || '').trim().toLowerCase();
      if (!id) return false;
      return arr.findIndex((item: any) => String(item.article_id || '').trim().toLowerCase() === id) !== idx;
    });

    const QualitySection = ({ title, quality }: { title: string; quality: any }) => (
      <div className="space-y-2">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{title}</h5>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total samples</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{quality.total_samples ?? 0}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Verified labels</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">
              {quality.verified_labels_count ?? 0}
              {quality.verified_labels_percentage != null ? ` (${quality.verified_labels_percentage}%)` : ''}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Duplicate rate</p>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-300">{quality.duplicate_rate ?? 0}%</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Avg. confidence</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{(quality.average_confidence ?? 0).toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Class balance</p>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-300">{quality.class_balance_status || 'Unknown'}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">Missing values</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">{quality.missing_values_count ?? 0}</p>
          </div>
        </div>

        {quality.warning_message && (
          <div className="flex items-start gap-2 p-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-300 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-800 dark:text-amber-200">{quality.warning_message}</p>
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <label className="space-y-1 text-xs w-full md:w-44">
              <span className="text-slate-600 dark:text-slate-400">Target model</span>
              <select
                value={csvModel}
                onChange={(e) => {
                  setCsvModel(e.target.value as ModelType);
                  setCsvValidation(null);
                  setCsvMapping({});
                  setCsvResultTab('rows');
                }}
                className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="sentiment">Sentiment</option>
                <option value="credibility">Credibility</option>
              </select>
            </label>

            <label className="space-y-1 text-xs w-full md:w-52">
              <span className="text-slate-600 dark:text-slate-400">Mapping mode</span>
              <select
                value={csvMappingMode}
                onChange={(e) => {
                  setCsvMappingMode(e.target.value as 'auto' | 'manual');
                  setCsvValidation(null);
                  setCsvResultTab('rows');
                }}
                className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="auto">Auto-detect</option>
                <option value="manual">Manual mapping</option>
              </select>
            </label>

            <label className="space-y-1 text-xs flex-1">
              <span className="text-slate-600 dark:text-slate-400">CSV file</span>
              <div className="flex w-full overflow-hidden rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-700">
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="shrink-0 border-r border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  Choose File
                </button>
                <div className="flex min-w-0 flex-1 items-center px-3 py-1.5 text-slate-500 dark:text-slate-300">
                  <span className="truncate">{csvFile ? csvFile.name : 'No file chosen'}</span>
                </div>
              </div>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCsvFile(file);
                  setCsvValidation(null);
                  setCsvMapping({});
                  setCsvResultTab('rows');
                }}
                className="hidden"
              />
              {csvModel === 'credibility' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Credibility labels can be REAL/FAKE or 1/0. Binary uploads are normalized before validation and training.
                </p>
              )}
            </label>
          </div>

          {csvMappingMode === 'manual' && headers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {requiredFields.map((field) => (
                <label key={field} className="space-y-1 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Map {getCsvFieldLabel(field)}</span>
                  <select
                    value={csvMapping[field] || ''}
                    onChange={(e) =>
                      setCsvMapping((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                    className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Select column</option>
                    {headers.map((header: string) => (
                      <option key={`${field}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleValidateCsv}
              disabled={!csvFile || csvValidating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {csvValidating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              <span className="font-semibold text-xs">{csvValidating ? 'Validating...' : 'Validate CSV'}</span>
            </button>

            <button
              onClick={handleImportCsv}
              disabled={!csvValidation?.ready_to_import || csvImporting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
            >
              {csvImporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              <span className="font-semibold text-xs">{csvImporting ? 'Importing...' : 'Import Valid Rows'}</span>
            </button>
          </div>

          {csvValidation && (
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Rows: <span className="font-semibold text-slate-900 dark:text-white">{csvValidation.validation?.total_rows ?? 0}</span>
                {' • '}Valid: <span className="font-semibold text-emerald-600 dark:text-emerald-300">{csvValidation.validation?.valid_rows ?? 0}</span>
                {' • '}Invalid: <span className="font-semibold text-rose-600 dark:text-rose-300">{csvValidation.validation?.invalid_rows ?? 0}</span>
                {' • '}Duplicates: <span className="font-semibold text-amber-600 dark:text-amber-300">{csvValidation.validation?.duplicate_estimate ?? 0}</span>
              </p>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'rows', label: 'Rows', count: csvValidation.validation?.total_rows ?? 0 },
                  { key: 'valid', label: 'Valid', count: csvValidation.validation?.valid_rows ?? 0 },
                  { key: 'invalid', label: 'Invalid', count: csvValidation.validation?.invalid_rows ?? 0 },
                  { key: 'duplicate', label: 'Duplicate', count: csvValidation.validation?.duplicate_estimate ?? 0 },
                ].map((tab: any) => (
                  <button
                    key={tab.key}
                    onClick={() => setCsvResultTab(tab.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      csvResultTab === tab.key
                        ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}: {tab.count}
                  </button>
                ))}
              </div>

              {Array.isArray(csvValidation.unresolved_required) && csvValidation.unresolved_required.length > 0 && (
                <p className="text-xs text-rose-600 dark:text-rose-300">
                  Required fields not mapped: {csvValidation.unresolved_required.map((field: string) => getCsvFieldLabel(field)).join(', ')}
                </p>
              )}

              {Array.isArray(csvValidation.validation?.warnings) && csvValidation.validation.warnings.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {csvValidation.validation.warnings.join(' | ')}
                </p>
              )}

              {csvResultTab === 'rows' && previewRows.length > 0 && (
                <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="text-left px-2 py-1">Row</th>
                        <th className="text-left px-2 py-1">Article</th>
                        <th className="text-left px-2 py-1">Text preview</th>
                        <th className="text-left px-2 py-1">Label</th>
                        <th className="text-left px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row: any) => (
                        <tr key={`preview-${row.row}`} className="border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          <td className="px-2 py-1">{row.row}</td>
                          <td className="px-2 py-1">{row.article_id || '-'}</td>
                          <td className="px-2 py-1">{row.text || row.title_or_text || '-'}</td>
                          <td className="px-2 py-1">{row.label || '-'}</td>
                          <td className="px-2 py-1">
                            <span className={row.valid ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
                              {row.valid ? 'valid' : 'invalid'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {csvResultTab === 'valid' && (
                validPreviewRows.length > 0 ? (
                  <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-1">Row</th>
                          <th className="text-left px-2 py-1">Article</th>
                          <th className="text-left px-2 py-1">Text preview</th>
                          <th className="text-left px-2 py-1">Label</th>
                          <th className="text-left px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validPreviewRows.map((row: any) => (
                          <tr key={`valid-${row.row}`} className="border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <td className="px-2 py-1">{row.row}</td>
                            <td className="px-2 py-1">{row.article_id || '-'}</td>
                            <td className="px-2 py-1">{row.text || row.title_or_text || '-'}</td>
                            <td className="px-2 py-1">{row.label || '-'}</td>
                            <td className="px-2 py-1 text-emerald-600 dark:text-emerald-300">valid</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No valid sample rows in preview.</p>
                )
              )}

              {csvResultTab === 'invalid' && (
                invalidIssues.length > 0 ? (
                  <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-1">Row</th>
                          <th className="text-left px-2 py-1">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invalidIssues.map((issue: any, idx: number) => (
                          <tr key={`invalid-${idx}`} className="border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <td className="px-2 py-1">{issue.row}</td>
                            <td className="px-2 py-1">{issue.error || issue.reason || issue.message || 'Unknown error'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No invalid sample rows in preview.</p>
                )
              )}

              {csvResultTab === 'duplicate' && (
                duplicatePreviewRows.length > 0 ? (
                  <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-1">Row</th>
                          <th className="text-left px-2 py-1">Article</th>
                          <th className="text-left px-2 py-1">Text preview</th>
                          <th className="text-left px-2 py-1">Label</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicatePreviewRows.map((row: any) => (
                          <tr key={`duplicate-${row.row}`} className="border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <td className="px-2 py-1">{row.row}</td>
                            <td className="px-2 py-1">{row.article_id || '-'}</td>
                            <td className="px-2 py-1">{row.text || row.title_or_text || '-'}</td>
                            <td className="px-2 py-1">{row.label || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No duplicates found in preview sample. Estimated duplicates in full file: {csvValidation.validation?.duplicate_estimate ?? 0}.
                  </p>
                )
              )}

              {csvResultTab === 'rows' && Array.isArray(csvValidation.validation?.raw_preview_rows) && csvValidation.validation.raw_preview_rows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-600 dark:text-slate-400">Raw CSV preview (first rows)</p>
                  <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-1">Row</th>
                          {(csvValidation.validation.raw_preview_headers || []).map((header: string) => (
                            <th key={`raw-header-${header}`} className="text-left px-2 py-1">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvValidation.validation.raw_preview_rows.map((row: any) => (
                          <tr key={`raw-row-${row.row}`} className="border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <td className="px-2 py-1">{row.row}</td>
                            {(csvValidation.validation.raw_preview_headers || []).map((header: string) => (
                              <td key={`raw-${row.row}-${header}`} className="px-2 py-1">{row.values?.[header] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Dataset overview</h4>

        <QualitySection title="Sentiment model" quality={sentimentQuality} />
        <QualitySection title="Credibility model" quality={credibilityQuality} />

        <DataImprovementTips 
          sentimentQuality={sentimentQuality} 
          credibilityQuality={credibilityQuality} 
        />
      </div>
    );
  };

  const VersionsTab = () => {
    const renderVersionGroup = (modelType: ModelType) => {
      const items = versions[modelType]?.versions || [];

      return (
        <div className="space-y-2">
          <h5 className="text-base font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {modelType} model versions
          </h5>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No versions recorded yet.</p>
          ) : (
            items
              .slice()
              .sort((a: any, b: any) => (b.version || 0) - (a.version || 0))
              .map((version: any) => (
                <div
                  key={`${modelType}-${version.version}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      v{version.version}
                    </span>
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      <span className="font-semibold">{version.sample_count ?? 0} samples</span>
                      {' • '}
                      {version.created_at ? new Date(version.created_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Acc: {version.accuracy != null ? `${(version.accuracy * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                    {version.is_active ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Current
                      </span>
                    ) : (
                      <button
                        onClick={() => notify.info('Rollback functionality will be enabled in Phase 4')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <span className="font-semibold">Rollback</span>
                        <RotateCcw size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      );
    };

    return (
      <div className="space-y-6">
        {renderVersionGroup('sentiment')}
        {renderVersionGroup('credibility')}
      </div>
    );
  };

  const LogsTab = () => {
    const hasLogs = jobLogs.length > 0;
    const modelLabel = runningJob?.model || 'sentiment';

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {modelLabel} model {hasRunningJob ? '- training in progress' : '- latest run logs'}
          </p>
          <button
            onClick={() => activeLogJobId && fetchLogs(activeLogJobId)}
            disabled={!activeLogJobId || logsLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} aria-hidden="true" />
            <span className="font-semibold text-sm">Refresh</span>
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5">
          {hasLogs ? (
            <div className="max-h-60 overflow-auto rounded-md bg-white dark:bg-slate-900 p-3 font-mono text-xs leading-6 text-slate-700 dark:text-slate-300">
              {jobLogs.map((entry: any, idx: number) => {
                const stamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '--:--:--';
                const epoch = entry.epoch != null ? `Epoch ${entry.epoch}` : 'Step';
                const step = entry.step != null ? `/${entry.step}` : '';
                const loss = entry.loss != null ? `loss: ${Number(entry.loss).toFixed(4)}` : null;
                const acc = entry.accuracy != null ? `acc: ${Number(entry.accuracy).toFixed(2)}` : null;

                return (
                  <p key={`${entry.step || idx}-${entry.timestamp || idx}`}>
                    [{stamp}] {epoch}{step}
                    {loss ? ` - ${loss}` : ''}
                    {acc ? `, ${acc}` : ''}
                    {entry.event ? `, event: ${entry.event}` : ''}
                    {entry.message ? `, ${entry.message}` : ''}
                  </p>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {activeLogJobId ? 'No logs recorded yet for this job.' : 'No active training job selected.'}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">Estimated completion: {hasRunningJob ? '~45 seconds' : 'N/A'}</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="shimmer" className="h-7 w-44" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
              <Skeleton variant="shimmer" className="h-6 w-40 mb-4" />
              <Skeleton variant="shimmer" className="h-4 w-full mb-2" />
              <Skeleton variant="shimmer" className="h-4 w-3/4 mb-4" />
              <Skeleton variant="shimmer" className="h-24 w-full mb-3" />
              <Skeleton variant="shimmer" className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Active models</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ModelCard title="Sentiment model" modelType="sentiment" />
        <ModelCard title="Credibility model" modelType="credibility" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap gap-6">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {activeTab === 'jobs' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
                <select
                  value={jobStatusFilter}
                  onChange={(e) => {
                    setJobsPage(1);
                    setJobStatusFilter(e.target.value as any);
                  }}
                  className="w-full sm:w-52 px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="all">All statuses</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {jobsLoading ? (
                <div className="space-y-2">
                  <Skeleton variant="shimmer" className="h-14 w-full" />
                  <Skeleton variant="shimmer" className="h-14 w-full" />
                  <Skeleton variant="shimmer" className="h-14 w-full" />
                </div>
              ) : jobsHistory.length === 0 ? (
                <EmptyState
                  title="No tuning jobs"
                  description="Start sentiment or credibility fine-tuning to see job history here."
                  illustration="generic"
                />
              ) : (
                <div className="space-y-3">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {jobsHistory.map((job: any) => (
                      <div key={job.id} className="flex items-start justify-between py-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-400" />
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-slate-900 dark:text-white capitalize">
                              {job.model} model
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {job.samples ?? job.samples_available ?? 0} samples • {job.date ? new Date(job.date).toLocaleDateString() : 'N/A'}
                              {job.training_loss != null ? ` • Loss: ${Number(job.training_loss).toFixed(4)}` : ''}
                              {job.message ? ` • ${job.message}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusIcon(job.status)}
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusPill(job.status)}`}>
                            {mapStatus(job.status).charAt(0).toUpperCase() + mapStatus(job.status).slice(1)}
                          </span>
                          {mapStatus(job.status) === 'running' && (
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              disabled={cancelling === job.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-700 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                              title="Cancel this fine-tuning job"
                            >
                              {cancelling === job.id ? (
                                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Ban size={12} aria-hidden="true" />
                              )}
                              <span>Stop</span>
                            </button>
                          )}
                          {mapStatus(job.status) !== 'running' && (
                            <button
                              onClick={() => handleDeleteJob(job.id)}
                              disabled={deletingJob === job.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                              title="Delete this completed job"
                            >
                              {deletingJob === job.id ? (
                                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 size={12} aria-hidden="true" />
                              )}
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing {(jobsMeta.page - 1) * jobsMeta.page_size + 1}
                      {' - '}
                      {Math.min(jobsMeta.page * jobsMeta.page_size, jobsMeta.total)} of {jobsMeta.total}
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setJobsPage((prev) => Math.max(1, prev - 1))}
                        disabled={!jobsMeta.has_prev || jobsLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        <ChevronLeft size={14} aria-hidden="true" />
                        Prev
                      </button>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        Page {jobsMeta.page} / {Math.max(1, jobsMeta.total_pages)}
                      </span>
                      <button
                        onClick={() => setJobsPage((prev) => prev + 1)}
                        disabled={!jobsMeta.has_next || jobsLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        Next
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'data-quality' && <DataQualityTab />}
          {activeTab === 'versions' && <VersionsTab />}
          {activeTab === 'logs' && <LogsTab />}
        </div>
      </div>
    </div>
  );
};

export default ModelTuning;
