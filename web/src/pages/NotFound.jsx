import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center p-4">
      <div className="text-center animate-fadeUp">
        <p className="text-6xl font-heading font-bold text-cream-300 dark:text-dark-border mb-4">404</p>
        <h1 className="text-xl font-heading font-semibold mb-2">Page not found</h1>
        <p className="text-sm text-cream-500 mb-6">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <Home size={16} /> Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
