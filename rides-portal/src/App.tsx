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
import HowItWorksPage from './pages/HowItWorksPage';
import AboutPage from './pages/AboutPage';
import OwnerDashboardPage from './pages/OwnerDashboardPage';
import AddCarPage from './pages/AddCarPage';
import EditCarPage from './pages/EditCarPage';

function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [solid, setSolid] = useState(false);
  const isHome = location.pathname === '/';

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
            {user.role === 'owner' && <Link to="/owner">My Listings</Link>}
            {user.role !== 'owner' && <Link to="/bookings">My Bookings</Link>}
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
        <p className="footer-copy">© {new Date().getFullYear()} UnforgettableRides. All rights reserved.</p>
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
