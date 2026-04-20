import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function HelpPage() {
  const { user } = useAuth();

  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Support</div>
          <h1 className="page-title">Help Center</h1>
          <p className="page-subtitle">Quick answers and shortcuts to common tasks.</p>
        </div>
      </div>

      <div className="container page" style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 24 }}>
          <div className="stat-card" style={{ textAlign: 'left' }}>
            <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>Booking Help</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 14 }}>
              Need to check booking status, dates, or request details?
            </p>
            {user
              ? <Link to="/bookings" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Open My Bookings</Link>
              : <Link to="/login" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Sign In to View</Link>}
          </div>

          <div className="stat-card" style={{ textAlign: 'left' }}>
            <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>Messages</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 14 }}>
              Contact car owners directly from your message inbox.
            </p>
            {user
              ? <Link to="/messages" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Open Messages</Link>
              : <Link to="/login" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Sign In to View</Link>}
          </div>

          <div className="stat-card" style={{ textAlign: 'left' }}>
            <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>How It Works</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 14 }}>
              Learn the full process for booking and listing vehicles.
            </p>
            <Link to="/how-it-works" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Read Guide</Link>
          </div>
        </div>

        <div className="stat-card" style={{ textAlign: 'left' }}>
          <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 8 }}>Still need help?</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 12 }}>
            Email us at <a href="mailto:support@unforgettablerides.com">support@unforgettablerides.com</a> and include your booking or listing details.
          </p>
        </div>
      </div>
    </>
  );
}

