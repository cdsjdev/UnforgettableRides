import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useI18n } from '../i18n/I18nContext';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('auth.resetRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="PetCare" className="login-logo" />
          <h1>{t('auth.forgotTitle')}</h1>
          <p>{t('auth.forgotSubtitle')}</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {sent ? (
          <div className="login-success">
            <p>{t('auth.resetRequestSent')}</p>
            <Link to="/login" className="inline-link">{t('auth.backToLogin')}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">{t('login.email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@petcare.com"
                required
                autoFocus
                disabled={loading}
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? t('auth.sendingReset') : t('auth.sendResetLink')}
            </button>
            <div className="login-footer-link">
              <Link to="/login" className="inline-link">{t('auth.backToLogin')}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
