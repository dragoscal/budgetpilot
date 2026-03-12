import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { SkeletonPage } from './components/LoadingSkeleton';
import InstallPrompt from './components/InstallPrompt';
import CommandPalette from './components/CommandPalette';
import OfflineBanner from './components/OfflineBanner';
import FeedbackFAB from './components/FeedbackFAB';
import QuickAddFAB from './components/QuickAddFAB';
import WhatsNew from './components/WhatsNew';
import BackgroundJobNotifier from './components/BackgroundJobNotifier';

// ─── Lazy import with retry (handles chunk failures after deploy) ───
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() =>
      // First retry after short delay (chunk may have been re-deployed)
      new Promise(resolve => setTimeout(resolve, 1000))
        .then(() => importFn())
        .catch(() => {
          // Final fallback: force reload to get new asset manifest
          const reloaded = sessionStorage.getItem('chunk_reload');
          if (!reloaded) {
            sessionStorage.setItem('chunk_reload', '1');
            window.location.reload();
          }
          // If already reloaded once, show the error
          throw new Error('Failed to load page. Please refresh.');
        })
    )
  );
}

// Clear chunk reload flag on successful load
if (sessionStorage.getItem('chunk_reload')) {
  sessionStorage.removeItem('chunk_reload');
}

// ─── Lazy-loaded pages (code splitting) ──────────────────
// Auth pages (small, loaded on demand)
const Login = lazyRetry(() => import('./pages/Login'));
const Register = lazyRetry(() => import('./pages/Register'));
const Onboarding = lazyRetry(() => import('./pages/Onboarding'));

// App pages
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

function AppLayout({ children }) {
  // Key the ErrorBoundary on pathname so it resets when navigating between pages.
  // Without this, if a page crashes, the ErrorBoundary stays stuck in error state
  // even after navigating to a different page (React reuses the same instance).
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
            {children}
          </ErrorBoundary>
        </div>
      </main>
      <FeedbackFAB />
      <QuickAddFAB />
    </div>
  );
}

// Suspense fallback shown while lazy chunks load
function PageFallback() {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg">
      <div className="md:ml-sidebar transition-all duration-200 pb-20 md:pb-8">
        <div className="max-w-content mx-auto px-4 md:px-8 py-4 md:py-8">
          <SkeletonPage />
        </div>
      </div>
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
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/login" replace />} />

          {/* Protected routes */}
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
    </>
  );
}
