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
              <input
                className="form-control"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
                autoComplete="current-password"
              />
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