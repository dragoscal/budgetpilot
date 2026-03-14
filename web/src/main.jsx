import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { SyncProvider } from './contexts/SyncContext';
import { FamilyProvider } from './contexts/FamilyContext';
import { LanguageProvider } from './contexts/LanguageContext';
import './index.css';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── PWA Install Tracking ──────────────────────────────────────
async function reportPwaInstall() {
  try {
    const { getSetting } = await import('./lib/storage.js');
    const { settings: settingsApi } = await import('./lib/api.js');
    const apiUrl = await getSetting('apiUrl');
    if (!apiUrl) return; // offline-only user, skip
    const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios'
      : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
    await settingsApi.set('pwaInstalled', 'true');
    await settingsApi.set('pwaInstalledAt', new Date().toISOString());
    await settingsApi.set('pwaPlatform', platform);
  } catch { /* best-effort, non-blocking */ }
}

// Track fresh PWA installation via browser prompt
window.addEventListener('appinstalled', () => {
  localStorage.setItem('bp_pwaInstalled', '1');
  reportPwaInstall();
});

// Detect standalone mode on load (user already installed previously)
if (
  (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) &&
  !localStorage.getItem('bp_pwaInstalled')
) {
  localStorage.setItem('bp_pwaInstalled', '1');
  reportPwaInstall();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <SettingsProvider>
              <SyncProvider>
                <FamilyProvider>
                  <App />
                </FamilyProvider>
              </SyncProvider>
            </SettingsProvider>
          </AuthProvider>
        </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
