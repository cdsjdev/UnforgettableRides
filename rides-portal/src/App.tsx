import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import CarsPage from './pages/CarsPage';
import CarDetailPage from './pages/CarDetailPage';
import BookingPage from './pages/BookingPage';
import BookingsPage from './pages/BookingsPage';
import MessagesPage from './pages/MessagesPage';
import MessageThreadPage from './pages/MessageThreadPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import HowItWorksPage from './pages/HowItWorksPage';
import OwnerDashboardPage from './pages/OwnerDashboardPage';
import AddCarPage from './pages/AddCarPage';
import EditCarPage from './pages/EditCarPage';
import HelpPage from './pages/HelpPage';
import SettingsPage from './pages/SettingsPage';
import { WEB_APP_VERSION, WEB_BUILD_NUMBER, WEB_BUILD_DATE, WEB_BUILD_SHA } from './version';

function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [solid, setSolid] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const isHome = location.pathname === '/';
  const ownerNavLabel = user && (user.role === 'owner' || user.role === 'admin') ? 'My Listings' : 'Become Owner';
  const ownerNavHref = user && (user.role === 'owner' || user.role === 'admin') ? '/owner/cars/new' : '/owner';
  const accountTypeLabel = user ? user.role.replace(/_/g, ' ').toUpperCase() : '';

  useEffect(() => {
    if (!isHome) { setSolid(true); return; }
    const onScroll = () => setSolid(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  useEffect(() => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <nav className={`navbar${solid ? ' solid' : ''}${mobileMenuOpen ? ' menu-open' : ''}`}>
      <Link to="/" className="nav-brand">UnforgettableRides</Link>
      <button
        className={`nav-hamburger${mobileMenuOpen ? ' active' : ''}`}
        onClick={() => setMobileMenuOpen((v) => !v)}
        aria-expanded={mobileMenuOpen}
        aria-controls="nav-links"
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="nav-hamburger-bar" />
        <span className="nav-hamburger-bar" />
        <span className="nav-hamburger-bar" />
      </button>
      <div className="nav-links" id="nav-links">
        <Link to="/cars">Browse Cars</Link>
        <Link to="/how-it-works">How It Works</Link>
        {user ? (
          <>
            <Link to="/bookings">My Bookings</Link>
            <Link to="/messages">Messages</Link>
            <div className="nav-account-menu-wrap" ref={accountMenuRef}>
              <button
                className={`nav-avatar-btn${accountMenuOpen ? ' active' : ''}`}
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <span className="nav-account-badge">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.name} className="nav-account-avatar-img" />
                    : user.name.charAt(0).toUpperCase()}
                </span>
                <span className="nav-avatar-text">
                  <span className="nav-user">{user.name}</span>
                  <span className="nav-user-role">{accountTypeLabel}</span>
                </span>
              </button>
              {accountMenuOpen && (
                <div className="nav-account-menu" role="menu">
                  <Link to={ownerNavHref} className="nav-account-menu-link">{ownerNavLabel}</Link>
                  <Link to="/settings" className="nav-account-menu-link">Settings</Link>
                  <Link to="/help" className="nav-account-menu-link">Help</Link>
                  <button
                    className="nav-account-menu-signout"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      logout();
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Link to="/login">Sign In</Link>
            <Link to="/register" className="nav-cta">List Your Car</Link>
          </>
        )}
      </div>
    </nav>
  );
}

function Footer() {
  const buildInfo = `v${WEB_APP_VERSION} (${WEB_BUILD_NUMBER} | ${WEB_BUILD_DATE} | ${WEB_BUILD_SHA})`;
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">UnforgettableRides</div>
            <p className="footer-tagline">Premium classic car hire for weddings, photo shoots & unforgettable events.</p>
          </div>
          <div className="footer-links">
            <Link to="/cars">Browse Cars</Link>
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/register">List Your Car</Link>
          </div>
        </div>
        <p className="footer-copy">(c) {new Date().getFullYear()} UnforgettableRides. All rights reserved.</p>
        <p className="footer-copy" style={{ opacity: 0.68, marginTop: 8 }}>Build {buildInfo}</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/cars" element={<CarsPage />} />
        <Route path="/cars/:id" element={<CarDetailPage />} />
        <Route path="/book/:carId" element={<BookingPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:threadId" element={<MessageThreadPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/about" element={<Navigate to="/how-it-works" replace />} />
        <Route path="/owner" element={<OwnerDashboardPage />} />
        <Route path="/owner/cars/new" element={<AddCarPage />} />
        <Route path="/owner/cars/:id/edit" element={<EditCarPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
