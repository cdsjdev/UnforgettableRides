import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, carsAPI, bookingsAPI, quotesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ClassicCar, Booking, Quote } from '../services/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--gold)',
  confirmed: '#4caf50',
  completed: '#2196f3',
  cancelled: 'var(--text-muted)',
  accepted: '#4caf50',
  declined: 'var(--danger)',
  expired: 'var(--text-muted)',
};

export default function OwnerDashboardPage() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cars' | 'bookings' | 'quotes'>('cars');

  const { data: cars = [], isLoading: carsLoading } = useQuery({
    queryKey: ['owner-cars'],
    queryFn: () => carsAPI.getAll({ owner_id: user?.id }),
    enabled: !!user,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['owner-bookings'],
    queryFn: () => bookingsAPI.getMine(),
    enabled: !!user,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['owner-quotes'],
    queryFn: () => quotesAPI.getMine(),
    enabled: !!user,
  });

  const bookingStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      bookingsAPI.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-bookings'] }),
  });

  const quoteStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      quotesAPI.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-quotes'] }),
  });

  const toggleAvailability = useMutation({
    mutationFn: (car: ClassicCar) =>
      carsAPI.update(car.id, { available_for_hire: car.available_for_hire ? false : true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-cars'] }),
  });

  const becomeOwnerMutation = useMutation({
    mutationFn: () => authAPI.becomeOwner(),
    onSuccess: async () => {
      await refreshMe();
      navigate('/owner', { replace: true });
    },
  });

  if (!user) {
    return (
      <div className="container page">
        <p>Please <Link to="/login">sign in</Link> to view your dashboard.</p>
      </div>
    );
  }

  if (user.role !== 'owner' && user.role !== 'admin') {
    return (
      <div className="container page">
        <div className="empty">
          <h3>Enable Owner Access</h3>
          <p>Use the same account for both hiring and listing cars.</p>
          <button className="btn btn-primary" onClick={() => becomeOwnerMutation.mutate()} disabled={becomeOwnerMutation.isPending}>
            {becomeOwnerMutation.isPending ? 'Enabling...' : 'Enable Owner Dashboard'}
          </button>
        </div>
      </div>
    );
  }

  const pendingBookings = (bookings as Booking[]).filter((b) => b.status === 'pending');
  const pendingQuotes = (quotes as Quote[]).filter((q) => q.status === 'pending');

  const totalEarnings = (bookings as Booking[])
    .filter((b) => b.status === 'completed' && b.total_price_cents)
    .reduce((sum, b) => sum + (b.total_price_cents ?? 0), 0) / 100;

  return (
    <div className="container page">
      <div className="page-header" style={{ margin: '0 0 40px', padding: '40px 0 0' }}>
        <div className="section-eyebrow">Owner Portal</div>
        <h1 className="page-title" style={{ marginBottom: 8 }}>My Dashboard</h1>
        <p className="page-subtitle">Manage your listings, bookings, and enquiries.</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        {[
          { label: 'Active Listings', value: (cars as ClassicCar[]).filter((c) => c.is_active).length },
          { label: 'Pending Bookings', value: pendingBookings.length, highlight: pendingBookings.length > 0 },
          { label: 'Pending Quotes', value: pendingQuotes.length, highlight: pendingQuotes.length > 0 },
          { label: 'Total Earnings', value: `$${totalEarnings.toLocaleString()}` },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div
              className="stat-value"
              style={stat.highlight ? { color: 'var(--gold)' } : undefined}
            >
              {stat.value}
            </div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="filter-tabs" style={{ marginBottom: 32 }}>
        {(['cars', 'bookings', 'quotes'] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'cars' ? 'My Cars' : tab === 'bookings' ? `Bookings${pendingBookings.length > 0 ? ` (${pendingBookings.length})` : ''}` : `Quotes${pendingQuotes.length > 0 ? ` (${pendingQuotes.length})` : ''}`}
          </button>
        ))}
        <Link to="/owner/cars/new" className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
          + Add New Car
        </Link>
      </div>

      {/* Cars tab */}
      {activeTab === 'cars' && (
        <div>
          {carsLoading ? (
            <p className="loading">Loading<span className="loading-dots" /></p>
          ) : (cars as ClassicCar[]).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <p style={{ marginBottom: 20 }}>You haven't listed any cars yet.</p>
              <Link to="/owner/cars/new" className="btn btn-primary">List Your First Car</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {(cars as ClassicCar[]).map((car) => (
                <div
                  key={car.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr auto',
                    gap: 20,
                    alignItems: 'center',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 60,
                      borderRadius: 'var(--radius)',
                      background: 'var(--bg-surface)',
                      backgroundImage: car.primary_image_url ? `url(${car.primary_image_url})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {car.year} {car.make} {car.model}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {car.location} · {car.color}
                      {car.price_per_day_cents ? ` · $${(car.price_per_day_cents / 100).toLocaleString()}/day` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 20,
                        background: car.available_for_hire ? 'rgba(76,175,80,0.15)' : 'rgba(160,144,112,0.15)',
                        color: car.available_for_hire ? '#4caf50' : 'var(--text-muted)',
                        cursor: 'pointer',
                        border: 'none',
                      }}
                      onClick={() => toggleAvailability.mutate(car)}
                    >
                      {car.available_for_hire ? 'Available' : 'Unavailable'}
                    </span>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                      onClick={() => navigate(`/owner/cars/${car.id}/edit`)}
                    >
                      Edit
                    </button>
                    <Link
                      to={`/cars/${car.id}`}
                      className="btn btn-outline"
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bookings tab */}
      {activeTab === 'bookings' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {bookingsLoading ? (
            <p className="loading">Loading<span className="loading-dots" /></p>
          ) : (bookings as Booking[]).length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '40px 0' }}>No booking requests yet.</p>
          ) : (
            (bookings as Booking[]).map((b) => (
              <div
                key={b.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>
                      {(b as any).car ? `${(b as any).car.year} ${(b as any).car.make} ${(b as any).car.model}` : 'Booking'}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {b.event_type} · {new Date(b.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {b.duration_days ? ` · ${b.duration_days} day${b.duration_days !== 1 ? 's' : ''}` : ''}
                      {b.duration_hours ? ` · ${b.duration_hours} hour${b.duration_hours !== 1 ? 's' : ''}` : ''}
                    </div>
                    {b.pickup_location && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>📍 {b.pickup_location}</div>
                    )}
                    {b.notes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{b.notes}</div>
                    )}
                  </div>
                  <span
                    className="booking-status"
                    style={{ color: STATUS_COLORS[b.status] ?? 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}
                  >
                    {b.status}
                  </span>
                </div>
                {b.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                      onClick={() => bookingStatusMutation.mutate({ id: b.id, status: 'confirmed' })}
                      disabled={bookingStatusMutation.isPending}
                    >
                      Confirm
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                      onClick={() => bookingStatusMutation.mutate({ id: b.id, status: 'cancelled' })}
                      disabled={bookingStatusMutation.isPending}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Quotes tab */}
      {activeTab === 'quotes' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {quotesLoading ? (
            <p className="loading">Loading<span className="loading-dots" /></p>
          ) : (quotes as Quote[]).length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '40px 0' }}>No quote requests yet.</p>
          ) : (
            (quotes as Quote[]).map((q) => (
              <div
                key={q.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>
                      {(q as any).car ? `${(q as any).car.year} ${(q as any).car.make} ${(q as any).car.model}` : 'Quote Request'}
                    </div>
                    {q.event_type && q.event_date && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        {q.event_type} · {new Date(q.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    )}
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)', marginTop: 8 }}>{q.message}</div>
                    {q.proposed_price_cents && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--gold)', marginTop: 6 }}>
                        Proposed: ${(q.proposed_price_cents / 100).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <span style={{ color: STATUS_COLORS[q.status] ?? 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    {q.status}
                  </span>
                </div>
                {q.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                      onClick={() => quoteStatusMutation.mutate({ id: q.id, status: 'accepted' })}
                      disabled={quoteStatusMutation.isPending}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                      onClick={() => quoteStatusMutation.mutate({ id: q.id, status: 'declined' })}
                      disabled={quoteStatusMutation.isPending}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
