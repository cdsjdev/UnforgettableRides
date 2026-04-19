import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsAdminAPI } from '../services/api';

const STATUS_TABS = ['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#ef4444',
};

export default function BookingsPage() {
  const [tab, setTab] = useState<StatusTab>('all');
  const qc = useQueryClient();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['admin-bookings', tab],
    queryFn: () => bookingsAdminAPI.getAll(tab !== 'all' ? { status: tab } : undefined),
    staleTime: 15000,
  });

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => bookingsAdminAPI.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
    },
  });

  return (
    <div className="page-container">
      <h1 className="page-title">Bookings</h1>

      <div className="tab-bar" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid var(--border, #e5e7eb)',
              background: tab === t ? 'var(--primary, #2563eb)' : 'transparent',
              color: tab === t ? '#fff' : 'inherit',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : !bookings?.length ? (
        <p style={{ color: 'var(--text-secondary, #6b7280)' }}>No bookings found.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Date</th>
                <th>Type</th>
                <th>Car</th>
                <th>Customer</th>
                <th>Duration</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id}>
                  <td>{b.event_date}</td>
                  <td style={{ textTransform: 'capitalize' }}>{b.event_type}</td>
                  <td>{(b as any).car_make ? `${(b as any).car_make} ${(b as any).car_model} (${(b as any).car_year})` : b.car_id}</td>
                  <td>{(b as any).customer_name || b.customer_id}</td>
                  <td>
                    {b.duration_days ? `${b.duration_days}d` : b.duration_hours ? `${b.duration_hours}h` : '—'}
                  </td>
                  <td>{b.total_price_cents ? `$${(b.total_price_cents / 100).toFixed(2)}` : '—'}</td>
                  <td>
                    <span style={{
                      background: STATUS_COLOR[b.status] || '#6b7280',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}>
                      {b.status}
                    </span>
                  </td>
                  <td>
                    {b.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={updating}
                          onClick={() => updateStatus({ id: b.id, status: 'confirmed' })}
                          style={{ padding: '3px 10px', fontSize: 12 }}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={updating}
                          onClick={() => updateStatus({ id: b.id, status: 'cancelled' })}
                          style={{ padding: '3px 10px', fontSize: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {b.status === 'confirmed' && (
                      <button
                        className="btn btn-sm"
                        disabled={updating}
                        onClick={() => updateStatus({ id: b.id, status: 'completed' })}
                        style={{ padding: '3px 10px', fontSize: 12, background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
