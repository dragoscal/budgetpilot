import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useSync } from '../contexts/SyncContext';
import { useTranslation } from '../contexts/LanguageContext';
import { getSetting, setSetting, getAllSettings } from '../lib/storage';
import { exportData, importData, clearData } from '../lib/api';
import { deleteAccount, changePassword } from '../lib/auth';
import { hasEncryptionKey, pushEncryptedKeys } from '../lib/crypto';
import { CURRENCIES, AI_PROVIDERS, HIDE_AMOUNTS_OPTIONS } from '../lib/constants';
import { getRates, fetchRates, getManualOverrides, setManualOverride, clearOverrides, getRatesUpdatedAt } from '../lib/exchangeRates';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Moon, Sun, Key, Globe, Database, Download, Upload, Trash2, AlertTriangle, MessageSquare, UserX, Bot, EyeOff, LogOut, CloudUpload, CheckCircle2, RefreshCw, DollarSign, Lock } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { hideAmounts, updateHideAmounts } = useHideAmounts();
  const { refreshStatus: refreshSyncStatus, syncNow } = useSync();
  const { t, language, setLanguage, languages } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [aiModel, setAiModel] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('RON');
  const [userName, setUserName] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');
  const [showClear, setShowClear] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [aiTestResult, setAiTestResult] = useState(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [keySyncStatus, setKeySyncStatus] = useState(null); // null | 'syncing' | 'synced' | 'local'
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({});
  const [rateOverrides, setRateOverrides] = useState({});
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null);
  const [ratesFetching, setRatesFetching] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await getAllSettings();
    setApiUrl(settings.apiUrl || '');
    setApiKey(settings.apiKey || '');
    setAnthropicKey(settings.anthropicApiKey || '');
    setOpenaiKey(settings.openaiApiKey || '');
    setOpenrouterKey(settings.openrouterApiKey || '');
    setAiProvider(settings.aiProvider || 'anthropic');
    setAiModel(settings.aiModel || '');
    setTelegramBotToken(settings.telegramBotToken || '');
    setTelegramChatId(settings.telegramChatId || '');
    setWebhookUrl(settings.webhookUrl || '');
    setDefaultCurrency(settings.defaultCurrency || user?.defaultCurrency || 'RON');
    setUserName(settings.userName || user?.name || '');

    // Load exchange rates
    try {
      const rates = await getRates(settings.defaultCurrency || 'RON');
      setExchangeRates(rates);
      const overrides = await getManualOverrides();
      setRateOverrides(overrides);
      const updAt = await getRatesUpdatedAt();
      setRatesUpdatedAt(updAt);
    } catch (err) {
      // Offline or network error — use default exchange rates
      console.error('Failed to load exchange rates:', err);
    }
  };

  const currentProvider = AI_PROVIDERS.find(p => p.id === aiProvider) || AI_PROVIDERS[0];

  const saveSettings = async () => {
    try {
      await setSetting('apiUrl', apiUrl.trim());
      await setSetting('apiKey', apiKey.trim());
      await setSetting('anthropicApiKey', anthropicKey.trim());
      await setSetting('openaiApiKey', openaiKey.trim());
      await setSetting('openrouterApiKey', openrouterKey.trim());
      await setSetting('aiProvider', aiProvider);
      await setSetting('aiModel', aiModel || currentProvider.defaultModel);
      await setSetting('hideAmounts', hideAmounts);
      await setSetting('telegramBotToken', telegramBotToken.trim());
      await setSetting('telegramChatId', telegramChatId.trim());
      await setSetting('webhookUrl', webhookUrl.trim());
      await setSetting('defaultCurrency', defaultCurrency);
      await setSetting('userName', userName);
      if (user) {
        await updateProfile({ name: userName, defaultCurrency });
      }
      // Refresh sync status (starts auto-sync if backend URL was just configured)
      await refreshSyncStatus();

      // Encrypt and sync AI keys to server if backend + encryption key available
      const anyAiKey = anthropicKey.trim() || openaiKey.trim() || openrouterKey.trim();
      if (apiUrl.trim() && hasEncryptionKey() && anyAiKey) {
        setKeySyncStatus('syncing');
        try {
          const ok = await pushEncryptedKeys({
            anthropicApiKey: anthropicKey.trim(),
            openaiApiKey: openaiKey.trim(),
            openrouterApiKey: openrouterKey.trim(),
            aiProvider,
            aiModel: aiModel || currentProvider.defaultModel,
          });
          setKeySyncStatus(ok ? 'synced' : 'local');
        } catch {
          setKeySyncStatus('local');
        }
      } else if (anyAiKey) {
        setKeySyncStatus('local');
      }

      toast.success(t('settings.saved'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const testConnection = async () => {
    if (!apiUrl) { setTestResult({ ok: false, msg: t('settings.noApiUrl') }); return; }
    try {
      const url = apiUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/api/health`);
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: res.ok, msg: res.ok ? `${t('settings.connected')} (${data.version || 'ok'})` : `${t('settings.error')}: ${res.status}` });
    } catch (err) {
      setTestResult({ ok: false, msg: t('settings.connectionFailed') });
    }
  };

  const testAiKey = async () => {
    const key = aiProvider === 'anthropic' ? anthropicKey : aiProvider === 'openai' ? openaiKey : openrouterKey;
    if (!key) { setAiTestResult({ ok: false, msg: t('settings.noApiKey') }); return; }
    setAiTesting(true);
    setAiTestResult(null);
    try {
      if (aiProvider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: aiModel || 'claude-sonnet-4-20250514', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
        });
        if (res.ok) setAiTestResult({ ok: true, msg: t('settings.keyValid', { provider: 'Anthropic' }) });
        else {
          const err = await res.json().catch(() => ({}));
          setAiTestResult({ ok: false, msg: err.error?.message || `${t('settings.error')}: ${res.status}` });
        }
      } else {
        const baseUrl = aiProvider === 'openrouter' ? 'https://openrouter.ai/api/v1/models' : 'https://api.openai.com/v1/models';
        const headers = { 'Authorization': `Bearer ${key}` };
        if (aiProvider === 'openrouter') headers['HTTP-Referer'] = window.location.origin;
        const res = await fetch(baseUrl, { headers });
        if (res.ok) setAiTestResult({ ok: true, msg: t('settings.keyValid', { provider: aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter' }) });
        else {
          const err = await res.json().catch(() => ({}));
          setAiTestResult({ ok: false, msg: err.error?.message || `${t('settings.error')}: ${res.status}` });
        }
      }
    } catch (err) {
      setAiTestResult({ ok: false, msg: t('settings.aiConnectionFailed') });
    } finally {
      setAiTesting(false);
    }
  };

  const handleExportJSON = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budgetpilot_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings.backupExported'));
    } catch (err) {
      toast.error(t('settings.exportFailed'));
    }
  };

  const handleImportJSON = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      toast.success(t('settings.dataImported'));
      window.location.reload();
    } catch (err) {
      toast.error(t('settings.invalidBackup'));
    }
  };

  const handleClearAll = async () => {
    if (clearConfirm !== 'DELETE MY DATA') {
      toast.error(t('settings.typeDeleteMyData'));
      return;
    }
    try {
      await clearData();
      toast.success(t('settings.allDataCleared'));
      setShowClear(false);
      setClearConfirm('');
    } catch (err) {
      toast.error(t('settings.failedClear'));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('settings.title')}</h1>

      {/* Display */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><EyeOff size={14} /> {t('settings.display')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('settings.theme')}</p>
              <p className="text-xs text-cream-500">{dark ? t('settings.darkMode') : t('settings.lightMode')}</p>
            </div>
            <button onClick={toggleTheme} className="btn-secondary flex items-center gap-2">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? t('settings.light') : t('settings.dark')}
            </button>
          </div>
          <div className="border-t border-cream-200 dark:border-dark-border pt-3">
            <label className="label">{t('settings.language')}</label>
            <div className="flex gap-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    language === lang.code
                      ? 'border-cream-900 bg-cream-900/5 dark:border-cream-100 dark:bg-cream-100/5'
                      : 'border-cream-300 hover:border-cream-400 dark:border-dark-border'
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-cream-200 dark:border-dark-border pt-3">
            <label className="label">{t('settings.hideAmounts')}</label>
            <select
              className="input"
              value={hideAmounts}
              onChange={(e) => updateHideAmounts(e.target.value)}
            >
              {HIDE_AMOUNTS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{t('hideOptions.' + o.id)}</option>
              ))}
            </select>
            <p className="text-xs text-cream-400 mt-1">{t('settings.hideAmountsDesc')}</p>
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="card">
        <h3 className="section-title">{t('settings.profile')}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.displayName')}</label>
            <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label">{t('settings.defaultCurrency')}</label>
            <select className="input" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {t('currencies.' + c.code) || c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Lock size={14} /> {t('settings.changePassword')}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.currentPassword')}</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="label">{t('settings.newPassword')}</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="label">{t('settings.confirmPassword')}</label>
            <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <button
            className="btn-primary"
            disabled={passwordChanging || !currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
            onClick={async () => {
              if (newPassword !== confirmPassword) { toast.error(t('settings.passwordMismatch')); return; }
              if (newPassword.length < 8) { toast.error(t('settings.passwordTooShort')); return; }
              setPasswordChanging(true);
              try {
                await changePassword(user?.id || 'local', currentPassword, newPassword);
                toast.success(t('settings.passwordChanged'));
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              } catch (e) {
                toast.error(e.message || t('settings.passwordChangeFailed'));
              }
              setPasswordChanging(false);
            }}
          >
            {passwordChanging ? t('common.saving') : t('settings.updatePassword')}
          </button>
        </div>
      </div>

      {/* AI Provider */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Bot size={14} /> {t('settings.aiConfig')}</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">
          {t('settings.aiConfigDesc')}
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.aiProvider')}</label>
            <select
              className="input"
              value={aiProvider}
              onChange={(e) => {
                const newProvider = e.target.value;
                setAiProvider(newProvider);
                const p = AI_PROVIDERS.find(p => p.id === newProvider);
                if (p) setAiModel(p.defaultModel);
              }}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('settings.aiModel')}</label>
            <select className="input" value={aiModel || currentProvider.defaultModel} onChange={(e) => setAiModel(e.target.value)}>
              {currentProvider.models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{currentProvider.name} {t('settings.apiKey')}</label>
            <input
              type="password"
              className="input"
              value={aiProvider === 'anthropic' ? anthropicKey : aiProvider === 'openai' ? openaiKey : openrouterKey}
              onChange={(e) => {
                if (aiProvider === 'anthropic') setAnthropicKey(e.target.value);
                else if (aiProvider === 'openai') setOpenaiKey(e.target.value);
                else setOpenrouterKey(e.target.value);
              }}
              autoComplete="off"
              placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : aiProvider === 'openai' ? 'sk-...' : 'sk-or-...'}
            />
            <p className="text-xs text-cream-400 mt-1">
              {aiProvider === 'anthropic' ? t('settings.getKeyFrom', { provider: 'console.anthropic.com' }) :
               aiProvider === 'openai' ? t('settings.getKeyFrom', { provider: 'platform.openai.com' }) :
               t('settings.openrouterDesc')}
            </p>
            {keySyncStatus && (
              <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${
                keySyncStatus === 'synced' ? 'text-success' :
                keySyncStatus === 'syncing' ? 'text-accent-500' :
                'text-cream-500'
              }`}>
                {keySyncStatus === 'synced' && <><CheckCircle2 size={12} /> {t('settings.keyEncrypted')}</>}
                {keySyncStatus === 'syncing' && <><CloudUpload size={12} className="animate-pulse" /> {t('settings.keySyncing')}</>}
                {keySyncStatus === 'local' && <><Key size={12} /> {t('settings.keyLocal')}</>}
              </div>
            )}
            {user?.aiProxyAllowed && !anthropicKey && !openaiKey && !openrouterKey && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-accent-500">
                <CheckCircle2 size={12} /> {t('settings.sharedKey')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={testAiKey} disabled={aiTesting} className="btn-secondary text-xs">
              {aiTesting ? t('settings.testing') : t('settings.testApiKey')}
            </button>
            {aiTestResult && (
              <span className={`text-xs ${aiTestResult.ok ? 'text-success' : 'text-danger'}`}>{aiTestResult.msg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Backend API Config */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Key size={14} /> {t('settings.backendApi')}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.backendUrl')}</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} autoComplete="off" placeholder={t('settings.backendUrlPlaceholder')} />
            <p className="text-xs text-cream-400 mt-1">{t('settings.leaveBlank')}</p>
          </div>
          {apiUrl && (
            <div>
              <label className="label">{t('settings.apiKey')}</label>
              <input type="password" className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder={t('settings.bearerToken')} />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {apiUrl && (
              <button onClick={testConnection} className="btn-secondary text-xs">{t('settings.testConnection')}</button>
            )}
            {apiUrl && (
              <button
                onClick={async () => {
                  try {
                    await syncNow();
                    toast.success(t('settings.syncCompleted'));
                  } catch (err) {
                    console.error('Sync failed:', err);
                    toast.error(t('settings.syncFailed'));
                  }
                }}
                className="btn-secondary text-xs"
              >
                {t('settings.syncNow')}
              </button>
            )}
            {testResult && (
              <span className={`text-xs self-center ${testResult.ok ? 'text-success' : 'text-danger'}`}>{testResult.msg}</span>
            )}
          </div>
          {apiUrl && (
            <p className="text-xs text-cream-400 mt-1">
              {t('settings.dataSyncInfo')}
            </p>
          )}
        </div>
      </div>

      {/* Data */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Database size={14} /> {t('settings.dataManagement')}</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={handleExportJSON} className="btn-secondary flex items-center gap-2 text-xs">
              <Download size={14} /> {t('settings.exportJson')}
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2 text-xs">
              <Upload size={14} /> {t('settings.importBackup')}
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
          </div>
          <div className="border-t border-cream-200 dark:border-dark-border pt-3">
            {!showClear ? (
              <button onClick={() => setShowClear(true)} className="btn-danger text-xs flex items-center gap-2">
                <Trash2 size={14} /> {t('settings.clearAllData')}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/5 border border-danger/20">
                  <AlertTriangle size={16} className="text-danger mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-danger">{t('settings.clearWarning')}</p>
                    <p className="text-xs text-cream-600 mt-1">{t('settings.clearConfirmText')}</p>
                  </div>
                </div>
                <input className="input" value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} autoComplete="off" placeholder={t('settings.clearConfirmPlaceholder')} />
                <div className="flex gap-2">
                  <button onClick={handleClearAll} className="btn-danger text-xs">{t('settings.confirmDelete')}</button>
                  <button onClick={() => { setShowClear(false); setClearConfirm(''); }} className="btn-ghost text-xs">{t('common.cancel')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Telegram Bot Configuration */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><MessageSquare size={14} /> {t('settings.telegram')}</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">
          {t('settings.telegramDesc')}
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.telegramBotToken')}</label>
            <input
              type="password"
              className="input"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              autoComplete="off"
              placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
            />
            <p className="text-xs text-cream-400 mt-1">{t('settings.telegramBotTokenHint')}</p>
          </div>
          <div>
            <label className="label">{t('settings.telegramChatId')}</label>
            <input
              className="input"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              autoComplete="off"
              placeholder={t('settings.telegramChatIdPlaceholder')}
            />
            <p className="text-xs text-cream-400 mt-1">{t('settings.telegramChatIdHint')}</p>
          </div>
          <div>
            <label className="label">{t('settings.webhookUrl')}</label>
            <input
              className="input"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              autoComplete="off"
              placeholder="https://your-worker.workers.dev/telegram/webhook"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!telegramBotToken) { setTelegramTestResult({ ok: false, msg: t('settings.noBotToken') }); return; }
                try {
                  const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getMe`);
                  const data = await res.json();
                  setTelegramTestResult({
                    ok: data.ok,
                    msg: data.ok ? t('settings.connectedToBot', { username: data.result.username }) : data.description || t('settings.failed'),
                  });
                } catch (err) {
                  console.error('Telegram connection test failed:', err);
                  setTelegramTestResult({ ok: false, msg: t('settings.telegramConnectionFailed') });
                }
              }}
              className="btn-secondary text-xs"
            >
              {t('settings.testBotToken')}
            </button>
            {telegramBotToken && webhookUrl && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
                    const data = await res.json();
                    setTelegramTestResult({
                      ok: data.ok,
                      msg: data.ok ? t('settings.webhookSet') : data.description || t('settings.failed'),
                    });
                  } catch (err) {
                    console.error('Webhook setup failed:', err);
                    setTelegramTestResult({ ok: false, msg: t('settings.webhookFailed') });
                  }
                }}
                className="btn-secondary text-xs"
              >
                {t('settings.setWebhook')}
              </button>
            )}
            {telegramTestResult && (
              <span className={`text-xs self-center ${telegramTestResult.ok ? 'text-success' : 'text-danger'}`}>
                {telegramTestResult.msg}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-cream-200 dark:border-dark-border">
          <p className="text-xs font-medium text-cream-600 dark:text-cream-400 mb-2">{t('settings.telegramSetupGuide')}</p>
          <ol className="text-xs text-cream-500 space-y-1.5 list-decimal list-inside">
            <li>{t('settings.telegramStep1')}</li>
            <li>{t('settings.telegramStep2')}</li>
            <li>{t('settings.telegramStep3')}</li>
            <li>{t('settings.telegramStep4')}</li>
            <li>{t('settings.telegramStep5')}</li>
            <li>{t('settings.telegramStep6')}</li>
            <li>{t('settings.telegramStep7')}</li>
          </ol>
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><DollarSign size={14} /> {t('settings.exchangeRates')}</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">
          {t('settings.exchangeRatesDesc')}
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-cream-500">
              {ratesUpdatedAt ? t('settings.lastUpdated', { date: new Date(ratesUpdatedAt).toLocaleString() }) : t('settings.usingDefaultRates')}
            </div>
            <button
              onClick={async () => {
                setRatesFetching(true);
                try {
                  const rates = await fetchRates(defaultCurrency);
                  const overrides = await getManualOverrides();
                  setExchangeRates({ ...rates, ...overrides });
                  const updAt = await getRatesUpdatedAt();
                  setRatesUpdatedAt(updAt);
                  toast.success(t('settings.ratesUpdated'));
                } catch (err) {
                  console.error('Exchange rate update failed:', err);
                  toast.error(t('settings.ratesFailed'));
                } finally {
                  setRatesFetching(false);
                }
              }}
              disabled={ratesFetching}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={ratesFetching ? 'animate-spin' : ''} />
              {ratesFetching ? t('settings.fetching') : t('settings.refreshRates')}
            </button>
          </div>

          <div className="space-y-2">
            {CURRENCIES.filter(c => c.code !== defaultCurrency).map((c) => {
              const rate = exchangeRates[c.code];
              const hasOverride = rateOverrides[c.code] !== undefined;
              return (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-12">{c.code}</span>
                  <span className="text-xs text-cream-500 flex-1">
                    1 {defaultCurrency} = {rate ? rate.toFixed(4) : '—'} {c.code}
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    className="input w-28 text-right text-sm"
                    value={hasOverride ? rateOverrides[c.code] : ''}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (val === '' || val === null) {
                        await setManualOverride(c.code, null);
                        const newOverrides = { ...rateOverrides };
                        delete newOverrides[c.code];
                        setRateOverrides(newOverrides);
                        const rates = await getRates(defaultCurrency);
                        setExchangeRates(rates);
                      } else {
                        const num = parseFloat(val);
                        if (!isNaN(num) && num > 0) {
                          await setManualOverride(c.code, num);
                          setRateOverrides({ ...rateOverrides, [c.code]: num });
                          setExchangeRates({ ...exchangeRates, [c.code]: num });
                        }
                      }
                    }}
                    placeholder={t('settings.override')}
                  />
                  {hasOverride && (
                    <span className="text-[10px] text-warning font-medium">{t('settings.manual')}</span>
                  )}
                </div>
              );
            })}
          </div>

          {Object.keys(rateOverrides).length > 0 && (
            <button
              onClick={async () => {
                await clearOverrides();
                setRateOverrides({});
                const rates = await getRates(defaultCurrency);
                setExchangeRates(rates);
                toast.success(t('settings.overridesCleared'));
              }}
              className="btn-ghost text-xs text-warning"
            >
              {t('settings.clearOverrides')}
            </button>
          )}
        </div>
      </div>

      {/* Danger Zone — Delete Account */}
      <div className="card border border-danger/20">
        <h3 className="section-title flex items-center gap-2 text-danger"><UserX size={14} /> {t('settings.dangerZone')}</h3>
        {!showDeleteAccount ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('settings.deleteYourAccount')}</p>
              <p className="text-xs text-cream-500">{t('settings.deleteAccountDesc')}</p>
            </div>
            <button onClick={() => setShowDeleteAccount(true)} className="btn-danger text-xs">{t('settings.deleteAccount')}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/5 border border-danger/20">
              <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-danger">{t('settings.deleteAccountWarning')}</p>
                <p className="text-xs text-cream-600 mt-1">{t('settings.deleteAccountDetails')}</p>
              </div>
            </div>
            <input
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              placeholder={t('settings.deleteAccountPlaceholder')}
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (deleteConfirm !== 'DELETE MY ACCOUNT') {
                    toast.error(t('settings.typeDeleteMyAccount'));
                    return;
                  }
                  try {
                    await deleteAccount();
                    window.location.href = '/';
                  } catch (err) {
                    toast.error(err.message);
                  }
                }}
                className="btn-danger text-xs"
              >
                {t('settings.permanentlyDelete')}
              </button>
              <button onClick={() => { setShowDeleteAccount(false); setDeleteConfirm(''); }} className="btn-ghost text-xs">{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>

      <button onClick={saveSettings} className="btn-primary w-full">{t('settings.saveSettings')}</button>

      {/* Feedback link */}
      <button
        onClick={() => navigate('/feedback')}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-info hover:bg-info/8 transition-colors border border-info/20"
      >
        <MessageSquare size={16} />
        {t('settings.reportBug')}
      </button>

      {/* Sign out — always visible, especially important on mobile where sidebar is hidden */}
      <button
        onClick={() => { logout(); navigate('/login'); }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-danger hover:bg-danger/8 transition-colors"
      >
        <LogOut size={16} />
        {t('settings.signOut')}
      </button>
    </div>
  );
}
