import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Grid3X3, Rows3 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Topic, Article } from '../types';
import { NewsGrid } from '../components/news/NewsGrid';
import { TrendingBulletin } from '../components/news/TrendingBulletin';
import { mergeArticlesByNewest, newsService } from '../services/news.service';
import { userService } from '../services/user.service';
import { getErrorMessage } from '../services/api';
import { ErrorState } from '../components/ui/ErrorState';
import { LoginRequiredModal } from '../components/ui/LoginRequiredModal';
import { NEWS_CATEGORY_IDS } from '../utils/constants';

interface HomeProps {
  showNotification: (msg: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
}

const categories = NEWS_CATEGORY_IDS as { id: Topic; label: string }[];
const COLD_START_STEPS = ['Model loaded', 'Sources indexed', 'Summarising', 'Ranking', 'Ready'];
const COLD_START_DELAY_MS = 2000;
const COLD_START_FAST_PROGRESS_MS = 3000;
const COLD_START_SLOW_PROGRESS_MS = 3000;
const GENERAL_FEED_POLL_MS = 3000;
const READY_TRANSITION_MS = 600;
const BACKGROUND_REFRESH_COOLDOWN_MS = 15 * 60_000;

export const Home: React.FC<HomeProps> = ({ showNotification }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = (searchParams.get('category') as Topic) || 'general';
  const queryFromUrl = (searchParams.get('q') || '').trim();
  const { isSignedIn, isLoaded } = useUser();
  
  const [category, setCategory] = useState<Topic>(categoryFromUrl);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [showColdStartProgress, setShowColdStartProgress] = useState(false);
  const [coldStartProgress, setColdStartProgress] = useState(0);
  const [coldStartStep, setColdStartStep] = useState(0);
  const [isCompletingFeedLoad, setIsCompletingFeedLoad] = useState(false);
  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<string>>(new Set());
  const [readLaterKeys, setReadLaterKeys] = useState<Set<string>>(new Set());
  const [sentimentByArticle, setSentimentByArticle] = useState<Record<string, string>>({});
  const [reportedKeys, setReportedKeys] = useState<Set<string>>(new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });
  
  // ✅ UI-only state: NEVER add to useEffect dependency array
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
  const [, startViewTransition] = useTransition();
  const activeNewsRequestIdRef = useRef(0);
  const lastBackgroundRefreshAtRef = useRef<Partial<Record<Topic, number>>>({});
  const backgroundRefreshInFlightRef = useRef<Partial<Record<Topic, boolean>>>({});

  const normalizeArticleKey = useCallback((value?: string | null) => {
    const key = (value || '').trim();
    return key.length > 0 ? key : null;
  }, []);

  const handleError = useCallback((msg: string) => {
    showNotification(msg, 'error');
  }, [showNotification]);

  const handleViewChange = useCallback((nextView: 'grid' | 'list') => {
    startViewTransition(() => {
      setViewType(nextView);
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth < 640;
      setIsMobileViewport(isMobile);
      if (isMobile) {
        setViewType('grid');
      }
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setCategory(categoryFromUrl);
  }, [categoryFromUrl]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn && categoryFromUrl !== 'general') {
      const selected = categories.find((cat) => cat.id === categoryFromUrl);
      setSelectedCategoryName(selected?.label || 'this category');
      setShowLoginModal(true);
      setSearchParams({ category: 'general' });
    }
  }, [categoryFromUrl, isLoaded, isSignedIn, setSearchParams]);

  const fetchNews = async (cat: Topic) => {
    const requestId = ++activeNewsRequestIdRef.current;
    setIsLoading(true);
    setError(null);

    const handleBackgroundRefresh = (requestIdForRefresh: number) => {
      const now = Date.now();
      const lastRefreshAt = lastBackgroundRefreshAtRef.current[cat] ?? 0;
      const isInFlight = backgroundRefreshInFlightRef.current[cat] === true;
      if (isInFlight || now - lastRefreshAt < BACKGROUND_REFRESH_COOLDOWN_MS) {
        return;
      }

      lastBackgroundRefreshAtRef.current[cat] = now;
      backgroundRefreshInFlightRef.current[cat] = true;

      void newsService
        .getNewsByTopic(cat, { refresh: true })
        .then((freshArticles) => {
          if (requestIdForRefresh !== activeNewsRequestIdRef.current) return;
          setArticles((currentArticles) => mergeArticlesByNewest(currentArticles, freshArticles));
        })
        .catch(() => {
          // Keep current rendered cache if background refresh fails.
        })
        .finally(() => {
          backgroundRefreshInFlightRef.current[cat] = false;
        });
    };

    try {
      const initialResponse = await newsService.getNewsByTopicResponse(cat);
      if (requestId !== activeNewsRequestIdRef.current) return;

      const nextArticles = initialResponse.articles;
      setArticles(nextArticles);
      if (!(cat === 'general' && nextArticles.length === 0 && queryFromUrl.length < 2)) {
        setIsFirstLoad(false);
      }
      setRetryCount(0);

      handleBackgroundRefresh(requestId);
    } catch (err: any) {
      if (requestId !== activeNewsRequestIdRef.current) return;
      const errorMsg = getErrorMessage(err);
      // On first load, retry once after a delay instead of showing error immediately
      if (isFirstLoad && retryCount < 1) {
        setRetryCount(retryCount + 1);
        setTimeout(() => {
          fetchNews(cat);
        }, 3000);
      } else {
        setError(errorMsg);
        setIsFirstLoad(false);
      }
    } finally {
      if (requestId === activeNewsRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const fetchSuggestions = async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await newsService.getSuggestions(query);
      setArticles(response.articles || []);
      setIsFirstLoad(false);
      setRetryCount(0);
    } catch {
      setArticles([]);
      setIsFirstLoad(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (queryFromUrl.length >= 2) {
      fetchSuggestions(queryFromUrl);
      return;
    }
    if (!isSignedIn && category !== 'general') return;
    fetchNews(category);
  }, [category, isLoaded, isSignedIn, queryFromUrl]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setBookmarkedKeys(new Set());
      setReadLaterKeys(new Set());
      setSentimentByArticle({});
      setReportedKeys(new Set());
      return;
    }

    let cancelled = false;

    const hydrateActionState = async () => {
      try {
        const [bookmarks, readLater, actionStatus] = await Promise.all([
          userService.getBookmarks(),
          userService.getReadLater(),
          userService.getNewsActionStatus(),
        ]);

        if (cancelled) return;

        const nextBookmarked = new Set<string>();
        for (const item of bookmarks) {
          const keyFromUrl = normalizeArticleKey(item.url);
          const keyFromArticleId = normalizeArticleKey(item.article_id);
          if (keyFromUrl) nextBookmarked.add(keyFromUrl);
          if (keyFromArticleId) nextBookmarked.add(keyFromArticleId);
        }

        const nextReadLater = new Set<string>();
        for (const item of readLater) {
          const keyFromUrl = normalizeArticleKey(item.url);
          const keyFromArticleId = normalizeArticleKey(item.article_id);
          if (keyFromUrl) nextReadLater.add(keyFromUrl);
          if (keyFromArticleId) nextReadLater.add(keyFromArticleId);
        }

        const nextSentimentByArticle: Record<string, string> = {};
        for (const [rawKey, label] of Object.entries(actionStatus.sentiment_by_article || {})) {
          const key = normalizeArticleKey(rawKey);
          if (key) {
            nextSentimentByArticle[key] = label;
          }
        }

        const nextReported = new Set<string>();
        for (const rawKey of actionStatus.reported_article_keys || []) {
          const key = normalizeArticleKey(rawKey);
          if (key) nextReported.add(key);
        }

        setBookmarkedKeys(nextBookmarked);
        setReadLaterKeys(nextReadLater);
        setSentimentByArticle(nextSentimentByArticle);
        setReportedKeys(nextReported);
      } catch {
        if (cancelled) return;
        // Keep feed rendering even if optional action hydration fails.
      }
    };

    void hydrateActionState();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, normalizeArticleKey]);

  const handleActionStateChange = useCallback((update: {
    articleKey: string;
    isBookmarked?: boolean;
    isInReadLater?: boolean;
    feedbackSubmitted?: string | null;
    reportSubmitted?: boolean;
  }) => {
    const articleKey = normalizeArticleKey(update.articleKey);
    if (!articleKey) return;

    if (typeof update.isBookmarked === 'boolean') {
      setBookmarkedKeys((prev) => {
        const next = new Set(prev);
        if (update.isBookmarked) next.add(articleKey);
        else next.delete(articleKey);
        return next;
      });
    }

    if (typeof update.isInReadLater === 'boolean') {
      setReadLaterKeys((prev) => {
        const next = new Set(prev);
        if (update.isInReadLater) next.add(articleKey);
        else next.delete(articleKey);
        return next;
      });
    }

    if (update.feedbackSubmitted !== undefined) {
      setSentimentByArticle((prev) => {
        const next = { ...prev };
        if (update.feedbackSubmitted) {
          next[articleKey] = update.feedbackSubmitted;
        } else {
          delete next[articleKey];
        }
        return next;
      });
    }

    if (typeof update.reportSubmitted === 'boolean') {
      setReportedKeys((prev) => {
        const next = new Set(prev);
        if (update.reportSubmitted) next.add(articleKey);
        else next.delete(articleKey);
        return next;
      });
    }
  }, [normalizeArticleKey]);

  useEffect(() => {
    const shouldShowTimedProgress = isFirstLoad
      && category === 'general'
      && queryFromUrl.length < 2
      && (isLoading || isCompletingFeedLoad || articles.length === 0);

    if (!shouldShowTimedProgress) {
      setShowColdStartProgress(false);
      setColdStartProgress(0);
      setColdStartStep(0);
      return;
    }

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    const delayTimer = setTimeout(() => {
      setShowColdStartProgress(true);
      const progressStart = Date.now();

      progressInterval = setInterval(() => {
        const elapsed = Date.now() - progressStart;
        const fastProgress = Math.min((elapsed / COLD_START_FAST_PROGRESS_MS) * 88, 88);
        const slowElapsed = Math.max(elapsed - COLD_START_FAST_PROGRESS_MS, 0);
        const slowProgress = Math.min((slowElapsed / COLD_START_SLOW_PROGRESS_MS) * 8, 8);
        const nextProgress = Math.min(fastProgress + slowProgress, 96);
        setColdStartProgress(nextProgress);

        const normalized = nextProgress / 96;
        const nextStep = Math.min(
          COLD_START_STEPS.length - 1,
          Math.floor(normalized * COLD_START_STEPS.length)
        );
        setColdStartStep(nextStep);
      }, 80);
    }, COLD_START_DELAY_MS);

    return () => {
      clearTimeout(delayTimer);
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [isFirstLoad, isLoading, isCompletingFeedLoad, category, queryFromUrl.length, articles.length]);

  useEffect(() => {
    const shouldPollGeneralFeed = isFirstLoad
      && !isLoading
      && !error
      && !isCompletingFeedLoad
      && category === 'general'
      && queryFromUrl.length < 2
      && articles.length === 0;

    if (!shouldPollGeneralFeed) {
      return;
    }

    const pollTimer = setTimeout(() => {
      fetchNews(category);
    }, GENERAL_FEED_POLL_MS);

    return () => clearTimeout(pollTimer);
  }, [isFirstLoad, isLoading, error, isCompletingFeedLoad, category, queryFromUrl.length, articles.length]);

  useEffect(() => {
    const shouldCompleteFeedLoad = isFirstLoad
      && category === 'general'
      && queryFromUrl.length < 2
      && articles.length > 0;

    if (!shouldCompleteFeedLoad) {
      setIsCompletingFeedLoad(false);
      return;
    }

    setShowColdStartProgress(true);
    setColdStartProgress(100);
    setColdStartStep(COLD_START_STEPS.length - 1);
    setIsCompletingFeedLoad(true);

    const readyTimer = setTimeout(() => {
      setIsCompletingFeedLoad(false);
      setIsFirstLoad(false);
      setShowColdStartProgress(false);
    }, READY_TRANSITION_MS);

    return () => clearTimeout(readyTimer);
  }, [isFirstLoad, category, queryFromUrl.length, articles.length]);

  const shouldKeepWaitingForGeneralFeed = isFirstLoad
    && !error
    && category === 'general'
    && queryFromUrl.length < 2
    && articles.length === 0;

  const effectiveIsLoading = isLoading || isCompletingFeedLoad || shouldKeepWaitingForGeneralFeed;
  const loadingVariant: 'feed' | 'category' | 'search' = queryFromUrl.length >= 2
    ? 'search'
    : category === 'general'
      ? 'feed'
      : 'category';

  return (
    <motion.div 
      className="w-full max-w-[1520px] mx-auto px-3 sm:px-4 lg:px-5 py-3 sm:py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* 🔥 Live Trending Headlines Bulletin */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <TrendingBulletin onError={(msg) => showNotification(msg, 'error')} />
      </motion.div>

      <motion.header 
        className="mb-8 mt-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          {/* Section Header with accent bar */}
          <div className="relative pl-4 border-l-4 border-gradient-to-b from-indigo-500 to-purple-600" style={{ borderImage: 'linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%) 1' }}>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-black mb-1 flex items-center gap-4 text-gray-900 dark:text-white">
              {queryFromUrl.length >= 2 ? 'Search Results' : `${categories.find(c => c.id === category)?.label} Feed`}
              <motion.span 
                className="inline-flex items-center justify-center px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-sm font-bold"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, delay: 0.3 }}
              >
                {articles.length} articles
              </motion.span>
            </h2>
            <p className="text-gray-700 dark:text-slate-400 text-sm">
              {queryFromUrl.length >= 2 ? `Results for "${queryFromUrl}"` : 'Latest AI-powered news coverage'}
            </p>
          </div>
          
          <motion.div 
            className="flex items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* ✅ Pill Style Segmented Control - NO API calls */}
            <div className="flex items-center bg-white/95 dark:bg-[#252526]/95 backdrop-blur-sm rounded-full p-1 border border-gray-200 dark:border-[#3a3a3c] shadow-sm dark:shadow-black/30">
              <motion.button
                onClick={() => handleViewChange('grid')}
                className={`relative px-4 py-2 rounded-full bg-transparent transition-all duration-200 font-semibold text-sm flex items-center gap-2 ${
                  viewType === 'grid'
                    ? 'text-white dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
                title="Grid View"
                whileTap={{ scale: 0.95 }}
              >
                {viewType === 'grid' && (
                  <motion.div
                    layoutId="viewToggle"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-[#3a3a3c] dark:to-[#2d2d30] rounded-full shadow-lg shadow-indigo-500/30 dark:shadow-black/40"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Grid3X3 size={16} className="relative z-10" aria-hidden="true" />
                <span className="hidden sm:inline relative z-10">Grid</span>
              </motion.button>
              <motion.button
                onClick={() => handleViewChange('list')}
                disabled={isMobileViewport}
                className={`relative px-4 py-2 rounded-full bg-transparent transition-all duration-200 font-semibold text-sm flex items-center gap-2 ${
                  viewType === 'list'
                    ? 'text-white dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                } ${isMobileViewport ? 'hidden' : ''}`}
                title="List View"
                whileTap={{ scale: 0.95 }}
              >
                {viewType === 'list' && (
                  <motion.div
                    layoutId="viewToggle"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-[#3a3a3c] dark:to-[#2d2d30] rounded-full shadow-lg shadow-indigo-500/30 dark:shadow-black/40"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Rows3 size={16} className="relative z-10" aria-hidden="true" />
                <span className="hidden sm:inline relative z-10">List</span>
              </motion.button>
            </div>
          </motion.div>
        </div>
      </motion.header>

      {error ? (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <ErrorState
            title="Feed Unavailable"
            message={error}
            onRetry={() => fetchNews(category)}
          />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <NewsGrid 
            articles={articles} 
            isLoading={effectiveIsLoading} 
            bookmarkedKeys={bookmarkedKeys}
            readLaterKeys={readLaterKeys}
            sentimentByArticle={sentimentByArticle}
            reportedKeys={reportedKeys}
            onActionStateChange={handleActionStateChange}
            viewType={viewType}
            loadingVariant={loadingVariant}
            showColdStartProgress={effectiveIsLoading && showColdStartProgress}
            coldStartProgress={coldStartProgress}
            coldStartStep={coldStartStep}
            onError={handleError} 
          />
        </motion.div>
      )}

      <LoginRequiredModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        categoryName={selectedCategoryName}
      />
    </motion.div>
  );
};