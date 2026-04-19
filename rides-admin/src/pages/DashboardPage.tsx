import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { carsAdminAPI, bookingsAdminAPI, quotesAdminAPI, payoutsAdminAPI } from '../services/api';

function StatCard({ label, value, sub, onClick }: { label: string; value: string | number; sub?: string; onClick?: () => void }) {
  return (
    <div className="stat-card" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#ef4444',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('en-CA');

  const { data: cars } = useQuery({
    queryKey: ['admin-cars'],
    queryFn: () => carsAdminAPI.getAll(),
    staleTime: 30000,
  });

  const { data: bookings } = useQuery({
    queryKey: ['admin-bookings'],
    queryFn: () => bookingsAdminAPI.getAll(),
    staleTime: 30000,
  });

  const { data: quotes } = useQuery({
    queryKey: ['admin-quotes'],
    queryFn: () => quotesAdminAPI.getAll(),
    staleTime: 30000,
  });

  const { data: payouts } = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => payoutsAdminAPI.getAll(),
    staleTime: 30000,
  });

  const activeListings = cars?.filter(c => c.is_active && c.available_for_hire).length ?? '—';
  const todayBookings = bookings?.filter(b => b.event_date === today).length ?? '—';
  const pendingQuotes = quotes?.filter(q => q.status === 'pending').length ?? '—';
  const pendingBookings = bookings?.filter(b => b.status === 'pending') ?? [];
  const revenueThisMonth = bookings
    ?.filter(b => b.status === 'confirmed' || b.status === 'completed')
    ?.filter(b => b.event_date?.startsWith(today.slice(0, 7)))
    ?.reduce((sum, b) => sum + (b.total_price_cents ?? 0), 0) ?? 0;

  const revenueStr = revenueThisMonth > 0
    ? `$${(revenueThisMonth / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '$0.00';

  const pendingPayouts = payouts?.filter(p => p.status === 'pending').length ?? 0;

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      <div className="stats-grid">
        <StatCard label="Active Listings" value={activeListings} onClick={() => navigate('/car-listings')} />
        <StatCard label="Bookings Today" value={todayBookings} onClick={() => navigate('/bookings')} />
        <StatCard label="Pending Quotes" value={pendingQuotes} onClick={() => navigate('/bookings')} />
        <StatCard label="Revenue This Month" value={revenueStr} />
        {pendingPayouts > 0 && (
          <StatCard label="Pending Payouts" value={pendingPayouts} sub="Awaiting processing" onClick={() => navigate('/payouts')} />
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Recent Booking Requests</h2>
        {pendingBookings.length === 0 ? (
          <p style={{ color: 'var(--text-secondary, #6b7280)' }}>No pending bookings.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Date</th>
                  <th>Type</th>
                  <th>Car</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {pendingBookings.slice(0, 10).map(b => (
                  <tr key={b.id}>
                    <td>{b.event_date}</td>
                    <td style={{ textTransform: 'capitalize' }}>{b.event_type}</td>
                    <td>{(b as any).car_make ? `${(b as any).car_make} ${(b as any).car_model}` : b.car_id}</td>
                    <td>{(b as any).customer_name || b.customer_id}</td>
                    <td>
                      <span className="status-badge" style={{ background: STATUS_BADGE[b.status] || '#6b7280', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                        {b.status}
                      </span>
                    </td>
                    <td>{b.total_price_cents ? `$${(b.total_price_cents / 100).toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pendingBookings.length > 10 && (
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/bookings')}>
            View all {pendingBookings.length} pending bookings
          </button>
        )}
      </div>
    </div>
  );
}
