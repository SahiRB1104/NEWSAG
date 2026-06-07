import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Lightbulb, Target, TrendingUp, BarChart3 } from 'lucide-react';

interface QualityMetrics {
  total_samples?: number;
  verified_labels_percentage?: number;
  verified_labels_count?: number;
  duplicate_rate?: number;
  average_confidence?: number;
  class_balance_status?: string;
  missing_values_count?: number;
  warning_message?: string;
}

interface DataImprovementTip {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  impact: string;
  actions: string[];
  estimatedImprovement: string;
}

interface DataImprovementTipsProps {
  sentimentQuality: QualityMetrics;
  credibilityQuality: QualityMetrics;
}

const generateTips = (modelName: string, metrics: QualityMetrics): DataImprovementTip[] => {
  const tips: DataImprovementTip[] = [];

  if (!metrics || Object.keys(metrics).length === 0) {
    return tips;
  }

  const totalSamples = metrics.total_samples || 0;
  const confidence = metrics.average_confidence || 0;
  const classBalance = metrics.class_balance_status || '';
  const duplicateRate = metrics.duplicate_rate || 0;
  const verifiedPercentage = metrics.verified_labels_percentage || 0;

  // Tip 1: Low Sample Size
  if (totalSamples < 50) {
    tips.push({
      id: `${modelName}-low-samples`,
      title: '⚠️ Insufficient Training Data',
      severity: 'critical',
      description: `Only ${totalSamples} samples detected. This is below the recommended minimum of 100 samples for reliable model training.`,
      impact: 'Model may overfit, resulting in poor generalization on new data.',
      actions: [
        'Collect at least 100-200 diverse samples from your news sources',
        'Use data augmentation techniques to expand your dataset',
        'Consider leveraging external datasets if available',
        'Prioritize collecting edge-case examples that challenge the model',
      ],
      estimatedImprovement: '15-25% accuracy improvement',
    });
  } else if (totalSamples < 100) {
    tips.push({
      id: `${modelName}-minimal-samples`,
      title: '⚠️ Limited Training Data',
      severity: 'warning',
      description: `You have ${totalSamples} samples. While workable, this is still below the ideal threshold.`,
      impact: 'Model performance may plateau; limited diversity in training data.',
      actions: [
        'Aim for 150+ samples for better results',
        'Focus on collecting high-quality, diverse examples',
        'Validate model performance on a held-out test set',
      ],
      estimatedImprovement: '10-15% accuracy improvement',
    });
  }

  // Tip 2: Class Imbalance
  if (classBalance && classBalance.toLowerCase().includes('imbalanced')) {
    tips.push({
      id: `${modelName}-class-imbalance`,
      title: '⚖️ Class Imbalance Detected',
      severity: 'warning',
      description: 'Your dataset has unequal distribution of classes. The model may be biased toward the majority class.',
      impact: 'Poor performance on minority class; misleading accuracy metrics.',
      actions: [
        'Oversample the minority class to balance the dataset',
        'Use weighted loss functions during training',
        'Collect more samples from underrepresented categories',
        'Consider stratified cross-validation for more reliable evaluation',
      ],
      estimatedImprovement: '10-20% improvement in minority class recall',
    });
  }

  // Tip 3: Low Confidence Score
  if (confidence < 0.6 && confidence > 0) {
    tips.push({
      id: `${modelName}-low-confidence`,
      title: '🎯 Model Confidence Is Low',
      severity: confidence < 0.5 ? 'critical' : 'warning',
      description: `Average confidence score is ${confidence.toFixed(2)}, indicating uncertainty in predictions.`,
      impact: 'Predictions may be unreliable; model needs better training data.',
      actions: [
        'Review low-confidence predictions for patterns or missing features',
        'Collect more representative training examples',
        'Validate label quality - some training labels might be incorrect',
        'Consider adding more discriminative features or text preprocessing',
      ],
      estimatedImprovement: '20-30% confidence improvement',
    });
  }

  // Tip 4: High Duplicate Rate
  if (duplicateRate > 5) {
    tips.push({
      id: `${modelName}-duplicates`,
      title: '🔄 High Duplicate Rate',
      severity: 'warning',
      description: `${duplicateRate}% duplicate articles detected. This skews model training.`,
      impact: 'Model learns the same patterns repeatedly; reduced data diversity.',
      actions: [
        'Use the CSV import tool to identify and remove duplicates',
        'Implement article deduplication in your data pipeline',
        'Focus on collecting unique, diverse articles',
      ],
      estimatedImprovement: '5-10% accuracy improvement',
    });
  }

  // Tip 5: Unverified Labels
  if (verifiedPercentage < 80 && verifiedPercentage > 0) {
    tips.push({
      id: `${modelName}-unverified-labels`,
      title: '✓ Label Quality Needs Attention',
      severity: 'warning',
      description: `Only ${verifiedPercentage}% of labels are verified. Many labels may be automatically assigned or inconsistent.`,
      impact: 'Model learns from potentially incorrect labels; reduced accuracy ceiling.',
      actions: [
        'Prioritize manual verification of labels',
        'Review auto-assigned labels for consistency',
        'Establish clear labeling guidelines for consistency',
        'Use the Credibility Queue or Sentiment Feedback tools for manual labeling',
      ],
      estimatedImprovement: '15-25% accuracy improvement',
    });
  }

  // Tip 6: Missing Values
  if (metrics.missing_values_count && metrics.missing_values_count > 0) {
    tips.push({
      id: `${modelName}-missing-values`,
      title: '❌ Missing Data Fields',
      severity: 'info',
      description: `${metrics.missing_values_count} rows have missing values or required fields.`,
      impact: 'These rows are excluded from training; reduces effective dataset size.',
      actions: [
        'Ensure all required fields are populated before import',
        'Clean data files before uploading',
        'Use data validation rules in your CSV pipeline',
      ],
      estimatedImprovement: '5% effective dataset size increase',
    });
  }

  return tips;
};

export const DataImprovementTips: React.FC<DataImprovementTipsProps> = ({
  sentimentQuality,
  credibilityQuality,
}) => {
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<'sentiment' | 'credibility' | 'all'>('all');

  const sentimentTips = generateTips('sentiment', sentimentQuality);
  const credibilityTips = generateTips('credibility', credibilityQuality);

  const allTips = [
    ...sentimentTips.map((tip) => ({ ...tip, model: 'sentiment' })),
    ...credibilityTips.map((tip) => ({ ...tip, model: 'credibility' })),
  ];

  const filteredTips = activeModel === 'all' 
    ? allTips 
    : allTips.filter((tip) => tip.model === activeModel);

  const criticalCount = filteredTips.filter((t) => t.severity === 'critical').length;
  const warningCount = filteredTips.filter((t) => t.severity === 'warning').length;

  const severityConfig = {
    critical: { color: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', icon: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' },
    warning: { color: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200' },
    info: { color: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', icon: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' },
  };

  if (filteredTips.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-center">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">✓ Your dataset looks great!</p>
        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">No critical issues detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Lightbulb size={18} className="text-amber-500" />
            Data Improvement Tips
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {criticalCount > 0 && <span className="font-semibold text-red-600 dark:text-red-400">{criticalCount} critical</span>}
            {criticalCount > 0 && warningCount > 0 && <span className="mx-1">•</span>}
            {warningCount > 0 && <span className="font-semibold text-amber-600 dark:text-amber-400">{warningCount} warnings</span>}
            {criticalCount === 0 && warningCount === 0 && <span>General recommendations</span>}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'sentiment', label: 'Sentiment' },
            { key: 'credibility', label: 'Credibility' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveModel(tab.key as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeModel === tab.key
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tips List */}
      <div className="space-y-2">
        {filteredTips.map((tip) => {
          const config = severityConfig[tip.severity];
          const isExpanded = expandedTip === tip.id;

          return (
            <div
              key={tip.id}
              className={`rounded-lg border ${config.border} ${config.color} overflow-hidden transition-all`}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedTip(isExpanded ? null : tip.id)}
                className="w-full px-3 py-2 flex items-start gap-3 hover:opacity-75 transition-opacity"
              >
                <AlertTriangle size={16} className={`${config.icon} mt-0.5 shrink-0`} />
                
                <div className="flex-1 text-left min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{tip.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{tip.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${config.badge}`}>
                    {tip.severity.charAt(0).toUpperCase() + tip.severity.slice(1)}
                  </span>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-current border-opacity-10 px-3 py-3 space-y-3 bg-opacity-50">
                  {/* Impact */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <TrendingUp size={13} /> Impact
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{tip.impact}</p>
                  </div>

                  {/* Actions */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                      <Target size={13} /> Recommended Actions
                    </p>
                    <ul className="space-y-1.5">
                      {tip.actions.map((action, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0">{idx + 1}.</span>
                          <span className="text-xs text-slate-600 dark:text-slate-400">{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Estimated Improvement */}
                  <div className="bg-white/40 dark:bg-slate-900/40 rounded p-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <BarChart3 size={13} /> Estimated Impact
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold text-emerald-700 dark:text-emerald-400">
                      {tip.estimatedImprovement}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="text-center pt-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          💡 <span className="font-semibold">Pro Tip:</span> Address critical issues first for maximum impact.
        </p>
      </div>
    </div>
  );
};

export default DataImprovementTips;
