import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ForgotPasswordPage() {
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
      setError(err.response?.data?.error?.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="UnforgettableRides" className="login-logo" />
          <h1>{'Forgot Password'}</h1>
          <p>{'Enter your account email to receive a reset link.'}</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {sent ? (
          <div className="login-success">
            <p>{'If this email is registered, a reset link has been sent.'}</p>
            <Link to="/login" className="inline-link">{'Back to Sign In'}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">{'Email'}</label>
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
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div className="login-footer-link">
              <Link to="/login" className="inline-link">{'Back to Sign In'}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

