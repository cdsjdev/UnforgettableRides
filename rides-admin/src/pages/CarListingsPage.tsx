import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carsAdminAPI } from '../services/api';

export default function CarListingsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [confirm, setConfirm] = useState<string | null>(null);

  const { data: cars, isLoading } = useQuery({
    queryKey: ['admin-cars'],
    queryFn: () => carsAdminAPI.getAll(),
    staleTime: 20000,
  });

  const { mutate: toggleAvailability } = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      carsAdminAPI.update(id, { available_for_hire: available }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cars'] }),
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => carsAdminAPI.deactivate(id),
    onSuccess: () => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['admin-cars'] });
    },
  });

  const filtered = (cars ?? []).filter(c => {
    if (filter === 'active') return c.is_active;
    if (filter === 'inactive') return !c.is_active;
    return true;
  });

  return (
    <div className="page-container">
      <h1 className="page-title">Car Listings</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid var(--border, #e5e7eb)',
              background: filter === f ? 'var(--primary, #2563eb)' : 'transparent',
              color: filter === f ? '#fff' : 'inherit',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-secondary, #6b7280)' }}>No listings found.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Car</th>
                <th>Year</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Price/Day</th>
                <th>Tags</th>
                <th>For Hire</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(car => (
                <tr key={car.id} style={{ opacity: car.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{car.make} {car.model}</td>
                  <td>{car.year}</td>
                  <td>{(car as any).owner_name || car.owner_id}</td>
                  <td>{car.location || '—'}</td>
                  <td>{car.price_per_day_cents ? `$${(car.price_per_day_cents / 100).toFixed(0)}/day` : '—'}</td>
                  <td>
                    {(Array.isArray(car.tags) ? car.tags : []).map((tag: string) => (
                      <span key={tag} style={{ background: 'var(--primary-dim, #dbeafe)', color: 'var(--primary, #2563eb)', borderRadius: 4, padding: '1px 6px', fontSize: 11, marginRight: 4 }}>
                        {tag}
                      </span>
                    ))}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleAvailability({ id: car.id, available: !car.available_for_hire })}
                      style={{
                        background: car.available_for_hire ? '#10b981' : '#6b7280',
                        color: '#fff', border: 'none', borderRadius: 4,
                        padding: '3px 10px', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {car.available_for_hire ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td>
                    <span style={{ color: car.is_active ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {car.is_active ? 'Active' : 'Removed'}
                    </span>
                  </td>
                  <td>
                    {car.is_active && (
                      confirm === car.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => deactivate(car.id)}
                            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}
                          >
                            Confirm Remove
                          </button>
                          <button
                            onClick={() => setConfirm(null)}
                            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: 'transparent' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirm(car.id)}
                          style={{ border: '1px solid #ef4444', color: '#ef4444', background: 'transparent', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      )
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
