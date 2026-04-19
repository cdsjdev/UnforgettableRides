import { useQuery } from '@tanstack/react-query';
import { bookingsAdminAPI } from '../services/api';

function barWidth(val: number, max: number) {
  if (!max) return 0;
  return Math.round((val / max) * 100);
}

export default function AnalyticsPage() {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['admin-bookings-analytics'],
    queryFn: () => bookingsAdminAPI.getAll(),
    staleTime: 60000,
  });

  if (isLoading) return <div className="page-container"><p>Loading…</p></div>;

  const all = bookings ?? [];

  const monthMap: Record<string, number> = {};
  const revenueMap: Record<string, number> = {};
  all.forEach(b => {
    const m = b.event_date?.slice(0, 7);
    if (!m) return;
    monthMap[m] = (monthMap[m] || 0) + 1;
    if (b.status === 'confirmed' || b.status === 'completed') {
      revenueMap[m] = (revenueMap[m] || 0) + (b.total_price_cents ?? 0);
    }
  });
  const months = Object.keys(monthMap).sort().slice(-6);

  const typeMap: Record<string, number> = {};
  all.forEach(b => { typeMap[b.event_type] = (typeMap[b.event_type] || 0) + 1; });
  const types = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);

  const statusMap: Record<string, number> = {};
  all.forEach(b => { statusMap[b.status] = (statusMap[b.status] || 0) + 1; });

  const maxBookings = Math.max(...months.map(m => monthMap[m] || 0), 1);
  const maxRevenue = Math.max(...months.map(m => revenueMap[m] || 0), 1);
  const maxTypes = Math.max(...types.map(([, v]) => v), 1);

  const STATUS_COLOR: Record<string, string> = {
    pending: '#f59e0b', confirmed: '#3b82f6', completed: '#10b981', cancelled: '#ef4444',
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value">{all.length}</div>
          <div className="stat-label">Total Bookings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{statusMap['confirmed'] ?? 0}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{statusMap['completed'] ?? 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            ${(Object.values(revenueMap).reduce((s, v) => s + v, 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Total Revenue</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Bookings by Month</h3>
          {months.length === 0 ? <p style={{ color: '#9ca3af' }}>No data yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {months.map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 60, fontSize: 12, flexShrink: 0 }}>{m}</span>
                  <div style={{ flex: 1, background: 'var(--border, #e5e7eb)', borderRadius: 4, height: 18 }}>
                    <div style={{ width: `${barWidth(monthMap[m], maxBookings)}%`, background: '#3b82f6', borderRadius: 4, height: '100%' }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 12 }}>{monthMap[m]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Revenue by Month</h3>
          {months.length === 0 ? <p style={{ color: '#9ca3af' }}>No data yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {months.map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 60, fontSize: 12, flexShrink: 0 }}>{m}</span>
                  <div style={{ flex: 1, background: 'var(--border, #e5e7eb)', borderRadius: 4, height: 18 }}>
                    <div style={{ width: `${barWidth(revenueMap[m] || 0, maxRevenue)}%`, background: '#10b981', borderRadius: 4, height: '100%' }} />
                  </div>
                  <span style={{ width: 60, textAlign: 'right', fontSize: 12 }}>${((revenueMap[m] || 0) / 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Bookings by Event Type</h3>
          {types.length === 0 ? <p style={{ color: '#9ca3af' }}>No data yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {types.map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 80, fontSize: 12, flexShrink: 0, textTransform: 'capitalize' }}>{type}</span>
                  <div style={{ flex: 1, background: 'var(--border, #e5e7eb)', borderRadius: 4, height: 18 }}>
                    <div style={{ width: `${barWidth(count, maxTypes)}%`, background: '#8b5cf6', borderRadius: 4, height: '100%' }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 12 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Booking Status Breakdown</h3>
          {Object.entries(statusMap).length === 0 ? <p style={{ color: '#9ca3af' }}>No data yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(statusMap).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ background: STATUS_COLOR[status] || '#6b7280', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: 'center', textTransform: 'capitalize' }}>
                    {status}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{count}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    ({all.length ? Math.round(count / all.length * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
