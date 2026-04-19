import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../hooks/useTheme';

export default function LoginPage() {
  const { login, verifyDeviceLogin } = useAuth();
  const { t } = useI18n();
  const { dark, toggle: toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.challenge_required && result.challenge_id) {
        setChallengeId(result.challenge_id);
        setError(result.message || t('login.challengeSent'));
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDevice = async () => {
    setError('');
    setLoading(true);
    try {
      await verifyDeviceLogin(challengeId, verificationCode);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="UnforgettableRides" className="login-logo" />
          <h1>{t('login.title')}</h1>
          <p>{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="login-field">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@unforgettablerides.com"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">{t('login.password')}</label>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                disabled={loading}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.58 10.58A2 2 0 0013.42 13.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9.88 5.09A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 8a12.3 12.3 0 01-4.34 5.17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6.61 6.61A12.75 12.75 0 001 12c1.73 4.89 6 8 11 8a10.5 10.5 0 005.39-1.45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M1 12C2.73 7.11 7 4 12 4s9.27 3.11 11 8c-1.73 4.89-6 8-11 8S2.73 16.89 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {challengeId && (
            <div className="login-field">
              <label htmlFor="verificationCode">{t('login.verificationCode')}</label>
              <input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder={t('login.verificationCodePlaceholder')}
                required
                disabled={loading}
              />
            </div>
          )}

          {!challengeId ? (
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          ) : (
            <button
              type="button"
              className="login-button"
              onClick={handleVerifyDevice}
              disabled={loading || verificationCode.trim().length < 6}
            >
              {loading ? t('login.verifying') : t('login.verifyAndSignIn')}
            </button>
          )}
          <div className="login-footer-link">
            <Link to="/forgot-password" className="inline-link">{t('login.forgotPassword')}</Link>
          </div>
        </form>

        <button
          type="button"
          className="login-theme-toggle"
          onClick={toggleTheme}
          title={dark ? t('app.theme.light') : t('app.theme.dark')}
        >
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
          <span>{dark ? t('app.theme.light') : t('app.theme.dark')}</span>
        </button>
      </div>
    </div>
  );
}

