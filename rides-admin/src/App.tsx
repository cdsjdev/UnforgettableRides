import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import BookingsPage from './pages/BookingsPage';
import CarListingsPage from './pages/CarListingsPage';
import TransactionsPage from './pages/TransactionsPage';
import PayoutsPage from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ModerationPage from './pages/ModerationPage';
import ModerationAuditPage from './pages/ModerationAuditPage';
import ModerationAbuseStatsPage from './pages/ModerationAbuseStatsPage';
import SecuritySettingsPage from './pages/SecuritySettingsPage';
import FeedbackPage from './pages/FeedbackPage';
import HelpPage from './pages/HelpPage';
import { useTheme } from './hooks/useTheme';

function ThemeBootstrap() {
  useTheme();
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 18, color: '#6B7280' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = user?.role === 'admin';
  const close = () => setMobileNavOpen(false);

  return (
    <div className="app-layout">
      <nav className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <span style={{ fontSize: 22 }}>&#x1F697;</span>
          <span style={{ marginLeft: 8, fontWeight: 700, letterSpacing: '-0.5px' }}>UnforgettableRides</span>
        </div>

        <ul className="sidebar-nav">
          <li className="sidebar-section">Operations</li>
          <li><NavLink to="/" end onClick={close}><span>&#x1F3E0;</span> Dashboard</NavLink></li>
          <li><NavLink to="/bookings" onClick={close}><span>&#x1F4C5;</span> Bookings</NavLink></li>
          <li><NavLink to="/transactions" onClick={close}><span>&#x1F4B3;</span> Transactions</NavLink></li>
          <li><NavLink to="/car-listings" onClick={close}><span>&#x1F697;</span> Car Listings</NavLink></li>
          <li><NavLink to="/payouts" onClick={close}><span>&#x1F4B0;</span> Payouts</NavLink></li>

          <li className="sidebar-section">People</li>
          {isAdmin && <li><NavLink to="/users" onClick={close}><span>&#x1F465;</span> Users</NavLink></li>}
          {isAdmin && <li><NavLink to="/feedback" onClick={close}><span>&#x1F4AC;</span> Feedback</NavLink></li>}

          <li className="sidebar-section">Insights</li>
          <li><NavLink to="/analytics" onClick={close}><span>&#x1F4CA;</span> Analytics</NavLink></li>
          {isAdmin && <li><NavLink to="/moderation" onClick={close}><span>&#x1F6E1;&#xFE0F;</span> Moderation</NavLink></li>}

          <li className="sidebar-section">Config</li>
          {isAdmin && <li><NavLink to="/security-settings" onClick={close}><span>&#x1F512;</span> Security Settings</NavLink></li>}
        </ul>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-role" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
          <button className="sidebar-help" onClick={() => { close(); navigate('/help'); }} title="Help" aria-label="Help">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 115.82 1c0 2-3 2-3 4" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <button className="sidebar-theme-toggle" onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'} aria-label={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
              </svg>
            )}
          </button>
          <button className="sidebar-logout" onClick={() => { close(); logout(); }} title="Logout">
            <svg width="18" height="18" viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round">
              <path d="M304 336v40a40 40 0 01-40 40H104a40 40 0 01-40-40V136a40 40 0 0140-40h152c22.09 0 48 17.91 48 40v40" />
              <line x1="368" y1="256" x2="176" y2="256" />
              <polyline points="432 200 496 256 432 312" />
            </svg>
          </button>
        </div>
      </nav>
      {mobileNavOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={close} />}

      <main className="main-content">
        <button
          className="mobile-nav-toggle"
          onClick={() => setMobileNavOpen(v => !v)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileNavOpen ? 'X' : 'Menu'}
        </button>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/car-listings" element={<CarListingsPage />} />
          <Route path="/payouts" element={isAdmin ? <PayoutsPage /> : <Navigate to="/" replace />} />
          <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to="/" replace />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/moderation" element={isAdmin ? <ModerationPage /> : <Navigate to="/" replace />} />
          <Route path="/moderation/audit" element={isAdmin ? <ModerationAuditPage /> : <Navigate to="/" replace />} />
          <Route path="/moderation/abuse-stats" element={isAdmin ? <ModerationAbuseStatsPage /> : <Navigate to="/" replace />} />
          <Route path="/security-settings" element={isAdmin ? <SecuritySettingsPage /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={<Navigate to="/security-settings" replace />} />
          <Route path="/feedback" element={isAdmin ? <FeedbackPage /> : <Navigate to="/" replace />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 18, color: '#6B7280' }}>Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/*" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeBootstrap />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

