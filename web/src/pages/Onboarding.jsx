import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { CURRENCIES, ACCOUNT_TYPES, ONBOARDING_BUDGET_DEFAULTS } from '../lib/constants';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { accounts as accountsApi, budgets as budgetsApi, transactions as txApi, settings as settingsApi } from '../lib/api';
import { generateId, formatDateISO } from '../lib/helpers';
import { Wallet, ArrowRight, ArrowLeft, Check, Sparkles, Upload, History } from 'lucide-react';
import CSVImport from '../components/CSVImport';
import { suggestBudgetsFromHistory } from '../lib/predictions';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const { t, language, setLanguage, languages } = useTranslation();
  const { categories } = useCategories();

  const STEPS = [
    t('onboarding.stepWelcome'),
    t('onboarding.stepAccount'),
    t('onboarding.stepImport'),
    t('onboarding.stepBudgets'),
    t('onboarding.stepAi'),
  ];
  const [step, setStep] = useState(0);
  const isNavigatingRef = useRef(false);

  // Handle browser back button — navigate between steps instead of leaving
  useEffect(() => {
    window.history.pushState({ onboarding: true }, '');

    const onPopState = () => {
      window.history.pushState({ onboarding: true }, '');
      setStep((prev) => Math.max(0, prev - 1));
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const goNext = () => {
    window.history.pushState({ onboarding: true }, '');
    setStep(step + 1);
  };

  const goPrev = () => {
    setStep(step - 1);
  };

  // Step 0 — Welcome
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [currency, setCurrency] = useState(user?.defaultCurrency || 'RON');

  // Step 1 — First account
  const [accountName, setAccountName] = useState('Main Account');
  const [accountType, setAccountType] = useState('checking');
  const [accountBalance, setAccountBalance] = useState('');

  // Step 2 — Import (optional)
  const [importedTransactions, setImportedTransactions] = useState([]);
  const [importError, setImportError] = useState(null);

  // Step 3 — Budgets
  const budgetCategories = ['groceries', 'dining', 'transport', 'shopping', 'entertainment'];
  const [budgetAmounts, setBudgetAmounts] = useState({});

  // Step 4 — AI
  const [apiKey, setApiKey] = useState('');

  const handleImportResult = useCallback((result) => {
    if (result?.transactions?.length > 0) {
      setImportedTransactions(result.transactions);
      setImportError(null);
      toast.success(t('addTransaction.transactionsAdded', { count: result.transactions.length }));
    }
  }, [toast, t]);

  const handleImportError = useCallback((msg) => {
    setImportError(msg);
    toast.error(msg);
  }, [toast]);

  const handleUseSuggestions = () => {
    const defaults = ONBOARDING_BUDGET_DEFAULTS[currency] || ONBOARDING_BUDGET_DEFAULTS.RON;
    setBudgetAmounts({ ...defaults });
  };

  const handleFinish = async () => {
    try {
      // Save settings (syncs to server if connected)
      await settingsApi.set('defaultCurrency', currency);
      await settingsApi.set('userName', displayName);
      await settingsApi.set('language', language);
      await updateProfile({ name: displayName, defaultCurrency: currency, onboardingComplete: true });

      // Create account if filled
      const uid = user?.id || 'local';
      if (accountName && accountBalance) {
        const acctType = ACCOUNT_TYPES.find((t) => t.id === accountType);
        await accountsApi.create({
          id: generateId(),
          name: accountName,
          type: accountType,
          balance: Number(accountBalance) || 0,
          currency,
          icon: acctType?.icon || '🏦',
          color: '#14b8a6',
          userId: uid,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        });
      }

      // Save imported transactions
      if (importedTransactions.length > 0) {
        for (const tx of importedTransactions) {
          await txApi.create({ ...tx, userId: uid, currency });
        }
      }

      // Create budgets
      for (const [catId, amount] of Object.entries(budgetAmounts)) {
        if (Number(amount) > 0) {
          await budgetsApi.create({
            id: generateId(),
            category: catId,
            amount: Number(amount),
            currency,
            rollover: false,
            month: formatDateISO(new Date()).slice(0, 7),
            userId: uid,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Save API key if provided (syncs to server so it works across devices)
      if (apiKey.trim()) {
        await settingsApi.set('anthropicApiKey', apiKey.trim());
      }

      toast.success(t('onboarding.setupComplete'));
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const canNext = () => {
    if (step === 0) return displayName.trim().length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fadeUp">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i <= step
                    ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                    : 'bg-cream-300 text-cream-600 dark:bg-dark-border dark:text-cream-500'
                }`}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-cream-900 dark:bg-cream-100' : 'bg-cream-300 dark:bg-dark-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-success/10 rounded-lg mb-3">
                  <Wallet className="w-7 h-7 text-success" />
                </div>
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.welcome')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">{t('onboarding.letsSetup')}</p>
              </div>
              {/* Language selector */}
              <div>
                <label className="label">{t('onboarding.language')}</label>
                <div className="flex gap-2">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLanguage(lang.code)}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-colors ${
                        language === lang.code
                          ? 'border-cream-900 bg-cream-900/5 dark:border-cream-100 dark:bg-cream-100/5'
                          : 'border-cream-300 hover:border-cream-400 dark:border-dark-border'
                      }`}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      {lang.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{t('onboarding.whatName')}</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('onboarding.namePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">{t('onboarding.primaryCurrency')}</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {t(`currencies.${c.code}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 1: First account */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.addFirstAccount')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">{t('onboarding.trackMoney')}</p>
              </div>
              <div>
                <label className="label">{t('onboarding.accountName')}</label>
                <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={t('onboarding.accountNamePlaceholder')} />
              </div>
              <div>
                <label className="label">{t('onboarding.accountType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.slice(0, 4).map((at) => (
                    <button
                      key={at.id}
                      type="button"
                      onClick={() => setAccountType(at.id)}
                      className={`p-3 rounded-xl border text-left text-sm transition-colors ${
                        accountType === at.id
                          ? 'border-cream-900 bg-cream-900/5 dark:border-cream-100 dark:bg-cream-100/5'
                          : 'border-cream-300 hover:border-cream-400 dark:border-dark-border'
                      }`}
                    >
                      <span className="text-lg mr-2">{at.icon}</span>
                      {t(`accountTypes.${at.id}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{t('onboarding.currentBalance')}</label>
                <input
                  type="number"
                  className="input"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
            </div>
          )}

          {/* Step 2: Import Data (optional) */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-500/10 rounded-lg mb-3">
                  <Upload className="w-7 h-7 text-accent-500" />
                </div>
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.importData')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">{t('onboarding.importDescription')}</p>
              </div>
              {importedTransactions.length > 0 ? (
                <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-center">
                  <Check className="w-8 h-8 text-success mx-auto mb-2" />
                  <p className="text-sm font-medium">{importedTransactions.length} {t('common.transactions')} {t('addTransaction.saved')}</p>
                </div>
              ) : (
                <CSVImport onResult={handleImportResult} onError={handleImportError} />
              )}
              {importError && (
                <p className="text-xs text-danger">{importError}</p>
              )}
            </div>
          )}

          {/* Step 3: Budgets */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.setMonthlyBudgets')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">{t('onboarding.budgetsOptional')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUseSuggestions}
                  className="btn-secondary flex-1 text-sm"
                >
                  {t('onboarding.useSuggestions')}
                </button>
                {importedTransactions.length > 0 && (
                  <button
                    onClick={() => {
                      const suggestions = suggestBudgetsFromHistory(importedTransactions, currency);
                      const newAmounts = {};
                      for (const s of suggestions) {
                        newAmounts[s.category] = s.suggestedAmount;
                      }
                      setBudgetAmounts(newAmounts);
                      toast.success(t('onboarding.suggestedBudgets'));
                    }}
                    className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"
                  >
                    <History size={14} /> {t('onboarding.createFromHistory')}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {/* Show the fixed budget categories, plus any extra from imported history */}
                {(() => {
                  const extraCats = Object.keys(budgetAmounts).filter(
                    (id) => !budgetCategories.includes(id) && id !== 'income' && id !== 'transfer'
                  );
                  const allCats = [...budgetCategories, ...extraCats];
                  return allCats.map((catId) => {
                    const cat = categories.find((c) => c.id === catId);
                    if (!cat) return null;
                    const defaults = ONBOARDING_BUDGET_DEFAULTS[currency] || ONBOARDING_BUDGET_DEFAULTS.RON;
                    return (
                      <div key={catId} className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center">{cat.icon}</span>
                        <span className="text-sm font-medium flex-1">{getCategoryLabel(cat, t)}</span>
                        <input
                          type="number"
                          className="input w-32"
                          placeholder={defaults[catId]?.toString() || '0'}
                          value={budgetAmounts[catId] || ''}
                          onChange={(e) => setBudgetAmounts((prev) => ({ ...prev, [catId]: e.target.value }))}
                          inputMode="decimal"
                        />
                        <span className="text-xs text-cream-500 w-8">{currency === 'RON' ? 'lei' : CURRENCIES.find((c) => c.code === currency)?.symbol}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Step 4: AI Setup */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-info/10 rounded-lg mb-3">
                  <Sparkles className="w-7 h-7 text-info" />
                </div>
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.aiPowered')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">
                  {t('onboarding.aiDesc')}
                </p>
              </div>
              <div>
                <label className="label">{t('onboarding.anthropicKey')}</label>
                <input
                  type="password"
                  className="input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <p className="text-xs text-cream-500 mt-1.5">
                  {t('onboarding.keyStoredLocally')}
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-cream-200 dark:border-dark-border">
            {step > 0 ? (
              <button onClick={goPrev} className="btn-ghost flex items-center gap-1">
                <ArrowLeft size={16} /> {t('common.back')}
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <button
                onClick={goNext}
                disabled={!canNext()}
                className="btn-primary flex items-center gap-1 disabled:opacity-50"
              >
                {step === 2 ? t('onboarding.skipImport') : t('common.next')} <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleFinish} className="btn-primary flex items-center gap-1">
                <Check size={16} /> {t('onboarding.finishSetup')}
              </button>
            )}
          </div>

          {/* Skip */}
          <button
            onClick={handleFinish}
            className="w-full text-center text-xs text-cream-500 hover:text-cream-700 mt-4"
          >
            {step < STEPS.length - 1 ? t('onboarding.skipSetup') : t('onboarding.skipStep')}
          </button>
        </div>
      </div>
    </div>
  );
}
