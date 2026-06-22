import React, { useCallback, useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { AppRouter } from './router';
import { AppErrorBoundary } from '../components/app/AppErrorBoundary';
import { RouteProgress } from '../components/app/RouteProgress';
import { Navbar } from '../components/layout/Navbar';
import { Sidebar } from '../components/layout/Sidebar';
import { Footer } from '../components/layout/Footer';
import { AppToaster } from '../components/ui/AppToaster';
import { ChatBot } from '../components/ui/ChatBot';
import { ScrollToTop } from '../components/ui/ScrollToTop';
import { useTheme } from '../hooks/useTheme';
import { notify, notifyLegacy } from '../lib/notify';
import { setAuthToken, setAuthTokenProvider } from '../services/api';

const AppLayout: React.FC<{ showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void }> = ({ showNotification }) => {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';
  const isAdminPage = location.pathname.startsWith('/admin');
  const isProfilePage = location.pathname === '/profile';
  const isHomePage = location.pathname === '/';
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    const syncToken = async () => {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setAuthToken(null);
        setAuthTokenProvider(null);
        return;
      }

      setAuthTokenProvider(async () => {
        const token = await getToken();
        return token || null;
      });

      const token = await getToken();
      setAuthToken(token || null);
    };

    syncToken();
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      <RouteProgress />

      {!isAdminPage && (
        <Navbar 
          onThemeToggle={toggleTheme}
          isDark={isDark}
        />
      )}

      {!isAuthPage && !isAdminPage && !isProfilePage && <Sidebar />}

      <main
        className={`app-main flex-grow overflow-x-hidden ${
          !isAuthPage && !isAdminPage ? (isProfilePage ? 'app-main-with-navbar-offset-profile' : 'app-main-with-navbar-offset') : ''
        } ${!isAuthPage && !isAdminPage && !isProfilePage ? 'news-shell-main' : ''}`}
      >
        <AppRouter showNotification={showNotification} />
      </main>

      {!isAuthPage && !isAdminPage && (
        <style>{`
          .news-shell-main {
            margin-left: 0;
            padding-bottom: 128px;
          }

          .app-main-with-navbar-offset {
            padding-top: 88px;
          }

          .app-main-with-navbar-offset-profile {
            padding-top: 82px;
          }

          @media (min-width: 640px) and (max-width: 1023px) {
            .news-shell-main {
              margin-left: 0;
              padding-bottom: 0;
            }
          }

          @media (min-width: 1024px) {
            .news-shell-main {
              margin-left: 182px;
              padding-bottom: 0;
            }
          }

          @media (max-width: 639px) {
            .app-main-with-navbar-offset {
              padding-top: 84px;
            }

            .app-main-with-navbar-offset-profile {
              padding-top: 80px;
            }
          }
        `}</style>
      )}

      {!isAdminPage && <Footer />}
      
      {/* Scroll to top button */}
      <ScrollToTop />
      
      {isHomePage && (
        <ChatBot 
          onError={(msg) => showNotification(msg, 'error')}
        />
      )}
    </div>
  );
};

const AppContent: React.FC<{ showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void }> = ({ showNotification }) => {
  return (
    <BrowserRouter>
      <AppLayout showNotification={showNotification} />
    </BrowserRouter>
  );
};

const App: React.FC = () => {
  const showNotification = useCallback((message: string, type: 'error' | 'success' | 'warning' | 'info' = 'error') => {
    if (type === 'warning') return notify.warning(message);
    if (type === 'info') return notify.info(message);
    notifyLegacy(message, type);
  }, []);

  return (
    <AppErrorBoundary>
      <AppToaster />
      <AppContent showNotification={showNotification} />
    </AppErrorBoundary>
  );
};


export default App;
