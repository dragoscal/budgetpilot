import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { SkeletonPage } from './components/LoadingSkeleton';
import InstallPrompt from './components/InstallPrompt';
import CommandPalette from './components/CommandPalette';
import OfflineBanner from './components/OfflineBanner';
import WhatsNew from './components/WhatsNew';
import BackgroundJobNotifier from './components/BackgroundJobNotifier';
import QuickAddFAB from './components/QuickAddFAB';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

// ─── Lazy import with robust retry (handles chunk failures after deploy) ───
function lazyRetry(importFn, retries = 3) {
  return lazy(() => {
    const attempt = (retriesLeft) =>
      importFn().catch((err) => {
        if (retriesLeft <= 0) {
          // All retries exhausted — try a full page reload once
          const reloaded = sessionStorage.getItem('chunk_reload');
          if (!reloaded) {
            sessionStorage.setItem('chunk_reload', '1');
            window.location.reload();
            return new Promise(() => {});
          }
          throw err;
        }
        const delay = (retries - retriesLeft + 1) * 500;
        return new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
          attempt(retriesLeft - 1)
        );
      });
    return attempt(retries);
  });
}

// Clear chunk reload flag on successful load
if (sessionStorage.getItem('chunk_reload')) {
  sessionStorage.removeItem('chunk_reload');
}

// ─── Lazy-loaded pages (code splitting) ──────────────────
const Login = lazyRetry(() => import('./pages/Login'));
const Register = lazyRetry(() => import('./pages/Register'));
const Onboarding = lazyRetry(() => import('./pages/Onboarding'));

const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const AddTransaction = lazyRetry(() => import('./pages/AddTransaction'));
const Transactions = lazyRetry(() => import('./pages/Transactions'));
const Budgets = lazyRetry(() => import('./pages/Budgets'));
const Goals = lazyRetry(() => import('./pages/Goals'));
const Recurring = lazyRetry(() => import('./pages/Recurring'));
const CalendarPage = lazyRetry(() => import('./pages/Calendar'));
const CashFlow = lazyRetry(() => import('./pages/CashFlow'));
const NetWorth = lazyRetry(() => import('./pages/NetWorth'));
const Analytics = lazyRetry(() => import('./pages/Analytics'));
const SettingsPage = lazyRetry(() => import('./pages/Settings'));
const People = lazyRetry(() => import('./pages/People'));
const Wishlist = lazyRetry(() => import('./pages/Wishlist'));
const MonthlyReview = lazyRetry(() => import('./pages/MonthlyReview'));
const Admin = lazyRetry(() => import('./pages/Admin'));
const Feedback = lazyRetry(() => import('./pages/Feedback'));
const Loans = lazyRetry(() => import('./pages/Loans'));
const Family = lazyRetry(() => import('./pages/Family'));
const Reports = lazyRetry(() => import('./pages/Reports'));
const Challenges = lazyRetry(() => import('./pages/Challenges'));
const ReceiptGallery = lazyRetry(() => import('./pages/Receipts'));
const Guide = lazyRetry(() => import('./pages/Guide'));
const ImportBudget = lazyRetry(() => import('./pages/ImportBudget'));
const NotificationHistory = lazyRetry(() => import('./pages/NotificationHistory'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ─── App layout with INNER Suspense ───
// Suspense is INSIDE AppLayout so the sidebar stays visible while page chunks load.
// This prevents the "black screen" flash that happened when Suspense was outside.
function AppLayout({ children }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-accent-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" className="md:ml-sidebar transition-all duration-200 pb-20 md:pb-8">
        <div className="max-w-content mx-auto px-4 md:px-8 py-4 md:py-8 animate-fadeUp">
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<SkeletonPage />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

// Auth-only fallback (full-page, no sidebar)
function AuthFallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (stuck) {
    return (
      <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center p-8">
        <div className="text-center max-w-md space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
            <AlertTriangle size={32} className="text-warning" />
          </div>
          <h2 className="text-xl font-bold text-cream-900 dark:text-cream-100">
            Page is taking too long to load
          </h2>
          <p className="text-sm text-cream-500">
            This might be a network issue or a stale cache. Try refreshing.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="btn-secondary flex items-center gap-2"
            >
              <Home size={16} /> Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cream-900 border-t-transparent rounded-full animate-spin dark:border-cream-100 dark:border-t-transparent" />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cream-900 border-t-transparent rounded-full animate-spin dark:border-cream-100 dark:border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <OfflineBanner />
      <ScrollToTop />
      <ToastContainer />
      <InstallPrompt />
      <CommandPalette />
      <WhatsNew />
      <BackgroundJobNotifier />
      <QuickAddFAB />

      {/* Outer Suspense: only catches auth pages (Login/Register/Onboarding).
          App pages have their own Suspense INSIDE AppLayout so sidebar stays visible. */}
      <ErrorBoundary>
      <Suspense fallback={<AuthFallback />}>
        <Routes>
          {/* Public routes — these use the outer Suspense */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/login" replace />} />

          {/* Protected routes — each has Suspense INSIDE AppLayout */}
          <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/add" element={<ProtectedRoute><AppLayout><AddTransaction /></AppLayout></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><AppLayout><Transactions /></AppLayout></ProtectedRoute>} />
          <Route path="/budgets" element={<ProtectedRoute><AppLayout><Budgets /></AppLayout></ProtectedRoute>} />
          <Route path="/goals" element={<ProtectedRoute><AppLayout><Goals /></AppLayout></ProtectedRoute>} />
          <Route path="/recurring" element={<ProtectedRoute><AppLayout><Recurring /></AppLayout></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><AppLayout><CalendarPage /></AppLayout></ProtectedRoute>} />
          <Route path="/cashflow" element={<ProtectedRoute><AppLayout><CashFlow /></AppLayout></ProtectedRoute>} />
          <Route path="/networth" element={<ProtectedRoute><AppLayout><NetWorth /></AppLayout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AppLayout><Analytics /></AppLayout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/people" element={<ProtectedRoute><AppLayout><People /></AppLayout></ProtectedRoute>} />
          <Route path="/wishlist" element={<ProtectedRoute><AppLayout><Wishlist /></AppLayout></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute><AppLayout><MonthlyReview /></AppLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AppLayout><Admin /></AppLayout></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><AppLayout><Feedback /></AppLayout></ProtectedRoute>} />
          <Route path="/loans" element={<ProtectedRoute><AppLayout><Loans /></AppLayout></ProtectedRoute>} />
          <Route path="/family" element={<ProtectedRoute><AppLayout><Family /></AppLayout></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
          <Route path="/challenges" element={<ProtectedRoute><AppLayout><Challenges /></AppLayout></ProtectedRoute>} />
          <Route path="/receipts" element={<ProtectedRoute><AppLayout><ReceiptGallery /></AppLayout></ProtectedRoute>} />
          <Route path="/import-budget" element={<ProtectedRoute><AppLayout><ImportBudget /></AppLayout></ProtectedRoute>} />
          <Route path="/guide" element={<ProtectedRoute><AppLayout><Guide /></AppLayout></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><AppLayout><NotificationHistory /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}
