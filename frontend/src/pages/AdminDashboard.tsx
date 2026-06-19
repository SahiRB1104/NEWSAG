import React, { useState } from 'react';
import { BarChart3, Bot, CheckCircle2, ClipboardList, LogOut, Menu, Settings, Smile, UserRound, X } from 'lucide-react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import AdminOverview from './AdminOverview.tsx';
import CredibilityQueue from './CredibilityQueue.tsx';
import SentimentFeedback from './SentimentFeedback.tsx';
import ModelTuning from './ModelTuning.tsx';
import SystemOps from './SystemOps.tsx';
import AdminAuditLog from './AdminAuditLog.tsx';

interface AdminLayoutProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

export const AdminDashboard: React.FC<AdminLayoutProps> = ({ showNotification }) => {
  const location = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const adminDisplayName =
    user?.username ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Admin';

  const navItems = [
    { path: '/admin/overview', label: 'Overview', icon: BarChart3 },
    { path: '/admin/credibility', label: 'Credibility Queue', icon: CheckCircle2 },
    { path: '/admin/sentiment', label: 'Sentiment Feedback', icon: Smile },
    { path: '/admin/tuning', label: 'Model Tuning', icon: Bot },
    { path: '/admin/ops', label: 'System Ops', icon: Settings },
    { path: '/admin/audit', label: 'Audit Log', icon: ClipboardList },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      showNotification('Failed to logout', 'error');
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-slate-200 dark:border-slate-800">
            <BarChart3 size={24} className="text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Admin</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dashboard</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden text-slate-500 hover:text-slate-700"
              aria-label="Close sidebar"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );})}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut size={16} aria-hidden="true" />
              Logout
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 px-4 py-2">
              NewsAura Admin Panel v1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-slate-600 dark:text-slate-400"
            aria-label="Open sidebar"
          >
            <Menu size={24} aria-hidden="true" />
          </button>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {navItems.find((item) => item.path === location.pathname)?.label || 'Admin Dashboard'}
          </h2>
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex items-center gap-2 min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
              <UserRound size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span className="max-w-[180px] truncate text-sm font-medium text-slate-700 dark:text-slate-200" title={adminDisplayName}>
                {adminDisplayName}
              </span>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/overview" element={<AdminOverview showNotification={showNotification} />} />
            <Route path="/credibility" element={<CredibilityQueue showNotification={showNotification} />} />
            <Route path="/sentiment" element={<SentimentFeedback showNotification={showNotification} />} />
            <Route path="/tuning" element={<ModelTuning showNotification={showNotification} />} />
            <Route path="/ops" element={<SystemOps showNotification={showNotification} />} />
            <Route path="/audit" element={<AdminAuditLog />} />
            <Route path="/" element={<AdminOverview showNotification={showNotification} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
