import { useState, useEffect } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { processSpreadsheetStructure } from '../../lib/ai';
import { gridToAISample, extractDataFromGrid } from '../../lib/spreadsheetParser';
import { Brain, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, Calendar, Users, Tag } from 'lucide-react';

export default function StepAnalyze({ rawGrid, aiAnalysis, setAiAnalysis, extractedData, setExtractedData, setCategoryMappings, onNext, onBack }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    if (!rawGrid || rawGrid.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      const sample = gridToAISample(rawGrid, 40);
      const result = await processSpreadsheetStructure(sample);
      if (!result || !result.layout) {
        throw new Error('Invalid AI response');
      }
      // Ensure months/people arrays exist (flat-table may have them populated differently)
      if (!result.months) result.months = [];
      if (!result.people) result.people = [];
      setAiAnalysis(result);

      // Extract data using AI's structural map
      const data = extractDataFromGrid(rawGrid, result);
      setExtractedData(data);

      // Pre-load AI category suggestions
      if (result.categoryMappingSuggestions) {
        setCategoryMappings((prev) => ({ ...result.categoryMappingSuggestions, ...prev }));
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || t('import.analysisError'));
      toast.error(t('import.analysisError'));
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!aiAnalysis && rawGrid) {
      runAnalysis();
    }
  }, []); // Run once on mount

  return (
    <div className="space-y-5">
      <h3 className="section-title flex items-center gap-2"><Brain size={16} /> {t('import.stepAnalyze')}</h3>

      {analyzing && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-cream-500">{t('import.analyzing')}</p>
          <p className="text-xs text-cream-400">{t('import.analyzingHint')}</p>
        </div>
      )}

      {error && !analyzing && (
        <div className="flex flex-col items-center gap-3 py-8">
          <AlertTriangle size={32} className="text-danger" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={runAnalysis} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw size={14} /> {t('import.reanalyze')}
          </button>
        </div>
      )}

      {aiAnalysis && !analyzing && (
        <>
          {/* Analysis results */}
          <div className="bg-accent-50/50 dark:bg-accent-500/5 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-accent-700 dark:text-accent-300">{t('import.analysisComplete')}</p>

            {aiAnalysis.description && (
              <p className="text-xs text-cream-600 dark:text-cream-400 italic">{aiAnalysis.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Months */}
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{t('import.detectedMonths')}</p>
                  <p className="text-xs text-cream-500">
                    {(aiAnalysis.months || []).map((m) => m.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* People */}
              <div className="flex items-start gap-2">
                <Users size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{t('import.detectedPeople')}</p>
                  <p className="text-xs text-cream-500">
                    {(aiAnalysis.people || []).map((p) => p.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* Categories */}
              <div className="flex items-start gap-2">
                <Tag size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{t('import.detectedCategories')}</p>
                  <p className="text-xs text-cream-500">
                    {(aiAnalysis.categoryNames || []).length} {t('import.categoriesFound')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Extraction summary */}
          <div className="text-sm text-cream-600 dark:text-cream-400">
            {t('import.extractedRows', { count: extractedData.length })}
          </div>

          {/* Extracted data preview */}
          {extractedData.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-cream-200 dark:border-dark-border">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-cream-100 dark:bg-dark-border">
                    <th className="px-3 py-2 text-left">{t('import.month')}</th>
                    <th className="px-3 py-2 text-left">{t('import.person')}</th>
                    <th className="px-3 py-2 text-left">{t('import.category')}</th>
                    <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedData.slice(0, 15).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-cream-50 dark:bg-dark-card' : ''}>
                      <td className="px-3 py-1.5">{row.monthName}</td>
                      <td className="px-3 py-1.5">{row.person}</td>
                      <td className="px-3 py-1.5">{row.originalCategory}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {extractedData.length > 15 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-center text-cream-400">
                        ... +{extractedData.length - 15} {t('import.moreRows')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Re-analyze */}
          <button onClick={runAnalysis} className="btn-ghost text-xs flex items-center gap-1.5">
            <RefreshCw size={12} /> {t('import.reanalyze')}
          </button>

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={onBack} className="btn-ghost flex items-center gap-1">
              <ChevronLeft size={16} /> {t('common.back')}
            </button>
            <button onClick={onNext} disabled={extractedData.length === 0} className="btn-primary flex items-center gap-2">
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
