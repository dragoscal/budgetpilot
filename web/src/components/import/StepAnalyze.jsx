import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { processSpreadsheetStructure } from '../../lib/ai';
import { gridToAISample, extractDataFromGrid } from '../../lib/spreadsheetParser';
import { Brain, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, Calendar, Users, Tag, Info } from 'lucide-react';

export default function StepAnalyze({ rawGrid, aiAnalysis, setAiAnalysis, extractedData, setExtractedData, setCategoryMappings, onNext, onBack }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const analyzingRef = useRef(false); // debounce guard

  const runAnalysis = useCallback(async () => {
    if (!rawGrid || rawGrid.length === 0) return;
    if (analyzingRef.current) return; // prevent double-click
    analyzingRef.current = true;
    setAnalyzing(true);
    setError(null);
    try {
      const sample = gridToAISample(rawGrid, 40);
      const result = await processSpreadsheetStructure(sample);

      // Validate AI response
      if (!result || typeof result !== 'object') {
        throw new Error(t('import.errorInvalidResponse') || 'AI returned an invalid response. Try re-analyzing.');
      }
      if (!result.layout) {
        throw new Error(t('import.errorNoLayout') || 'AI could not detect the spreadsheet layout. Try a different file or sheet.');
      }

      // Ensure months/people arrays exist (flat-table may have them populated differently)
      if (!result.months) result.months = [];
      if (!result.people) result.people = [];

      // Validate month numbers are in range
      result.months = result.months.filter((m) => m && m.monthNumber >= 1 && m.monthNumber <= 12);

      setAiAnalysis(result);

      // Extract data using AI's structural map
      const data = extractDataFromGrid(rawGrid, result);
      setExtractedData(data);

      // Pre-load AI category suggestions
      if (result.categoryMappingSuggestions) {
        setCategoryMappings((prev) => ({ ...result.categoryMappingSuggestions, ...prev }));
      }

      // Warn if extraction ratio is low
      const totalDataRows = rawGrid.length - (result.dataStartRow || 1);
      if (data.length === 0 && totalDataRows > 0) {
        setError(t('import.errorNoDataExtracted') || `AI detected the structure but no data could be extracted from ${totalDataRows} rows. The layout detection may be incorrect — try re-analyzing.`);
      } else if (totalDataRows > 5 && data.length < totalDataRows * 0.2) {
        // Less than 20% extraction rate — warn but don't block
        toast.warning(t('import.lowExtractionWarning') || `Only ${data.length} of ~${totalDataRows} rows extracted. Some rows may have missing amounts or categories.`);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      // Provide specific error messages based on error type
      let errorMsg = err.message || t('import.analysisError');
      if (err.message?.includes('API key') || err.message?.includes('api key') || err.message?.includes('No ')) {
        errorMsg = t('import.errorNoApiKey') || 'No AI API key configured. Go to Settings to add one.';
      } else if (err.message?.includes('timed out') || err.message?.includes('timeout')) {
        errorMsg = t('import.errorTimeout') || 'AI request timed out. Try again — the server may be busy.';
      } else if (err.message?.includes('NetworkError') || err.message?.includes('fetch') || err.message?.includes('network')) {
        errorMsg = t('import.errorNetwork') || 'Network error. Check your connection and try again.';
      }
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setAnalyzing(false);
      analyzingRef.current = false;
    }
  }, [rawGrid, setAiAnalysis, setExtractedData, setCategoryMappings, toast, t]);

  useEffect(() => {
    if (!aiAnalysis && rawGrid) {
      runAnalysis();
    }
  }, []); // Run once on mount

  // Count skipped rows for display
  const totalGridRows = rawGrid ? rawGrid.length - (aiAnalysis?.dataStartRow || 1) : 0;
  const skippedRows = totalGridRows > 0 ? Math.max(0, totalGridRows - extractedData.length) : 0;

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
          <p className="text-sm text-danger text-center max-w-md">{error}</p>
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

            {/* Layout type badge */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-700 dark:text-accent-300 font-medium">
                {aiAnalysis.layout === 'flat-table' ? 'Flat Table' : aiAnalysis.layout === 'monthly-columns' ? 'Monthly Columns' : aiAnalysis.layout === 'monthly-rows' ? 'Monthly Rows' : aiAnalysis.layout}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Months */}
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{t('import.detectedMonths')}</p>
                  <p className="text-xs text-cream-500">
                    {(aiAnalysis.months || []).length > 0
                      ? (aiAnalysis.months || []).map((m) => m.name).join(', ')
                      : <span className="italic">{t('import.none') || 'None detected'}</span>}
                  </p>
                </div>
              </div>

              {/* People */}
              <div className="flex items-start gap-2">
                <Users size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">{t('import.detectedPeople')}</p>
                  <p className="text-xs text-cream-500">
                    {(aiAnalysis.people || []).length > 0
                      ? (aiAnalysis.people || []).map((p) => p.name).join(', ')
                      : <span className="italic">{t('import.none') || 'None detected'}</span>}
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
            {skippedRows > 0 && (
              <span className="text-cream-400 ml-2">
                ({skippedRows} {t('import.rowsSkipped') || 'rows skipped — missing amount or category'})
              </span>
            )}
          </div>

          {/* Warning if no data extracted but analysis succeeded */}
          {extractedData.length === 0 && !error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/20">
              <Info size={14} className="text-warning mt-0.5 shrink-0" />
              <div className="text-xs text-warning space-y-1">
                <p>{t('import.noDataWarning') || 'No data could be extracted. This usually means:'}</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>{t('import.noDataReason1') || 'All amounts are zero or empty'}</li>
                  <li>{t('import.noDataReason2') || 'Category column is empty'}</li>
                  <li>{t('import.noDataReason3') || 'AI misidentified the spreadsheet structure'}</li>
                </ul>
                <p>{t('import.noDataAction') || 'Try re-analyzing or selecting a different sheet.'}</p>
              </div>
            </div>
          )}

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
          <button onClick={runAnalysis} disabled={analyzing} className="btn-ghost text-xs flex items-center gap-1.5">
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
