import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const { refreshStatus } = useSync();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password, remember });
      // Trigger sync after successful login
      refreshStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-dark-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fadeUp">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-600 rounded-lg mb-4">
            <svg viewBox="0 0 512 512" className="w-9 h-9" aria-hidden="true">
              <polygon points="256,80 160,280 352,280" fill="#115e59" opacity="0.9"/>
              <polygon points="200,160 104,360 296,360" fill="#5eead4" opacity="0.7"/>
              <polygon points="312,160 216,360 408,360" fill="#ffffff" opacity="0.5"/>
            </svg>
          </div>
          <h1 className="text-3xl font-heading font-bold text-cream-900 dark:text-dark-text">
            LUMET
          </h1>
          <p className="text-cream-700 dark:text-cream-500 mt-1">
            {t('auth.tagline')}
          </p>
        </div>

        {/* Login card */}
        <div className="card">
          <h2 className="text-xl font-heading font-semibold mb-6 text-center">{t('auth.welcomeBack')}</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="label">{t('auth.password')}</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-500 hover:text-cream-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-cream-300 text-cream-900 focus:ring-cream-900/20"
                />
                <span className="text-sm text-cream-700 dark:text-cream-500">{t('auth.rememberMe')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-cream-600 dark:text-cream-500">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-cream-900 dark:text-dark-text font-medium hover:underline">
              {t('auth.createOne')}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-cream-500">
          {t('auth.dataEncrypted')}
        </p>
      </div>
    </div>
  );
}
