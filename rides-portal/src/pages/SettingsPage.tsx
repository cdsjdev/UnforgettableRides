import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SettingsPage() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="container page">
        <div className="empty">
          <h3>Sign In Required</h3>
          <p>Please sign in to view your account settings.</p>
          <Link to="/login" className="btn btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your profile and account access.</p>
        </div>
      </div>

      <div className="container page" style={{ paddingTop: 24 }}>
        <div className="stat-card" style={{ textAlign: 'left', marginBottom: 16 }}>
          <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 12 }}>Profile</div>
          <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {user.name}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> {user.email}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Account Type:</span> {formatRole(user.role)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/verify-email" className="btn btn-outline">Verify Email</Link>
          <Link to="/owner" className="btn btn-outline">Owner Dashboard</Link>
          <Link to="/help" className="btn btn-outline">Help Center</Link>
          <button className="btn btn-primary" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </>
  );
}
