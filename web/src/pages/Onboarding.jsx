import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CURRENCIES, CATEGORIES, ACCOUNT_TYPES } from '../lib/constants';
import { accounts as accountsApi, budgets as budgetsApi, settings as settingsApi } from '../lib/api';
import { generateId, formatDateISO } from '../lib/helpers';
import { Wallet, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

const STEPS = ['Welcome', 'Account', 'Budgets', 'AI Setup'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
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

      toast.success('Setup complete! Welcome to BudgetPilot.');
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
                <h2 className="text-2xl font-heading font-bold">Welcome to BudgetPilot</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">Let's set up your account in a few quick steps.</p>
              </div>
              <div>
                <label className="label">What should we call you?</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Primary currency</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 1: First account */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-heading font-bold">Add your first account</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">Track your money across accounts.</p>
              </div>
              <div>
                <label className="label">Account name</label>
                <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. BT Checking" />
              </div>
              <div>
                <label className="label">Account type</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAccountType(t.id)}
                      className={`p-3 rounded-xl border text-left text-sm transition-colors ${
                        accountType === t.id
                          ? 'border-cream-900 bg-cream-900/5 dark:border-cream-100 dark:bg-cream-100/5'
                          : 'border-cream-300 hover:border-cream-400 dark:border-dark-border'
                      }`}
                    >
                      <span className="text-lg mr-2">{t.icon}</span>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Current balance</label>
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
                <h2 className="text-2xl font-heading font-bold">Set monthly budgets</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">Optional — you can always change these later.</p>
              </div>
              <div className="space-y-3">
                {budgetCategories.map((catId) => {
                  const cat = CATEGORIES.find((c) => c.id === catId);
                  return (
                    <div key={catId} className="flex items-center gap-3">
                      <span className="text-xl w-8 text-center">{cat.icon}</span>
                      <span className="text-sm font-medium flex-1">{cat.name}</span>
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
                <h2 className="text-2xl font-heading font-bold">AI-powered features</h2>
                <p className="text-cream-700 dark:text-cream-500 mt-1">
                  Optionally scan receipts and add expenses with natural language.
                </p>
              </div>
              <div>
                <label className="label">Anthropic API Key (optional)</label>
                <input
                  type="password"
                  className="input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <p className="text-xs text-cream-500 mt-1.5">
                  Stored locally — never sent anywhere except directly to Anthropic's API.
                  You can add this later in Settings.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-cream-200 dark:border-dark-border">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="btn-ghost flex items-center gap-1">
                <ArrowLeft size={16} /> Back
              </button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="btn-primary flex items-center gap-1 disabled:opacity-50"
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleFinish} className="btn-primary flex items-center gap-1">
                <Check size={16} /> Finish setup
              </button>
            )}
          </div>

          {/* Skip */}
          <button
            onClick={handleFinish}
            className="w-full text-center text-xs text-cream-500 hover:text-cream-700 mt-4"
          >
            {step < STEPS.length - 1 ? 'Skip setup and start using BudgetPilot' : 'Skip this step'}
          </button>
        </div>
      </div>
    </div>
  );
}
