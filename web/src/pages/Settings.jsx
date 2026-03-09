import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useSync } from '../contexts/SyncContext';
import { getSetting, setSetting, getAllSettings } from '../lib/storage';
import { exportData, importData, clearData } from '../lib/api';
import { deleteAccount } from '../lib/auth';
import { CURRENCIES, AI_PROVIDERS, HIDE_AMOUNTS_OPTIONS } from '../lib/constants';
import { Settings as SettingsIcon, Moon, Sun, Key, Globe, Database, Download, Upload, Trash2, AlertTriangle, MessageSquare, UserX, Bot, EyeOff } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { hideAmounts, updateHideAmounts } = useHideAmounts();
  const { refreshStatus: refreshSyncStatus, syncNow } = useSync();
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
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const testConnection = async () => {
    if (!apiUrl) { setTestResult({ ok: false, msg: 'No API URL configured' }); return; }
    try {
      const url = apiUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/api/health`);
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: res.ok, msg: res.ok ? `Connected! (${data.version || 'ok'})` : `Error: ${res.status}` });
    } catch (err) {
      setTestResult({ ok: false, msg: 'Connection failed — check the URL' });
    }
  };

  const testAiKey = async () => {
    const key = aiProvider === 'anthropic' ? anthropicKey : aiProvider === 'openai' ? openaiKey : openrouterKey;
    if (!key) { setAiTestResult({ ok: false, msg: 'No API key entered' }); return; }
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
        if (res.ok) setAiTestResult({ ok: true, msg: 'Anthropic key valid!' });
        else {
          const err = await res.json().catch(() => ({}));
          setAiTestResult({ ok: false, msg: err.error?.message || `Error: ${res.status}` });
        }
      } else {
        const baseUrl = aiProvider === 'openrouter' ? 'https://openrouter.ai/api/v1/models' : 'https://api.openai.com/v1/models';
        const headers = { 'Authorization': `Bearer ${key}` };
        if (aiProvider === 'openrouter') headers['HTTP-Referer'] = window.location.origin;
        const res = await fetch(baseUrl, { headers });
        if (res.ok) setAiTestResult({ ok: true, msg: `${aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'} key valid!` });
        else {
          const err = await res.json().catch(() => ({}));
          setAiTestResult({ ok: false, msg: err.error?.message || `Error: ${res.status}` });
        }
      }
    } catch (err) {
      setAiTestResult({ ok: false, msg: 'Connection failed — check your key' });
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
      toast.success('Backup exported');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const handleImportJSON = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      toast.success('Data imported successfully!');
      window.location.reload();
    } catch (err) {
      toast.error('Invalid backup file');
    }
  };

  const handleClearAll = async () => {
    if (clearConfirm !== 'DELETE MY DATA') {
      toast.error('Type "DELETE MY DATA" to confirm');
      return;
    }
    try {
      await clearData();
      toast.success('All data cleared');
      setShowClear(false);
      setClearConfirm('');
    } catch (err) {
      toast.error('Failed to clear data');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Settings</h1>

      {/* Display */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><EyeOff size={14} /> Display</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-cream-500">{dark ? 'Dark mode' : 'Light mode'}</p>
            </div>
            <button onClick={toggleTheme} className="btn-secondary flex items-center gap-2">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
          <div className="border-t border-cream-200 dark:border-dark-border pt-3">
            <label className="label">Hide amounts</label>
            <select
              className="input"
              value={hideAmounts}
              onChange={(e) => updateHideAmounts(e.target.value)}
            >
              {HIDE_AMOUNTS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-cream-400 mt-1">Mask financial amounts for privacy when sharing your screen</p>
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="card">
        <h3 className="section-title">Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Display name</label>
            <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label">Default currency</label>
            <select className="input" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* AI Provider */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Bot size={14} /> AI Configuration</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">
          Powers receipt scanning and natural language expense input.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">AI Provider</label>
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
            <label className="label">Model</label>
            <select className="input" value={aiModel || currentProvider.defaultModel} onChange={(e) => setAiModel(e.target.value)}>
              {currentProvider.models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{currentProvider.name} API Key</label>
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
              {aiProvider === 'anthropic' ? 'Get your key from console.anthropic.com' :
               aiProvider === 'openai' ? 'Get your key from platform.openai.com' :
               'Get your key from openrouter.ai/keys — access many models with one key'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={testAiKey} disabled={aiTesting} className="btn-secondary text-xs">
              {aiTesting ? 'Testing...' : 'Test API key'}
            </button>
            {aiTestResult && (
              <span className={`text-xs ${aiTestResult.ok ? 'text-success' : 'text-danger'}`}>{aiTestResult.msg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Backend API Config */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Key size={14} /> Backend API</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Backend API URL (optional)</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} autoComplete="off" placeholder="https://your-worker.workers.dev" />
            <p className="text-xs text-cream-400 mt-1">Leave blank for standalone mode</p>
          </div>
          {apiUrl && (
            <div>
              <label className="label">API Key</label>
              <input type="password" className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="Bearer token" />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {apiUrl && (
              <button onClick={testConnection} className="btn-secondary text-xs">Test connection</button>
            )}
            {apiUrl && (
              <button
                onClick={async () => {
                  try {
                    await syncNow();
                    toast.success('Sync completed');
                  } catch {
                    toast.error('Sync failed');
                  }
                }}
                className="btn-secondary text-xs"
              >
                Sync now
              </button>
            )}
            {testResult && (
              <span className={`text-xs self-center ${testResult.ok ? 'text-success' : 'text-danger'}`}>{testResult.msg}</span>
            )}
          </div>
          {apiUrl && (
            <p className="text-xs text-cream-400 mt-1">
              Data syncs automatically every 60 seconds when a backend is configured. Your API keys (AI, Telegram) stay local and are never synced to the server.
            </p>
          )}
        </div>
      </div>

      {/* Data */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Database size={14} /> Data Management</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={handleExportJSON} className="btn-secondary flex items-center gap-2 text-xs">
              <Download size={14} /> Export JSON backup
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2 text-xs">
              <Upload size={14} /> Import backup
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
          </div>
          <div className="border-t border-cream-200 dark:border-dark-border pt-3">
            {!showClear ? (
              <button onClick={() => setShowClear(true)} className="btn-danger text-xs flex items-center gap-2">
                <Trash2 size={14} /> Clear all data
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/5 border border-danger/20">
                  <AlertTriangle size={16} className="text-danger mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-danger">This will permanently delete all your data.</p>
                    <p className="text-xs text-cream-600 mt-1">Type <strong>DELETE MY DATA</strong> to confirm.</p>
                  </div>
                </div>
                <input className="input" value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} autoComplete="off" placeholder="Type DELETE MY DATA" />
                <div className="flex gap-2">
                  <button onClick={handleClearAll} className="btn-danger text-xs">Confirm delete</button>
                  <button onClick={() => { setShowClear(false); setClearConfirm(''); }} className="btn-ghost text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Telegram Bot Configuration */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><MessageSquare size={14} /> Telegram Bot</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400 mb-4">
          Connect a Telegram bot to add expenses by sending photos of receipts or text messages.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Telegram Bot Token</label>
            <input
              type="password"
              className="input"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              autoComplete="off"
              placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
            />
            <p className="text-xs text-cream-400 mt-1">Get this from @BotFather on Telegram.</p>
          </div>
          <div>
            <label className="label">Allowed Telegram Chat ID</label>
            <input
              className="input"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              autoComplete="off"
              placeholder="Your Telegram user/chat ID"
            />
            <p className="text-xs text-cream-400 mt-1">Your Telegram user ID to restrict bot access. Send /start to @userinfobot to find it.</p>
          </div>
          <div>
            <label className="label">Webhook URL (auto-configured when API is deployed)</label>
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
                if (!telegramBotToken) { setTelegramTestResult({ ok: false, msg: 'No bot token' }); return; }
                try {
                  const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getMe`);
                  const data = await res.json();
                  setTelegramTestResult({
                    ok: data.ok,
                    msg: data.ok ? `Connected to @${data.result.username}` : data.description || 'Failed',
                  });
                } catch {
                  setTelegramTestResult({ ok: false, msg: 'Connection failed' });
                }
              }}
              className="btn-secondary text-xs"
            >
              Test bot token
            </button>
            {telegramBotToken && webhookUrl && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
                    const data = await res.json();
                    setTelegramTestResult({
                      ok: data.ok,
                      msg: data.ok ? 'Webhook set!' : data.description || 'Failed',
                    });
                  } catch {
                    setTelegramTestResult({ ok: false, msg: 'Failed to set webhook' });
                  }
                }}
                className="btn-secondary text-xs"
              >
                Set webhook
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
          <p className="text-xs font-medium text-cream-600 dark:text-cream-400 mb-2">Setup guide:</p>
          <ol className="text-xs text-cream-500 space-y-1.5 list-decimal list-inside">
            <li>Open Telegram and search for @BotFather</li>
            <li>Send /newbot and follow the prompts to create your bot</li>
            <li>Copy the bot token and paste it above</li>
            <li>Find your Chat ID via @userinfobot and paste it above</li>
            <li>Deploy the BudgetPilot API (Cloudflare Worker)</li>
            <li>The webhook URL will be auto-configured, or set it manually</li>
            <li>Send a receipt photo or text like "45 lei Bolt taxi" to your bot!</li>
          </ol>
        </div>
      </div>

      {/* Household - future */}
      <div className="card opacity-60">
        <h3 className="section-title">Household</h3>
        <p className="text-sm text-cream-500">Coming soon — invite family members to share budgets and goals.</p>
      </div>

      {/* Danger Zone — Delete Account */}
      <div className="card border border-danger/20">
        <h3 className="section-title flex items-center gap-2 text-danger"><UserX size={14} /> Danger Zone</h3>
        {!showDeleteAccount ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete your account</p>
              <p className="text-xs text-cream-500">Permanently remove your account and all associated data.</p>
            </div>
            <button onClick={() => setShowDeleteAccount(true)} className="btn-danger text-xs">Delete account</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/5 border border-danger/20">
              <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-danger">This action cannot be undone.</p>
                <p className="text-xs text-cream-600 mt-1">All your transactions, budgets, goals, accounts, and other data will be permanently deleted. Type <strong>DELETE MY ACCOUNT</strong> to confirm.</p>
              </div>
            </div>
            <input
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              placeholder="Type DELETE MY ACCOUNT"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (deleteConfirm !== 'DELETE MY ACCOUNT') {
                    toast.error('Type "DELETE MY ACCOUNT" to confirm');
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
                Permanently delete my account
              </button>
              <button onClick={() => { setShowDeleteAccount(false); setDeleteConfirm(''); }} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <button onClick={saveSettings} className="btn-primary w-full">Save settings</button>
    </div>
  );
}
