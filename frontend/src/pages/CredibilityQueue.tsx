import React, { useCallback, useState, useEffect } from 'react';
import { Check, Clock3, RefreshCw, X } from 'lucide-react';
import { adminApi } from '../services/admin.service';
import { notify } from '../lib/notify';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/Button';
import { useAsyncState } from '../hooks/useAsyncState';
import { BookmarkSkeleton } from '../components/ui/skeletons/BookmarkSkeleton';

interface CredibilityQueueProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

interface CredibilityReport {
  id: string;
  article_url: string;
  source_domain: string;
  title: string;
  ai_label: string;
  ai_score: number;
  user_reason?: string;
  report_count: number;
  created_at: string;
}

export const CredibilityQueue: React.FC<CredibilityQueueProps> = ({ showNotification }) => {
  const {
    data: reports,
    loading,
    error: fetchError,
    executeLatest,
    setData: setReports,
  } = useAsyncState<CredibilityReport[]>({
    initialData: [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Unknown error',
  });
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      await executeLatest(() => adminApi.getPendingReports(50), (result) => result.reports);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(`Failed to load credibility reports: ${message}`, 'error');
      return false;
    }
  }, [executeLatest, showNotification]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const handleManualRefresh = async () => {
    const refreshed = await fetchReports();
    if (refreshed) {
      showNotification('Credibility queue refreshed', 'success');
    }
  };

  const handleVerify = async (reportId: string) => {
    setVerifying(reportId);
    try {
      await notify.promise(adminApi.verifyReport(reportId, true), {
        loading: 'Verifying report...',
        success: 'Report verified',
        error: 'Failed to verify report',
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch {
      // Toast is already handled by notify.promise.
    } finally {
      setVerifying(null);
    }
  };

  const handleReject = async (reportId: string) => {
    setVerifying(reportId);
    try {
      await notify.promise(adminApi.verifyReport(reportId, false), {
        loading: 'Rejecting report...',
        success: 'Report rejected',
        error: 'Failed to reject report',
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch {
      // Toast is already handled by notify.promise.
    } finally {
      setVerifying(null);
    }
  };

  if (loading && reports.length === 0) {
    return (
      <div className="py-4">
        <BookmarkSkeleton rows={4} />
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Failed to load credibility queue"
        message={fetchError}
        onRetry={fetchReports}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Credibility Queue
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {reports.length} pending
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading}
              isLoading={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            title="No Pending Reports"
            description="All credibility reports are reviewed. New flagged items will appear here."
            action={{ label: 'Go To Overview', href: '/admin/overview' }}
            illustration="generic"
          />
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                onClick={() => setSelectedReport(selectedReport === report.id ? null : report.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white mb-1">
                      {report.title.substring(0, 80)}...
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Source: {report.source_domain || 'Unknown'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                    <Clock3 size={12} className="inline mr-1" aria-hidden="true" />
                    {report.report_count} reports
                  </span>
                </div>

                {selectedReport === report.id && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      <strong>AI Label:</strong> {report.ai_label} ({(report.ai_score * 100).toFixed(0)}%)
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      <strong>Article URL:</strong> <a href={report.article_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">{report.article_url}</a>
                    </p>
                    {report.user_reason && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <strong>User Reason:</strong> {report.user_reason}
                      </p>
                    )}
                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="success"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerify(report.id);
                        }}
                        disabled={verifying === report.id}
                        isLoading={verifying === report.id}
                      >
                        <Check size={16} aria-hidden="true" />
                        {verifying === report.id ? 'Processing...' : 'Verify'}
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReject(report.id);
                        }}
                        disabled={verifying === report.id}
                        isLoading={verifying === report.id}
                      >
                        <X size={16} aria-hidden="true" />
                        {verifying === report.id ? 'Processing...' : 'Reject'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CredibilityQueue;
