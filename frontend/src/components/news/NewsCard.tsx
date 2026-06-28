import React, { useState, useCallback, useMemo, useEffect, memo, lazy, Suspense } from 'react';
import type { Article } from '../../types';
import { SentimentBadge } from './SentimentBadge';
import { CredibilityBadge } from './CredibilityBadge';
import { Button } from '../ui/Button';
import { newsService } from '../../services/news.service';
import { userService } from '../../services/user.service';
import { Modal } from '../ui/Modal';
import { formatAbsoluteTime, getReadTimeText } from '../../utils/timeUtils';
import { openChatWithArticle } from '../../utils/chatEvents';
import { ERROR_MESSAGES, SUPPORTED_LANGUAGES } from '../../utils/constants';
import { AlertTriangle, Bookmark, Bot, Check, Clock3, Heart, MessageCircle, RefreshCw, Smile, Sparkles, TriangleAlert } from 'lucide-react';
import { ArticleSkeleton } from '../ui/skeletons/ArticleSkeleton';

// Lazy load heavy components
const CommentSection = lazy(() => import('./commentSection').then(m => ({ default: m.CommentSection })));
const AudioPlayer = lazy(() => import('./AudioPlayer').then(m => ({ default: m.AudioPlayer })));

const SENTIMENT_OPTIONS = ['Positive', 'Neutral', 'Negative'] as const;

const ACTION_BTN_BASE = 'relative inline-flex items-center justify-center p-2 sm:p-2.5 rounded-xl transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:!focus-visible:ring-offset-slate-900';
const ACTION_BTN_INACTIVE = 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-105';
const ACTION_BTN_ACTIVE_PRIMARY = 'text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30';
const ACTION_BTN_ACTIVE_SUCCESS = 'text-white bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30';
const ACTION_BTN_ACTIVE_WARNING = 'text-white bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/30';
const ACTION_ICON_CLASS = 'w-[17px] h-[17px] stroke-[1.9] transition-transform duration-200';
const ASK_BTN_CLASS = 'items-center gap-1 px-2 py-1.5 sm:px-2.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50/80 dark:bg-slate-700/70 border border-indigo-100 dark:border-slate-600/60 shadow-sm shadow-indigo-500/5 dark:shadow-black/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-200 hover:border-indigo-200 dark:hover:border-indigo-500/50 rounded-xl transition-all hover:scale-105 active:scale-95 whitespace-nowrap';
const FEEDBACK_MENU_CLASS = 'absolute left-0 bottom-full mb-2 rounded-2xl border py-3 px-2 z-[70] min-w-[180px] animate-slide-up origin-bottom-left bg-white border-gray-200 shadow-2xl backdrop-blur-xl dark:!bg-[#1f1f1f] dark:!border-[#2d2d30] dark:!shadow-black/80 dark:!ring-1 dark:!ring-[#2d2d30]';
const FEEDBACK_MENU_HEADER_CLASS = 'px-2 py-1.5 text-[9px] uppercase tracking-widest font-bold text-gray-500 dark:!text-slate-300';
const FEEDBACK_MENU_ITEM_CLASS = 'relative w-full text-left px-3 py-2.5 text-xs transition-all flex items-center gap-2.5 rounded-lg hover:bg-gray-100 dark:!hover:bg-[#2d2d30]/60 dark:!rounded-lg dark:!my-0.5 dark:!mx-0 border border-transparent dark:!border-transparent dark:!bg-[#1f1f1f]';
const FEEDBACK_MENU_ITEM_TEXT_CLASS = 'text-gray-700 dark:!text-slate-300';
const FEEDBACK_MENU_ITEM_SELECTED_CLASS = 'text-indigo-600 dark:!text-indigo-200 font-semibold dark:!bg-[#2d2d30] dark:!border-transparent dark:!text-indigo-100';
const FEEDBACK_MENU_DOT_BASE = 'w-2 h-2 rounded-full ring-1 ring-black/5 dark:!ring-white/10';

interface NewsCardProps {
  article: Article;
  viewType?: 'grid' | 'list';
  isBookmarked?: boolean;
  isInReadLater?: boolean;
  initialFeedbackSubmitted?: string | null;
  isReported?: boolean;
  onActionStateChange?: (update: {
    articleKey: string;
    isBookmarked?: boolean;
    isInReadLater?: boolean;
    feedbackSubmitted?: string | null;
    reportSubmitted?: boolean;
  }) => void;
  onError?: (message: string) => void;
}

// Memoized NewsCard to prevent unnecessary re-renders
export const NewsCard: React.FC<NewsCardProps> = memo(({ 
  article, 
  viewType = 'grid',
  isBookmarked: initialIsBookmarked, 
  isInReadLater: initialIsInReadLater, 
  initialFeedbackSubmitted,
  isReported: initialIsReported,
  onActionStateChange,
  onError 
}) => {
  const [isBookmarked, setIsBookmarked] = useState(Boolean(initialIsBookmarked));
  const [isInReadLater, setIsInReadLater] = useState(Boolean(initialIsInReadLater));
  const [summary, setSummary] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');
  const [summaryData, setSummaryData] = useState<any>(null);
  
  // ✅ ML Feedback State
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<string | null>(initialFeedbackSubmitted ?? null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isBookmarkPending, setIsBookmarkPending] = useState(false);
  const [isReadLaterPending, setIsReadLaterPending] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(Boolean(initialIsReported));
  // Memoize computed values
  const articleStateKey = useMemo(() => article.url || article.id || '', [article.url, article.id]);
  const articleId = useMemo(() => article.url || article.id, [article.url, article.id]);
  const sourceValue = useMemo(() => {
    return typeof article.source === 'string'
      ? article.source
      : (article.source as { name?: string })?.name || '';
  }, [article.source]);
  
  const imageUrl = useMemo(() => {
    return article.image_url || `https://picsum.photos/seed/${article.title.length}/600/400`;
  }, [article.image_url, article.title.length]);

  const articleTimestamp = useMemo(() => {
    return formatAbsoluteTime(article.fetched_at || article.published_at);
  }, [article.fetched_at, article.published_at]);

  useEffect(() => {
    setIsBookmarked(Boolean(initialIsBookmarked));
  }, [initialIsBookmarked]);

  useEffect(() => {
    setIsInReadLater(Boolean(initialIsInReadLater));
  }, [initialIsInReadLater]);

  useEffect(() => {
    setFeedbackSubmitted(initialFeedbackSubmitted ?? null);
  }, [initialFeedbackSubmitted]);

  useEffect(() => {
    setReportSubmitted(Boolean(initialIsReported));
  }, [initialIsReported]);

  useEffect(() => {
    if (feedbackSubmitted) {
      setShowFeedbackMenu(false);
    }
  }, [feedbackSubmitted]);

  const handleSentimentFeedback = useCallback(async (userLabel: string) => {
    if (isSubmittingFeedback || feedbackSubmitted) return;

    const previousFeedback = feedbackSubmitted;
    setFeedbackSubmitted(userLabel);
    setShowFeedbackMenu(false);
    setIsSubmittingFeedback(true);
    if (articleStateKey) {
      onActionStateChange?.({
        articleKey: articleStateKey,
        feedbackSubmitted: userLabel,
      });
    }

    try {
      await newsService.rateSentiment({
        article_id: articleId,
        article_url: article.url,
        title: article.title,
        description: article.description,
        ai_label: article.sentiment?.label || 'Neutral',
        ai_confidence: article.sentiment?.confidence || 0.5,
        user_label: userLabel,
      });
    } catch (err: any) {
      setFeedbackSubmitted(previousFeedback);
      if (articleStateKey) {
        onActionStateChange?.({
          articleKey: articleStateKey,
          feedbackSubmitted: previousFeedback,
        });
      }
      onError?.(err.message || 'Failed to submit feedback');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [isSubmittingFeedback, feedbackSubmitted, articleStateKey, onActionStateChange, articleId, article.url, article.title, article.description, article.sentiment, onError]);

  // ✅ Handle Report Misleading
  const handleReportMisleading = useCallback(async () => {
    if (isSubmittingFeedback || reportSubmitted) return;

    const previousReportSubmitted = reportSubmitted;
    const submittedReason = reportReason;
    setReportSubmitted(true);
    setShowReportModal(false);
    setReportReason('');
    setIsSubmittingFeedback(true);
    if (articleStateKey) {
      onActionStateChange?.({
        articleKey: articleStateKey,
        reportSubmitted: true,
      });
    }

    try {
      await newsService.reportMisleading({
        article_id: articleId,
        article_url: article.url,
        title: article.title,
        description: article.description,
        content: article.content,
        source_domain: sourceValue,
        ai_label: article.credibility?.label || 'Unknown',
        ai_score: article.credibility?.score || 0.5,
        ai_source: article.credibility?.source || 'unknown',
        reason: submittedReason,
      });
    } catch (err: any) {
      setReportSubmitted(previousReportSubmitted);
      setReportReason(submittedReason);
      if (articleStateKey) {
        onActionStateChange?.({
          articleKey: articleStateKey,
          reportSubmitted: previousReportSubmitted,
        });
      }
      onError?.(err.message || 'Failed to submit report');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [isSubmittingFeedback, reportSubmitted, reportReason, articleStateKey, onActionStateChange, articleId, article.url, article.title, article.description, article.content, sourceValue, article.credibility, onError]);

  const handleSummary = useCallback(async () => {
    setIsModalOpen(true);
    setSelectedLang('en');
    if (!summary) {
      setIsLoadingSummary(true);
      setSummaryError(null);
      try {
        // ✅ Send content, description, title, source & article_id for backend validation
        const res = await newsService.getSummary(
          article.url,
          article.content,
          article.description,
          'en',
          article.title,
          sourceValue,
          articleId
        );
        setSummary(res.summary);
        setSummaryData(res);
      } catch (err: any) {
        console.error("Summary failed", err);
        setSummaryError(err.message || ERROR_MESSAGES.GENERATE_SUMMARY);
      } finally {
        setIsLoadingSummary(false);
      }
    }
  }, [article.url, article.content, article.description, article.title, sourceValue, articleId, summary]);

  const handleRetrySummary = useCallback(async () => {
    setSummary(null);
    setSummaryData(null);
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await newsService.getSummary(
        article.url,
        article.content,
        article.description,
        selectedLang,
        article.title,
        sourceValue,
        articleId
      );
      setSummary(res.summary);
      setSummaryData(res);
    } catch (err: any) {
      console.error("Summary retry failed", err);
      setSummaryError(err.message || ERROR_MESSAGES.GENERATE_SUMMARY);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [article.url, article.content, article.description, article.title, sourceValue, articleId, selectedLang]);

  const handleLanguageChange = useCallback(async (lang: string) => {
    if (lang === selectedLang) return;
    setSelectedLang(lang);
    setIsTranslating(true);
    setSummaryError(null);
    try {
      const res = await newsService.getSummary(
        article.url,
        article.content,
        article.description,
        lang,
        article.title,
        sourceValue,
        articleId
      );
      setSummary(res.summary);
      setSummaryData(res);
    } catch (err: any) {
      setSummaryError(err.message || ERROR_MESSAGES.TRANSLATION_FAILED);
    } finally {
      setIsTranslating(false);
    }
  }, [article.url, article.content, article.description, article.title, sourceValue, articleId, selectedLang]);

  const toggleBookmark = useCallback(async () => {
    if (isBookmarkPending) return;

    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    setIsBookmarkPending(true);
    if (articleStateKey) {
      onActionStateChange?.({
        articleKey: articleStateKey,
        isBookmarked: nextState,
      });
    }

    try {
      const articleIdValue = article.url || article.id;

      if (isBookmarked) {
        await userService.removeBookmarkByArticleId(articleIdValue);
      } else {
        await userService.addBookmark({
          article_id: articleIdValue,
          title: article.title,
          source: sourceValue,
          description: article.description,
          url: article.url,
          image_url: article.image_url,
          category: article.category,
        });
      }
    } catch (err: any) {
      setIsBookmarked(isBookmarked);
      if (articleStateKey) {
        onActionStateChange?.({
          articleKey: articleStateKey,
          isBookmarked,
        });
      }
      onError?.(err.message || ERROR_MESSAGES.ACTION_FAILED);
    } finally {
      setIsBookmarkPending(false);
    }
  }, [isBookmarkPending, isBookmarked, articleStateKey, onActionStateChange, article.url, article.id, article.title, article.description, article.image_url, article.category, sourceValue, onError]);

  const toggleReadLater = useCallback(async () => {
    if (isReadLaterPending) return;

    const nextState = !isInReadLater;
    setIsInReadLater(nextState);
    setIsReadLaterPending(true);
    if (articleStateKey) {
      onActionStateChange?.({
        articleKey: articleStateKey,
        isInReadLater: nextState,
      });
    }

    try {
      const articleIdValue = article.url || article.id;

      if (isInReadLater) {
        await userService.removeFromReadLaterByArticleId(articleIdValue);
      } else {
        await userService.addToReadLater({
          article_id: articleIdValue,
          title: article.title,
          source: sourceValue,
          url: article.url,
          category: article.category,
        });
      }
    } catch (err: any) {
      setIsInReadLater(isInReadLater);
      if (articleStateKey) {
        onActionStateChange?.({
          articleKey: articleStateKey,
          isInReadLater,
        });
      }
      onError?.(err.message || ERROR_MESSAGES.ACTION_FAILED);
    } finally {
      setIsReadLaterPending(false);
    }
  }, [isReadLaterPending, isInReadLater, articleStateKey, onActionStateChange, article.url, article.id, article.title, article.category, sourceValue, onError]);

  const trackReadActivity = useCallback(() => {
    const articleUrl = article.url;
    if (!articleUrl) return;

    userService
      .trackReadActivity({
        article_id: article.id,
        article_url: articleUrl,
        title: article.title,
        source: sourceValue,
        category: article.category,
      })
      .catch(() => {
        // Intentionally ignore telemetry failures.
      });
  }, [article.category, article.id, article.title, article.url, sourceValue]);

  const handleReadFullArticle = useCallback(() => {
    trackReadActivity();
    window.open(article.url, '_blank', 'noopener,noreferrer');
  }, [article.url, trackReadActivity]);

  // ✅ List View Layout (Horizontal)
  if (viewType === 'list') {
    return (
      <div className={`group relative bg-white dark:bg-slate-800/90 rounded-2xl overflow-visible border border-gray-200 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row hover:-translate-y-0.5 ${showFeedbackMenu ? 'z-20' : ''}`}>
        {/* Image Section - Adaptive for small screens */}
        <div className="relative w-full sm:w-52 h-[180px] sm:h-44 overflow-hidden flex-shrink-0">
          <img 
            src={imageUrl} 
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 will-change-transform"
          />
          <div className="absolute top-3 left-3">
            <SentimentBadge sentiment={article.sentiment} />
          </div>
          <div className="absolute bottom-3 right-3">
            <CredibilityBadge credibility={article.credibility} />
          </div>
        </div>

        {/* Content Section */}
        <div className="p-5 flex-grow flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {article.source}
            </span>
            <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-slate-500">
              <span>{articleTimestamp}</span>
              {(article.description || article.content) && (
                <span className="text-gray-400 dark:text-slate-600">• {getReadTimeText(article.description || article.content)}</span>
              )}
            </div>
          </div>
          
          <h3 className="text-lg font-semibold leading-snug mb-2 line-clamp-2 text-gray-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200">
            <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={trackReadActivity}>{article.title}</a>
          </h3>
          
          <p className="text-gray-700 dark:text-slate-400 text-sm line-clamp-2 mb-4 leading-relaxed">
            {article.description}
          </p>

          <div className="mt-auto flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="flex gap-1.5 shrink-0">
              <button 
                onClick={toggleBookmark}
                disabled={isBookmarkPending}
                className={`${ACTION_BTN_BASE} ${isBookmarked ? ACTION_BTN_ACTIVE_PRIMARY : ACTION_BTN_INACTIVE} disabled:cursor-wait disabled:opacity-80`}
                title="Bookmark"
              >
                <Bookmark className={`${ACTION_ICON_CLASS} ${isBookmarked ? 'scale-105' : ''}`} />
              </button>
              <button 
                onClick={toggleReadLater}
                disabled={isReadLaterPending}
                className={`${ACTION_BTN_BASE} ${isInReadLater ? ACTION_BTN_ACTIVE_PRIMARY : ACTION_BTN_INACTIVE} disabled:cursor-wait disabled:opacity-80`}
                title="Read Later"
              >
                <Clock3 className={`${ACTION_ICON_CLASS} ${isInReadLater ? 'scale-105' : ''}`} />
              </button>
              <button 
                onClick={() => setIsCommentsOpen(true)}
                className={`${ACTION_BTN_BASE} ${ACTION_BTN_INACTIVE}`}
                title="Comments"
              >
                <MessageCircle className={ACTION_ICON_CLASS} />
              </button>
              
              {/* ✅ ML Feedback Button (List View) */}
              <div className="relative z-30">
                <button 
                  onClick={() => {
                    if (!feedbackSubmitted) {
                      setShowFeedbackMenu((current) => !current);
                    }
                  }}
                  className={`${ACTION_BTN_BASE} ${
                    feedbackSubmitted 
                      ? ACTION_BTN_ACTIVE_SUCCESS
                      : ACTION_BTN_INACTIVE
                  }`}
                  title={feedbackSubmitted ? `Rated: ${feedbackSubmitted}` : "Rate Sentiment"}
                >
                  {feedbackSubmitted ? (
                    <Check className={`${ACTION_ICON_CLASS} stroke-[2.4]`} />
                  ) : (
                    <Smile className={ACTION_ICON_CLASS} />
                  )}
                </button>
                
                {showFeedbackMenu && !feedbackSubmitted && (
                  <div className={FEEDBACK_MENU_CLASS}>
                    <div className={FEEDBACK_MENU_HEADER_CLASS}>
                      Rate Sentiment
                    </div>
                    {SENTIMENT_OPTIONS.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSentimentFeedback(option)}
                        disabled={isSubmittingFeedback}
                        className={`${FEEDBACK_MENU_ITEM_CLASS} ${
                          article.sentiment?.label === option ? FEEDBACK_MENU_ITEM_SELECTED_CLASS : FEEDBACK_MENU_ITEM_TEXT_CLASS
                        }`}
                      >
                          <span className={`${FEEDBACK_MENU_DOT_BASE} ${
                          option === 'Positive' ? 'bg-emerald-500' : 
                          option === 'Negative' ? 'bg-rose-500' : 'bg-slate-400'
                        }`}></span>
                        {option}
                          {article.sentiment?.label === option && <span className="text-[9px] opacity-60 ml-auto">(AI)</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* ✅ Report Button (List View) */}
              <button 
                onClick={() => {
                  setShowFeedbackMenu(false);
                  setShowReportModal(true);
                }}
                className={`${ACTION_BTN_BASE} relative z-40 ${
                  reportSubmitted 
                    ? ACTION_BTN_ACTIVE_WARNING
                    : 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-600 dark:hover:text-rose-400 hover:scale-105'
                }`}
                title={reportSubmitted ? "Report Submitted" : "Report Misleading"}
                disabled={reportSubmitted}
              >
                <TriangleAlert className={ACTION_ICON_CLASS} />
              </button>
            </div>
            
            <div className="flex gap-1 ml-auto shrink-0">
              <Button variant="ghost" size="sm" onClick={handleSummary} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] px-2 py-1.5 sm:px-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all hover:scale-105 active:scale-95 whitespace-nowrap">
                <Sparkles className="w-3.5 h-3.5 stroke-[2.1]" />
                <span>Summary</span>
              </Button>
              <button
                onClick={() => openChatWithArticle(article.id, article.title)}
                className={`hidden sm:inline-flex ${ASK_BTN_CLASS}`}
                title="Ask AI about this article"
              >
                <Bot className="w-3.5 h-3.5 stroke-[2.1]" />
                <span>Ask</span>
              </button>
            </div>
          </div>
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} forceLightTheme>
          {isLoadingSummary ? (
            <ArticleSkeleton />
          ) : summaryError ? (
            <div className="py-8 text-center font-serif">
               <h4 className="font-serif text-2xl mb-4">DISPATCH ERROR</h4>
               <p className="text-slate-600 mb-6">{summaryError}</p>
               <Button onClick={() => setIsModalOpen(false)}>Close Bulletin</Button>
            </div>
          ) : (
            <div
              className="newspaper-paper border w-full"
              style={{ backgroundColor: '#f1f1ef', borderColor: '#5a5a5a', outline: '1px solid #5a5a5a', outlineOffset: '4px' }}
            >
              <div className="border p-3 sm:p-4" style={{ borderColor: '#9b9b9b', borderWidth: '1px' }}>
                 {/* Masthead */}
                 <div className="text-center mb-3 pb-2 border-b-4 border-black border-double">
                    <div className="mb-1">
                      <span className="text-[8px] font-normal uppercase tracking-widest italic">Special AI Edition</span>
                    </div>
                    <h4 className="font-serif text-xl sm:text-2xl font-normal tracking-tight uppercase mb-1">
                      {typeof article.source === 'string'
                        ? article.source
                        : (article.source as { name?: string })?.name || 'The Artificial Dispatch'}
                    </h4>
                 </div>

                 {/* Headline */}
                 <h2 className="font-serif text-lg sm:text-xl font-normal mb-2 leading-tight text-center italic">
                   "{article.title}"
                 </h2>

                 {/* Language Selector */}
                 <div className="flex items-center justify-center gap-2 mb-3">
                   <label
                     htmlFor="lang-select-list"
                     className="text-[10px] uppercase tracking-widest font-semibold text-slate-700"
                   >
                     Translate
                   </label>
                   <select
                     id="lang-select-list"
                     value={selectedLang}
                     onChange={(e) => handleLanguageChange(e.target.value)}
                     disabled={isTranslating}
                     className="text-xs border border-slate-500 rounded px-2 py-1 bg-white font-serif focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 text-slate-900"
                   >
                     {SUPPORTED_LANGUAGES.map((l) => (
                       <option key={l.code} value={l.code}>
                         {l.name}
                       </option>
                     ))}
                   </select>
                   {isTranslating && (
                     <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                   )}
                   {summaryData?.translated && (
                     <span className="text-[9px] uppercase tracking-wider text-indigo-700 font-semibold">
                       Translated
                     </span>
                   )}
                 </div>

                 {/* 2-Column Text Body */}
                 <div 
                   className={`text-base leading-snug text-justify md:columns-2 gap-6 whitespace-pre-wrap transition-opacity duration-300 ${isTranslating ? 'opacity-40' : ''} ${selectedLang === 'hi' ? 'devanagari' : ''}`}
                   style={{ 
                     ...(selectedLang !== 'hi' ? { fontFamily: 'Georgia, "Times New Roman", serif' } : {}),
                     fontWeight: '300',
                     opacity: isTranslating ? 0.4 : 0.85,
                     color: '#333'
                   }}
                 >
                   {summary}
                </div>

                {/* Fallback indicator */}
                {summaryData?.is_fallback && (
                  <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded border" style={{ backgroundColor: '#fffbe6', borderColor: '#ffe58f' }}>
                    <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#ad6800' }}>
                      <AlertTriangle size={12} className="inline mr-1" aria-hidden="true" />
                      {summaryData.source === 'description' ? 'Limited summary (from description)' : summaryData.source === 'placeholder' ? 'Summary unavailable' : 'Partial summary'}
                    </span>
                    <button
                      onClick={handleRetrySummary}
                      className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded hover:bg-amber-100 transition-colors"
                      style={{ color: '#ad6800' }}
                    >
                      <RefreshCw size={12} className="inline mr-1" aria-hidden="true" /> Retry
                    </button>
                  </div>
                )}

                {/* Audio Player for TTS */}
                {summaryData?.audio_available && summaryData?.summary && (
                  <div className="mt-4 pt-3 border-t border-slate-300 dark:border-slate-600">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500">Listen to Summary</span>
                    </div>
                    <Suspense fallback={<div className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>}>
                      <AudioPlayer 
                        text={summaryData.summary} 
                        language={selectedLang}
                        forceLightTheme
                        className="bg-slate-50 px-3 rounded-lg"
                      />
                    </Suspense>
                  </div>
                )}
              
                {/* Horizontal Line Separator */}
                <div className="border-t border-black mt-3"></div>
              
                {/* Action Footer */}
                <div className="px-4 py-2" style={{backgroundColor: '#ececec'}}>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                    {/* Icon Buttons - Like & Comment */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => setIsCommentsOpen(true)}
                        className="p-1.5 hover:opacity-60 transition-opacity"
                        title="Comments"
                        style={{color: '#333'}}
                      >
                        <MessageCircle size={20} aria-hidden="true" />
                      </button>
                      <button 
                        onClick={() => setIsLiked(!isLiked)}
                        className="p-1.5 hover:opacity-60 transition-opacity"
                        title="Like"
                        style={{color: '#333'}}
                      >
                        <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="hidden sm:block h-4 w-px" style={{backgroundColor: '#333', opacity: 0.3}}></div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
                      <button 
                        onClick={() => setIsModalOpen(false)}
                        className="text-[9px] sm:text-[10px] font-normal uppercase tracking-widest text-slate-700 px-2 py-1 rounded hover:text-white hover:bg-indigo-600 transition-colors"
                      >
                        Close
                      </button>
                      <button 
                        onClick={handleReadFullArticle}
                        className="text-[9px] sm:text-[10px] font-normal uppercase tracking-widest border border-slate-800 px-2.5 sm:px-3 py-1 text-slate-900 bg-[#ececec] hover:text-white hover:border-indigo-600 hover:bg-indigo-600 transition-colors"
                      >
                        Read Full Article
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        <Modal isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} title="Comments" accent="comments">
          <Suspense fallback={<div className="py-8 flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <CommentSection articleId={article.id} articleTitle={article.title} />
          </Suspense>
        </Modal>

        {/* ✅ Report Misleading Modal */}
        <Modal isOpen={showReportModal} onClose={() => setShowReportModal(false)} title="Report Misleading Content">
          <div className="p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Help improve our AI by reporting potentially misleading or inaccurate content.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Why do you think this is misleading?</label>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Optional: Describe the issue..."
                className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowReportModal(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleReportMisleading}
                disabled={isSubmittingFeedback}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit Report'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ✅ Grid View Layout (Vertical - Default)
  return (
    <div className={`group relative bg-white dark:bg-slate-800/90 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700/50 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-slate-600 transition-all duration-200 flex flex-col hover:-translate-y-1 ${showFeedbackMenu ? 'z-20' : ''}`}>
      {/* Image Section */}
      <div className="relative h-[180px] sm:h-52 overflow-hidden">
        <img 
          src={imageUrl} 
          alt={article.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 will-change-transform"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute top-3 left-3 flex gap-2">
          <SentimentBadge sentiment={article.sentiment} />
        </div>
        <div className="absolute top-3 right-3">
          <CredibilityBadge credibility={article.credibility} />
        </div>
        <div className="absolute top-12 right-3 lg:hidden">
          <button
            onClick={() => openChatWithArticle(article.id, article.title)}
            className={`${ASK_BTN_CLASS} inline-flex px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wide`}
            title="Ask AI about this article"
          >
            <Bot className="w-3.5 h-3.5 stroke-[2.1]" aria-hidden="true" />
            <span>Ask AI</span>
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-5 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            {article.source}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-slate-500">
            <span>{articleTimestamp}</span>
            {(article.description || article.content) && (
              <>
                <span className="text-gray-400 dark:text-slate-600">•</span>
                <span>{getReadTimeText(article.description || article.content)}</span>
              </>
            )}
          </div>
        </div>
        
        <h3 className="text-base font-semibold leading-snug mb-3 line-clamp-2 text-gray-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200">
          <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={trackReadActivity}>{article.title}</a>
        </h3>
        
        <p className="text-gray-700 dark:text-slate-400 text-sm line-clamp-2 mb-4 leading-relaxed">
          {article.description}
        </p>

        <div className="mt-auto pt-4 flex flex-wrap sm:flex-nowrap items-center gap-2 border-t border-gray-200 dark:border-slate-700/50">
          <div className="flex gap-1.5 shrink-0">
            <button 
              onClick={toggleBookmark}
              disabled={isBookmarkPending}
              className={`${ACTION_BTN_BASE} ${isBookmarked ? ACTION_BTN_ACTIVE_PRIMARY : ACTION_BTN_INACTIVE} disabled:cursor-wait disabled:opacity-80`}
              title="Bookmark"
            >
              <Bookmark className={`${ACTION_ICON_CLASS} ${isBookmarked ? 'scale-105' : ''}`} />
            </button>
            <button 
              onClick={toggleReadLater}
              disabled={isReadLaterPending}
              className={`${ACTION_BTN_BASE} ${isInReadLater ? ACTION_BTN_ACTIVE_PRIMARY : ACTION_BTN_INACTIVE} disabled:cursor-wait disabled:opacity-80`}
              title="Read Later"
            >
              <Clock3 className={`${ACTION_ICON_CLASS} ${isInReadLater ? 'scale-105' : ''}`} />
            </button>
            <button 
              onClick={() => setIsCommentsOpen(true)}
              className={`${ACTION_BTN_BASE} ${ACTION_BTN_INACTIVE}`}
              title="Comments"
            >
              <MessageCircle className={ACTION_ICON_CLASS} />
            </button>
            
            {/* ✅ ML Feedback Dropdown */}
            <div className="relative z-30">
              <button 
                onClick={() => {
                  if (!feedbackSubmitted) {
                    setShowFeedbackMenu((current) => !current);
                  }
                }}
                className={`${ACTION_BTN_BASE} ${
                  feedbackSubmitted 
                    ? ACTION_BTN_ACTIVE_SUCCESS
                    : ACTION_BTN_INACTIVE
                }`}
                title={feedbackSubmitted ? `Rated: ${feedbackSubmitted}` : "Rate Sentiment"}
              >
                {feedbackSubmitted ? (
                  <Check className={`${ACTION_ICON_CLASS} stroke-[2.4]`} />
                ) : (
                  <Smile className={ACTION_ICON_CLASS} />
                )}
              </button>
              
              {showFeedbackMenu && !feedbackSubmitted && (
                <div className={FEEDBACK_MENU_CLASS}>
                  <div className={FEEDBACK_MENU_HEADER_CLASS}>
                    Rate Sentiment
                  </div>
                  {SENTIMENT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleSentimentFeedback(option)}
                      disabled={isSubmittingFeedback}
                      className={`${FEEDBACK_MENU_ITEM_CLASS} ${
                        article.sentiment?.label === option ? FEEDBACK_MENU_ITEM_SELECTED_CLASS : FEEDBACK_MENU_ITEM_TEXT_CLASS
                      }`}
                    >
                      <span className={`${FEEDBACK_MENU_DOT_BASE} ${
                        option === 'Positive' ? 'bg-emerald-500' : 
                        option === 'Negative' ? 'bg-rose-500' : 'bg-slate-400'
                      }`}></span>
                      {option}
                      {article.sentiment?.label === option && <span className="text-[9px] opacity-60 ml-auto">(AI)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* ✅ Report Misleading Button */}
            <button 
              onClick={() => {
                setShowFeedbackMenu(false);
                setShowReportModal(true);
              }}
              className={`${ACTION_BTN_BASE} relative z-40 ${
                reportSubmitted 
                  ? ACTION_BTN_ACTIVE_WARNING
                  : 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-600 dark:hover:text-rose-400 hover:scale-105'
              }`}
              title={reportSubmitted ? "Report Submitted" : "Report Misleading"}
              disabled={reportSubmitted}
            >
              <TriangleAlert className={ACTION_ICON_CLASS} />
            </button>
          </div>
          
          <div className="flex gap-1 ml-auto shrink-0">
            <Button variant="ghost" size="sm" onClick={handleSummary} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] px-2 py-1.5 sm:px-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all hover:scale-105 active:scale-95 whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5 stroke-[2.1]" />
              <span>Summary</span>
            </Button>
            <button
              onClick={() => openChatWithArticle(article.id, article.title)}
              className={`hidden lg:inline-flex ${ASK_BTN_CLASS}`}
              title="Ask AI about this article"
            >
              <Bot className="w-3.5 h-3.5 stroke-[2.1]" />
              <span>Ask</span>
            </button>
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} forceLightTheme>
        {isLoadingSummary ? (
          <ArticleSkeleton />
        ) : summaryError ? (
          <div className="py-8 text-center font-serif">
             <h4 className="font-serif text-2xl mb-4">DISPATCH ERROR</h4>
             <p className="text-slate-600 mb-6">{summaryError}</p>
             <Button onClick={() => setIsModalOpen(false)}>Close Bulletin</Button>
          </div>
        ) : (
          <div
            className="newspaper-paper border w-full"
            style={{ backgroundColor: '#f1f1ef', borderColor: '#5a5a5a', outline: '1px solid #5a5a5a', outlineOffset: '4px' }}
          >
            <div className="border p-3 sm:p-4" style={{ borderColor: '#9b9b9b', borderWidth: '1px' }}>
               {/* Masthead */}
               <div className="text-center mb-3 pb-2 border-b-4 border-black border-double">
                  <div className="mb-1">
                    <span className="text-[8px] font-normal uppercase tracking-widest italic">Special AI Edition</span>
                  </div>
                  <h4 className="font-serif text-xl sm:text-2xl font-normal tracking-tight uppercase mb-1">
                    {typeof article.source === 'string'
                      ? article.source
                      : (article.source as { name?: string })?.name || 'The Artificial Dispatch'}
                  </h4>
               </div>

               {/* Headline */}
               <h2 className="font-serif text-lg sm:text-xl font-normal mb-2 leading-tight text-center italic">
                 "{article.title}"
               </h2>

               {/* Language Selector */}
               <div className="flex items-center justify-center gap-2 mb-3">
                 <label
                   htmlFor="lang-select-grid"
                   className="text-[10px] uppercase tracking-widest font-semibold text-slate-700"
                 >
                   Translate
                 </label>
                 <select
                   id="lang-select-grid"
                   value={selectedLang}
                   onChange={(e) => handleLanguageChange(e.target.value)}
                   disabled={isTranslating}
                   className="text-xs border border-slate-500 rounded px-2 py-1 bg-white font-serif focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 text-slate-900"
                 >
                   {SUPPORTED_LANGUAGES.map((l) => (
                     <option key={l.code} value={l.code}>
                       {l.name}
                     </option>
                   ))}
                 </select>
                 {isTranslating && (
                   <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                 )}
                 {summaryData?.translated && (
                   <span className="text-[9px] uppercase tracking-wider text-indigo-700 font-semibold">
                     Translated
                   </span>
                 )}
               </div>

               {/* 2-Column Text Body */}
               <div 
                 className={`text-base leading-snug text-justify md:columns-2 gap-6 whitespace-pre-wrap transition-opacity duration-300 ${isTranslating ? 'opacity-40' : ''} ${selectedLang === 'hi' ? 'devanagari' : ''}`}
                 style={{ 
                   ...(selectedLang !== 'hi' ? { fontFamily: 'Georgia, "Times New Roman", serif' } : {}),
                   fontWeight: '300',
                   opacity: isTranslating ? 0.4 : 0.85,
                   color: '#333'
                 }}
               >
                 {summary}
              </div>

              {/* Fallback indicator */}
              {summaryData?.is_fallback && (
                <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded border" style={{ backgroundColor: '#fffbe6', borderColor: '#ffe58f' }}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#ad6800' }}>
                    <AlertTriangle size={12} className="inline mr-1" aria-hidden="true" />
                    {summaryData.source === 'description' ? 'Limited summary (from description)' : summaryData.source === 'placeholder' ? 'Summary unavailable' : 'Partial summary'}
                  </span>
                  <button
                    onClick={handleRetrySummary}
                    className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded hover:bg-amber-100 transition-colors"
                    style={{ color: '#ad6800' }}
                  >
                    <RefreshCw size={12} className="inline mr-1" aria-hidden="true" /> Retry
                  </button>
                </div>
              )}

              {/* Audio Player for TTS */}
              {summaryData?.audio_available && summaryData?.summary && (
                <div className="mt-4 pt-3 border-t border-slate-300 dark:border-slate-600">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] uppercase tracking-widest text-slate-500">Listen to Summary</span>
                  </div>
                  <Suspense fallback={<div className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>}>
                    <AudioPlayer 
                      text={summaryData.summary} 
                      language={selectedLang}
                      forceLightTheme
                      className="bg-slate-50 px-3 rounded-lg"
                    />
                  </Suspense>
                </div>
              )}
            
            {/* Horizontal Line Separator */}
            <div className="border-t border-black mt-3" ></div>
            
            {/* Action Footer */}
            <div className="px-4 py-2" style={{backgroundColor: '#ececec'}}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                {/* Icon Buttons - Like & Comment */}
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => setIsCommentsOpen(true)}
                    className="p-1.5 hover:opacity-60 transition-opacity"
                    title="Comments"
                    style={{color: '#333'}}
                  >
                    <MessageCircle size={20} aria-hidden="true" />
                  </button>
                  <button 
                    onClick={() => setIsLiked(!isLiked)}
                    className="p-1.5 hover:opacity-60 transition-opacity"
                    title="Like"
                    style={{color: '#333'}}
                  >
                    <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                </div>

                <div className="hidden sm:block h-4 w-px" style={{backgroundColor: '#333', opacity: 0.3}}></div>

                {/* Action Buttons */}
                <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="text-[9px] sm:text-[10px] font-normal uppercase tracking-widest text-slate-700 px-2 py-1 rounded hover:text-white hover:bg-indigo-600 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={handleReadFullArticle}
                    className="text-[9px] sm:text-[10px] font-normal uppercase tracking-widest border border-slate-800 px-2.5 sm:px-3 py-1 text-slate-900 bg-[#ececec] hover:text-white hover:border-indigo-600 hover:bg-indigo-600 transition-colors"
                  >
                    Read Full Article
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} title="Comments" accent="comments">
        <Suspense fallback={<div className="py-8 flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
          <CommentSection articleId={article.id} articleTitle={article.title} />
        </Suspense>
      </Modal>

      {/* ✅ Report Misleading Modal */}
      <Modal isOpen={showReportModal} onClose={() => setShowReportModal(false)} title="Report Misleading Content">
        <div className="p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Help improve our AI by reporting potentially misleading or inaccurate content.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Why do you think this is misleading?</label>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Optional: Describe the issue..."
              className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowReportModal(false)}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleReportMisleading}
              disabled={isSubmittingFeedback}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmittingFeedback ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

// Display name for React DevTools
NewsCard.displayName = 'NewsCard';
