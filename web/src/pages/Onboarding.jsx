import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { CURRENCIES, CATEGORIES, ACCOUNT_TYPES } from '../lib/constants';
import { accounts as accountsApi, budgets as budgetsApi, settings as settingsApi } from '../lib/api';
import { generateId, formatDateISO } from '../lib/helpers';
import { Wallet, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const { t, language, setLanguage, languages } = useTranslation();

  const STEPS = [t('onboarding.stepWelcome'), t('onboarding.stepAccount'), t('onboarding.stepBudgets'), t('onboarding.stepAi')];
  const [step, setStep] = useState(0);

  // Step 1 — Welcome
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [currency, setCurrency] = useState(user?.defaultCurrency || 'RON');

  // Step 2 — First account
  const [accountName, setAccountName] = useState('Main Account');
  const [accountType, setAccountType] = useState('checking');
  const [accountBalance, setAccountBalance] = useState('');

  // Step 3 — Budgets
  const budgetCategories = ['groceries', 'dining', 'transport', 'shopping', 'entertainment'];
  const [budgetAmounts, setBudgetAmounts] = useState({});

  // Step 4 — AI
  const [apiKey, setApiKey] = useState('');

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
          color: '#6366f1',
          userId: uid,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        });
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
                <div className={`w-12 h-0.5 ${i < step ? 'bg-cream-900 dark:bg-cream-100' : 'bg-cream-300 dark:bg-dark-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-success/10 rounded-2xl mb-3">
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

          {/* Step 2: Budgets */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-heading font-bold">{t('onboarding.setMonthlyBudgets')}</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">{t('onboarding.budgetsOptional')}</p>
              </div>
              <div className="space-y-3">
                {budgetCategories.map((catId) => {
                  const cat = CATEGORIES.find((c) => c.id === catId);
                  return (
                    <div key={catId} className="flex items-center gap-3">
                      <span className="text-xl w-8 text-center">{cat.icon}</span>
                      <span className="text-sm font-medium flex-1">{t(`categories.${catId}`)}</span>
                      <input
                        type="number"
                        className="input w-32"
                        placeholder="0"
                        value={budgetAmounts[catId] || ''}
                        onChange={(e) => setBudgetAmounts((prev) => ({ ...prev, [catId]: e.target.value }))}
                        inputMode="decimal"
                      />
                      <span className="text-xs text-cream-500 w-8">{currency === 'RON' ? 'lei' : CURRENCIES.find((c) => c.code === currency)?.symbol}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: AI Setup */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-info/10 rounded-2xl mb-3">
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
              <button onClick={() => setStep(step - 1)} className="btn-ghost flex items-center gap-1">
                <ArrowLeft size={16} /> {t('common.back')}
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="btn-primary flex items-center gap-1 disabled:opacity-50"
              >
                {t('common.next')} <ArrowRight size={16} />
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
