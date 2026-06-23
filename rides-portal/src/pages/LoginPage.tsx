import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const DEVICE_ID_KEY = 'rides_device_id';

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export default function LoginPage() {
  const { login, setSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [passcode, setPasscode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      if (res.challenge_required && res.challenge_id) {
        setChallengeId(res.challenge_id);
        setError(res.message || 'Enter the verification code sent to your email.');
        return;
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.verifyDeviceLogin(challengeId, passcode, getDeviceId(), 'Portal Web');
      if (!res.token || !res.user) {
        throw new Error('Verification succeeded but session response was incomplete');
      }
      setSession(res.token, res.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Verification code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Welcome Back</h1>
        <p className="subtitle">Sign in to your UnforgettableRides account.</p>

        {!challengeId ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                className="form-control"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label>Password</label>
              <div className="password-field">
                <input
                  className="form-control"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-visibility-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M9.9 5.1A10.2 10.2 0 0 1 12 4c5 0 9.3 3.1 11 8a12.2 12.2 0 0 1-4.3 5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.6 6.6A12.5 12.5 0 0 0 1 12c1.7 4.9 6 8 11 8a10.5 10.5 0 0 0 5.4-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M1 12c1.7-4.9 6-8 11-8s9.3 3.1 11 8c-1.7 4.9-6 8-11 8s-9.3-3.1-11-8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <Link to="/forgot-password" className="link-btn">Forgot password?</Link>
            </div>

            {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ marginTop: 20 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyPasscode}>
            <div className="form-group">
              <label>Email Passcode</label>
              <input
                className="form-control"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading || passcode.length !== 6} style={{ marginTop: 20 }}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => { setChallengeId(''); setPasscode(''); setError(''); }}
            >
              Back to Login
            </button>
          </form>
        )}

        <p className="switch-mode">
          Don't have an account? <Link to="/register" className="link-btn">Register</Link>
          {' '}|{' '}
          <Link to="/verify-email" className="link-btn">Verify Email</Link>
        </p>
      </div>
    </div>
  );
}
