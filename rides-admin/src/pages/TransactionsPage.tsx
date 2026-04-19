import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsAdminAPI } from '../services/api';

export default function TransactionsPage() {
  const [filter, setFilter] = useState<string>('all');

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['admin-transactions', filter],
    queryFn: () => bookingsAdminAPI.getAll(filter !== 'all' ? { status: filter } : undefined),
    staleTime: 20000,
  });

  const paid = bookings?.filter(b => b.total_price_cents && b.total_price_cents > 0) ?? [];
  const totalRevenue = paid.reduce((sum, b) => sum + (b.total_price_cents ?? 0), 0);

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Transactions</h1>
        {totalRevenue > 0 && (
          <div style={{ background: 'var(--surface, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 18px', fontWeight: 700, color: '#065f46' }}>
            Total Shown: ${(totalRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid var(--border, #e5e7eb)',
              background: filter === f ? 'var(--primary, #2563eb)' : 'transparent',
              color: filter === f ? '#fff' : 'inherit',
              cursor: 'pointer', textTransform: 'capitalize',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : !bookings?.length ? (
        <p style={{ color: 'var(--text-secondary, #6b7280)' }}>No transactions found.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Car</th>
                <th>Customer</th>
                <th>Event Date</th>
                <th>Type</th>
                <th>Total</th>
                <th>Payment Intent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{b.id.slice(0, 8)}…</td>
                  <td>{(b as any).car_make ? `${(b as any).car_make} ${(b as any).car_model}` : b.car_id.slice(0, 8)}</td>
                  <td>{(b as any).customer_name || b.customer_id.slice(0, 8)}</td>
                  <td>{b.event_date}</td>
                  <td style={{ textTransform: 'capitalize' }}>{b.event_type}</td>
                  <td style={{ fontWeight: 600 }}>{b.total_price_cents ? `$${(b.total_price_cents / 100).toFixed(2)}` : '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {b.stripe_payment_intent_id ? b.stripe_payment_intent_id.slice(0, 16) + '…' : '—'}
                  </td>
                  <td>
                    <span style={{
                      background: b.status === 'completed' ? '#10b981' : b.status === 'confirmed' ? '#3b82f6' : b.status === 'cancelled' ? '#ef4444' : '#f59e0b',
                      color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, textTransform: 'capitalize',
                    }}>
                      {b.status}
                    </span>
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
