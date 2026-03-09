import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { getSetting, setSetting, getAllSettings } from '../lib/storage';
import { exportData, importData, clearData } from '../lib/api';
import { CURRENCIES, CATEGORIES } from '../lib/constants';
import { Settings as SettingsIcon, Moon, Sun, Key, Globe, Database, Download, Upload, Trash2, AlertTriangle, MessageSquare } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('RON');
  const [userName, setUserName] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');
  const [showClear, setShowClear] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [telegramTestResult, setTelegramTestResult] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await getAllSettings();
    setApiUrl(settings.apiUrl || '');
    setApiKey(settings.apiKey || '');
    setAnthropicKey(settings.anthropicApiKey || '');
    setTelegramBotToken(settings.telegramBotToken || '');
    setTelegramChatId(settings.telegramChatId || '');
    setWebhookUrl(settings.webhookUrl || '');
    setDefaultCurrency(settings.defaultCurrency || user?.defaultCurrency || 'RON');
    setUserName(settings.userName || user?.name || '');
  };

  const saveSettings = async () => {
    try {
      await setSetting('apiUrl', apiUrl.trim());
      await setSetting('apiKey', apiKey.trim());
      await setSetting('anthropicApiKey', anthropicKey.trim());
      await setSetting('telegramBotToken', telegramBotToken.trim());
      await setSetting('telegramChatId', telegramChatId.trim());
      await setSetting('webhookUrl', webhookUrl.trim());
      await setSetting('defaultCurrency', defaultCurrency);
      await setSetting('userName', userName);
      if (user) {
        await updateProfile({ name: userName, defaultCurrency });
      }
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const testConnection = async () => {
    if (!apiUrl) { setTestResult({ ok: false, msg: 'No API URL configured' }); return; }
    try {
      const res = await fetch(`${apiUrl}/health`);
      setTestResult({ ok: res.ok, msg: res.ok ? 'Connected!' : `Error: ${res.status}` });
    } catch (err) {
      setTestResult({ ok: false, msg: 'Connection failed' });
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
        <h3 className="section-title">Display</h3>
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
      </div>

      {/* Profile */}
      <div className="card">
        <h3 className="section-title">Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Display name</label>
            <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} />
          </div>
          <div>
            <label className="label">Default currency</label>
            <select className="input" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* API Config */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><Key size={14} /> API Configuration</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Backend API URL (optional)</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://your-worker.workers.dev" />
            <p className="text-xs text-cream-400 mt-1">Leave blank for standalone mode</p>
          </div>
          {apiUrl && (
            <div>
              <label className="label">API Key</label>
              <input type="password" className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Bearer token" />
            </div>
          )}
          <div>
            <label className="label">Anthropic API Key</label>
            <input type="password" className="input" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." />
            <p className="text-xs text-cream-400 mt-1">For receipt scanning & AI features. Stored locally only.</p>
          </div>
          <div className="flex gap-2">
            {apiUrl && (
              <button onClick={testConnection} className="btn-secondary text-xs">Test connection</button>
            )}
            {testResult && (
              <span className={`text-xs self-center ${testResult.ok ? 'text-success' : 'text-danger'}`}>{testResult.msg}</span>
            )}
          </div>
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
                <input className="input" value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} placeholder="Type DELETE MY DATA" />
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
              placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
            />
            <p className="text-xs text-cream-400 mt-1">Get this from @BotFather on Telegram. Stored locally only.</p>
          </div>
          <div>
            <label className="label">Allowed Telegram Chat ID</label>
            <input
              className="input"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
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
              placeholder="https://your-worker.workers.dev/telegram/webhook"
            />
            <p className="text-xs text-cream-400 mt-1">The URL your Cloudflare Worker will receive Telegram updates on.</p>
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

      <button onClick={saveSettings} className="btn-primary w-full">Save settings</button>
    </div>
  );
}
