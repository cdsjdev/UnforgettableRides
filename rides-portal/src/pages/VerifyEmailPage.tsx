import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmailPage() {
  const { user, refreshMe } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const sendLink = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await authAPI.sendEmailVerification();
      if (res.already_verified) {
        await refreshMe();
        setMessage('Your email is already verified.');
      } else {
        setMessage(res.message || 'Verification link sent to your email.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send verification link.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await authAPI.verifyEmailCode(code);
      await refreshMe();
      setMessage('Email verified successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Verification code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container page">
        <p>Please <Link to="/login">sign in</Link> first to verify your email.</p>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Verify Email</h1>
        <p className="subtitle">
          {user.email_verified_at ? 'Your email is verified.' : `Current email: ${user.email}`}
        </p>

        {!user.email_verified_at && (
          <>
            <button className="btn btn-outline btn-lg" onClick={sendLink} disabled={loading} style={{ marginBottom: 16 }}>
              {loading ? 'Sending...' : 'Send Verification Link'}
            </button>

            <form onSubmit={verifyCode}>
              <div className="form-group">
                <label>Verification Code</label>
                <input
                  className="form-control"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || code.length !== 6} style={{ marginTop: 20 }}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          </>
        )}

        {message && <p style={{ color: '#9bd7a5', marginTop: 12 }}>{message}</p>}
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

        <p className="switch-mode">
          <Link to="/">Back to Home</Link>
        </p>
      </div>
    </div>
  );
}
