import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, Filter, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/admin.service';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

interface AuditLog {
  id: string;
  admin_user_id: string;
  admin_username?: string;
  admin_name?: string;
  admin_display?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
  details: Record<string, any>;
}

interface AdminAuditLogProps {
  showNotification?: (msg: string, type?: 'error' | 'success') => void;
}

export const AdminAuditLog: React.FC<AdminAuditLogProps> = ({ showNotification }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    resource_type: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const getAdminLabel = (log: AuditLog): string => {
    return log.admin_display || log.admin_username || log.admin_name || `${log.admin_user_id.substring(0, 8)}...`;
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getAuditLog(
        100,
        undefined,
        filters.action || undefined,
        filters.resource_type || undefined
      );
      setLogs(response.logs || []);
    } catch (err) {
      showNotification?.(
        `Error loading audit logs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyFilters = () => {
    setLoading(true);
    fetchAuditLogs();
  };

  const handleClearFilters = () => {
    setFilters({ action: '', resource_type: '' });
    setLoading(true);
    adminApi.getAuditLog(100, undefined, undefined, undefined).then(response => {
      setLogs(response.logs || []);
      setLoading(false);
    }).catch(err => {
      showNotification?.(
        `Error loading audit logs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      );
      setLoading(false);
    });
  };

  const handleExportCSV = () => {
    try {
      const headers = [
        'Timestamp',
        'Admin User',
        'Action',
        'Resource Type',
        'Resource ID',
        'Status',
        'Details',
      ];

      const rows = logs.map(log => [
        log.created_at || 'N/A',
        getAdminLabel(log),
        log.action,
        log.resource_type,
        log.resource_id || 'N/A',
        log.success ? 'Success' : 'Failed',
        JSON.stringify(log.details),
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showNotification?.('Audit log exported successfully', 'success');
    } catch (err) {
      showNotification?.(
        `Error exporting audit log: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'verify_report':
        return 'bg-green-100 text-green-800';
      case 'reject_report':
        return 'bg-red-100 text-red-800';
      case 'fine_tune':
        return 'bg-blue-100 text-blue-800';
      case 'refresh_cache':
        return 'bg-purple-100 text-purple-800';
      case 'reset_quota':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-3 p-4 border border-input rounded-lg">
            <Skeleton variant="shimmer" className="h-4 w-full" />
            <Skeleton variant="shimmer" className="h-4 w-full" />
            <Skeleton variant="shimmer" className="h-4 w-full" />
            <Skeleton variant="shimmer" className="h-4 w-full" />
            <Skeleton variant="shimmer" className="h-4 w-full" />
            <Skeleton variant="shimmer" className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Track all admin actions and system operations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} aria-hidden="true" />
            Filters
          </Button>
          <Button variant="primary" onClick={handleExportCSV} disabled={logs.length === 0}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={fetchAuditLogs} disabled={loading} className="h-10 w-10 p-0" isLoading={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-card border border-input rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Action
              </label>
              <select
                value={filters.action}
                onChange={e => handleFilterChange('action', e.target.value)}
                className="w-full px-3 py-2 border border-input bg-white text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Actions</option>
                <option value="verify_report">Verify Report</option>
                <option value="reject_report">Reject Report</option>
                <option value="fine_tune">Fine Tune</option>
                <option value="refresh_cache">Refresh Cache</option>
                <option value="reset_quota">Reset Quota</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Resource Type
              </label>
              <select
                value={filters.resource_type}
                onChange={e => handleFilterChange('resource_type', e.target.value)}
                className="w-full px-3 py-2 border border-input bg-white text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Resources</option>
                <option value="credibility_report">Credibility Report</option>
                <option value="sentiment_model">Sentiment Model</option>
                <option value="credibility_model">Credibility Model</option>
                <option value="news_category">News Category</option>
                <option value="all_categories">All Categories</option>
                <option value="gnews_hits">GNews Hits</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
            <Button variant="secondary" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-card border border-input rounded-lg overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle size={40} className="mx-auto mb-4 text-amber-500" aria-hidden="true" />
            <p className="text-muted-foreground">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-input bg-muted/50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    Admin User
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    Resource
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    className="border-b border-input hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-3 text-sm text-foreground">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-3 text-sm text-foreground">
                      <span className="font-medium">{getAdminLabel(log)}</span>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getActionBadgeColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-foreground">
                      <div>
                        <p>{log.resource_type}</p>
                        {log.resource_id && (
                          <p className="text-xs text-muted-foreground">
                            ID: {log.resource_id.substring(0, 12)}...
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-400"></span>
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                          Failed
                        </span>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-muted-foreground mt-1">{log.error_message}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-input rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Actions</p>
          <p className="text-3xl font-bold text-foreground mt-2">{logs.length}</p>
        </div>
        <div className="bg-card border border-input rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Successful</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
            {logs.filter(l => l.success).length}
          </p>
        </div>
        <div className="bg-card border border-input rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
            {logs.filter(l => !l.success).length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminAuditLog;
