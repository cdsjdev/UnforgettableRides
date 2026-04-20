import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import AboutPage from './pages/AboutPage';
import OwnerDashboardPage from './pages/OwnerDashboardPage';
import AddCarPage from './pages/AddCarPage';
import EditCarPage from './pages/EditCarPage';
import { WEB_APP_VERSION, WEB_BUILD_NUMBER, WEB_BUILD_DATE, WEB_BUILD_SHA } from './version';

function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [solid, setSolid] = useState(false);
  const isHome = location.pathname === '/';
  const ownerNavLabel = user && (user.role === 'owner' || user.role === 'admin') ? 'My Listings' : 'Become Owner';

  useEffect(() => {
    if (!isHome) { setSolid(true); return; }
    const onScroll = () => setSolid(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  return (
    <nav className={`navbar${solid ? ' solid' : ''}`}>
      <Link to="/" className="nav-brand">UnforgettableRides</Link>
      <div className="nav-links">
        <Link to="/cars" className="nav-hide-mobile">Browse Cars</Link>
        <Link to="/how-it-works" className="nav-hide-mobile">How It Works</Link>
        <Link to="/about" className="nav-hide-mobile">About</Link>
        {user ? (
          <>
            <Link to="/bookings">My Bookings</Link>
            <Link to="/owner">{ownerNavLabel}</Link>
            <Link to="/messages">Messages</Link>
            <span className="nav-user">{user.name}</span>
            <button className="link-btn" onClick={logout}>Sign Out</button>
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
            <Link to="/about">About</Link>
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
        <Route path="/about" element={<AboutPage />} />
        <Route path="/owner" element={<OwnerDashboardPage />} />
        <Route path="/owner/cars/new" element={<AddCarPage />} />
        <Route path="/owner/cars/:id/edit" element={<EditCarPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
