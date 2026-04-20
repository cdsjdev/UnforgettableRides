import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ResetPasswordPage() {
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
      setError('Invalid or expired reset link.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword(token, newPassword);
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="UnforgettableRides" className="login-logo" />
          <h1>{'Reset Password'}</h1>
          <p>{'Set a new password for your account.'}</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {done ? (
          <div className="login-success">
            <p>{'Password reset successful. You can sign in now.'}</p>
            <Link to={returnTo} className="inline-link">{'Back to Sign In'}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!token && <div className="login-error">{'Invalid or expired reset link.'}</div>}
            <div className="login-field">
              <label htmlFor="new-password">{'New Password'}</label>
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={'Min 6 characters'}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <div className="login-field">
              <label htmlFor="confirm-password">{'Confirm Password'}</label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={'Confirm Password'}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <div className="login-footer-link" style={{ marginBottom: 10 }}>
              <button type="button" className="text-link-btn" onClick={() => setShowPassword(v => !v)}>
                {showPassword ? 'Hide password' : 'Show password'}
              </button>
            </div>
            <button type="submit" className="login-button" disabled={loading || !token}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <div className="login-footer-link">
              <Link to={returnTo} className="inline-link">{'Back to Sign In'}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

