import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/Toast';

// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';

// App pages
import Dashboard from './pages/Dashboard';
import AddTransaction from './pages/AddTransaction';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import Goals from './pages/Goals';
import Recurring from './pages/Recurring';
import CalendarPage from './pages/Calendar';
import CashFlow from './pages/CashFlow';
import NetWorth from './pages/NetWorth';
import Analytics from './pages/Analytics';
import SettingsPage from './pages/Settings';
import People from './pages/People';
import Wishlist from './pages/Wishlist';
import MonthlyReview from './pages/MonthlyReview';
import Admin from './pages/Admin';
import Feedback from './pages/Feedback';
import NotFound from './pages/NotFound';

import { useEffect } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg">
      <Sidebar />
      <main className="md:ml-sidebar transition-all duration-200 pb-20 md:pb-8">
        <div className="max-w-content mx-auto px-4 md:px-8 py-4 md:py-8 animate-fadeUp">
          {children}
        </div>
      </main>
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
      <ScrollToTop />
      <ToastContainer />
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
