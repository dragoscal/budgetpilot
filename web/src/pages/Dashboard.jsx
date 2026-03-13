import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/LanguageContext';
import { transactions as txApi, budgets as budgetsApi, goals as goalsApi, recurring as recurringApi, accounts as accountsApi } from '../lib/api';
import { formatCurrency, percentOf, sumBy, sumAmountsMultiCurrency, groupBy, trendIndicator, getCategoryById, sortByDate, getRecurringDueToday, splitRecurringDue, generateId } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { settings as settingsApi } from '../lib/api';
import { getCachedRates } from '../lib/exchangeRates';
import { predictMonthlySpending, predictEndOfMonthBalance, getSpendingAnomalies } from '../lib/predictions';
import { getBillSuggestions, dismissSuggestion } from '../lib/billSuggestions';
import { checkAndNotifyBudgetAlerts, checkAndNotifyRecurringDue } from '../lib/notifications';
import { addNotification } from '../lib/notificationStore';
import StatCard from '../components/StatCard';
import BudgetBar from '../components/BudgetBar';
import TransactionRow from '../components/TransactionRow';
import MonthPicker from '../components/MonthPicker';
import EmptyState from '../components/EmptyState';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SyncIndicator from '../components/SyncIndicator';
import SpendingPsychology from '../components/SpendingPsychology';
import HelpButton from '../components/HelpButton';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PiggyBank, CalendarDays, ArrowRight, PlusCircle, Landmark, Eye, EyeOff, Camera, Zap, RotateCcw, AlertTriangle, Bell, Flame, X, Heart, Settings, ChevronUp, ChevronDown, Lightbulb, Target, GripVertical, User, Home, BookOpen, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';


export default function Dashboard() {
  const navigate = useNavigate();
  const { user, effectiveUserId } = useAuth();
  // eslint-disable-next-line no-unused-vars -- context available for future use
  const hideAmountsCtx = useHideAmounts();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [prevTransactions, setPrevTransactions] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [goalsList, setGoals] = useState([]);
  const [recurringList, setRecurring] = useState([]);
  const [accountsList, setAccounts] = useState([]);
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);

  const [manualBillsDue, setManualBillsDue] = useState([]);
  const [autoBillsDue, setAutoBillsDue] = useState([]);
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [billAmounts, setBillAmounts] = useState({});

  // Single master toggle for hiding all amounts
  const [hidden, setHidden] = useState(false);

  // All transactions (not just current month) for predictions
  const [allTransactions, setAllTransactions] = useState([]);

  // Scope filter: 'all' | 'personal' | 'household'
  const [scopeFilter, setScopeFilter] = useState(() => localStorage.getItem('lumet_dashboard_scope') || 'all');
  const handleScopeChange = useCallback((newScope) => {
    setScopeFilter(newScope);
    localStorage.setItem('lumet_dashboard_scope', newScope);
  }, []);

  // ─── Widget customization ──────────────────────────────
  const WIDGET_DEFAULTS = [
    { id: 'quickStats', visible: true },
    { id: 'healthScore', visible: true },
    { id: 'spendingChart', visible: true },
    { id: 'topCategories', visible: true },
    { id: 'budgetOverview', visible: true },
    { id: 'predictions', visible: true },
    { id: 'billSuggestions', visible: true },
    { id: 'spendingPsychology', visible: true },
    { id: 'recentTransactions', visible: true },
  ];

  const WIDGET_LABELS = {
    quickStats: 'dashboard.quickStats',
    healthScore: 'dashboard.healthScoreWidget',
    spendingChart: 'dashboard.spendingChartWidget',
    topCategories: 'dashboard.topCategories',
    budgetOverview: 'dashboard.budgetOverview',
    predictions: 'dashboard.predictions',
    billSuggestions: 'dashboard.billSuggestions',
    spendingPsychology: 'psychology.title',
    recentTransactions: 'dashboard.recentTransactionsWidget',
  };

  const [widgetConfig, setWidgetConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('bp_dashboardWidgets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return WIDGET_DEFAULTS;
  });
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [dragOverWidget, setDragOverWidget] = useState(null);

  const saveWidgetConfig = useCallback((config) => {
    setWidgetConfig(config);
    localStorage.setItem('bp_dashboardWidgets', JSON.stringify(config));
  }, []);

  const isWidgetVisible = useCallback((id) => {
    const w = widgetConfig.find((w) => w.id === id);
    return w ? w.visible : true;
  }, [widgetConfig]);

  const toggleWidget = useCallback((id) => {
    const updated = widgetConfig.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    saveWidgetConfig(updated);
  }, [widgetConfig, saveWidgetConfig]);

  const moveWidget = useCallback((id, direction) => {
    const idx = widgetConfig.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= widgetConfig.length) return;
    const updated = [...widgetConfig];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    saveWidgetConfig(updated);
  }, [widgetConfig, saveWidgetConfig]);

  const resetWidgets = useCallback(() => {
    saveWidgetConfig(WIDGET_DEFAULTS);
  }, [saveWidgetConfig]);

  // Bill suggestion dismissals trigger re-render
  const [billSuggestionVersion, setBillSuggestionVersion] = useState(0);

  // ─── Stat card ordering + visibility (draggable) ──────
  const STAT_CARD_ALL = [
    { id: 'totalSpent', visible: true },
    { id: 'totalIncome', visible: true },
    { id: 'net', visible: true },
    { id: 'budgetLeft', visible: true },
    { id: 'dailyAvg', visible: true },
    { id: 'netWorth', visible: true },
  ];

  const STAT_CARD_LABELS = {
    totalSpent: 'dashboard.totalSpent',
    totalIncome: 'dashboard.totalIncome',
    net: 'dashboard.net',
    budgetLeft: 'dashboard.budgetLeft',
    dailyAvg: 'dashboard.dailyAvg',
    netWorth: 'dashboard.netWorth',
  };

  const [statCardConfig, setStatCardConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('bp_statCardConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
          // Merge: ensure any new cards from defaults are added
          const ids = parsed.map(s => s.id);
          const missing = STAT_CARD_ALL.filter(s => !ids.includes(s.id));
          return [...parsed, ...missing];
        }
      }
    } catch {}
    return STAT_CARD_ALL;
  });
  const [draggedStat, setDraggedStat] = useState(null);
  const [dragOverStat, setDragOverStat] = useState(null);
  const [showStatSettings, setShowStatSettings] = useState(false);

  const saveStatCardConfig = useCallback((config) => {
    setStatCardConfig(config);
    localStorage.setItem('bp_statCardConfig', JSON.stringify(config));
  }, []);

  const toggleStatCard = useCallback((id) => {
    const updated = statCardConfig.map(s => s.id === id ? { ...s, visible: !s.visible } : s);
    saveStatCardConfig(updated);
  }, [statCardConfig, saveStatCardConfig]);

  const resetStatCards = useCallback(() => {
    saveStatCardConfig(STAT_CARD_ALL);
  }, [saveStatCardConfig]);

  // Version counter to discard stale fetches when month/user changes rapidly
  const loadVersion = useRef(0);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [allTx, budgets, goals, rec, accts, ratesData] = await Promise.all([
        txApi.getAll({ userId: effectiveUserId }),
        budgetsApi.getAll({ userId: effectiveUserId }),
        goalsApi.getAll({ userId: effectiveUserId }),
        recurringApi.getAll({ userId: effectiveUserId }),
        accountsApi.getAll({ userId: effectiveUserId }),
        getCachedRates(),
      ]);
      if (loadVersion.current !== version) return; // Stale — discard
      setRates(ratesData);

      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const prevStart = startOfMonth(subMonths(month, 1));
      const prevEnd = endOfMonth(subMonths(month, 1));

      const monthTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
      const prevTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= prevStart && d <= prevEnd;
      });

      setAllTransactions(allTx);
      setTransactions(monthTx);
      setPrevTransactions(prevTx);
      setBudgets(budgets);
      setGoals(goals);
      const activeRec = rec.filter((r) => r.active !== false);
      setRecurring(activeRec);
      setAccounts(accts);

      // Check for recurring items due this month — split by manual/auto
      const { manual, auto } = splitRecurringDue(activeRec, allTx);
      setManualBillsDue(manual);
      setAutoBillsDue(auto);

      // Welcome card check
      try { const seen = await settingsApi.get('hasSeenWelcome'); if (!seen) setShowWelcome(true); } catch (e) {}
    } catch (err) {
      if (loadVersion.current === version) console.error('Dashboard load error:', err);
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  }, [month, effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Notification checks (run once when data is loaded) ─────
  useEffect(() => {
    if (loading || transactions.length === 0) return;
    const runNotificationChecks = async () => {
      try {
        // Check budget alerts and send OS notifications
        await checkAndNotifyBudgetAlerts(transactions, effectiveUserId);
        // Store budget alerts in notification center
        const { checkBudgetAlerts } = await import('../lib/smartFeatures');
        const alerts = await checkBudgetAlerts(transactions, effectiveUserId);
        for (const alert of alerts) {
          await addNotification({
            type: alert.type === 'over' ? 'budget_exceeded' : alert.type === 'pace' ? 'pace_alert' : 'budget_warning',
            title: alert.type === 'over' ? t('notifications.budgetExceeded') : alert.type === 'pace' ? t('notifications.paceAlert') : t('notifications.budgetWarning'),
            message: alert.message,
            actionUrl: '/budgets',
          });
        }
        // Check recurring due and send OS notifications
        const allDue = [...manualBillsDue, ...autoBillsDue];
        if (allDue.length > 0) {
          await checkAndNotifyRecurringDue(allDue);
        }
        // Separate notifications for manual vs auto — manual needs action
        if (manualBillsDue.length > 0) {
          await addNotification({
            type: 'recurring_due',
            title: t('dashboard.manualBillsDue'),
            message: `${manualBillsDue.length} bill(s) need confirmation: ${manualBillsDue.map(r => r.name).join(', ')}`,
            actionUrl: '/',
          });
        }
        if (autoBillsDue.length > 0) {
          await addNotification({
            type: 'recurring_due',
            title: t('dashboard.autoBillsTitle'),
            message: `${autoBillsDue.length} auto-debit bill(s): ${autoBillsDue.map(r => r.name).join(', ')}`,
            actionUrl: '/',
          });
        }
      } catch (err) {
        // Notifications are non-critical — don't block the dashboard
        console.error('Notification check error:', err);
      }
    };
    runNotificationChecks();
  }, [loading, transactions.length, budgetsList.length, manualBillsDue.length, autoBillsDue.length]);

  // Apply scope filter to transactions
  const scopedTx = useMemo(() => {
    if (scopeFilter === 'all') return transactions;
    return transactions.filter((tx) => {
      const txScope = tx.scope || 'personal';
      return txScope === scopeFilter;
    });
  }, [transactions, scopeFilter]);

  const scopedPrevTx = useMemo(() => {
    if (scopeFilter === 'all') return prevTransactions;
    return prevTransactions.filter((tx) => {
      const txScope = tx.scope || 'personal';
      return txScope === scopeFilter;
    });
  }, [prevTransactions, scopeFilter]);

  const stats = useMemo(() => {
    const currency = user?.defaultCurrency || 'RON';
    const expenses = scopedTx.filter((t) => t.type === 'expense');
    const income = scopedTx.filter((t) => t.type === 'income');
    const prevExpenses = scopedPrevTx.filter((t) => t.type === 'expense');

    const totalSpent = sumAmountsMultiCurrency(expenses, currency, rates);
    const totalIncome = sumAmountsMultiCurrency(income, currency, rates);
    const prevTotalSpent = sumAmountsMultiCurrency(prevExpenses, currency, rates);
    const net = totalIncome - totalSpent;
    const totalBudget = sumBy(budgetsList, 'amount');
    const budgetRemaining = totalBudget - totalSpent;
    const now = new Date();
    const selYear = month.getFullYear();
    const selMonth = month.getMonth() + 1;
    const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1;
    const daysPassed = isCurrentMonth
      ? now.getDate()
      : new Date(selYear, selMonth, 0).getDate(); // total days in that month
    const dailyAvg = daysPassed > 0 ? totalSpent / daysPassed : 0;
    const netWorth = sumBy(accountsList, (a) =>
      ['credit_card', 'loan'].includes(a.type) ? -(a.balance || 0) : (a.balance || 0)
    );

    // "In My Pocket" — income minus budgeted minus upcoming bills
    const recurringTotal = sumAmountsMultiCurrency(recurringList, currency, rates);
    const inMyPocket = totalIncome - totalSpent - Math.max(0, recurringTotal - totalSpent);

    return {
      totalSpent, totalIncome, net, budgetRemaining, dailyAvg, netWorth, inMyPocket, totalBudget,
      prevTotalSpent,
      spentTrend: trendIndicator(totalSpent, prevTotalSpent),
    };
  }, [scopedTx, scopedPrevTx, budgetsList, accountsList, recurringList, rates, user]);

  // Spending velocity: compare current pace to last month
  const velocity = useMemo(() => {
    const now = new Date();
    const selYear = month.getFullYear();
    const selMonth = month.getMonth();
    const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth();
    // For current month: use actual days elapsed. For past months: use total days in month.
    const daysElapsed = isCurrentMonth
      ? now.getDate()
      : new Date(selYear, selMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(selYear, selMonth, 0).getDate();

    const currentDailyRate = daysElapsed > 0 ? stats.totalSpent / daysElapsed : 0;
    const prevDailyRate = daysInPrevMonth > 0 ? stats.prevTotalSpent / daysInPrevMonth : 0;

    if (prevDailyRate === 0) return null;
    const change = Math.round(((currentDailyRate - prevDailyRate) / prevDailyRate) * 100);
    return { change, faster: change > 0 };
  }, [stats.totalSpent, stats.prevTotalSpent, month]);

  // Chart data — cumulative spending per day (with multi-currency conversion)
  const spendingChartData = useMemo(() => {
    const cur = user?.defaultCurrency || 'RON';
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    const expenses = scopedTx.filter((t) => t.type === 'expense');

    let cumulative = 0;
    return days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayExpenses = expenses.filter((t) => t.date === dayStr);
      const daySpend = dayExpenses.length > 0 ? Math.round(sumAmountsMultiCurrency(dayExpenses, cur, rates) * 100) / 100 : 0;
      cumulative += daySpend;
      return { date: format(day, 'dd'), daily: daySpend, cumulative };
    });
  }, [scopedTx, month, rates, user]);

  // Category pie chart data (translated names + multi-currency conversion)
  const categoryData = useMemo(() => {
    const cur = user?.defaultCurrency || 'RON';
    const expenses = scopedTx.filter((t) => t.type === 'expense');
    const grouped = groupBy(expenses, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => {
        const cat = getCategoryById(catId);
        return { name: t('categories.' + catId), value: Math.round(sumAmountsMultiCurrency(txs, cur, rates) * 100) / 100, color: cat.color, icon: cat.icon };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [scopedTx, rates, user, t]);

  // Budget progress — sorted by most critical (with multi-currency conversion)
  const budgetProgress = useMemo(() => {
    const cur = user?.defaultCurrency || 'RON';
    return budgetsList
      .map((b) => {
        const catExpenses = scopedTx.filter((t) => t.type === 'expense' && t.category === b.category);
        const spent = catExpenses.length > 0 ? Math.round(sumAmountsMultiCurrency(catExpenses, cur, rates) * 100) / 100 : 0;
        return { ...b, spent, pct: percentOf(spent, b.amount) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [budgetsList, scopedTx, rates, user]);

  // Smart alerts
  const smartAlerts = useMemo(() => {
    const alerts = [];

    // Budget alerts
    budgetProgress.forEach((b) => {
      if (b.pct >= 100) {
        alerts.push({ type: 'danger', icon: AlertTriangle, text: t('dashboard.budgetExceeded', { name: getCategoryLabel(getCategoryById(b.category), t), pct: b.pct }), link: '/budgets' });
      } else if (b.pct >= 80) {
        alerts.push({ type: 'warning', icon: AlertTriangle, text: t('dashboard.budgetAt', { name: getCategoryLabel(getCategoryById(b.category), t), pct: b.pct }), link: '/budgets' });
      }
    });

    // Upcoming bill in next 2 days
    const today = new Date().getDate();
    recurringList.forEach((r) => {
      const billingDay = r.billingDay || 1;
      const daysUntil = billingDay >= today ? billingDay - today : 30 - today + billingDay;
      if (daysUntil <= 2 && daysUntil >= 0) {
        const text = daysUntil === 0 ? t('dashboard.dueToday', { name: r.name }) : daysUntil === 1 ? t('dashboard.dueTomorrow', { name: r.name }) : t('dashboard.dueIn2Days', { name: r.name });
        alerts.push({ type: 'info', icon: Bell, text, link: '/recurring' });
      }
    });

    // Month-over-month spending comparison (at same point in month) — uses scopedPrevTx to respect scope filter
    if (stats.totalSpent > 0 && scopedPrevTx.length > 0) {
      const prevExpenses = scopedPrevTx.filter((tx) => tx.type === 'expense');
      const dayOfMonth = new Date().getDate();
      const prevAtThisPoint = sumBy(
        prevExpenses.filter((tx) => new Date(tx.date).getDate() <= dayOfMonth),
        'amount'
      );
      if (prevAtThisPoint > 0) {
        const diff = ((stats.totalSpent - prevAtThisPoint) / prevAtThisPoint) * 100;
        if (diff > 30) {
          alerts.push({ type: 'warning', icon: TrendingUp, text: t('dashboard.spendingHigher', { pct: Math.round(diff) }) });
        }
      }
    }

    return alerts.slice(0, 3);
  }, [budgetProgress, recurringList, stats, scopedPrevTx, t]);

  // No-spend days count
  const noSpendDays = useMemo(() => {
    const expenses = scopedTx.filter((t) => t.type === 'expense');
    const spendDates = new Set(expenses.map((t) => t.date));
    const start = startOfMonth(month);
    const today = new Date();
    const end = today < endOfMonth(month) ? today : endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    return days.filter((d) => !spendDates.has(format(d, 'yyyy-MM-dd'))).length;
  }, [scopedTx, month]);

  // Financial Health Score (0-100)
  const healthScore = useMemo(() => {
    let score = 0;

    // 1. Budget adherence: % of budgets under limit (0-30 points)
    if (budgetProgress.length > 0) {
      const underBudget = budgetProgress.filter((b) => b.pct <= 100).length;
      score += Math.round((underBudget / budgetProgress.length) * 30);
    } else {
      score += 15; // neutral if no budgets set
    }

    // 2. Savings rate: (income - expenses) / income (0-25 points)
    if (stats.totalIncome > 0) {
      const savingsRate = Math.max(0, (stats.totalIncome - stats.totalSpent) / stats.totalIncome);
      score += Math.round(Math.min(savingsRate, 0.5) / 0.5 * 25);
    }

    // 3. No-spend days: days with zero spending / days elapsed (0-15 points)
    const now = new Date();
    const daysElapsed = now.getDate();
    if (daysElapsed > 0) {
      const noSpendRatio = noSpendDays / daysElapsed;
      score += Math.round(noSpendRatio * 15);
    }

    // 4. Emergency fund: savings account balance > 3 months expenses (0-15 points)
    const savingsAccts = accountsList.filter((a) => a.type === 'savings');
    const savingsBalance = sumBy(savingsAccts, 'balance');
    const threeMonthExpenses = stats.totalSpent * 3;
    if (threeMonthExpenses > 0 && savingsBalance > 0) {
      const fundRatio = Math.min(savingsBalance / threeMonthExpenses, 1);
      score += Math.round(fundRatio * 15);
    } else if (stats.totalSpent === 0) {
      score += 15;
    }

    // 5. Debt-to-income: lower is better (0-15 points)
    const debtAccts = accountsList.filter((a) => ['credit_card', 'loan'].includes(a.type));
    const totalDebt = sumBy(debtAccts, 'balance');
    if (stats.totalIncome > 0) {
      const dti = totalDebt / stats.totalIncome;
      if (dti <= 0) {
        score += 15;
      } else if (dti < 0.36) {
        score += Math.round((1 - dti / 0.36) * 15);
      }
    } else if (totalDebt === 0) {
      score += 15;
    }

    return Math.min(100, Math.max(0, score));
  }, [budgetProgress, stats, noSpendDays, accountsList]);

  const healthLabel = useMemo(() => {
    if (healthScore >= 80) return { key: 'dashboard.healthExcellent', color: 'text-success', bg: 'bg-success/10', ring: 'ring-success/30', strokeColor: '#059669' };
    if (healthScore >= 60) return { key: 'dashboard.healthGood', color: 'text-info', bg: 'bg-info/10', ring: 'ring-info/30', strokeColor: '#0ea5e9' };
    if (healthScore >= 40) return { key: 'dashboard.healthFair', color: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/30', strokeColor: '#d97706' };
    return { key: 'dashboard.healthPoor', color: 'text-danger', bg: 'bg-danger/10', ring: 'ring-danger/30', strokeColor: '#e11d48' };
  }, [healthScore]);

  // Month comparison text (uses scoped prev transactions to match stats)
  const monthComparison = useMemo(() => {
    if (scopedPrevTx.length === 0 || stats.totalSpent === 0) return null;
    const prevExpenses = scopedPrevTx.filter((t) => t.type === 'expense');
    const dayOfMonth = new Date().getDate();
    const prevAtThisPoint = sumBy(
      prevExpenses.filter((t) => new Date(t.date).getDate() <= dayOfMonth),
      'amount'
    );
    if (prevAtThisPoint === 0) return null;
    const diff = ((stats.totalSpent - prevAtThisPoint) / prevAtThisPoint) * 100;
    return {
      pct: Math.abs(Math.round(diff)),
      direction: diff > 0 ? 'more' : 'less',
      isGood: diff <= 0,
    };
  }, [stats, scopedPrevTx]);

  const recentTx = useMemo(() => sortByDate(scopedTx).slice(0, 6), [scopedTx]);

  // ─── Spending Predictions ──────────────────────────────
  const predictions = useMemo(() => {
    if (allTransactions.length === 0) return null;
    const monthlyPred = predictMonthlySpending(allTransactions, 3);
    if (monthlyPred.monthsUsed < 2) return null;
    const endOfMonth = predictEndOfMonthBalance(scopedTx, stats.totalIncome - stats.totalSpent);
    const anomalies = getSpendingAnomalies(allTransactions);
    return { monthly: monthlyPred, endOfMonth, anomalies };
  }, [allTransactions, scopedTx, stats]);

  // ─── Bill Suggestions ─────────────────────────────────
  const billSuggestions = useMemo(() => {
    // billSuggestionVersion is a dependency to force re-compute on dismiss
    void billSuggestionVersion;
    return getBillSuggestions(allTransactions, recurringList);
  }, [allTransactions, recurringList, billSuggestionVersion]);

  const handleDismissSuggestion = useCallback((id) => {
    dismissSuggestion(id);
    setBillSuggestionVersion((v) => v + 1);
  }, []);

  const upcomingBills = useMemo(() => {
    const today = new Date().getDate();
    return recurringList
      .filter((r) => (r.billingDay || 1) >= today)
      .sort((a, b) => (a.billingDay || 1) - (b.billingDay || 1))
      .slice(0, 5);
  }, [recurringList]);

  const handleAutoCreateRecurring = async () => {
    setCreatingRecurring(true);
    try {
      const cur = user?.defaultCurrency || 'RON';
      const now = new Date();
      for (const item of autoBillsDue) {
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // Clamp billing day to actual days in current month to avoid invalid dates like Feb-31
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const billingDay = String(Math.min(item.billingDay || 1, daysInMonth)).padStart(2, '0');
        await txApi.create({
          id: generateId(),
          type: 'expense',
          amount: item.amount,
          currency: item.currency || cur,
          category: item.category || 'bills',
          merchant: item.name || item.merchant,
          description: `Auto-created from recurring: ${item.name || item.merchant}`,
          date: `${currentMonth}-${billingDay}`,
          source: 'recurring',
          recurringId: item.id,
          userId: effectiveUserId,
          createdAt: new Date().toISOString(),
        });
      }
      setAutoBillsDue([]);
      toast.success(t('dashboard.autoBillsCreated'));
      loadData();
    } catch (err) {
      console.error('Failed to auto-create recurring:', err);
      toast.error(err.message);
    } finally {
      setCreatingRecurring(false);
    }
  };

  const handleConfirmManualBill = async (item) => {
    try {
      const cur = user?.defaultCurrency || 'RON';
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      // Clamp billing day to actual days in current month to avoid invalid dates like Feb-31
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const billingDay = String(Math.min(item.billingDay || 1, daysInMonth)).padStart(2, '0');
      const finalAmount = Number(billAmounts[item.id]) || item.amount || 0;
      await txApi.create({
        id: generateId(),
        type: 'expense',
        amount: finalAmount,
        currency: item.currency || cur,
        category: item.category || 'bills',
        merchant: item.name || item.merchant,
        description: `Confirmed payment: ${item.name || item.merchant}`,
        date: `${currentMonth}-${billingDay}`,
        source: 'recurring',
        recurringId: item.id,
        userId: effectiveUserId,
        createdAt: new Date().toISOString(),
      });
      setManualBillsDue((prev) => prev.filter((b) => b.id !== item.id));
      toast.success(`${t('dashboard.confirmPaid')}: ${item.name}`);
      loadData();
    } catch (err) {
      console.error('Failed to confirm manual bill:', err);
      toast.error(err.message);
    }
  };

  const dismissWelcome = async () => {
    setShowWelcome(false);
    try { await settingsApi.set('hasSeenWelcome', true); } catch (e) {}
  };

  // Welcome progress steps
  const welcomeProgress = useMemo(() => {
    const steps = [
      { key: 'transactions', done: allTransactions.length > 0 },
      { key: 'budgets', done: budgetsList.length > 0 },
      { key: 'accounts', done: accountsList.length > 1 },
      { key: 'recurring', done: recurringList.length > 0 },
    ];
    return { steps, done: steps.filter(s => s.done).length, total: steps.length };
  }, [allTransactions, budgetsList, accountsList, recurringList]);

  if (loading) return <SkeletonPage />;

  const currency = user?.defaultCurrency || 'RON';

  // Show fewer recent transactions on mobile
  const recentTxMobile = recentTx.slice(0, 3);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="page-title mb-0 !text-lg sm:!text-2xl">
            {user?.name ? t('dashboard.hey', { name: user.name.split(' ')[0] }) : t('dashboard.title')}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-xs sm:text-sm text-cream-600 dark:text-cream-500 hidden sm:block">{t('dashboard.financialOverview')}</p>
            <span className="md:hidden"><SyncIndicator mobile /></span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <HelpButton section="dashboard" />
          <div className="relative">
            <button
              onClick={() => setShowWidgetSettings(!showWidgetSettings)}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-cream-100 dark:hover:bg-cream-800 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-all"
              title={t('dashboard.customizeWidgets')}
            >
              <Settings size={16} />
            </button>
            {showWidgetSettings && (
              <>
                <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={() => setShowWidgetSettings(false)} />
                <div className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-full sm:w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-dark-card border-t sm:border border-cream-200 dark:border-dark-border sm:rounded-xl rounded-t-xl shadow-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cream-500">{t('dashboard.widgetOrder')}</h4>
                    <button onClick={resetWidgets} className="text-[10px] text-accent-600 dark:text-accent-400 font-medium hover:underline">
                      {t('dashboard.resetDefaults')}
                    </button>
                  </div>
                  <p className="text-[10px] text-cream-400 mb-1">{t('dashboard.widgetDragHint')}</p>
                  <div className="space-y-1">
                    {widgetConfig.map((w, idx) => (
                      <div
                        key={w.id}
                        draggable="true"
                        onDragStart={(e) => {
                          setDraggedWidget(w.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverWidget(w.id);
                        }}
                        onDragLeave={() => {
                          setDragOverWidget((prev) => prev === w.id ? null : prev);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedWidget && draggedWidget !== w.id) {
                            const fromIdx = widgetConfig.findIndex((wc) => wc.id === draggedWidget);
                            const toIdx = widgetConfig.findIndex((wc) => wc.id === w.id);
                            if (fromIdx >= 0 && toIdx >= 0) {
                              const updated = [...widgetConfig];
                              const [moved] = updated.splice(fromIdx, 1);
                              updated.splice(toIdx, 0, moved);
                              saveWidgetConfig(updated);
                            }
                          }
                          setDraggedWidget(null);
                          setDragOverWidget(null);
                        }}
                        onDragEnd={() => {
                          setDraggedWidget(null);
                          setDragOverWidget(null);
                        }}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${
                          draggedWidget === w.id ? 'opacity-50 cursor-grabbing' :
                          dragOverWidget === w.id ? 'bg-accent-50 dark:bg-accent-500/15 ring-1 ring-accent/30' :
                          'hover:bg-cream-50 dark:hover:bg-cream-800/30 cursor-grab'
                        }`}
                      >
                        <GripVertical size={12} className="text-cream-300 shrink-0" />
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={w.visible}
                            onChange={() => toggleWidget(w.id)}
                            className="w-3.5 h-3.5 rounded accent-accent-600"
                          />
                          <span className="text-xs font-medium">{t(WIDGET_LABELS[w.id] || w.id)}</span>
                        </label>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => moveWidget(w.id, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 rounded hover:bg-cream-200 dark:hover:bg-dark-border disabled:opacity-20"
                            title={t('dashboard.moveUp')}
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            onClick={() => moveWidget(w.id, 'down')}
                            disabled={idx === widgetConfig.length - 1}
                            className="p-0.5 rounded hover:bg-cream-200 dark:hover:bg-dark-border disabled:opacity-20"
                            title={t('dashboard.moveDown')}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setHidden(!hidden)}
            className="p-1.5 sm:p-2 rounded-xl hover:bg-cream-100 dark:hover:bg-cream-800 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-all"
            title={hidden ? t('dashboard.showAmounts') : t('dashboard.hideAmounts')}
          >
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>

      {/* Scope filter pills */}
      <div className="flex gap-1.5">
        {[
          { id: 'all', label: t('household.scopeAll') },
          { id: 'personal', label: t('household.scopePersonal'), icon: User },
          { id: 'household', label: t('household.scopeHousehold'), icon: Home },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => handleScopeChange(s.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
              scopeFilter === s.id
                ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-300 dark:border-accent-600/30 text-accent-700 dark:text-accent-300 shadow-sm'
                : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            {s.icon && <s.icon size={12} />}
            {s.label}
          </button>
        ))}
      </div>

      {/* Smart Alerts */}
      {smartAlerts.length > 0 && (
        <div className="space-y-2">
          {smartAlerts.map((alert, i) => (
            <Link
              key={i}
              to={alert.link || '#'}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                alert.type === 'danger' ? 'bg-danger/8 text-danger border border-danger/15 hover:bg-danger/12' :
                alert.type === 'warning' ? 'bg-warning/8 text-warning border border-warning/15 hover:bg-warning/12' :
                'bg-info/8 text-info border border-info/15 hover:bg-info/12'
              }`}
            >
              <alert.icon size={14} className="shrink-0" />
              <span className="flex-1">{alert.text}</span>
              <ArrowRight size={12} className="shrink-0 opacity-50" />
            </Link>
          ))}
        </div>
      )}

      {/* Welcome Card — shown once for new users */}
      {showWelcome && (
        <div className="card relative overflow-hidden border-accent-200 dark:border-accent-500/20">
          <button onClick={dismissWelcome} className="absolute top-3 right-3 p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 hover:text-cream-600 transition-colors z-10">
            <X size={16} />
          </button>
          <div className="relative">
            <h2 className="text-lg font-heading font-bold mb-1">
              {t('dashboard.welcomeTitle', { name: user?.name?.split(' ')[0] || '' })}
            </h2>
            <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">{t('dashboard.welcomeDesc')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <Link to="/add" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-accent/10 text-accent-700 dark:text-accent-300 text-xs font-medium hover:bg-accent/15 transition-colors">
                <PlusCircle size={16} /> {t('dashboard.welcomeAddTx')}
              </Link>
              <Link to="/budgets" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-success/10 text-success text-xs font-medium hover:bg-success/15 transition-colors">
                <Target size={16} /> {t('dashboard.welcomeBudget')}
              </Link>
              <Link to="/import-budget" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-info/10 text-info text-xs font-medium hover:bg-info/15 transition-colors">
                <Zap size={16} /> {t('dashboard.welcomeImport')}
              </Link>
              <Link to="/guide" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-warning/10 text-warning text-xs font-medium hover:bg-warning/15 transition-colors">
                <BookOpen size={16} /> {t('dashboard.welcomeGuide')}
              </Link>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {welcomeProgress.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-colors ${step.done ? 'bg-accent' : 'bg-cream-300 dark:bg-dark-border'}`} />
                    <span className={`text-[11px] font-medium ${step.done ? 'text-accent line-through' : 'text-cream-600 dark:text-cream-400'}`}>
                      {t(`dashboard.step${step.key.charAt(0).toUpperCase() + step.key.slice(1)}`)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-cream-500">{t('dashboard.welcomeProgress', { done: welcomeProgress.done, total: welcomeProgress.total })}</span>
                <button onClick={dismissWelcome} className="text-xs text-cream-500 hover:text-cream-700 dark:hover:text-cream-300 font-medium transition-colors">
                  {t('dashboard.welcomeDismiss')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Bills Due — need user confirmation */}
      {manualBillsDue.length > 0 && (
        <div className="card border-warning/30 bg-warning/5 dark:bg-warning/8 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <Bell size={16} className="text-warning" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{t('dashboard.manualBillsDue')}</h3>
                <p className="text-[11px] text-cream-500">{t('dashboard.manualBillsDesc', { count: manualBillsDue.length })}</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning text-xs font-bold">{manualBillsDue.length}</span>
          </div>
          <div className="divide-y divide-warning/10">
            {manualBillsDue.map((item) => {
              const cat = getCategoryById(item.category);
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-cream-500">{t('recurring.dayBilling', { day: item.billingDay || 1 })} · {getCategoryLabel(cat, t)}</p>
                  </div>
                  <div className="shrink-0">
                    {item.isVariable ? (
                      <input
                        type="number"
                        className="input w-24 text-sm text-right font-heading font-bold py-1"
                        value={billAmounts[item.id] ?? (item.amount || '')}
                        onChange={(e) => setBillAmounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder={item.amount ? String(item.amount) : '0.00'}
                        inputMode="decimal"
                      />
                    ) : (
                      <p className="text-sm font-heading font-bold money">{formatCurrency(item.amount, item.currency || currency)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleConfirmManualBill(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-success/15 text-success text-xs font-medium hover:bg-success/25 transition-colors flex items-center gap-1"
                    >
                      <Check size={12} /> {t('dashboard.confirmPaid')}
                    </button>
                    <button
                      onClick={() => setManualBillsDue((prev) => prev.filter((b) => b.id !== item.id))}
                      className="px-2 py-1.5 rounded-lg bg-cream-200/50 dark:bg-dark-border text-cream-500 text-xs font-medium hover:bg-cream-300 dark:hover:bg-cream-700 transition-colors"
                    >
                      {t('dashboard.skipPayment')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-debit Bills — show detail card */}
      {autoBillsDue.length > 0 && (
        <div className="card border-accent/20 bg-accent-50/50 dark:bg-accent-500/5 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Landmark size={16} className="text-accent-600 dark:text-accent-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{t('dashboard.autoBillsTitle')}</h3>
                <p className="text-[11px] text-cream-500">{t('dashboard.autoBillsDesc')}</p>
              </div>
            </div>
            <button
              onClick={handleAutoCreateRecurring}
              disabled={creatingRecurring}
              className="btn-primary text-xs shrink-0 disabled:opacity-50"
            >
              {creatingRecurring ? t('common.loading') : t('dashboard.recordAll')}
            </button>
          </div>
          <div className="divide-y divide-accent/10">
            {autoBillsDue.map((item) => {
              const cat = getCategoryById(item.category);
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium flex items-center gap-0.5">
                        <Landmark size={10} /> {t('recurring.autoLabel')}
                      </span>
                    </div>
                    <p className="text-[11px] text-cream-500">{t('recurring.dayBilling', { day: item.billingDay || 1 })} · {getCategoryLabel(cat, t)}</p>
                  </div>
                  <p className="text-sm font-heading font-bold money shrink-0">{formatCurrency(item.amount, item.currency || currency)}</p>
                </div>
              );
            })}
          </div>
          {autoBillsDue.length > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-accent/5 border-t border-accent/10">
              <span className="text-xs font-medium text-cream-600 dark:text-cream-400">{t('dashboard.totalDue')}</span>
              <span className="text-sm font-heading font-bold money">{formatCurrency(autoBillsDue.reduce((s, i) => s + (Number(i.amount) || 0), 0), currency)}</span>
            </div>
          )}
          <div className="px-4 pb-3 pt-1">
            <Link to="/recurring" className="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium flex items-center gap-1">
              {t('dashboard.viewRecurring')} <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <Link to="/add?tab=quick" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 text-sm font-medium whitespace-nowrap hover:bg-accent-100 dark:hover:bg-accent-500/15 transition-colors shrink-0">
          <Zap size={16} /> {t('dashboard.quickAdd')}
        </Link>
        <Link to="/add?tab=receipt" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cream-100 dark:bg-cream-800 text-cream-700 dark:text-cream-300 text-sm font-medium whitespace-nowrap hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors shrink-0">
          <Camera size={16} /> {t('dashboard.scanReceipt')}
        </Link>
        <Link to="/recurring" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cream-100 dark:bg-cream-800 text-cream-700 dark:text-cream-300 text-sm font-medium whitespace-nowrap hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors shrink-0">
          <RotateCcw size={16} /> {t('dashboard.recurring')}
        </Link>
        <Link to="/analytics" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-accent-200 dark:border-accent-500/20 text-accent-600 dark:text-accent-400 text-sm font-medium whitespace-nowrap hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors shrink-0">
          <TrendingUp size={16} /> {t('dashboard.analytics')}
        </Link>
      </div>

      {/* Widgets rendered in user-configured order */}
      {widgetConfig.map((w) => {
        if (!w.visible) return null;

        switch (w.id) {
          case 'quickStats': {
            const STAT_CARDS = {
              totalSpent: { label: t('dashboard.totalSpent'), value: formatCurrency(stats.totalSpent, currency), trend: stats.spentTrend, icon: TrendingDown, accent: '#e11d48' },
              totalIncome: { label: t('dashboard.totalIncome'), value: formatCurrency(stats.totalIncome, currency), icon: TrendingUp, accent: '#059669' },
              net: { label: t('dashboard.net'), value: formatCurrency(stats.net, currency), icon: DollarSign, accent: '#14b8a6' },
              budgetLeft: { label: t('dashboard.budgetLeft'), value: formatCurrency(Math.max(0, stats.budgetRemaining), currency), icon: PiggyBank, accent: '#d97706' },
              dailyAvg: { label: t('dashboard.dailyAvg'), value: formatCurrency(stats.dailyAvg, currency), icon: CalendarDays, accent: '#0ea5e9' },
              netWorth: { label: t('dashboard.netWorth'), value: formatCurrency(stats.netWorth, currency), icon: Landmark, accent: '#14b8a6' },
            };
            return (
              <div key="quickStats">
                {/* Stat card settings toggle */}
                <div className="relative flex items-center justify-end mb-1.5">
                  <button
                    onClick={() => setShowStatSettings(v => !v)}
                    className="flex items-center gap-1 text-[10px] sm:text-[11px] text-cream-500 dark:text-cream-400 hover:text-accent-600 dark:hover:text-accent-400 transition-colors"
                  >
                    <Settings size={12} />
                    <span className="hidden sm:inline">{t('dashboard.customizeStats')}</span>
                  </button>
                  {showStatSettings && (
                    <div className="absolute top-6 right-0 z-50 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-lg p-3 w-56">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-cream-700 dark:text-cream-200">{t('dashboard.statCards')}</p>
                        <button onClick={resetStatCards} className="text-[10px] text-accent-600 dark:text-accent-400 hover:underline">{t('common.reset')}</button>
                      </div>
                      {statCardConfig.map(s => (
                        <label key={s.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input type="checkbox" checked={s.visible} onChange={() => toggleStatCard(s.id)} className="accent-accent-600" />
                          <span className="text-xs text-cream-700 dark:text-cream-200">{t(STAT_CARD_LABELS[s.id] || s.id)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stat cards — draggable, horizontal scroll on mobile, grid on desktop */}
                <div className="grid grid-cols-3 gap-2 sm:gap-2.5 md:gap-3 md:overflow-visible">
                  {statCardConfig.filter(s => s.visible).map((statItem) => {
                    const card = STAT_CARDS[statItem.id];
                    if (!card) return null;
                    return (
                      <div
                        key={statItem.id}
                        draggable="true"
                        onDragStart={(e) => {
                          setDraggedStat(statItem.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', statItem.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (draggedStat && draggedStat !== statItem.id) setDragOverStat(statItem.id);
                        }}
                        onDragLeave={() => setDragOverStat((prev) => prev === statItem.id ? null : prev)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedStat && draggedStat !== statItem.id) {
                            const fromIdx = statCardConfig.findIndex(s => s.id === draggedStat);
                            const toIdx = statCardConfig.findIndex(s => s.id === statItem.id);
                            if (fromIdx >= 0 && toIdx >= 0) {
                              const updated = [...statCardConfig];
                              const [moved] = updated.splice(fromIdx, 1);
                              updated.splice(toIdx, 0, moved);
                              saveStatCardConfig(updated);
                            }
                          }
                          setDraggedStat(null);
                          setDragOverStat(null);
                        }}
                        onDragEnd={() => { setDraggedStat(null); setDragOverStat(null); }}
                        className={`min-w-0 transition-all ${
                          draggedStat === statItem.id ? 'opacity-40 scale-95' :
                          dragOverStat === statItem.id ? 'ring-2 ring-accent-400/50 ring-offset-2 dark:ring-offset-dark-bg scale-[1.02]' :
                          'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <StatCard {...card} hide={hidden} compact />
                      </div>
                    );
                  })}
                </div>

                {/* Spending velocity indicator */}
                {velocity && Math.abs(velocity.change) > 5 && (
                  <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                    velocity.faster
                      ? 'bg-warning/10 text-warning border border-warning/20'
                      : 'bg-success/10 text-success border border-success/20'
                  }`}>
                    {velocity.faster ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {t('dashboard.spendingVelocity', { pct: Math.abs(velocity.change), direction: velocity.faster ? t('dashboard.faster') : t('dashboard.slower') })}
                  </div>
                )}

                {/* In My Pocket + Month Comparison + No-spend days */}
                <div className="mt-4 card relative overflow-hidden border-success/20 !p-3 md:!p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 shrink-0">
                      <p className="text-[10px] md:text-[11px] font-bold text-success uppercase tracking-wider">{t('dashboard.inMyPocket')}</p>
                      <p className="text-xs md:text-sm text-cream-500 dark:text-cream-400 mt-0.5">{t('dashboard.safeToSpend')}</p>
                    </div>
                    <p className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-success money truncate">
                      {hidden ? '••••••' : formatCurrency(Math.max(0, stats.inMyPocket), currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 mt-2 pt-2 border-t border-success/10 flex-wrap">
                    {monthComparison && (
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${monthComparison.isGood ? 'text-success' : 'text-warning'}`}>
                        {monthComparison.isGood ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                        {t(monthComparison.isGood ? 'dashboard.lessLastMonth' : 'dashboard.moreLastMonth', { pct: monthComparison.pct })}
                      </span>
                    )}
                    {noSpendDays > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-accent-600 dark:text-accent-400">
                        <Flame size={12} /> {t(noSpendDays !== 1 ? 'dashboard.noSpendDaysPlural' : 'dashboard.noSpendDays', { count: noSpendDays })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          case 'healthScore':
            return (
              <div key="healthScore" className={`card !p-3 md:!p-4 ${healthLabel.bg} border ${healthLabel.ring} ring-1`}>
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-cream-200 dark:text-dark-border" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={healthLabel.strokeColor} strokeWidth="3" strokeDasharray={`${healthScore}, 100`} strokeLinecap="round" />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center text-sm font-heading font-bold ${healthLabel.color}`}>{healthScore}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Heart size={14} className={healthLabel.color} />
                      <p className="text-xs font-bold uppercase tracking-wider text-cream-600 dark:text-cream-400">{t('dashboard.healthScore')}</p>
                    </div>
                    <p className={`text-sm font-heading font-bold ${healthLabel.color}`}>{t(healthLabel.key)}</p>
                  </div>
                </div>
                <p className="text-xs text-cream-500 mt-2">
                  {healthScore > 80
                    ? t('health.excellent')
                    : healthScore >= 60
                    ? t('health.good')
                    : healthScore >= 40
                    ? t('health.needsWork')
                    : t('health.critical')
                  }
                </p>
              </div>
            );

          case 'spendingChart':
            return (
              <div key="spendingChart" className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="card !p-3 md:!p-5">
                  <h3 className="section-title">{t('dashboard.spendingTrend')}</h3>
                  {spendingChartData.length > 0 ? (
                    <div className="h-[140px] md:h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={spendingChartData}>
                          <defs>
                            <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1} />
                              <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: '12px' }}
                            formatter={(val) => [hidden ? '••••••' : formatCurrency(val, currency), '']}
                          />
                          <Area type="monotone" dataKey="cumulative" stroke={hidden ? 'transparent' : '#4F46E5'} fill={hidden ? 'transparent' : 'url(#spendGrad)'} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noSpendingData')}</p>
                  )}
                </div>

                {/* Goals & Bills previews alongside chart */}
                <div className="space-y-4">
                  <div className={`card !p-3 md:!p-5 ${goalsList.length === 0 ? 'hidden md:block' : ''}`}>
                    <div className="flex items-center justify-between mb-3 md:mb-4">
                      <h3 className="section-title mb-0">{t('dashboard.savingsGoals')}</h3>
                      <Link to="/goals" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">{t('common.viewAll')} <ArrowRight size={12} /></Link>
                    </div>
                    {goalsList.length > 0 ? (
                      <div className="space-y-3">
                        {goalsList.slice(0, 3).map((g) => {
                          const pct = percentOf(g.currentAmount || 0, g.targetAmount);
                          return (
                            <div key={g.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{g.icon || '🎯'} {g.name}</span>
                                <span className="text-cream-500">{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                                <div className="h-full bg-success rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: g.color || '#059669' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noGoals')}</p>
                    )}
                  </div>

                  <div className={`card !p-3 md:!p-5 ${upcomingBills.length === 0 ? 'hidden md:block' : ''}`}>
                    <div className="flex items-center justify-between mb-3 md:mb-4">
                      <h3 className="section-title mb-0">{t('dashboard.upcomingBills')}</h3>
                      <Link to="/recurring" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">{t('common.viewAll')} <ArrowRight size={12} /></Link>
                    </div>
                    {upcomingBills.length > 0 ? (
                      <div className="space-y-2">
                        {upcomingBills.map((r) => {
                          const cat = getCategoryById(r.category);
                          return (
                            <div key={r.id} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                <span>{cat.icon}</span>
                                <span>{r.name}</span>
                                <span className="text-xs text-cream-400">{t('dashboard.billDay', { day: r.billingDay })}</span>
                              </span>
                              <span className="font-heading font-bold money">{hidden ? '••••••' : formatCurrency(r.amount, r.currency || currency)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noBills')}</p>
                    )}
                  </div>
                </div>
              </div>
            );

          case 'topCategories':
            return (
              <div key="topCategories" className="card !p-3 md:!p-5">
                <h3 className="section-title">{t('dashboard.byCategory')}</h3>
                {categoryData.length > 0 ? (
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-[110px] h-[110px] md:w-[140px] md:h-[140px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} dataKey="value" innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="none">
                            {categoryData.map((d, i) => <Cell key={i} fill={hidden ? '#e7e5e4' : d.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {categoryData.slice(0, 5).map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hidden ? '#e7e5e4' : d.color }} />
                            {d.name}
                          </span>
                          <span className="font-medium money">{hidden ? '••••••' : formatCurrency(d.value, currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-cream-500 text-center py-6">{t('common.noData')}</p>
                )}
              </div>
            );

          case 'budgetOverview':
            return budgetProgress.length > 0 ? (
              <div key="budgetOverview" className="card !p-3 md:!p-5">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="section-title mb-0">{t('dashboard.budgetProgress')}</h3>
                  <Link to="/budgets" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">{t('common.viewAll')} <ArrowRight size={12} /></Link>
                </div>
                <div className="space-y-2.5 md:space-y-3">
                  {budgetProgress.map((b, idx) => (
                    <div key={b.id} className={idx >= 3 ? 'hidden md:block' : ''}>
                      <BudgetBar category={b.category} spent={b.spent} budgeted={b.amount} currency={b.currency || currency} compact hide={hidden} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          case 'predictions':
            return predictions ? (
              <div key="predictions" className="card !p-3 md:!p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={14} className="text-accent-600 dark:text-accent-400" />
                  <h3 className="section-title mb-0">{t('dashboard.predictions')}</h3>
                </div>
                <div className="space-y-3">
                  {/* Predicted end-of-month spending */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-cream-600 dark:text-cream-400">{t('dashboard.predictedSpending')}</p>
                      <p className="text-[11px] text-cream-500 mt-0.5">
                        {t('dashboard.daysLeft', { count: predictions.endOfMonth.daysLeft })} &middot; {t('dashboard.dailyRate', { amount: hidden ? '••••••' : formatCurrency(predictions.endOfMonth.dailyRate, currency) })}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="font-heading font-bold money text-lg">
                        {hidden ? '••••••' : formatCurrency(predictions.endOfMonth.predictedTotalSpend, currency)}
                      </span>
                      <span className={`text-xs font-medium flex items-center gap-0.5 ${
                        predictions.endOfMonth.trend === 'up' ? 'text-danger' :
                        predictions.endOfMonth.trend === 'down' ? 'text-success' : 'text-cream-400'
                      }`}>
                        {predictions.endOfMonth.trend === 'up' && <TrendingUp size={12} />}
                        {predictions.endOfMonth.trend === 'down' && <TrendingDown size={12} />}
                        {predictions.endOfMonth.trend === 'up' ? t('dashboard.trendUp') :
                         predictions.endOfMonth.trend === 'down' ? t('dashboard.trendDown') : t('dashboard.trendStable')}
                      </span>
                    </div>
                  </div>

                  {/* Spending anomalies */}
                  {predictions.anomalies.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cream-500 mb-2">{t('dashboard.spendingAnomalies')}</p>
                      <div className="space-y-1.5">
                        {predictions.anomalies.slice(0, 3).map((a) => {
                          const cat = getCategoryById(a.category);
                          return (
                            <div key={a.category} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
                              <span className="flex items-center gap-1.5">
                                <span>{cat.icon}</span>
                                <span className="font-medium">{cat.name}</span>
                              </span>
                              <span className="text-warning font-medium">{t('dashboard.aboveAverage', { pct: a.percentOver })}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null;

          case 'billSuggestions':
            return billSuggestions.length > 0 ? (
              <div key="billSuggestions" className="card !p-3 md:!p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={14} className="text-warning" />
                  <h3 className="section-title mb-0">{t('dashboard.billSuggestions')}</h3>
                </div>
                <div className="space-y-2">
                  {billSuggestions.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-cream-50 dark:bg-cream-800/20 border border-cream-200 dark:border-dark-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{s.title}</p>
                        <p className="text-[11px] text-cream-500 mt-0.5">{s.description}</p>
                        {s.potentialSaving > 0 && (
                          <p className="text-[11px] text-success font-medium mt-1">
                            {t('dashboard.potentialSaving', { amount: formatCurrency(s.potentialSaving, currency) })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDismissSuggestion(s.id)}
                        className="p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 hover:text-cream-600 transition-colors shrink-0"
                        title={t('dashboard.dismiss')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          case 'spendingPsychology':
            return (
              <SpendingPsychology key="spendingPsychology" transactions={transactions} currency={currency} hidden={hidden} />
            );

          case 'recentTransactions':
            return (
              <div key="recentTransactions" className="card !p-3 md:!p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="section-title mb-0">{t('dashboard.recentTransactions')}</h3>
                  <Link to="/transactions" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">{t('common.viewAll')} <ArrowRight size={12} /></Link>
                </div>
                {recentTx.length > 0 ? (
                  <>
                    <div className="divide-y divide-cream-100 dark:divide-dark-border md:hidden">
                      {recentTxMobile.map((tx) => <TransactionRow key={tx.id} transaction={tx} hide={hidden} defaultCurrency={currency} rates={rates} />)}
                    </div>
                    <div className="divide-y divide-cream-100 dark:divide-dark-border hidden md:block">
                      {recentTx.map((tx) => <TransactionRow key={tx.id} transaction={tx} hide={hidden} defaultCurrency={currency} rates={rates} />)}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={PlusCircle}
                    title={t('dashboard.noTransactions')}
                    description={t('dashboard.addFirst')}
                    action={t('dashboard.addTransaction')}
                    onAction={() => navigate('/add')}
                  />
                )}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
