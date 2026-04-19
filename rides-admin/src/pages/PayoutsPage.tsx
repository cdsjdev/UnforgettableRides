import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payoutsAdminAPI, authAPI } from '../services/api';

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  paid: '#10b981',
  failed: '#ef4444',
};

export default function PayoutsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ owner_id: '', amount: '', notes: '' });

  const { data: payouts, isLoading } = useQuery({
    queryKey: ['admin-payouts', filter],
    queryFn: () => payoutsAdminAPI.getAll(filter !== 'all' ? { status: filter } : undefined),
    staleTime: 15000,
  });

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: authAPI.getUsers,
    staleTime: 60000,
  });

  const owners = users?.filter(u => u.role === 'owner') ?? [];

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => payoutsAdminAPI.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payouts'] }),
  });

  const { mutate: createPayout, isPending: creating } = useMutation({
    mutationFn: () => payoutsAdminAPI.create({
      owner_id: form.owner_id,
      amount_cents: Math.round(parseFloat(form.amount) * 100),
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      setShowCreate(false);
      setForm({ owner_id: '', amount: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
  });

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Payouts</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate(v => !v)}
          style={{ padding: '8px 18px' }}
        >
          + Initiate Payout
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--surface, #f9fafb)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>New Payout</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <select
              value={form.owner_id}
              onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)', minWidth: 200 }}
            >
              <option value="">Select owner…</option>
              {owners.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount ($)"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)', width: 140 }}
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)', flex: 1, minWidth: 200 }}
            />
            <button
              onClick={() => createPayout()}
              disabled={creating || !form.owner_id || !form.amount}
              style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pending', 'processing', 'paid', 'failed'].map(f => (
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
      ) : !payouts?.length ? (
        <p style={{ color: 'var(--text-secondary, #6b7280)' }}>No payouts found.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Amount</th>
                <th>Period</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id}>
                  <td>{(p as any).owner_name || p.owner_id}</td>
                  <td style={{ fontWeight: 600 }}>{`$${(p.amount_cents / 100).toFixed(2)} ${p.currency}`}</td>
                  <td style={{ fontSize: 12 }}>
                    {p.period_start && p.period_end ? `${p.period_start} — ${p.period_end}` : '—'}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes || '—'}</td>
                  <td>
                    <span style={{
                      background: STATUS_COLOR[p.status] || '#6b7280',
                      color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.created_at?.slice(0, 10)}</td>
                  <td>
                    {p.status === 'pending' && (
                      <button
                        onClick={() => updateStatus({ id: p.id, status: 'processing' })}
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                      >
                        Process
                      </button>
                    )}
                    {p.status === 'processing' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => updateStatus({ id: p.id, status: 'paid' })}
                          style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                        >
                          Mark Paid
                        </button>
                        <button
                          onClick={() => updateStatus({ id: p.id, status: 'failed' })}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                        >
                          Failed
                        </button>
                      </div>
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
