import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword(email, 'app');
      setMessage(res.message || 'If this email is registered, a password reset link has been sent.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Forgot Password</h1>
        <p className="subtitle">Enter your email and we will send a reset link.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="form-control"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {message && <p style={{ color: '#9bd7a5', marginTop: 12 }}>{message}</p>}
          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ marginTop: 20 }}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="switch-mode">
          Remembered your password? <Link to="/login" className="link-btn">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
