import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') === 'owner' ? 'owner' : 'customer';

  const [form, setForm] = useState({ name: '', email: '', password: '', role: defaultRole });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.role);
      navigate(form.role === 'owner' ? '/owner' : '/cars');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Create Account</h1>
        <p className="subtitle">Join UnforgettableRides today.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              className="form-control"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoComplete="name"
            />
          </div>
          <div className="form-group" style={{ marginTop: 14 }}>
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
              autoComplete="new-password"
            />
          </div>

          <div className="form-group" style={{ marginTop: 18 }}>
            <label>I want to</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {[
                { value: 'customer', label: 'Hire a classic car' },
                { value: 'owner', label: 'List my classic car' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`booking-option${form.role === opt.value ? ' selected' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setForm({ ...form, role: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ marginTop: 20 }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="switch-mode">
          Already have an account? <Link to="/login" className="link-btn">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
