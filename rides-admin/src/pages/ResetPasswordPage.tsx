import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useI18n } from '../i18n/I18nContext';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const returnTo = useMemo(() => {
    const raw = String(params.get('return_to') || '').trim();
    if (!raw) return '/login';
    // Prevent open-redirect: only allow in-app relative routes.
    if (!raw.startsWith('/')) return '/login';
    if (raw.startsWith('//')) return '/login';
    return raw;
  }, [params]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError(t('auth.invalidResetLink'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword(token, newPassword);
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="PetCare" className="login-logo" />
          <h1>{t('auth.resetTitle')}</h1>
          <p>{t('auth.resetSubtitle')}</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {done ? (
          <div className="login-success">
            <p>{t('auth.resetDone')}</p>
            <Link to={returnTo} className="inline-link">{t('auth.backToLogin')}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!token && <div className="login-error">{t('auth.invalidResetLink')}</div>}
            <div className="login-field">
              <label htmlFor="new-password">{t('auth.newPassword')}</label>
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('users.passwordPlaceholder')}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <div className="login-field">
              <label htmlFor="confirm-password">{t('auth.confirmPassword')}</label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.confirmPassword')}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <div className="login-footer-link" style={{ marginBottom: 10 }}>
              <button type="button" className="text-link-btn" onClick={() => setShowPassword(v => !v)}>
                {showPassword ? t('login.hidePassword') : t('login.showPassword')}
              </button>
            </div>
            <button type="submit" className="login-button" disabled={loading || !token}>
              {loading ? t('auth.resetting') : t('auth.resetAction')}
            </button>
            <div className="login-footer-link">
              <Link to={returnTo} className="inline-link">{t('auth.backToLogin')}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
