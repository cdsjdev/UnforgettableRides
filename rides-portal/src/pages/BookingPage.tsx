import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { carsAPI, bookingsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'photoshoot', label: 'Photo Shoot' },
  { value: 'event', label: 'Special Event' },
  { value: 'other', label: 'Other' },
];

export default function BookingPage() {
  const { carId } = useParams<{ carId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    event_type: 'wedding',
    event_date: '',
    duration_mode: 'day' as 'day' | 'hour',
    duration_days: 1,
    duration_hours: 4,
    pickup_location: '',
    notes: '',
  });

  const [success, setSuccess] = useState(false);
  const [bookingId, setBookingId] = useState('');

  const { data: car, isLoading: carLoading } = useQuery({
    queryKey: ['car', carId],
    queryFn: () => carsAPI.getById(carId!),
    enabled: !!carId,
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ['car-availability', carId],
    queryFn: () => carsAPI.getAvailability(carId!),
    enabled: !!carId,
  });

  const mutation = useMutation({
    mutationFn: () => bookingsAPI.create({
      car_id: carId!,
      event_type: form.event_type,
      event_date: form.event_date,
      duration_days: form.duration_mode === 'day' ? form.duration_days : undefined,
      duration_hours: form.duration_mode === 'hour' ? form.duration_hours : undefined,
      pickup_location: form.pickup_location || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: (booking) => {
      setBookingId(booking.id);
      setSuccess(true);
    },
  });

  if (!user) {
    return (
      <div className="container page">
        <p className="error">Please <Link to="/login">sign in</Link> to make a booking.</p>
      </div>
    );
  }

  if (carLoading || !car) {
    return <div className="container page"><p className="loading">Loading<span className="loading-dots" /></p></div>;
  }

  const isDateBlocked = blockedDates.includes(form.event_date);

  const pricePerDay = car.price_per_day_cents ? car.price_per_day_cents / 100 : null;
  const pricePerHour = car.price_per_hour_cents ? car.price_per_hour_cents / 100 : null;

  const totalPrice = form.duration_mode === 'day' && pricePerDay
    ? pricePerDay * form.duration_days
    : form.duration_mode === 'hour' && pricePerHour
    ? pricePerHour * form.duration_hours
    : null;

  if (success) {
    return (
      <div className="container page" style={{ maxWidth: 540, margin: '0 auto' }}>
        <div className="success-card">
          <h2>Booking Request Sent!</h2>
          <p>Your request for the {car.year} {car.make} {car.model} has been sent to the owner.</p>
          <p style={{ marginTop: 8 }}>Booking ID: <code style={{ color: 'var(--gold)', fontFamily: 'monospace' }}>{bookingId.slice(0, 8).toUpperCase()}</code></p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link to="/bookings" className="btn btn-primary">View My Bookings</Link>
            <Link to="/cars" className="btn btn-outline">Browse More Cars</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="breadcrumb">
        <Link to={`/cars/${carId}`}>← Back to {car.year} {car.make} {car.model}</Link>
      </div>

      <h1 className="page-title" style={{ marginTop: 12 }}>Request a Booking</h1>
      <p className="page-subtitle">{car.year} {car.make} {car.model} · {car.location}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 40, marginTop: 40, alignItems: 'start' }}>
        <div>
          <div className="form-section">
            <div className="form-section-title">Event Details</div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Event Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6 }}>
                {EVENT_TYPES.map((et) => (
                  <button
                    key={et.value}
                    type="button"
                    className={`booking-option${form.event_type === et.value ? ' selected' : ''}`}
                    onClick={() => setForm({ ...form, event_type: et.value })}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Event Date</label>
              <input
                className="form-control"
                type="date"
                value={form.event_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                required
              />
              {isDateBlocked && (
                <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 4 }}>
                  This date is not available. Please choose another date.
                </p>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Duration</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 12 }}>
                {[{ value: 'day', label: 'Full Day(s)' }, { value: 'hour', label: 'Hours' }].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`booking-option${form.duration_mode === opt.value ? ' selected' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm({ ...form, duration_mode: opt.value as 'day' | 'hour' })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.duration_mode === 'day' ? (
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={30}
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              ) : (
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={24}
                  value={form.duration_hours}
                  onChange={(e) => setForm({ ...form, duration_hours: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Additional Information</div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Pickup / Drop-off Location</label>
              <input
                className="form-control"
                type="text"
                placeholder="Venue address or city"
                value={form.pickup_location}
                onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Notes for the Owner</label>
              <textarea
                className="form-control"
                placeholder="Any special requirements, questions, or details about your event…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          {mutation.error && (
            <p className="error" style={{ marginBottom: 16 }}>
              {(mutation.error as any).response?.data?.error?.message || 'Booking failed. Please try again.'}
            </p>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.event_date || isDateBlocked}
            style={{ width: '100%' }}
          >
            {mutation.isPending ? 'Sending Request…' : 'Send Booking Request'}
          </button>
        </div>

        <div className="booking-sidebar">
          <div className="booking-sidebar-header">
            <div style={{ fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
              Your Vehicle
            </div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: 'var(--text)', fontWeight: 700 }}>
              {car.year} {car.make} {car.model}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{car.color} · {car.location}</div>
          </div>
          <div className="booking-sidebar-body">
            {totalPrice !== null && (
              <div className="price-breakdown">
                <div className="price-row">
                  <span>{form.duration_mode === 'day'
                    ? `${form.duration_days} day${form.duration_days !== 1 ? 's' : ''}`
                    : `${form.duration_hours} hour${form.duration_hours !== 1 ? 's' : ''}`}
                  </span>
                  <span>${(form.duration_mode === 'day' ? pricePerDay! : pricePerHour!).toLocaleString()} each</span>
                </div>
                <div className="price-row total">
                  <span>Estimated Total</span>
                  <span>${totalPrice.toLocaleString()}</span>
                </div>
              </div>
            )}
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              No payment taken until the owner confirms your booking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
