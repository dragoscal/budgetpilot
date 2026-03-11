import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { Upload, Brain, Tag, Users, Eye, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import StepUpload from '../components/import/StepUpload';
import StepAnalyze from '../components/import/StepAnalyze';
import StepMapCategories from '../components/import/StepMapCategories';
import StepMapPeople from '../components/import/StepMapPeople';
import StepPreview from '../components/import/StepPreview';
import StepImport from '../components/import/StepImport';
import HelpButton from '../components/HelpButton';

const STEPS = [
  { key: 'upload', icon: Upload },
  { key: 'analyze', icon: Brain },
  { key: 'categories', icon: Tag },
  { key: 'people', icon: Users },
  { key: 'preview', icon: Eye },
  { key: 'import', icon: CheckCircle2 },
];

export default function ImportBudget() {
  const { t } = useTranslation();
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [parsedData, setParsedData] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [extractedData, setExtractedData] = useState([]);
  const [categoryMappings, setCategoryMappings] = useState({});
  const [personMappings, setPersonMappings] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [importResult, setImportResult] = useState(null);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const reset = useCallback(() => {
    setStep(0);
    setParsedData(null);
    setSelectedSheet(0);
    setYear(new Date().getFullYear());
    setAiAnalysis(null);
    setExtractedData([]);
    setCategoryMappings({});
    setPersonMappings({});
    setTransactions([]);
    setImportResult(null);
  }, []);

  const stepLabels = [
    t('import.stepUpload'), t('import.stepAnalyze'), t('import.stepCategories'),
    t('import.stepPeople'), t('import.stepPreview'), t('import.stepImport'),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={20} className="text-accent" />
        <h1 className="page-title mb-0">{t('import.title')}</h1>
        <HelpButton section="import" />
      </div>
      <p className="text-sm text-cream-500 -mt-4">{t('import.subtitle')}</p>

      {/* Step indicator */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-white shadow-md'
                    : isDone
                      ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-700 dark:text-accent-300'
                      : 'bg-cream-200 dark:bg-dark-border text-cream-400'
                }`}>
                  {isDone ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                </div>
                <span className={`text-[10px] mt-1 text-center leading-tight ${
                  isActive ? 'text-accent-700 dark:text-accent-300 font-medium' : 'text-cream-400'
                }`}>
                  {stepLabels[i]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mt-[-14px] rounded-full transition-colors ${
                  i < step ? 'bg-accent-300 dark:bg-accent-500/40' : 'bg-cream-200 dark:bg-dark-border'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="card">
        {step === 0 && (
          <StepUpload
            parsedData={parsedData}
            setParsedData={setParsedData}
            selectedSheet={selectedSheet}
            setSelectedSheet={setSelectedSheet}
            year={year}
            setYear={setYear}
            onNext={next}
          />
        )}
        {step === 1 && (
          <StepAnalyze
            rawGrid={parsedData?.sheets[selectedSheet]?.rawGrid}
            aiAnalysis={aiAnalysis}
            setAiAnalysis={setAiAnalysis}
            extractedData={extractedData}
            setExtractedData={setExtractedData}
            setCategoryMappings={setCategoryMappings}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 2 && (
          <StepMapCategories
            extractedData={extractedData}
            categoryMappings={categoryMappings}
            setCategoryMappings={setCategoryMappings}
            aiSuggestions={aiAnalysis?.categoryMappingSuggestions || {}}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <StepMapPeople
            extractedData={extractedData}
            personMappings={personMappings}
            setPersonMappings={setPersonMappings}
            effectiveUserId={effectiveUserId}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <StepPreview
            extractedData={extractedData}
            categoryMappings={categoryMappings}
            personMappings={personMappings}
            year={year}
            currency={user?.defaultCurrency || 'RON'}
            effectiveUserId={effectiveUserId}
            transactions={transactions}
            setTransactions={setTransactions}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 5 && (
          <StepImport
            transactions={transactions}
            importResult={importResult}
            setImportResult={setImportResult}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
