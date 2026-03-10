import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { CURRENCIES } from '../lib/constants';

function PasswordStrength({ password, t }) {
  const checks = [
    { label: t('auth.atLeast8Chars'), pass: password.length >= 8 },
    { label: t('auth.containsNumber'), pass: /\d/.test(password) },
    { label: t('auth.containsUppercase'), pass: /[A-Z]/.test(password) },
    { label: t('auth.containsSpecialChar'), pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score
                ? score <= 1 ? 'bg-danger' : score <= 2 ? 'bg-warning' : 'bg-success'
                : 'bg-cream-300 dark:bg-dark-border'
            }`}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            {c.pass ? (
              <Check size={12} className="text-success" />
            ) : (
              <X size={12} className="text-cream-500" />
            )}
            <span className={c.pass ? 'text-success' : 'text-cream-500'}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('RON');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      await register({ name, email, password, defaultCurrency });
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-600 rounded-2xl mb-4">
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
            {t('auth.createAccount')}
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-heading font-semibold mb-6 text-center">{t('auth.getStarted')}</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="label">{t('auth.fullName')}</label>
              <input
                id="name"
                type="text"
                className="input"
                placeholder={t('auth.fullNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="label">{t('auth.email')}</label>
              <input
                id="reg-email"
                type="email"
                className="input"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="label">{t('auth.password')}</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={t('auth.createStrongPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
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
              <PasswordStrength password={password} t={t} />
            </div>

            <div>
              <label htmlFor="confirm-password" className="label">{t('auth.confirmPassword')}</label>
              <input
                id="confirm-password"
                type="password"
                className="input"
                placeholder={t('auth.repeatPassword')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-danger mt-1">{t('auth.passwordsDontMatch')}</p>
              )}
            </div>

            <div>
              <label htmlFor="currency" className="label">{t('auth.defaultCurrency')}</label>
              <select
                id="currency"
                className="input"
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.creatingAccount') : t('auth.register')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-cream-600 dark:text-cream-500">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-cream-900 dark:text-dark-text font-medium hover:underline">
              {t('auth.signIn')}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-cream-500">
          {t('auth.dataStoredLocally')}
        </p>
      </div>
    </div>
  );
}
