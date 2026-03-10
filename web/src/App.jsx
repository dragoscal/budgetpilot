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

// ─── Lazy-loaded pages (code splitting) ──────────────────
// Auth pages (small, loaded on demand)
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

// App pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddTransaction = lazy(() => import('./pages/AddTransaction'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Goals = lazy(() => import('./pages/Goals'));
const Recurring = lazy(() => import('./pages/Recurring'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const CashFlow = lazy(() => import('./pages/CashFlow'));
const NetWorth = lazy(() => import('./pages/NetWorth'));
const Analytics = lazy(() => import('./pages/Analytics'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const People = lazy(() => import('./pages/People'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const MonthlyReview = lazy(() => import('./pages/MonthlyReview'));
const Admin = lazy(() => import('./pages/Admin'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Loans = lazy(() => import('./pages/Loans'));
const Family = lazy(() => import('./pages/Family'));
const Reports = lazy(() => import('./pages/Reports'));
const Challenges = lazy(() => import('./pages/Challenges'));
const ReceiptGallery = lazy(() => import('./pages/Receipts'));
const Guide = lazy(() => import('./pages/Guide'));
const NotFound = lazy(() => import('./pages/NotFound'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-accent-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" className="md:ml-sidebar transition-all duration-200 pb-20 md:pb-8">
        <div className="max-w-content mx-auto px-4 md:px-8 py-4 md:py-8 animate-fadeUp">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      <FeedbackFAB />
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
          <Route path="/guide" element={<ProtectedRoute><AppLayout><Guide /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
