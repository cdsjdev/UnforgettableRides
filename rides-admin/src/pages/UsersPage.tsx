import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { User, UserRole } from '@shared/types';

const ROLES: UserRole[] = ['admin', 'owner', 'customer'];

const roleBadgeColor: Record<string, { bg: string; color: string }> = {
  admin: { bg: '#fef3c7', color: '#92400e' },
  owner: { bg: '#dbeafe', color: '#1e40af' },
  customer: { bg: '#dcfce7', color: '#166534' },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'customer' as UserRole });
  const [formError, setFormError] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: authAPI.getUsers,
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof authAPI.register>[0]) => authAPI.register(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); },
    onError: (err: any) => setFormError(err.response?.data?.error?.message || err.message || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) => authAPI.updateUser(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); setConfirmDeactivate(null); },
    onError: (err: any) => setFormError(err.response?.data?.error?.message || err.message || 'Failed to update user'),
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', role: 'customer' });
    setEditingUser(null);
    setShowForm(false);
    setFormError('');
  };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setFormData({ name: u.name, email: u.email, password: '', role: u.role as UserRole });
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim() || !formData.email.trim()) { setFormError('Name and email are required'); return; }
    if (editingUser) {
      const updates: Partial<User> = {};
      if (formData.name !== editingUser.name) updates.name = formData.name;
      if (formData.role !== editingUser.role) updates.role = formData.role;
      updateMutation.mutate({ id: editingUser.id, updates });
    } else {
      if (!formData.password || formData.password.length < 6) { setFormError('Password must be at least 6 characters'); return; }
      createMutation.mutate({ name: formData.name.trim(), email: formData.email.trim(), password: formData.password, role: formData.role });
    }
  };

  const filtered = (users || []).filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Users</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }} style={{ padding: '8px 18px' }}>
          + Add User
        </button>
      </div>

      {showForm && (
        <div className="action-dialog-backdrop" role="presentation" onClick={resetForm}>
          <div className="form-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="form-dialog-header">
              <h3>{editingUser ? `Edit ${editingUser.name}` : 'Create User'}</h3>
              <button type="button" className="form-dialog-close" onClick={resetForm} aria-label="Cancel">×</button>
            </div>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div>
                  <label>Name</label>
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Full name" required />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="user@example.com" required disabled={!!editingUser} />
                </div>
                {!editingUser && (
                  <div>
                    <label>Password</label>
                    <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Min 6 characters" required minLength={6} />
                  </div>
                )}
                <div>
                  <label>Role</label>
                  <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}>
                    {ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
                  </select>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? 'Saving…' : editingUser ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeactivate && (
        <div className="action-dialog-backdrop" role="presentation" onClick={() => setConfirmDeactivate(null)}>
          <div className="form-dialog" style={{ maxWidth: 400 }} role="dialog" onClick={e => e.stopPropagation()}>
            <div className="form-dialog-header">
              <h3>{confirmDeactivate.is_active ? 'Deactivate User' : 'Activate User'}</h3>
            </div>
            <p style={{ margin: '0 0 20px' }}>
              {confirmDeactivate.is_active
                ? `Deactivate ${confirmDeactivate.name}? They will no longer be able to log in.`
                : `Activate ${confirmDeactivate.name}? They will be able to log in again.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                style={{ background: confirmDeactivate.is_active ? '#ef4444' : '#10b981', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: confirmDeactivate.id, updates: { is_active: !confirmDeactivate.is_active } as any })}
              >
                {confirmDeactivate.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmDeactivate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="filter-bar" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name or email…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }}
        />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }}
        >
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
        </select>
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="icon">&#128100;</div><p>No users found.</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const badge = roleBadgeColor[u.role] || { bg: '#f3f4f6', color: '#374151' };
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge" style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 4, fontSize: 12, textTransform: 'capitalize' }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: u.is_active ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: 13 }}>
                      {new Date(u.created_at).toLocaleDateString('en-US')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-compact" onClick={() => handleEdit(u)}>Edit</button>
                        {u.id !== currentUser?.id && (
                          <button
                            className="btn-compact"
                            style={{ border: `1px solid ${u.is_active ? '#ef4444' : '#10b981'}`, color: u.is_active ? '#ef4444' : '#10b981', background: 'transparent', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                            onClick={() => setConfirmDeactivate(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
