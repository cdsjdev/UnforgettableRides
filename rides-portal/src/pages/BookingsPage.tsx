import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bookingsAPI, type Booking } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const FALLBACK = 'https://images.pexels.com/photos/8867048/pexels-photo-8867048.jpeg?auto=compress&cs=tinysrgb&w=400';

function statusLabel(s: string) {
  const map: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
  return map[s] ?? s;
}

function eventLabel(e: string) {
  const map: Record<string, string> = { wedding: 'Wedding', photoshoot: 'Photo Shoot', event: 'Special Event', other: 'Other' };
  return map[e] ?? e;
}

export default function BookingsPage() {
  const { user } = useAuth();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => bookingsAPI.getMine(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="container page">
        <p>Please <Link to="/login">sign in</Link> to view your bookings.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">My Bookings</h1>
        <p className="page-subtitle">Track your classic car booking requests.</p>
      </div>

      <div style={{ paddingBottom: 80 }}>
        {isLoading ? (
          <p className="loading">Loading bookings<span className="loading-dots" /></p>
        ) : bookings.length === 0 ? (
          <div className="empty">
            <h3>No bookings yet</h3>
            <p>Find your perfect classic car and make your first booking.</p>
            <Link to="/cars" className="btn btn-primary">Browse Classic Cars</Link>
          </div>
        ) : (
          <div className="bookings-list">
            {bookings.map((booking: Booking) => {
              const car = booking.car;
              const image = car?.primary_image_url || car?.images?.[0]?.url || FALLBACK;
              return (
                <div key={booking.id} className="booking-card">
                  <div className="booking-card-header">
                    <span className="booking-id">#{booking.id.slice(0, 8).toUpperCase()}</span>
                    <span className={`booking-status status-${booking.status}`}>{statusLabel(booking.status)}</span>
                  </div>
                  <div className="booking-card-body">
                    <img className="booking-car-img" src={image} alt="Car" />
                    <div className="booking-info">
                      <div className="booking-car-title">
                        {car ? `${car.year} ${car.make} ${car.model}` : 'Classic Car'}
                      </div>
                      <div className="booking-meta">
                        <span>📅 {new Date(booking.event_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        <span>🎉 {eventLabel(booking.event_type)}</span>
                        {booking.duration_days && <span>⏱ {booking.duration_days} day{booking.duration_days !== 1 ? 's' : ''}</span>}
                        {booking.duration_hours && <span>⏱ {booking.duration_hours} hour{booking.duration_hours !== 1 ? 's' : ''}</span>}
                        {booking.total_price_cents && (
                          <span>💰 ${(booking.total_price_cents / 100).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
